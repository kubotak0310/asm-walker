// x86-64 instruction interpreter: X86Instruction + MachineState → InterpretResult

import type { MachineState, StateUpdate, Phase, StackFrame } from '../types'
import { BASE_PC_X86 } from '../types'
import { hexU32 } from '../simulator'
import type { X86Instruction, X86Operand } from './parser'

export interface X86InterpretResult {
  update: StateUpdate
  explain: string
  effect: string
  comment: string
  phase: Phase
  isPtr?: boolean
  isArr?: boolean
  nextInstrIdx: number
}

const BASE_PC = BASE_PC_X86
// Virtual instruction size for PC tracking (x86 has variable-length instructions,
// but we use a fixed step for visualization purposes)
const INSTR_SIZE = 4

// rsp/rbp/rip は常にアドレス値を保持するため 16 進表示する
const ADDR_REGS = new Set(['rsp', 'rbp', 'rip'])

/**
 * 数値を学習用の可読フォーマットに変換する。
 *
 * x86-64 コードは 0x400000 以上に配置されるため、それ以上の値はアドレスとみなして 16 進表示。
 * 学習時に「これはアドレスか数値か」が見た目で分かるようにするための閾値。
 *
 * @param val - フォーマット対象の数値
 * @returns 0x400000 未満なら 10 進数文字列、以上なら 16 進数文字列
 */
function fmtDec(val: number): string {
  const u = val >>> 0
  if (u >= 0x400000) return hexU32(u)
  return (val | 0).toString(10)
}

/**
 * レジスタ名と現在値を "rax(42)" や "rsp(0x7ffef0)" 形式で組み合わせた文字列を返す。
 *
 * @param name - レジスタ名（例: "rax", "rsp"）
 * @param val - レジスタの現在値
 * @returns "レジスタ名(値)" 形式の文字列
 */
function fmtRV(name: string, val: number): string {
  const s = ADDR_REGS.has(name) ? hexU32(val >>> 0) : fmtDec(val)
  return `${name}(${s})`
}

/**
 * "[rbp-4]=0x7ffef0" 形式のメモリアドレス式を生成する。
 *
 * base + index*scale + disp から実効アドレスを計算して表示する。
 *
 * @param base - ベースレジスタ名（例: "rbp"）
 * @param index - インデックスレジスタ名
 * @param scale - インデックスのスケール係数
 * @param disp - ディスプレースメント（オフセット）
 * @param state - 現在のマシン状態（レジスタ値の参照に使用）
 * @returns "[式]=0xアドレス" 形式の文字列
 */
function fmtMA(base: string | undefined, index: string | undefined, scale: number | undefined, disp: number | undefined, state: MachineState): string {
  const baseVal = base ? (getRegVal(base, state)) : 0
  const indexVal = index ? (getRegVal(index, state)) : 0
  const sc = scale ?? 1
  const d = disp ?? 0
  const addr = (baseVal + indexVal * sc + d) >>> 0
  let expr = base ? base : ''
  if (index) expr += `+${index}` + (sc !== 1 ? `*${sc}` : '')
  if (d > 0) expr += `+${d}`
  else if (d < 0) expr += `${d}`
  return `[${expr}]=${hexU32(addr)}`
}

/**
 * レジスタ名から現在の値を取得する。
 *
 * rsp/rbp/rip は MachineState の専用フィールドを参照する。
 *
 * @param name - レジスタ名（例: "rax", "rsp", "rip"）
 * @param state - 現在のマシン状態
 * @returns レジスタの現在値（未定義のレジスタは 0）
 */
function getRegVal(name: string, state: MachineState): number {
  if (name === 'rsp') return state.sp
  if (name === 'rbp') return state.fp
  if (name === 'rip') return state.pc
  return state.regs[name] ?? 0
}

/**
 * メモリオペランドから実効アドレスを計算する（base + index*scale + disp）。
 *
 * @param op - メモリ型のオペランド（base/index/scale/disp フィールドを持つ）
 * @param state - 現在のマシン状態（レジスタ値の参照に使用）
 * @returns 符号なし 32bit に丸めた実効アドレス
 */
function getMemAddr(op: X86Operand & { type: 'mem' }, state: MachineState): number {
  const base = op.base ? getRegVal(op.base, state) : 0
  const index = op.index ? getRegVal(op.index, state) : 0
  const scale = op.scale ?? 1
  const disp = op.disp ?? 0
  return (base + index * scale + disp) >>> 0
}

/**
 * 仮想スタックから指定アドレスの値を読む。
 *
 * 未書き込みアドレスは 0 を返す。
 *
 * @param addr - 読み取り対象のアドレス
 * @param state - 現在のマシン状態（state.stack を参照）
 * @returns アドレスに書き込まれた値。未書き込みの場合は 0
 */
function readMem(addr: number, state: MachineState): number {
  return state.stack[addr] ?? 0
}

/**
 * オペランドから実際の数値を解決する（レジスタ値・即値・メモリ読み出し）。
 *
 * @param op - 解決対象のオペランド
 * @param state - 現在のマシン状態
 * @returns オペランドが表す数値
 */
function resolveOperandValue(op: X86Operand, state: MachineState): number {
  if (op.type === 'reg') return getRegVal(op.name, state)
  if (op.type === 'imm') return op.value
  if (op.type === 'mem') return readMem(getMemAddr(op, state), state)
  return 0
}

/**
 * レジスタ名と新しい値から StateUpdate の部分オブジェクトを生成する。
 *
 * rsp/rbp は専用フィールド、それ以外は regs オブジェクトに格納する。
 *
 * @param name - 更新対象のレジスタ名
 * @param val - 新しいレジスタ値
 * @returns applyUpdate に渡せる部分的な StateUpdate オブジェクト
 */
function regUpdate(name: string, val: number): StateUpdate {
  if (name === 'rsp') return { sp: val >>> 0 }
  if (name === 'rbp') return { fp: val >>> 0 }
  return { regs: { [name]: val >>> 0 } }
}

interface Flags {
  zero: boolean
  negative: boolean
  carry: boolean
  overflow: boolean
}

/**
 * 加減算・論理演算の結果から x86 EFLAGS を計算する。
 *
 * @param result - 演算結果の生の数値
 * @param a - 第1オペランド（演算前の値）
 * @param b - 第2オペランド（演算前の値）
 * @param op - 演算種別
 * @returns ZF/SF/CF/OF の真偽値を格納した Flags オブジェクト
 *
 * @example
 * // ADD 演算: 0xffffffff + 1 → CF=1（符号なし桁あふれ）, OF=0
 * calcFlags(0, 0xffffffff, 1, 'add')
 * // => { zero: true, negative: false, carry: true, overflow: false }
 *
 * // SUB 演算: 3 - 5 → CF=1（借りが発生）, OF=0
 * calcFlags(-2, 3, 5, 'sub')
 * // => { zero: false, negative: true, carry: true, overflow: false }
 */
function calcFlags(result: number, a: number, b: number, op: 'add' | 'sub' | 'and' | 'or' | 'xor'): Flags {
  const r32 = result >>> 0
  const zero = r32 === 0
  const negative = (r32 >>> 31) === 1
  let carry = false
  let overflow = false
  if (op === 'add') {
    // 符号なし加算でラップアラウンドしたら CF=1
    carry = r32 < (a >>> 0)
    // 符号付きオーバーフロー: 両オペランドが同符号で結果が異符号
    const signA = (a >>> 31) & 1
    const signB = (b >>> 31) & 1
    const signR = (r32 >>> 31) & 1
    overflow = signA === signB && signR !== signA
  } else if (op === 'sub') {
    // 符号なし減算で借りが発生したら CF=1（x86 は ARM と定義が同じ方向）
    carry = (a >>> 0) < (b >>> 0)
    // 符号付きオーバーフロー: オペランドが異符号で結果が a と異符号
    const signA = (a >>> 31) & 1
    const signB = (b >>> 31) & 1
    const signR = (r32 >>> 31) & 1
    overflow = signA !== signB && signR !== signA
  }
  return { zero, negative, carry, overflow }
}

/**
 * x86 EFLAGS の条件コードが現在のフラグ状態で成立するかを返す（Intel SDM Vol.1 B.1 準拠）。
 *
 * @param cond - 条件コード文字列（例: "E", "NE", "L", "GE"）
 * @param flags - 現在の EFLAGS 状態
 * @returns 条件が成立する場合 true
 */
function evalCond(cond: string, flags: MachineState['flags']): boolean {
  const { zero: Z, negative: N, carry: C, overflow: V } = flags
  switch (cond) {
    case 'E': case 'Z':   return Z
    case 'NE': case 'NZ': return !Z
    case 'L': case 'NGE': return N !== V
    case 'LE': case 'NG': return Z || N !== V
    case 'G': case 'NLE': return !Z && N === V
    case 'GE': case 'NL': return N === V
    case 'B': case 'NAE': case 'C': return C
    case 'BE': case 'NA': return C || Z
    case 'A': case 'NBE': return !C && !Z
    case 'AE': case 'NB': case 'NC': return !C
    case 'S':  return N
    case 'NS': return !N
    case 'O':  return V
    case 'NO': return !V
    case 'P': case 'PE': return false  // parity — rarely used in GCC output
    case 'NP': case 'PO': return true
    default:   return false
  }
}

/**
 * 条件付き命令のニーモニックから条件部分を抽出する（"JE" → "E"、"SETL" → "L"）。
 *
 * @param mnemonic - 命令のニーモニック文字列（例: "JE", "SETL"）
 * @param prefix - 除去するプレフィックス（例: "J", "SET"）
 * @returns プレフィックスを取り除いた条件コード文字列
 */
function getCondSuffix(mnemonic: string, prefix: string): string {
  return mnemonic.slice(prefix.length)
}

const FRAME_COLORS: Array<'purple' | 'green' | 'orange'> = ['purple', 'green', 'orange']

/**
 * 1命令を解釈して StateUpdate・説明文・次命令インデックスを返す。
 *
 * callDepth はフレーム色と phase の決定に使う。未対応命令は { error: string } を返す。
 *
 * @param instr - 実行対象の x86 命令オブジェクト
 * @param instrIdx - 命令配列内のインデックス（PC 計算の基準）
 * @param state - 実行前のマシン状態
 * @param labels - ラベル名 → 命令インデックスのマップ（ジャンプ先解決に使用）
 * @param instrCount - 命令配列の総数（番兵値として使用）
 * @param callDepth - 現在のコールネスト深さ（0 = main 相当）
 * @returns 正常時は X86InterpretResult、未対応命令時は { error: string }
 */
export function interpretX86(
  instr: X86Instruction,
  instrIdx: number,
  state: MachineState,
  labels: Map<string, number>,
  instrCount: number,
  callDepth: number,
): X86InterpretResult | { error: string } {
  const { mnemonic, operands } = instr
  const nextDefault = instrIdx + 1
  const curPc = BASE_PC + instrIdx * INSTR_SIZE
  const nextPc = BASE_PC + nextDefault * INSTR_SIZE

  const phase: Phase = callDepth === 0 ? 'main' : callDepth === 1 ? 'callee' : 'callee'

  /**
   * 正常終了の X86InterpretResult を組み立てるヘルパー。
   *
   * pc を自動計算して update に追加する。
   *
   * @param update - 状態変化を表す部分的な StateUpdate
   * @param explain - 命令の人間向け説明文
   * @param effect - 状態変化の ← 記法による文字列
   * @param comment - CodePanel のインライン表示用コメント
   * @param nextInstrIdx - 次の命令インデックス（省略時は instrIdx + 1）
   * @param extras - isPtr / isArr フラグ（省略可）
   * @returns 組み立て済みの X86InterpretResult
   */
  function ok(
    update: StateUpdate,
    explain: string,
    effect: string,
    comment: string,
    nextInstrIdx: number = nextDefault,
    extras: { isPtr?: boolean; isArr?: boolean } = {},
  ): X86InterpretResult {
    return { update: { ...update, pc: BASE_PC + nextInstrIdx * INSTR_SIZE }, explain, effect, comment, phase, ...extras, nextInstrIdx }
  }

  const op0 = operands[0]
  const op1 = operands[1]
  const op2 = operands[2]

  // ── MOV ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'MOV') {
    if (!op0 || !op1) return { error: 'MOV: operand不足' }
    const val = resolveOperandValue(op1, state)
    const valStr = fmtDec(val)

    if (op0.type === 'reg') {
      const src = op1.type === 'reg' ? fmtRV(op1.name, val)
        : op1.type === 'imm' ? String(val)
        : op1.type === 'mem' ? `${fmtMA(op1.base, op1.index, op1.scale, op1.disp, state)}(${valStr})`
        : String(val)
      const comment = `${op0.name} ← ${src}`
      return ok(regUpdate(op0.name, val), `${op0.name} にデータを転送`, comment, comment)
    }

    if (op0.type === 'mem') {
      const addr = getMemAddr(op0, state)
      const memStr = fmtMA(op0.base, op0.index, op0.scale, op0.disp, state)
      const src = op1.type === 'reg' ? fmtRV(op1.name, val)
        : op1.type === 'imm' ? String(val)
        : String(val)
      const comment = `${memStr} ← ${src}`
      return ok(
        { stackSet: { [addr]: val >>> 0 } },
        `メモリにデータを書き込み`,
        comment, comment,
        nextDefault,
        { isPtr: (val >>> 0) >= 0x7f0000 && (val >>> 0) <= 0x800000 },
      )
    }
    return { error: `MOV: 不正なオペランド` }
  }

  // ── MOVSX / MOVZX ────────────────────────────────────────────────────────
  if (mnemonic === 'MOVSX' || mnemonic === 'MOVZX') {
    if (!op0 || !op1 || op0.type !== 'reg') return { error: `${mnemonic}: operand不足` }
    const raw = resolveOperandValue(op1, state)
    const size = op1.type === 'mem' ? op1.size : 4
    let val: number
    if (mnemonic === 'MOVSX') {
      // Sign extend
      const shift = 32 - size * 8
      val = (raw << shift) >> shift
    } else {
      // Zero extend
      const mask = size === 1 ? 0xff : size === 2 ? 0xffff : 0xffffffff
      val = raw & mask
    }
    const comment = `${op0.name} ← ${mnemonic === 'MOVSX' ? '符号拡張' : 'ゼロ拡張'}(${fmtDec(raw)}) = ${fmtDec(val)}`
    return ok(regUpdate(op0.name, val), `${op0.name} に符号拡張転送`, comment, comment)
  }

  // ── LEA ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'LEA') {
    if (!op0 || !op1 || op0.type !== 'reg' || op1.type !== 'mem') return { error: 'LEA: operand不足' }
    const addr = getMemAddr(op1, state)
    const comment = `${op0.name} ← ${hexU32(addr)}`
    return ok(regUpdate(op0.name, addr), `実効アドレスをロード (LEA)`, comment, comment)
  }

  // ── PUSH ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'PUSH') {
    if (!op0) return { error: 'PUSH: operand不足' }
    const val = resolveOperandValue(op0, state)
    const newSp = (state.sp - 8) >>> 0
    const src = op0.type === 'reg' ? fmtRV(op0.name, val) : fmtDec(val)
    const isAddrVal = (val >>> 0) >= 0x400000 && (val >>> 0) <= 0x800000
    const effect = `rsp ← ${hexU32(newSp)}; [rsp] ← ${src}`
    const comment = `${src} をスタックに保存`
    return ok(
      { sp: newSp, stackSet: { [newSp]: val >>> 0 } },
      `${src} をスタックにプッシュ`,
      effect, comment,
      nextDefault,
      { isPtr: isAddrVal },
    )
  }

  // ── POP ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'POP') {
    if (!op0 || op0.type !== 'reg') return { error: 'POP: operand不足' }
    const val = readMem(state.sp, state)
    const newSp = (state.sp + 8) >>> 0
    const effect = `${op0.name} ← [rsp]=${hexU32(state.sp)}(${fmtDec(val)}); rsp ← ${hexU32(newSp)}`
    const comment = `スタックから ${fmtRV(op0.name, val)} を復元`
    return ok(
      { ...regUpdate(op0.name, val), sp: newSp, stackRemove: [state.sp] },
      `スタックからポップ`,
      effect, comment,
    )
  }

  // ── ADD ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'ADD') {
    if (!op0 || !op1) return { error: 'ADD: operand不足' }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const result = (a + b) | 0
    const flags = calcFlags(result, a, b, 'add')
    const bStr = op1.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    if (op0.type === 'reg') {
      const comment = `${op0.name} ← ${fmtRV(op0.name, a)} + ${bStr} = ${fmtDec(result)}`
      return ok({ ...regUpdate(op0.name, result), flags }, `加算 (ADD)`, comment, comment)
    }
    if (op0.type === 'mem') {
      const addr = getMemAddr(op0, state)
      const memStr = fmtMA(op0.base, op0.index, op0.scale, op0.disp, state)
      const comment = `${memStr} ← ${fmtDec(a)} + ${bStr} = ${fmtDec(result)}`
      return ok({ stackSet: { [addr]: result >>> 0 }, flags }, `加算 (ADD)`, comment, comment)
    }
    return { error: 'ADD: 不正なオペランド' }
  }

  // ── SUB ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'SUB') {
    if (!op0 || !op1) return { error: 'SUB: operand不足' }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const result = (a - b) | 0
    const flags = calcFlags(result, a, b, 'sub')
    const bStr = op1.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    if (op0.type === 'reg') {
      const comment = `${op0.name} ← ${fmtRV(op0.name, a)} - ${bStr} = ${fmtDec(result)}`
      return ok({ ...regUpdate(op0.name, result), flags }, `減算 (SUB)`, comment, comment)
    }
    if (op0.type === 'mem') {
      const addr = getMemAddr(op0, state)
      const memStr = fmtMA(op0.base, op0.index, op0.scale, op0.disp, state)
      const comment = `${memStr} ← ${fmtDec(a)} - ${bStr} = ${fmtDec(result)}`
      return ok({ stackSet: { [addr]: result >>> 0 }, flags }, `減算 (SUB)`, comment, comment)
    }
    return { error: 'SUB: 不正なオペランド' }
  }

  // ── IMUL ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'IMUL') {
    if (!op0) return { error: 'IMUL: operand不足' }
    if (op0.type !== 'reg') return { error: 'IMUL: dest must be register' }
    let a: number, b: number, dest: string
    if (!op1) {
      // 1-operand: rdx:rax = rax * op0 (rarely used for small C programs)
      a = getRegVal('rax', state)
      b = resolveOperandValue(op0, state)
      dest = 'rax'
    } else if (!op2) {
      // 2-operand: op0 = op0 * op1
      a = resolveOperandValue(op0, state)
      b = resolveOperandValue(op1, state)
      dest = op0.name
    } else {
      // 3-operand: op0 = op1 * op2
      a = resolveOperandValue(op1, state)
      b = resolveOperandValue(op2, state)
      dest = op0.name
    }
    const result = Math.imul(a, b)
    const aStr = op2 ? (op1?.type === 'reg' ? fmtRV(op1.name, a) : fmtDec(a)) : fmtRV(dest, a)
    const bStr = op1?.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    const comment = `${dest} ← ${aStr} × ${bStr} = ${fmtDec(result)}`
    return ok(regUpdate(dest, result), `符号付き乗算 (IMUL)`, comment, comment)
  }

  // ── IDIV ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'IDIV') {
    if (!op0) return { error: 'IDIV: operand不足' }
    const divisor = resolveOperandValue(op0, state) | 0
    if (divisor === 0) return { error: 'IDIV: ゼロ除算' }
    const rax = getRegVal('rax', state) | 0
    const quot = Math.trunc(rax / divisor)
    const rem = rax % divisor
    const divStr = op0.type === 'reg' ? fmtRV(op0.name, divisor) : fmtDec(divisor)
    const comment = `rax ← ${fmtRV('rax', rax)} / ${divStr} = ${quot}; rdx ← ${rem}`
    return ok(
      { regs: { rax: quot >>> 0, rdx: rem >>> 0 } },
      `符号付き除算 (IDIV)`, comment, comment,
    )
  }

  // ── CDQ / CQO ────────────────────────────────────────────────────────────
  // IDIV は rdx:rax を被除数とする 64 bit 除算を行う。
  // 除算の前に CDQ/CQO で rax の符号を rdx に拡張しておく必要がある。
  if (mnemonic === 'CDQ') {
    const rax = getRegVal('rax', state) | 0
    const rdx = rax < 0 ? 0xffffffff : 0
    const comment = `rdx ← ${rax < 0 ? '0xffffffff (eax符号拡張)' : '0'}`
    return ok({ regs: { rdx } }, `eax を edx:eax に符号拡張 (CDQ)`, comment, comment)
  }
  if (mnemonic === 'CQO') {
    const rax = getRegVal('rax', state) | 0
    const rdx = rax < 0 ? 0xffffffff : 0
    const comment = `rdx ← ${rax < 0 ? '0xffffffff (rax符号拡張)' : '0'}`
    return ok({ regs: { rdx } }, `rax を rdx:rax に符号拡張 (CQO)`, comment, comment)
  }

  // ── AND / OR / XOR ────────────────────────────────────────────────────────
  if (mnemonic === 'AND' || mnemonic === 'OR' || mnemonic === 'XOR') {
    if (!op0 || !op1) return { error: `${mnemonic}: operand不足` }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const result = mnemonic === 'AND' ? a & b : mnemonic === 'OR' ? a | b : a ^ b
    const op = mnemonic === 'AND' ? 'and' : mnemonic === 'OR' ? 'or' : 'xor'
    const flags = calcFlags(result, a, b, op as 'and' | 'or' | 'xor')
    const bStr = op1.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    if (op0.type === 'reg') {
      const sym = mnemonic === 'AND' ? '&' : mnemonic === 'OR' ? '|' : '^'
      const comment = `${op0.name} ← ${fmtRV(op0.name, a)} ${sym} ${bStr} = ${fmtDec(result)}`
      return ok({ ...regUpdate(op0.name, result), flags }, `${mnemonic} 演算`, comment, comment)
    }
    return { error: `${mnemonic}: 不正なオペランド` }
  }

  // ── NOT / NEG ─────────────────────────────────────────────────────────────
  if (mnemonic === 'NOT') {
    if (!op0 || op0.type !== 'reg') return { error: 'NOT: operand不足' }
    const a = resolveOperandValue(op0, state)
    const result = ~a >>> 0
    const comment = `${op0.name} ← ~${fmtRV(op0.name, a)} = ${fmtDec(result)}`
    return ok(regUpdate(op0.name, result), `ビット反転 (NOT)`, comment, comment)
  }
  if (mnemonic === 'NEG') {
    if (!op0 || op0.type !== 'reg') return { error: 'NEG: operand不足' }
    const a = resolveOperandValue(op0, state) | 0
    const result = (-a) | 0
    const comment = `${op0.name} ← -${fmtRV(op0.name, a)} = ${fmtDec(result)}`
    return ok(regUpdate(op0.name, result), `符号反転 (NEG)`, comment, comment)
  }

  // ── SHL / SHR / SAR ──────────────────────────────────────────────────────
  if (mnemonic === 'SHL' || mnemonic === 'SHR' || mnemonic === 'SAR') {
    if (!op0 || !op1 || op0.type !== 'reg') return { error: `${mnemonic}: operand不足` }
    const a = resolveOperandValue(op0, state)
    const shift = resolveOperandValue(op1, state) & 0x3f
    let result: number
    if (mnemonic === 'SHL') result = (a << shift) | 0
    else if (mnemonic === 'SHR') result = (a >>> shift) | 0
    else result = (a >> shift) | 0
    const sym = mnemonic === 'SHL' ? '<<' : mnemonic === 'SHR' ? '>>>' : '>>'
    const comment = `${op0.name} ← ${fmtRV(op0.name, a)} ${sym} ${shift} = ${fmtDec(result)}`
    return ok(regUpdate(op0.name, result), `シフト (${mnemonic})`, comment, comment)
  }

  // ── CMP ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'CMP') {
    if (!op0 || !op1) return { error: 'CMP: operand不足' }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const result = (a - b) | 0
    const flags = calcFlags(result, a, b, 'sub')
    const aStr = op0.type === 'reg' ? fmtRV(op0.name, a) : fmtDec(a)
    const bStr = op1.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    const flagStr = `Z=${flags.zero ? 1 : 0} N=${flags.negative ? 1 : 0} C=${flags.carry ? 1 : 0} V=${flags.overflow ? 1 : 0}`
    const comment = `${aStr} - ${bStr} → ${flagStr}`
    return ok({ flags }, `比較してフラグ更新 (CMP)`, flagStr, comment)
  }

  // ── TEST ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'TEST') {
    if (!op0 || !op1) return { error: 'TEST: operand不足' }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const result = a & b
    const flags = calcFlags(result, a, b, 'and')
    const aStr = op0.type === 'reg' ? fmtRV(op0.name, a) : fmtDec(a)
    const bStr = op1.type === 'reg' ? fmtRV(op1.name, b) : fmtDec(b)
    const flagStr = `Z=${flags.zero ? 1 : 0} N=${flags.negative ? 1 : 0} C=${flags.carry ? 1 : 0} V=${flags.overflow ? 1 : 0}`
    const comment = `${aStr} & ${bStr} → ${flagStr}`
    return ok({ flags }, `ANDしてフラグ更新 (TEST)`, flagStr, comment)
  }

  // ── JMP ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'JMP') {
    if (!op0) return { error: 'JMP: operand不足' }
    if (op0.type === 'label') {
      const target = labels.get(op0.name)
      if (target === undefined) return { error: `JMP: ラベル "${op0.name}" が見つかりません` }
      const comment = `RIP ← ${op0.name}`
      return ok({}, `無条件ジャンプ`, comment, comment, target)
    }
    // indirect jmp (reg/mem) — treat as end of trace
    return ok({}, `間接ジャンプ`, 'JMP (間接)', 'JMP (間接)', instrCount)
  }

  // ── Jcc (conditional jumps) ───────────────────────────────────────────────
  if (mnemonic.startsWith('J') && mnemonic !== 'JMP') {
    if (!op0 || op0.type !== 'label') return { error: `${mnemonic}: label operand必要` }
    const condSuffix = getCondSuffix(mnemonic, 'J')
    const taken = evalCond(condSuffix, state.flags)
    const target = labels.get(op0.name)
    if (target === undefined) return { error: `${mnemonic}: ラベル "${op0.name}" が見つかりません` }
    const nextIdx = taken ? target : nextDefault
    const takenStr = taken ? `成立 → ${op0.name}` : `不成立、スキップ`
    const comment = `${mnemonic} ${takenStr}`
    return ok({}, `条件分岐 (${mnemonic})`, comment, comment, nextIdx)
  }

  // ── CALL ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'CALL') {
    if (!op0) return { error: 'CALL: operand不足' }

    if (op0.type === 'label') {
      const target = labels.get(op0.name)
      if (target === undefined) return { error: `CALL: ラベル "${op0.name}" が見つかりません` }
      // x86 ABI: CALL は戻りアドレス（= 次の命令の PC）をスタックに積んでからジャンプする。
      // ARM の BL と違いハードウェアレジスタ（LR）は使わない。RET で [rsp] から戻る。
      const retAddr = nextPc
      const newSp = (state.sp - 8) >>> 0
      const effect = `rsp ← ${hexU32(newSp)}; [rsp] ← ${hexU32(retAddr)}, RIP ← ${op0.name}`
      const comment = `戻り先(${hexU32(retAddr)})をスタックに積んで ${op0.name.split('(')[0]} をコール`
      const color = FRAME_COLORS[Math.min(callDepth + 1, 2)] ?? 'green'
      // Compiler Explorer は "add(int, int)" 形式でラベルを出力するため、括弧以降を除去する
      const funcName = op0.name.split('(')[0]?.toLowerCase() ?? op0.name.toLowerCase()
      const newFrames: StackFrame[] = [
        ...state.frames,
        { name: funcName, lo: newSp, hi: newSp, color },
      ]
      return ok(
        { sp: newSp, stackSet: { [newSp]: retAddr }, frames: newFrames },
        `関数呼び出し (CALL ${funcName})`,
        effect, comment, target,
      )
    }

    // Indirect call (via register/memory) — skip
    const comment = `CALL (間接呼び出し)`
    return ok({}, `間接関数呼び出し`, comment, comment)
  }

  // ── RET ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'RET') {
    const retAddr = readMem(state.sp, state)
    const newSp = (state.sp + 8) >>> 0
    const rax = getRegVal('rax', state)
    const comment = `RIP ← [rsp]=${hexU32(state.sp)}(${hexU32(retAddr)}), rsp ← ${hexU32(newSp)}`
    const poppedFrames = state.frames.slice(0, -1)
    return ok(
      { sp: newSp, stackRemove: [state.sp], frames: poppedFrames },
      `関数から返る — rax = ${fmtDec(rax)}`,
      comment, comment,
      // Signal end of this frame: return to caller's next instruction
      // The tracer handles this by reading retAddr from stack
      instrCount,  // sentinel: tracer will use retAddr
    )
  }

  // ── LEAVE ────────────────────────────────────────────────────────────────
  if (mnemonic === 'LEAVE') {
    // mov rsp, rbp; pop rbp
    const newSp = state.fp  // rsp ← rbp
    const rbpVal = readMem(newSp, state)
    const finalSp = (newSp + 8) >>> 0
    const comment = `rsp ← rbp(${hexU32(state.fp)}); rbp ← [rsp](${fmtDec(rbpVal)}); rsp ← ${hexU32(finalSp)}`
    return ok(
      { sp: finalSp, fp: rbpVal, stackRemove: [newSp] },
      `スタックフレームを解放 (LEAVE)`, comment, comment,
    )
  }

  // ── NOP ──────────────────────────────────────────────────────────────────
  if (mnemonic === 'NOP') {
    return ok({}, `何もしない (NOP)`, 'NOP', 'NOP')
  }

  // ── SETcc ─────────────────────────────────────────────────────────────────
  if (mnemonic.startsWith('SET')) {
    const condSuffix = getCondSuffix(mnemonic, 'SET')
    const val = evalCond(condSuffix, state.flags) ? 1 : 0
    if (!op0 || op0.type !== 'reg') return { error: `${mnemonic}: reg operand必要` }
    const comment = `${op0.name} ← ${val} (${mnemonic})`
    return ok(regUpdate(op0.name, val), `条件セット (${mnemonic})`, comment, comment)
  }

  // ── XCHG ─────────────────────────────────────────────────────────────────
  if (mnemonic === 'XCHG') {
    if (!op0 || !op1) return { error: 'XCHG: operand不足' }
    const a = resolveOperandValue(op0, state)
    const b = resolveOperandValue(op1, state)
    const updates: StateUpdate = {}
    if (op0.type === 'reg') Object.assign(updates, regUpdate(op0.name, b))
    if (op1.type === 'reg') {
      const u = regUpdate(op1.name, a)
      Object.assign(updates, { regs: { ...(updates.regs ?? {}), ...(u.regs ?? {}) } })
    }
    const comment = `${op0.type === 'reg' ? op0.name : 'mem'} ↔ ${op1.type === 'reg' ? op1.name : 'mem'}`
    return ok(updates, `レジスタ交換 (XCHG)`, comment, comment)
  }

  return { error: `未実装の命令: ${mnemonic}` }
}
