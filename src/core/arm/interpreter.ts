// ARM instruction interpreter: ParsedInstruction + MachineState → StateUpdate + metadata

import type { MachineState, StateUpdate, Phase, StackFrame, StackMeta, Flags, Locale } from '../types'
import { BASE_PC_ARM, FRAME_COLORS_CYCLE } from '../types'
import { hexU32 } from '../simulator'
import { updateTopFrame } from '../utils'
import type { ParsedInstruction, Operand } from './parser'

export interface InterpretResult {
  update: StateUpdate
  explain: string
  effect: string
  comment: string   // concise inline annotation for CodePanel
  phase: Phase
  isArr?: boolean
  ptrReg?: string
  nextInstrIdx: number
}

type ArmCommentDict = {
  compare(a: string, b: string, flags: string): string
  push(regs: string): string
  pop(regs: string): string
  condSkip(cond: string): string
  branchCond(cond: string, label: string): string
  branch(label: string): string
  call(label: string, lr: string): string
  ret(reg: string): string
  nop: string
  cbzTaken(reg: string, label: string): string
  cbnzTaken(reg: string, label: string): string
  cbzSkip(reg: string): string
  cbnzSkip(reg: string): string
}

const ARM_COMMENTS: Record<Locale, ArmCommentDict> = {
  ja: {
    compare: (a, b, flags) => `${a} と ${b} を比較: ${flags}`,
    push: (regs) => `${regs} をスタックに保存`,
    pop: (regs) => `スタックから ${regs} を復元`,
    condSkip: (cond) => `${cond} 不成立、スキップ`,
    branchCond: (cond, label) => `${cond} 成立、${label} へ分岐`,
    branch: (label) => `${label} へ分岐`,
    call: (label, lr) => `${label}() を呼び出し（LR=${lr}）`,
    ret: (reg) => `${reg} へ戻る（関数復帰）`,
    nop: '（何もしない）',
    cbzTaken: (reg, label) => `${reg} = 0、${label} へ分岐`,
    cbnzTaken: (reg, label) => `${reg} ≠ 0、${label} へ分岐`,
    cbzSkip: (reg) => `${reg} ≠ 0、スキップ`,
    cbnzSkip: (reg) => `${reg} = 0、スキップ`,
  },
  en: {
    compare: (a, b, flags) => `Compare ${a} with ${b}: ${flags}`,
    push: (regs) => `Push ${regs} onto stack`,
    pop: (regs) => `Pop ${regs} from stack`,
    condSkip: (cond) => `${cond} not taken, skip`,
    branchCond: (cond, label) => `Branch to ${label} (${cond} taken)`,
    branch: (label) => `Branch to ${label}`,
    call: (label, lr) => `Call ${label}() (LR=${lr})`,
    ret: (reg) => `Return to ${reg}`,
    nop: '(no operation)',
    cbzTaken: (reg, label) => `${reg} = 0, branch to ${label}`,
    cbnzTaken: (reg, label) => `${reg} ≠ 0, branch to ${label}`,
    cbzSkip: (reg) => `${reg} ≠ 0, skip`,
    cbnzSkip: (reg) => `${reg} = 0, skip`,
  },
}

type ArmExplainDict = {
  mov(dst: string, withFlags: boolean): string
  add(withFlags: boolean): string
  sub(withFlags: boolean): string
  mul(withFlags: boolean): string
  div(): string
  bitwise(withFlags: boolean): string
  shift(withFlags: boolean): string
  cmp(): string
  ldrLiteral(): string
  ldr(writeBack: boolean, postIndex: boolean): string
  str(writeBack: boolean, postIndex: boolean): string
  push(): string
  pop(): string
  ldm(): string
  stm(): string
  condFalse(): string
  branch(): string
  call(): string
  bxRet(): string
  cbz(): string
  nop(): string
}

const ARM_EXPLAINS: Record<Locale, ArmExplainDict> = {
  ja: {
    mov: (dst, f) => `${dst} に値をセット${f ? '（フラグ更新）' : ''}`,
    add: (f) => `加算${f ? '（フラグ更新）' : ''}`,
    sub: (f) => `減算${f ? '（フラグ更新）' : ''}`,
    mul: (f) => `乗算${f ? '（フラグ更新）' : ''}`,
    div: () => '除算',
    bitwise: (f) => `ビット演算${f ? '（フラグ更新）' : ''}`,
    shift: (f) => `シフト演算${f ? '（フラグ更新）' : ''}`,
    cmp: () => '比較（フラグのみ更新）',
    ldrLiteral: () => 'リテラルプールから定数をロード',
    ldr: (wb, pi) => wb ? 'メモリからロード（ライトバック）' : pi ? 'メモリからロード（ポストインデックス）' : 'メモリからロード',
    str: (wb, pi) => wb ? 'メモリにストア（ライトバック）' : pi ? 'メモリにストア（ポストインデックス）' : 'メモリにストア',
    push: () => 'レジスタをスタックに保存',
    pop: () => 'スタックからレジスタを復元',
    ldm: () => '複数レジスタをメモリからロード',
    stm: () => '複数レジスタをメモリにストア',
    condFalse: () => '条件不成立、次へ',
    branch: () => '分岐',
    call: () => '関数呼び出し（LRに戻りアドレスを保存）',
    bxRet: () => 'レジスタにジャンプ（関数復帰）',
    cbz: () => 'ゼロ比較分岐',
    nop: () => '何もしない',
  },
  en: {
    mov: (dst, f) => `Move to ${dst}${f ? ' (with flags)' : ''}`,
    add: (f) => f ? 'Add (with flags)' : 'Add',
    sub: (f) => f ? 'Subtract (with flags)' : 'Subtract',
    mul: (f) => f ? 'Multiply (with flags)' : 'Multiply',
    div: () => 'Divide',
    bitwise: (f) => f ? 'Bitwise operation (with flags)' : 'Bitwise operation',
    shift: (f) => f ? 'Shift (with flags)' : 'Shift',
    cmp: () => 'Compare (flags only)',
    ldrLiteral: () => 'Load from literal pool',
    ldr: (wb, pi) => wb ? 'Load from memory (write-back)' : pi ? 'Load from memory (post-index)' : 'Load from memory',
    str: (wb, pi) => wb ? 'Store to memory (write-back)' : pi ? 'Store to memory (post-index)' : 'Store to memory',
    push: () => 'Push registers to stack',
    pop: () => 'Pop registers from stack',
    ldm: () => 'Load multiple registers',
    stm: () => 'Store multiple registers',
    condFalse: () => 'Condition not met, skip',
    branch: () => 'Branch',
    call: () => 'Function call (save return address to LR)',
    bxRet: () => 'Return (jump to register)',
    cbz: () => 'Compare and branch if zero/nonzero',
    nop: () => 'No operation',
  },
}

// フレームポインタ・スタックポインタを base に使う [] はポインタ参照ではなくローカル変数アクセス
const FRAME_REGS_ARM = new Set(['sp', 'fp', 'r7', 'r11'])

const BASE_PC = BASE_PC_ARM
// アドレス値を持つレジスタ — 数値ではなく 16 進表示する
const ADDR_REGS = new Set(['sp', 'lr', 'pc', 'fp'])

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * レジスタの種類に応じて値を適切な16進形式で表示する。
 *
 * @param regName - レジスタ名（'sp', 'lr', 'pc', 'fp' など）
 * @param val - 表示する数値
 * @returns アドレスレジスタは8桁16進（`0x20007ff0`）、それ以外は短縮16進（`0x3`）
 */
function fmtVal(regName: string, val: number): string {
  if (ADDR_REGS.has(regName)) return hexU32(val)
  return `0x${val.toString(16)}`
}

/**
 * 数値を学習者にとって意味が分かりやすい形式で表示する。
 *
 * ARM SRAM 領域（0x0800_0000〜）以上はアドレス値とみなして 16 進表示。
 * それ未満は符号付き 10 進数で表示する（学習時に値の意味が分かりやすいため）。
 *
 * @param val - 表示する数値
 * @returns アドレス値は8桁16進、それ以外は符号付き10進数の文字列
 */
function fmtDec(val: number): string {
  const u = val >>> 0
  if (u >= 0x08000000) return hexU32(u)
  return (val | 0).toString(10)
}

/**
 * レジスタ名と現在値を組み合わせた文字列を返す。
 *
 * コメント・effect 文字列の中で「どのレジスタが何の値を持っているか」を
 * 一目で分かるように示すために使う。
 *
 * @param name - レジスタ名（'r0', 'sp' など）
 * @param val - レジスタの現在値
 * @returns `"r0(3)"` や `"sp(0x20007ff0)"` 形式の文字列
 */
function fmtRV(name: string, val: number): string {
  const s = ADDR_REGS.has(name) ? hexU32(val >>> 0) : fmtDec(val)
  return `${name}(${s})`
}

/**
 * STR/LDR 命令のコメント用にメモリアドレス式の文字列を生成する。
 *
 * @param base - ベースレジスタ名（'r7', 'sp' など）
 * @param offset - バイトオフセット（正・負・ゼロ）
 * @param baseVal - ベースレジスタの現在値
 * @returns `"[r7+4]=0x20007fec"` 形式の文字列。オフセットが 0 の場合は `"[sp]=0x20007ff0"`
 */
function fmtMA(base: string, offset: number, baseVal: number): string {
  const addr = (baseVal + offset) >>> 0
  const off = offset === 0 ? '' : offset > 0 ? `+${offset}` : `${offset}`
  return `[${base}${off}]=${hexU32(addr)}`
}

/**
 * PUSH/POP のレジスタ処理順序を決めるための番号を返す。
 *
 * ARM 仕様では PUSH/POP はレジスタ番号の昇順にスタックへ格納・復元するため、
 * ソートキーとして使う（r0=0, ..., r12=12, sp=13, lr=14, pc=15）。
 *
 * @param name - レジスタ名（'r0'〜'r12', 'sp', 'lr', 'pc'）
 * @returns ソート用の番号（0〜15）
 */
function regOrder(name: string): number {
  if (name === 'pc') return 15
  if (name === 'lr') return 14
  if (name === 'sp') return 13
  const m = name.match(/r(\d+)/)
  return m ? parseInt(m[1] ?? '0', 10) : 0
}

/**
 * オペランドを ARM 仕様書準拠の表記文字列に変換する。
 *
 * ExplainPanel の syntax 欄に表示するために使う。
 *
 * @param op - パース済みオペランド（undefined の場合は `'?'` を返す）
 * @returns `'R0'`、`'#4'`、`'[SP, #-8]!'`、`'{R0, R1, LR}'` などの表記文字列
 */
function opLabel(op: Operand | undefined): string {
  if (!op) return '?'
  if (op.type === 'reg') {
    const sh = op.shift ? `, ${op.shift.op} #${op.shift.amount}` : ''
    return `${op.name.toUpperCase()}${sh}`
  }
  if (op.type === 'imm') return `#${op.value}`
  if (op.type === 'mem') {
    const base = `[${op.base.toUpperCase()}, #${op.offset}]`
    if (op.writeBack) return `${base}!`
    if (op.postIndex !== undefined) return `[${op.base.toUpperCase()}], #${op.postIndex}`
    return base
  }
  if (op.type === 'label') return op.name
  if (op.type === 'reglist') return `{${op.regs.map(r => r.toUpperCase()).join(', ')}}`
  return ''
}

// ── State helpers ────────────────────────────────────────────────────────────

/**
 * レジスタ名から現在の値を取得する。
 *
 * sp/lr/pc は MachineState の専用フィールドを参照し、
 * 汎用レジスタは regs オブジェクトを参照する。
 */
function getReg(name: string, state: MachineState): number {
  if (name === 'sp') return state.sp
  if (name === 'lr') return state.lr
  if (name === 'pc') return state.pc
  return state.regs[name] ?? 0
}

/**
 * レジスタ名と新しい値から StateUpdate の部分オブジェクトを生成する。
 *
 * sp/lr/pc は StateUpdate の専用フィールドに格納し、
 * 汎用レジスタは `regs` オブジェクトに格納する。
 */
function setRegUpdate(name: string, value: number): Partial<StateUpdate> {
  if (name === 'sp') return { sp: value }
  if (name === 'lr') return { lr: value }
  if (name === 'pc') return { pc: value }
  return { regs: { [name]: value } }
}

/**
 * オペランドから実際の数値を解決する。
 *
 * レジスタ参照の場合はシフト演算（LSL/LSR/ASR/ROR）も適用してから返す。
 */
function resolveVal(op: Operand | undefined, state: MachineState): number {
  if (!op) return 0
  if (op.type === 'reg') {
    let v = getReg(op.name, state)
    if (op.shift) {
      const { op: shOp, amount } = op.shift
      v = shOp === 'LSL' ? (v << amount) >>> 0
        : shOp === 'LSR' ? v >>> amount
        : shOp === 'ASR' ? ((v | 0) >> amount) >>> 0
        : ((v >>> amount) | (v << (32 - amount))) >>> 0
    }
    return v >>> 0
  }
  if (op.type === 'imm') return op.value
  return 0
}

/**
 * 算術演算の結果から CPSR フラグを計算する。
 *
 * ARM の C フラグは減算時に「借りが発生しなかった（a >= b）」のとき 1 になる点に注意
 * （x86 の CF とは逆の定義）。V フラグは両オペランドが同符号で結果が異符号のときに立つ。
 *
 * @param isSub - 減算命令の場合 true（C フラグの計算方法が変わる）
 */
function computeFlags(result: number, a: number, b: number, isSub: boolean): Partial<Flags> {
  const r32 = result >>> 0
  return {
    zero: r32 === 0,
    negative: (r32 >>> 31) !== 0,
    // 減算の C フラグ: ARM は「借りが発生しなかった（a >= b）」のとき 1（x86 と逆）
    carry: isSub ? (a >>> 0) >= (b >>> 0) : result > 0xffffffff,
    // V フラグ: 両オペランドが同符号で結果が異符号 = 符号付きオーバーフロー
    overflow: (() => {
      const as = (a >>> 31) !== 0
      const bs = isSub ? ((~b >>> 0) >>> 31) !== 0 : (b >>> 31) !== 0
      const rs = (r32 >>> 31) !== 0
      return as === bs && rs !== as
    })(),
  }
}

/**
 * ARM 条件コードが現在のフラグ状態で成立するかを返す。
 *
 * ARM Architecture Reference Manual B1.1 に準拠した全条件コードに対応する。
 */
function checkCond(c: string, state: MachineState): boolean {
  const f = state.flags
  switch (c) {
    case 'AL': return true
    case 'EQ': return f.zero
    case 'NE': return !f.zero
    case 'LT': return f.negative !== f.overflow
    case 'GT': return !f.zero && f.negative === f.overflow
    case 'LE': return f.zero || f.negative !== f.overflow
    case 'GE': return f.negative === f.overflow
    case 'HI': return !f.zero && f.carry
    case 'LS': return f.zero || !f.carry
    case 'MI': return f.negative
    case 'PL': return !f.negative
    case 'CS': case 'HS': return f.carry
    case 'CC': case 'LO': return !f.carry
    case 'VS': return f.overflow
    case 'VC': return !f.overflow
    default: return true
  }
}

/**
 * SP が下がるたびに最上位フレームの lo を更新する。
 *
 * スタックは下方向に成長するため、lo = 現在の SP（フレーム下端）を追跡することで
 * FrameViz がフレームサイズを正しく描画できる。
 */
// ── Instruction group handlers ───────────────────────────────────────────────
// 各ハンドラーは担当外の命令に対して null を返す（dispatch パターン）

/**
 * データ転送命令（MOV / MVN）を処理する。
 */
function handleDataTransfer(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'MOV' && mnemonic !== 'MVN') return null
  const dst = operands[0]
  const src = operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: レジスタが必要: ${raw}` }
  if (dst.name === 'pc') return { error: 'PC への直接書き込みは非対応 (BX LR を使用)' }
  const srcVal = resolveVal(src, state)
  let val = srcVal >>> 0
  if (mnemonic === 'MVN') val = (~val) >>> 0
  const update: StateUpdate = { ...setRegUpdate(dst.name, val), pc: BASE_PC + defaultNext * 4 }
  if (dst.name === 'sp') update.frames = updateTopFrame(val, state)
  if (sFlag) update.flags = computeFlags(val, val, 0, false)
  const comment = mnemonic === 'MVN'
    ? `${dst.name} ← ~${src?.type === 'reg' ? fmtRV(src.name, srcVal) : srcVal} = ${fmtDec(val)}`
    : src?.type === 'reg'
      ? `${dst.name} ← ${fmtRV(src.name, srcVal)}`
      : `${dst.name} ← ${fmtDec(val)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].mov(opLabel(dst), sFlag),
    effect: `${dst.name} ← ${fmtVal(dst.name, val)}`,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 加算命令（ADD / ADC）を処理する。
 */
function handleAdd(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'ADD' && mnemonic !== 'ADC') return null
  const dst = operands[0]
  const src1 = operands.length >= 3 ? operands[1] : operands[0]
  const src2 = operands.length >= 3 ? operands[2] : operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(src1, state)
  const b = resolveVal(src2, state)
  const c = mnemonic === 'ADC' ? (state.flags.carry ? 1 : 0) : 0
  const result = (a + b + c) >>> 0
  const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
  if (dst.name === 'sp') update.frames = updateTopFrame(result, state)
  if (sFlag) update.flags = computeFlags(a + b + c, a, b, false)
  const aLabel = src1?.type === 'reg' ? fmtRV(src1.name, a) : `${a | 0}`
  const bLabel = src2?.type === 'reg' ? fmtRV(src2.name, b) : `#${b}`
  const exprStr = dst.name === 'sp'
    ? `sp ← sp(${hexU32(a)}) + ${b} = ${hexU32(result)}`
    : `${dst.name} ← ${aLabel} + ${bLabel}${c ? ' + carry' : ''} = ${fmtDec(result)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].add(sFlag),
    effect: exprStr,
    comment: exprStr,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 減算命令（SUB / SBC / RSB）を処理する。
 */
function handleSub(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'SUB' && mnemonic !== 'SBC' && mnemonic !== 'RSB') return null
  const dst = operands[0]
  const src1 = operands.length >= 3 ? operands[1] : operands[0]
  const src2 = operands.length >= 3 ? operands[2] : operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(src1, state)
  const b = resolveVal(src2, state)
  const borrow = mnemonic === 'SBC' ? (state.flags.carry ? 0 : 1) : 0
  const result = (mnemonic === 'RSB' ? b - a - borrow : a - b - borrow) >>> 0
  const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
  if (dst.name === 'sp') update.frames = updateTopFrame(result, state)
  if (sFlag) update.flags = computeFlags(a - b - borrow, a, b, true)
  const aLabel = src1?.type === 'reg' ? fmtRV(src1.name, a) : `${a | 0}`
  const bLabel = src2?.type === 'reg' ? fmtRV(src2.name, b) : `#${b}`
  const exprStr = dst.name === 'sp'
    ? `sp ← sp(${hexU32(a)}) - ${b} = ${hexU32(result)}`
    : mnemonic === 'RSB'
      ? `${dst.name} ← ${bLabel} - ${aLabel} = ${fmtDec(result)}`
      : `${dst.name} ← ${aLabel} - ${bLabel}${borrow ? ' - borrow' : ''} = ${fmtDec(result)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].sub(sFlag),
    effect: exprStr,
    comment: exprStr,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 乗算命令（MUL / MLA / MLS）を処理する。
 */
function handleMul(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'MUL' && mnemonic !== 'MLA' && mnemonic !== 'MLS') return null
  const dst = operands[0]
  const rn = operands[1] ?? operands[0]
  const rm = operands[2] ?? operands[1]
  const ra = operands[3]  // MLA/MLS only
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(rn, state)
  const b = resolveVal(rm, state)
  const acc = ra ? resolveVal(ra, state) : 0
  const mul = Math.imul(a, b)
  const result = (mnemonic === 'MLA' ? mul + acc : mnemonic === 'MLS' ? acc - mul : mul) >>> 0
  const aLabel = rn?.type === 'reg' ? fmtRV(rn.name, a) : `${a}`
  const bLabel = rm?.type === 'reg' ? fmtRV(rm.name, b) : `${b}`
  const comment = mnemonic === 'MUL'
    ? `${dst.name} ← ${aLabel} × ${bLabel} = ${fmtDec(result)}`
    : `${dst.name} ← ${aLabel} × ${bLabel} ${mnemonic === 'MLA' ? '+' : '-'} ${fmtDec(acc)} = ${fmtDec(result)}`
  return {
    update: { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 },
    explain: ARM_EXPLAINS[locale].mul(sFlag),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 除算命令（SDIV / UDIV）を処理する。
 */
function handleDiv(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'SDIV' && mnemonic !== 'UDIV') return null
  const dst = operands[0]
  const rn = operands.length >= 3 ? operands[1] : operands[0]
  const rm = operands.length >= 3 ? operands[2] : operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(rn, state)
  const b = resolveVal(rm, state)
  if (b === 0) return { error: `${mnemonic}: ゼロ除算: ${raw}` }
  const result = Math.trunc(a / b) >>> 0
  const aLabel = rn?.type === 'reg' ? fmtRV(rn.name, a) : `${a}`
  const bLabel = rm?.type === 'reg' ? fmtRV(rm.name, b) : `${b}`
  const comment = `${dst.name} ← ${aLabel} ÷ ${bLabel} = ${fmtDec(result)}`
  return {
    update: { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 },
    explain: ARM_EXPLAINS[locale].div(),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * ビット論理演算命令（AND / ORR / EOR / BIC）を処理する。
 */
function handleBitwise(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'AND' && mnemonic !== 'ORR' && mnemonic !== 'EOR' && mnemonic !== 'BIC') return null
  const dst = operands[0]
  const src1 = operands.length >= 3 ? operands[1] : operands[0]
  const src2 = operands.length >= 3 ? operands[2] : operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(src1, state)
  const b = resolveVal(src2, state)
  const result = (
    mnemonic === 'AND' ? a & b :
    mnemonic === 'ORR' ? a | b :
    mnemonic === 'EOR' ? a ^ b :
    a & ~b
  ) >>> 0
  const opSym = mnemonic === 'AND' ? '&' : mnemonic === 'ORR' ? '|' : mnemonic === 'EOR' ? '^' : '& ~'
  const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
  if (sFlag) update.flags = computeFlags(result, a, b, false)
  const aLabel = src1?.type === 'reg' ? fmtRV(src1.name, a) : `0x${a.toString(16)}`
  const bLabel = src2?.type === 'reg' ? fmtRV(src2.name, b) : `0x${b.toString(16)}`
  const comment = `${dst.name} ← ${aLabel} ${opSym} ${bLabel} = 0x${result.toString(16)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].bitwise(sFlag),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * シフト命令（LSL / LSR / ASR / ROR）を処理する。
 */
function handleShift(
  mnemonic: string, sFlag: boolean, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'LSL' && mnemonic !== 'LSR' && mnemonic !== 'ASR' && mnemonic !== 'ROR') return null
  const dst = operands[0]
  const src = operands.length >= 3 ? operands[1] : operands[0]
  const shiftOp = operands.length >= 3 ? operands[2] : operands[1]
  if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const val = resolveVal(src, state) >>> 0
  const shamt = resolveVal(shiftOp, state) & 0x1f
  const result = (
    mnemonic === 'LSL' ? (val << shamt) >>> 0 :
    mnemonic === 'LSR' ? val >>> shamt :
    mnemonic === 'ASR' ? ((val | 0) >> shamt) >>> 0 :
    ((val >>> shamt) | (val << (32 - shamt))) >>> 0
  )
  const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
  if (sFlag) update.flags = computeFlags(result, val, shamt, false)
  const symMap: Record<string, string> = { LSL: '<<', LSR: '>>', ASR: '>>>', ROR: 'ror' }
  const sym = symMap[mnemonic] ?? mnemonic
  const srcLabel = src?.type === 'reg' ? fmtRV(src.name, val) : `${val}`
  const comment = `${dst.name} ← ${srcLabel} ${sym} ${shamt} = ${fmtDec(result)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].shift(sFlag),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 比較命令（CMP / CMN / TST / TEQ）を処理する。
 */
function handleCompare(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'CMP' && mnemonic !== 'CMN' && mnemonic !== 'TST' && mnemonic !== 'TEQ') return null
  const src1 = operands[0]
  const src2 = operands[1]
  if (!src1 || !src2) return { error: `${mnemonic}: オペランドエラー: ${raw}` }
  const a = resolveVal(src1, state)
  const b = resolveVal(src2, state)
  let flags: Partial<Flags>
  if (mnemonic === 'CMP') {
    flags = computeFlags(a - b, a, b, true)
  } else if (mnemonic === 'CMN') {
    flags = computeFlags(a + b, a, b, false)
  } else {
    const r = (mnemonic === 'TST' ? a & b : a ^ b) >>> 0
    flags = { zero: r === 0, negative: (r >>> 31) !== 0, carry: state.flags.carry, overflow: state.flags.overflow }
  }
  const aLabel = src1.type === 'reg' ? fmtRV(src1.name, a) : `${a}`
  const bLabel = src2.type === 'reg' ? fmtRV(src2.name, b) : `#${b}`
  const flagStr = `Z=${flags.zero ? 1 : 0} N=${flags.negative ? 1 : 0} C=${flags.carry ? 1 : 0} V=${flags.overflow ? 1 : 0}`
  return {
    update: { flags, pc: BASE_PC + defaultNext * 4 },
    explain: ARM_EXPLAINS[locale].cmp(),
    effect: flagStr,
    comment: ARM_COMMENTS[locale].compare(aLabel, bLabel, flagStr),
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * ロード命令（LDR / LDRB / LDRH）を処理する。
 */
function handleLoad(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  dataLabels: Map<string, number>, locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'LDR' && mnemonic !== 'LDRB' && mnemonic !== 'LDRH') return null
  const dst = operands[0]
  const src = operands[1]
  if (dst?.type !== 'reg') return { error: `LDR: レジスタが必要: ${raw}` }

  // PC-relative literal pool load: `ldr r2, .L5`
  // Resolve label → ROM address, then read from state.stack (pre-populated with romData)
  if (src?.type === 'label') {
    const romAddr = dataLabels.get(src.name) ?? 0
    const val = state.stack[romAddr] ?? 0
    const comment = `${dst.name} ← ${fmtDec(val)}（定数プール）`
    return {
      update: { ...setRegUpdate(dst.name, val), pc: BASE_PC + defaultNext * 4 },
      explain: ARM_EXPLAINS[locale].ldrLiteral(),
      effect: comment,
      comment,
      phase, nextInstrIdx: defaultNext,
    }
  }

  if (src?.type !== 'mem') return { error: `LDR: メモリオペランドが必要: ${raw}` }
  const baseVal = getReg(src.base, state)
  const addr = src.postIndex !== undefined ? baseVal : baseVal + src.offset
  const val = state.stack[addr] ?? 0
  const update: StateUpdate = { ...setRegUpdate(dst.name, val), pc: BASE_PC + defaultNext * 4 }
  if (src.writeBack) Object.assign(update, setRegUpdate(src.base, addr))
  if (src.postIndex !== undefined) Object.assign(update, setRegUpdate(src.base, baseVal + src.postIndex))
  const memDesc = fmtMA(src.base, src.postIndex !== undefined ? 0 : src.offset, baseVal)
  const comment = `${dst.name} ← ${memDesc}(${fmtDec(val)})`
  return {
    update,
    explain: ARM_EXPLAINS[locale].ldr(src.writeBack ?? false, src.postIndex !== undefined),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
    ptrReg: FRAME_REGS_ARM.has(src.base) ? undefined : src.base,
  }
}

/**
 * ストア命令（STR / STRB / STRH）を処理する。
 */
function handleStore(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic !== 'STR' && mnemonic !== 'STRB' && mnemonic !== 'STRH') return null
  const src = operands[0]
  const dst = operands[1]
  if (src?.type !== 'reg') return { error: `STR: レジスタが必要: ${raw}` }
  if (dst?.type !== 'mem') return { error: `STR: メモリオペランドが必要: ${raw}` }
  const baseVal = getReg(dst.base, state)
  const addr = dst.postIndex !== undefined ? baseVal : baseVal + dst.offset
  const val = getReg(src.name, state)
  const metaSet: Record<number, StackMeta> = { [addr]: { label: `${src.name.toUpperCase()} → [0x${addr.toString(16)}]`, kind: 'sw' } }
  const update: StateUpdate = { stackSet: { [addr]: val }, metaSet, pc: BASE_PC + defaultNext * 4 }
  if (dst.writeBack) Object.assign(update, setRegUpdate(dst.base, addr))
  if (dst.postIndex !== undefined) Object.assign(update, setRegUpdate(dst.base, baseVal + dst.postIndex))
  const memDesc = fmtMA(dst.base, dst.postIndex !== undefined ? 0 : dst.offset, baseVal)
  const comment = `${memDesc} ← ${fmtRV(src.name, val)}`
  return {
    update,
    explain: ARM_EXPLAINS[locale].str(dst.writeBack ?? false, dst.postIndex !== undefined),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
    ptrReg: FRAME_REGS_ARM.has(dst.base) ? undefined : dst.base,
  }
}

/**
 * スタック操作命令（PUSH / POP）を処理する。
 */
function handleStack(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  instrCount: number, locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic === 'PUSH') {
    const reglist = operands[0]
    if (reglist?.type !== 'reglist') return { error: `PUSH: レジスタリストが必要: ${raw}` }
    const regs = [...reglist.regs].sort((a, b) => regOrder(a) - regOrder(b))
    const newSp = state.sp - 4 * regs.length
    const stackSet: Record<number, number> = {}
    const metaSet: Record<number, StackMeta> = {}
    let addr = newSp
    for (const reg of regs) {
      stackSet[addr] = getReg(reg, state)
      metaSet[addr] = { label: `保存 ${reg.toUpperCase()}`, kind: 'sw' }
      addr += 4
    }
    const frames = updateTopFrame(newSp, state)
    const regLabels = regs.map(r => fmtRV(r, getReg(r, state))).join(', ')
    return {
      update: { sp: newSp, stackSet, metaSet, frames, pc: BASE_PC + defaultNext * 4 },
      explain: ARM_EXPLAINS[locale].push(),
      effect: `sp ← ${hexU32(newSp)}; [sp] ← ${regLabels}`,
      comment: ARM_COMMENTS[locale].push(regLabels),
      phase, nextInstrIdx: defaultNext,
    }
  }

  if (mnemonic === 'POP') {
    const reglist = operands[0]
    if (reglist?.type !== 'reglist') return { error: `POP: レジスタリストが必要: ${raw}` }
    const regs = [...reglist.regs].sort((a, b) => regOrder(a) - regOrder(b))
    let sp = state.sp
    const newRegs: Record<string, number> = {}
    const stackRemove: number[] = []
    const metaRemove: number[] = []
    let newLr: number | undefined
    let nextIdx = defaultNext
    let retPhase = false

    let spCursor = state.sp
    const popLabels = regs.map(r => {
      const v = state.stack[spCursor] ?? 0
      spCursor += 4
      return fmtRV(r, v)
    }).join(', ')

    for (const reg of regs) {
      const val = state.stack[sp] ?? 0
      stackRemove.push(sp)
      metaRemove.push(sp)
      if (reg === 'pc') {
        retPhase = true
        // スタックに積まれた LR 値（= 戻りアドレス）を命令インデックスに変換。
        // 仮想 PC（BASE_PC + i*4）から i を逆算することでステップ配列を正しく辿れる。
        const ti = (val - BASE_PC) / 4
        nextIdx = Number.isInteger(ti) && ti >= 0 && ti < instrCount ? ti : instrCount
      } else if (reg === 'lr') {
        newLr = val
      } else {
        newRegs[reg] = val
      }
      sp += 4
    }

    // pop {pc} は関数復帰 — トップフレームを削除する（bx lr と同じ処理）
    const frames = retPhase
      ? (state.frames.length > 1 ? state.frames.slice(0, -1) : [...state.frames])
      : updateTopFrame(sp, state)
    const update: StateUpdate = { regs: newRegs, sp, stackRemove, metaRemove, frames, pc: BASE_PC + nextIdx * 4 }
    if (newLr !== undefined) update.lr = newLr
    return {
      update,
      explain: ARM_EXPLAINS[locale].pop(),
      effect: `${popLabels} ← [旧sp]; sp ← ${hexU32(sp)}`,
      comment: ARM_COMMENTS[locale].pop(popLabels),
      phase: retPhase ? 'ret' : phase,
      nextInstrIdx: nextIdx,
    }
  }

  return null
}

/**
 * 複数レジスタのロード／ストア命令（LDM / STM とそのサフィックス変形）を処理する。
 *
 * GCC は配列初期化で `ldm r2, {r0,r1,r2}` + `stm r7, {r0,r1,r2}` パターンを使う。
 * ベースレジスタがレジスタリストに含まれる場合でも、アドレス計算は元の値で行う。
 */
function handleLDMSTM(
  mnemonic: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  locale: Locale,
): InterpretResult | { error: string } | null {
  const isLDM = mnemonic === 'LDM' || mnemonic === 'LDMIA' || mnemonic === 'LDMFD'
  const isSTM = mnemonic === 'STM' || mnemonic === 'STMIA' || mnemonic === 'STMEA'
  if (!isLDM && !isSTM) return null

  const base = operands[0]
  const reglistOp = operands[1]
  if (base?.type !== 'reg') return { error: `${mnemonic}: ベースレジスタが必要: ${raw}` }
  if (reglistOp?.type !== 'reglist') return { error: `${mnemonic}: レジスタリストが必要: ${raw}` }

  const baseAddr = getReg(base.name, state)
  const regs = [...reglistOp.regs].sort((a, b) => regOrder(a) - regOrder(b))

  if (isLDM) {
    const newRegs: Record<string, number> = {}
    let addr = baseAddr
    for (const reg of regs) {
      newRegs[reg] = state.stack[addr] ?? 0
      addr += 4
    }
    const comment = `${regs.join(', ')} ← [${hexU32(baseAddr)}+]`
    return {
      update: { regs: newRegs, pc: BASE_PC + defaultNext * 4 },
      explain: ARM_EXPLAINS[locale].ldm(),
      effect: comment,
      comment,
      phase, nextInstrIdx: defaultNext,
    }
  }

  // STM
  const stackSet: Record<number, number> = {}
  const metaSet: Record<number, StackMeta> = {}
  let addr = baseAddr
  for (const reg of regs) {
    stackSet[addr] = getReg(reg, state)
    metaSet[addr] = { label: reg.toUpperCase(), kind: 'sw' }
    addr += 4
  }
  const comment = `[${hexU32(baseAddr)}+] ← ${regs.join(', ')}`
  return {
    update: { stackSet, metaSet, pc: BASE_PC + defaultNext * 4 },
    explain: ARM_EXPLAINS[locale].stm(),
    effect: comment,
    comment,
    phase, nextInstrIdx: defaultNext,
  }
}

/**
 * 分岐命令（B / BL / BX / CBZ / CBNZ）を処理する。
 */
function handleBranch(
  mnemonic: string, cond: string, operands: Operand[],
  state: MachineState, phase: Phase, defaultNext: number, raw: string,
  labels: Map<string, number>, instrCount: number, callDepth: number,
  locale: Locale,
): InterpretResult | { error: string } | null {
  if (mnemonic === 'B') {
    const taken = checkCond(cond, state)
    if (!taken) {
      return {
        update: { pc: BASE_PC + defaultNext * 4 },
        explain: ARM_EXPLAINS[locale].condFalse(),
        effect: ARM_COMMENTS[locale].condSkip(cond),
        comment: ARM_COMMENTS[locale].condSkip(cond),
        phase, nextInstrIdx: defaultNext,
      }
    }
    const labelOp = operands[0]
    if (labelOp?.type !== 'label') return { error: `B: ラベルが必要: ${raw}` }
    const target = labels.get(labelOp.name)
    if (target === undefined) return { error: `B: 未定義ラベル: ${labelOp.name}` }
    return {
      update: { pc: BASE_PC + target * 4 },
      explain: ARM_EXPLAINS[locale].branch(),
      effect: `PC ← ${labelOp.name}(${hexU32(BASE_PC + target * 4)})`,
      comment: cond === 'AL'
        ? ARM_COMMENTS[locale].branch(labelOp.name)
        : ARM_COMMENTS[locale].branchCond(cond, labelOp.name),
      phase, nextInstrIdx: target,
    }
  }

  if (mnemonic === 'BL') {
    const labelOp = operands[0]
    if (labelOp?.type !== 'label') return { error: `BL: ラベルが必要: ${raw}` }
    const target = labels.get(labelOp.name)
    if (target === undefined) return { error: `BL: 未定義ラベル: ${labelOp.name}` }
    // ARM ABI: BL は次の命令アドレスを LR に保存してジャンプする。
    // ハードウェアは自動的にスタックを触らないため、LR が戻りアドレスになる。
    const retAddr = BASE_PC + defaultNext * 4
    const targetAddr = BASE_PC + target * 4
    const newColor = FRAME_COLORS_CYCLE[(callDepth + 1) % FRAME_COLORS_CYCLE.length] ?? 'purple'
    // フレームの lo/hi は最初 SP と同値にしておき、その後の PUSH で lo が更新される
    const newFrame: StackFrame = { name: labelOp.name, lo: state.sp, hi: state.sp, color: newColor }
    return {
      update: { lr: retAddr, frames: [...state.frames, newFrame], pc: targetAddr },
      explain: ARM_EXPLAINS[locale].call(),
      effect: `LR ← ${hexU32(retAddr)}, PC ← ${labelOp.name}`,
      comment: ARM_COMMENTS[locale].call(labelOp.name, hexU32(retAddr)),
      phase, nextInstrIdx: target,
    }
  }

  if (mnemonic === 'BX') {
    const reg = operands[0]
    if (reg?.type !== 'reg') return { error: `BX: レジスタが必要: ${raw}` }
    const lrVal = getReg(reg.name, state)
    const ti = (lrVal - BASE_PC) / 4
    const valid = Number.isInteger(ti) && ti >= 0 && ti < instrCount
    const nextIdx = valid ? ti : instrCount
    const frames = state.frames.length > 1 ? state.frames.slice(0, -1) : [...state.frames]
    return {
      update: { frames, pc: lrVal },
      explain: ARM_EXPLAINS[locale].bxRet(),
      effect: `PC ← ${fmtRV(reg.name, lrVal)}`,
      comment: ARM_COMMENTS[locale].ret(fmtRV(reg.name, lrVal)),
      phase: 'ret', nextInstrIdx: nextIdx,
    }
  }

  if (mnemonic === 'CBZ' || mnemonic === 'CBNZ') {
    const reg = operands[0]
    const labelOp = operands[1]
    if (reg?.type !== 'reg' || labelOp?.type !== 'label') {
      return { error: `${mnemonic}: オペランドエラー: ${raw}` }
    }
    const val = getReg(reg.name, state)
    const taken = mnemonic === 'CBZ' ? val === 0 : val !== 0
    if (taken && !labels.has(labelOp.name)) {
      return { error: `${mnemonic}: 未定義ラベル: ${labelOp.name}` }
    }
    const target = taken ? (labels.get(labelOp.name) ?? defaultNext) : defaultNext
    const regLabel = fmtRV(reg.name, val)
    const comment = taken
      ? mnemonic === 'CBZ'
        ? ARM_COMMENTS[locale].cbzTaken(regLabel, labelOp.name)
        : ARM_COMMENTS[locale].cbnzTaken(regLabel, labelOp.name)
      : mnemonic === 'CBZ'
        ? ARM_COMMENTS[locale].cbzSkip(regLabel)
        : ARM_COMMENTS[locale].cbnzSkip(regLabel)
    const effect = taken
      ? `PC ← ${labelOp.name}(${hexU32(BASE_PC + target * 4)})`
      : `スキップ`
    return {
      update: { pc: BASE_PC + target * 4 },
      explain: ARM_EXPLAINS[locale].cbz(),
      effect,
      comment,
      phase, nextInstrIdx: target,
    }
  }

  return null
}

// ── Main dispatch ────────────────────────────────────────────────────────────

/**
 * 1命令を解釈して StateUpdate・説明文・次命令インデックスを返す。
 *
 * 未対応命令やオペランドエラーの場合は `{ error: string }` を返す。
 *
 * @param instr - パース済み命令オブジェクト
 * @param instrIdx - 命令配列内の現在インデックス
 * @param state - 実行前のマシン状態スナップショット
 * @param labels - ラベル名 → 命令インデックスのマップ
 * @param instrCount - 全命令数（範囲チェックに使う）
 * @param callDepth - 現在の呼び出し深度（フレーム色の決定と phase の判断に使う）
 * @returns 実行結果（`InterpretResult`）またはエラー（`{ error: string }`）
 */
export function interpretInstruction(
  instr: ParsedInstruction,
  instrIdx: number,
  state: MachineState,
  labels: Map<string, number>,
  dataLabels: Map<string, number>,
  instrCount: number,
  callDepth: number,
  locale: Locale = 'ja',
): InterpretResult | { error: string } {
  const { mnemonic, cond, sFlag, operands } = instr
  const phase: Phase = callDepth === 0 ? 'caller' : 'callee'
  const defaultNext = instrIdx + 1
  const raw = instr.raw

  return (
    handleDataTransfer(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleAdd(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleSub(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleMul(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleDiv(mnemonic, operands, state, phase, defaultNext, raw, locale) ??
    handleBitwise(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleShift(mnemonic, sFlag, operands, state, phase, defaultNext, raw, locale) ??
    handleCompare(mnemonic, operands, state, phase, defaultNext, raw, locale) ??
    handleLoad(mnemonic, operands, state, phase, defaultNext, raw, dataLabels, locale) ??
    handleStore(mnemonic, operands, state, phase, defaultNext, raw, locale) ??
    handleStack(mnemonic, operands, state, phase, defaultNext, raw, instrCount, locale) ??
    handleLDMSTM(mnemonic, operands, state, phase, defaultNext, raw, locale) ??
    handleBranch(mnemonic, cond, operands, state, phase, defaultNext, raw, labels, instrCount, callDepth, locale) ??
    (mnemonic === 'NOP' ? {
      update: { pc: BASE_PC + defaultNext * 4 },
      explain: ARM_EXPLAINS[locale].nop(),
      effect: '（処理なし）',
      comment: ARM_COMMENTS[locale].nop,
      phase, nextInstrIdx: defaultNext,
    } : { error: `未対応の命令: ${mnemonic} (${raw})` })
  )
}
