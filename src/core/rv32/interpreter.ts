// RISC-V RV32IM 命令インタープリタ。
// RV32Instruction + MachineState → StateUpdate + 表示メタデータ を返す。

import type { MachineState, StateUpdate, Phase, Locale } from '../types'
import { FRAME_COLORS_CYCLE } from '../types'
import { hexU32 } from '../simulator'
import { updateTopFrame } from '../utils'
import type { RV32Instruction, RV32Operand } from './parser'

export interface RV32InterpretResult {
  update: StateUpdate
  explain: string
  effect: string
  comment: string
  phase: Phase
  isArr?: boolean
  ptrReg?: string
  nextInstrIdx: number
}

// ---- i18n 辞書 ----

type RV32ExplainDict = {
  addi(dst: string): string
  add(dst: string): string
  sub(dst: string): string
  lui(dst: string): string
  auipc(dst: string): string
  logic(op: string, dst: string): string
  logici(op: string, dst: string): string
  shift(op: string, dst: string): string
  slt(dst: string, signed: boolean): string
  load(size: string, dst: string, signed: boolean): string
  store(size: string): string
  branch(taken: boolean, cond: string, label: string): string
  jal(dst: string, label: string): string
  jalr(dst: string): string
  mul(op: string, dst: string): string
  div(op: string, dst: string): string
  rem(op: string, dst: string): string
  mv(dst: string, src: string): string
  li(dst: string): string
  ret(): string
  nop(): string
  call(label: string): string
  la(dst: string): string
  pseudo1(name: string, dst: string): string
}

type RV32CommentDict = {
  store(reg: string, addr: string): string
  load(reg: string, addr: string): string
  branch(cond: string, label: string, taken: boolean): string
  call(label: string, ra: string): string
  ret(ra: string): string
  jal(label: string, ra: string): string
}

type RV32ErrorDict = {
  unknownInstr(m: string): string
  regNotFound(name: string): string
  badMem(addr: string): string
}

const RV32_EXPLAINS: Record<Locale, RV32ExplainDict> = {
  ja: {
    addi:   (dst)           => `${dst} に即値を加算`,
    add:    (dst)           => `${dst} に rs1 と rs2 の和を格納`,
    sub:    (dst)           => `${dst} に rs1 - rs2 を格納`,
    lui:    (dst)           => `${dst} の上位 20bit に即値をロード`,
    auipc:  (dst)           => `PC に即値 (上位20bit) を加算して ${dst} に格納`,
    logic:  (op, dst)       => `${dst} に ${op} 演算結果を格納`,
    logici: (op, dst)       => `${dst} に即値との ${op} 演算結果を格納`,
    shift:  (op, dst)       => `${dst} を ${op} シフト`,
    slt:    (dst, signed)   => `rs1 < rs2 なら ${dst}=1、そうでなければ 0（${signed ? '符号あり' : '符号なし'}）`,
    load:   (size, dst, s)  => `メモリからレジスタ ${dst} に ${size} ロード（${s ? '符号拡張' : '0拡張'}）`,
    store:  (size)          => `レジスタ値をメモリに ${size} ストア`,
    branch: (taken, cond, label) => taken
      ? `条件 (${cond}) 成立、${label} へ分岐`
      : `条件 (${cond}) 不成立、次の命令へ`,
    jal:    (dst, label)    => `${label} へジャンプ、戻りアドレスを ${dst} に保存`,
    jalr:   (dst)           => `rs1+imm へジャンプ、戻りアドレスを ${dst} に保存`,
    mul:    (op, dst)       => `${dst} に乗算結果 (${op}) を格納`,
    div:    (op, dst)       => `${dst} に除算結果 (${op}) を格納`,
    rem:    (op, dst)       => `${dst} に余り (${op}) を格納`,
    mv:     (dst, src)      => `${src} の値を ${dst} にコピー`,
    li:     (dst)           => `${dst} に即値をロード`,
    ret:    ()              => `ra レジスタのアドレスに戻る（関数復帰）`,
    nop:    ()              => `何もしない（no operation）`,
    call:   (label)         => `${label}() を呼び出し、戻りアドレスを ra に保存`,
    la:     (dst)           => `シンボルのアドレスを ${dst} にロード`,
    pseudo1:(name, dst)     => `${name} 疑似命令: ${dst} に格納`,
  },
  en: {
    addi:   (dst)           => `Add immediate to ${dst}`,
    add:    (dst)           => `Add rs1 and rs2, store in ${dst}`,
    sub:    (dst)           => `Subtract rs2 from rs1, store in ${dst}`,
    lui:    (dst)           => `Load upper 20-bit immediate into ${dst}`,
    auipc:  (dst)           => `Add upper immediate to PC, store in ${dst}`,
    logic:  (op, dst)       => `Store ${op} of rs1, rs2 in ${dst}`,
    logici: (op, dst)       => `Store ${op} of rs1 and immediate in ${dst}`,
    shift:  (op, dst)       => `${op}-shift ${dst}`,
    slt:    (dst, signed)   => `Set ${dst}=1 if rs1 < rs2 (${signed ? 'signed' : 'unsigned'}), else 0`,
    load:   (size, dst, s)  => `Load ${size} from memory into ${dst} (${s ? 'sign' : 'zero'}-extend)`,
    store:  (size)          => `Store ${size} of register to memory`,
    branch: (taken, cond, label) => taken
      ? `Condition (${cond}) true, branch to ${label}`
      : `Condition (${cond}) false, fall through`,
    jal:    (dst, label)    => `Jump to ${label}, save return address in ${dst}`,
    jalr:   (dst)           => `Jump to rs1+imm, save return address in ${dst}`,
    mul:    (op, dst)       => `Store ${op} multiplication result in ${dst}`,
    div:    (op, dst)       => `Store ${op} division result in ${dst}`,
    rem:    (op, dst)       => `Store ${op} remainder in ${dst}`,
    mv:     (dst, src)      => `Copy ${src} into ${dst}`,
    li:     (dst)           => `Load immediate value into ${dst}`,
    ret:    ()              => `Return to address in ra`,
    nop:    ()              => `No operation`,
    call:   (label)         => `Call ${label}(), save return address in ra`,
    la:     (dst)           => `Load symbol address into ${dst}`,
    pseudo1:(name, dst)     => `Pseudo-instruction ${name}: result in ${dst}`,
  },
}

const RV32_COMMENTS: Record<Locale, RV32CommentDict> = {
  ja: {
    store:  (reg, addr) => `[${addr}] ← ${reg}`,
    load:   (reg, addr) => `${reg} ← [${addr}]`,
    branch: (cond, label, taken) => taken ? `${cond} → ${label}` : `${cond} 不成立`,
    call:   (label, ra) => `${label}() 呼び出し（ra=${ra}）`,
    ret:    (ra) => `ra(${ra}) へ戻る`,
    jal:    (label, ra) => `→ ${label}（ra=${ra}）`,
  },
  en: {
    store:  (reg, addr) => `[${addr}] ← ${reg}`,
    load:   (reg, addr) => `${reg} ← [${addr}]`,
    branch: (cond, label, taken) => taken ? `${cond} → ${label}` : `${cond} not taken`,
    call:   (label, ra) => `call ${label}() (ra=${ra})`,
    ret:    (ra) => `return to ra(${ra})`,
    jal:    (label, ra) => `→ ${label} (ra=${ra})`,
  },
}

const RV32_ERRORS: Record<Locale, RV32ErrorDict> = {
  ja: {
    unknownInstr: (m) => `未対応命令: ${m}`,
    regNotFound:  (n) => `レジスタ不明: ${n}`,
    badMem:       (a) => `メモリアクセス失敗: ${a}`,
  },
  en: {
    unknownInstr: (m) => `Unsupported instruction: ${m}`,
    regNotFound:  (n) => `Unknown register: ${n}`,
    badMem:       (a) => `Memory access error: ${a}`,
  },
}

// ---- コンテキスト ----

interface InterpCtx {
  nextDefault: number  // デフォルトの次命令インデックス（= 現在 + 1）
  phase: Phase
  instrCount: number
  callDepth: number
  labels: Map<string, number>
  locale: Locale
}

// ---- レジスタユーティリティ ----

/** レジスタ値を取得する。zero は常に 0。未定義は 0。*/
function getReg(name: string, state: MachineState): number {
  if (name === 'zero') return 0
  return state.regs[name] ?? 0
}

/** 符号なし 32bit に正規化する。 */
function u32(n: number): number {
  return n >>> 0
}

/** 符号あり 32bit に解釈する。 */
function i32(n: number): number {
  const v = n >>> 0
  return v >= 0x80000000 ? v - 0x100000000 : v
}

/** オペランドからレジスタ名を取り出す。 */
function regOf(op: RV32Operand | undefined): string {
  if (!op || op.type !== 'reg') return 'zero'
  return op.name
}

/** オペランドから即値を取り出す。 */
function immOf(op: RV32Operand | undefined): number {
  if (!op) return 0
  if (op.type === 'imm') return op.value
  if (op.type === 'label') return 0  // 解決はラベルマップで行う
  return 0
}

/** オペランドからメモリアクセス情報を取り出す。 */
function memOf(op: RV32Operand | undefined): { base: string; offset: number } | null {
  if (!op || op.type !== 'mem') return null
  return { base: op.base, offset: op.offset }
}

/** ラベル名からジャンプ先命令インデックスを解決する。 */
function resolveLabel(op: RV32Operand | undefined, labels: Map<string, number>, fallback: number): number {
  if (!op) return fallback
  if (op.type === 'label') return labels.get(op.name) ?? fallback
  if (op.type === 'imm') return fallback  // 即値オフセットは非対応（ラベル形式のみ）
  return fallback
}

// ---- ハンドラ ----

function handleArith(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands

  const rd = regOf(ops[0])
  let result: number
  let explain: string

  if (m === 'lui') {
    const imm = immOf(ops[1])
    result = u32(imm << 12)
    explain = E.lui(rd)
  } else if (m === 'auipc') {
    const imm = immOf(ops[1])
    result = u32(state.pc + (imm << 12))
    explain = E.auipc(rd)
  } else if (m === 'addi') {
    const rs1 = getReg(regOf(ops[1]), state)
    const imm = immOf(ops[2])
    result = u32(i32(rs1) + imm)
    explain = E.addi(rd)
  } else if (m === 'add') {
    const rs1 = getReg(regOf(ops[1]), state)
    const rs2 = getReg(regOf(ops[2]), state)
    result = u32(i32(rs1) + i32(rs2))
    explain = E.add(rd)
  } else if (m === 'sub') {
    const rs1 = getReg(regOf(ops[1]), state)
    const rs2 = getReg(regOf(ops[2]), state)
    result = u32(i32(rs1) - i32(rs2))
    explain = E.sub(rd)
  } else {
    result = 0
    explain = ''
  }

  const regs: Partial<Record<string, number>> = {}
  let update: StateUpdate = {}
  let newFrames = state.frames

  // SP 変化の検出（addi sp, sp, imm）
  if (rd === 'sp' && m === 'addi') {
    const imm = immOf(ops[2])
    const oldSp = getReg('sp', state)
    const newSp = u32((oldSp | 0) + imm)
    update = { sp: newSp, regs: { sp: newSp } }
    newFrames = updateTopFrame(newSp, state)
    update.frames = newFrames
    // 正値（スタック解放）の場合、解放範囲 [oldSp, newSp) のエントリを削除する
    if (imm > 0) {
      update.stackRemove = Object.keys(state.stack).map(Number)
        .filter(a => a >= oldSp && a < newSp)
    }
    return {
      update,
      explain,
      effect: `sp ← ${hexU32(newSp)} (${imm > 0 ? '+' : ''}${imm})`,
      comment: imm < 0
        ? (ctx.locale === 'ja' ? `スタック確保 ${Math.abs(imm)} バイト` : `alloc ${Math.abs(imm)} bytes`)
        : (ctx.locale === 'ja' ? `スタック解放 ${imm} バイト` : `free ${imm} bytes`),
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (rd !== 'zero') regs[rd] = result
  update = { regs }

  return {
    update,
    explain,
    effect: rd !== 'zero' ? `${rd} ← ${hexU32(result)}` : '(zero への書き込みは無視)',
    comment: rd !== 'zero' ? `${rd} ← ${hexU32(result)}` : '',
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleLogic(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands
  const rd = regOf(ops[0])
  const rs1 = getReg(regOf(ops[1]), state)

  let result: number
  let op: string
  let isImm = false

  if (m === 'and')  { result = u32(rs1 & getReg(regOf(ops[2]), state)); op = 'AND' }
  else if (m === 'or')   { result = u32(rs1 | getReg(regOf(ops[2]), state)); op = 'OR' }
  else if (m === 'xor')  { result = u32(rs1 ^ getReg(regOf(ops[2]), state)); op = 'XOR' }
  else if (m === 'andi') { result = u32(rs1 & immOf(ops[2])); op = 'AND'; isImm = true }
  else if (m === 'ori')  { result = u32(rs1 | immOf(ops[2])); op = 'OR';  isImm = true }
  else if (m === 'xori') { result = u32(rs1 ^ immOf(ops[2])); op = 'XOR'; isImm = true }
  else                   { result = 0; op = '?'; }

  const regs: Partial<Record<string, number>> = {}
  if (rd !== 'zero') regs[rd] = result

  return {
    update: { regs },
    explain: isImm ? E.logici(op, rd) : E.logic(op, rd),
    effect: `${rd} ← ${hexU32(result)}`,
    comment: `${rd} ← ${hexU32(result)}`,
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleShift(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands
  const rd = regOf(ops[0])
  const rs1v = getReg(regOf(ops[1]), state)
  const shamt = m.endsWith('i')
    ? immOf(ops[2]) & 0x1f
    : getReg(regOf(ops[2]), state) & 0x1f

  let result: number
  let opName: string

  if (m === 'sll' || m === 'slli') { result = u32(rs1v << shamt); opName = 'SLL' }
  else if (m === 'srl' || m === 'srli') { result = (rs1v >>> 0) >>> shamt; opName = 'SRL' }
  else if (m === 'sra' || m === 'srai') { result = u32((rs1v | 0) >> shamt); opName = 'SRA' }
  else { result = 0; opName = '?' }

  const regs: Partial<Record<string, number>> = {}
  if (rd !== 'zero') regs[rd] = result

  return {
    update: { regs },
    explain: E.shift(opName, rd),
    effect: `${rd} ← ${hexU32(result)}`,
    comment: `${rd} ← ${hexU32(result)}`,
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleCompare(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands
  const rd = regOf(ops[0])
  const rs1v = getReg(regOf(ops[1]), state)
  const isImm = m.endsWith('i') || m.endsWith('iu')
  const isUnsigned = m.endsWith('u') || m.endsWith('iu')
  const rhs = isImm ? immOf(ops[2]) : getReg(regOf(ops[2]), state)

  const result: number = isUnsigned
    ? ((rs1v >>> 0) < (rhs >>> 0) ? 1 : 0)
    : (i32(rs1v) < i32(rhs) ? 1 : 0)

  const regs: Partial<Record<string, number>> = {}
  if (rd !== 'zero') regs[rd] = result

  return {
    update: { regs },
    explain: E.slt(rd, !isUnsigned),
    effect: `${rd} ← ${result}`,
    comment: `${rd} ← ${result}`,
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleLoad(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const C = RV32_COMMENTS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands
  const rd = regOf(ops[0])
  const mem = memOf(ops[1])
  if (!mem) {
    return errResult(RV32_ERRORS[ctx.locale].badMem('?'), ctx)
  }

  const baseVal = getReg(mem.base, state)
  const addr = u32(baseVal + mem.offset)
  const rawVal = state.stack[addr] ?? 0

  // サイズ別の値処理（シミュレーターでは 32bit 粒度で管理）
  let value: number
  let sizeStr: string
  let signed: boolean

  if (m === 'lw')       { value = u32(rawVal); sizeStr = 'word'; signed = true }
  else if (m === 'lh')  { value = u32((rawVal & 0xffff) | ((rawVal & 0x8000) ? 0xffff0000 : 0)); sizeStr = 'halfword'; signed = true }
  else if (m === 'lhu') { value = rawVal & 0xffff; sizeStr = 'halfword'; signed = false }
  else if (m === 'lb')  { value = u32((rawVal & 0xff) | ((rawVal & 0x80) ? 0xffffff00 : 0)); sizeStr = 'byte'; signed = true }
  else                  { value = rawVal & 0xff; sizeStr = 'byte'; signed = false } // lbu

  const regs: Partial<Record<string, number>> = {}
  if (rd !== 'zero') regs[rd] = value

  const addrStr = `${hexU32(addr)}(${mem.base}+${mem.offset})`

  return {
    update: { regs },
    explain: E.load(sizeStr, rd, signed),
    effect: `${rd} ← [${hexU32(addr)}] = ${hexU32(value)}`,
    comment: C.load(rd, addrStr),
    phase: ctx.phase,
    ptrReg: mem.base !== 'sp' ? mem.base : undefined,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleStore(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const C = RV32_COMMENTS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands

  // sw rs2, offset(rs1) — ops[0]=rs2, ops[1]=mem
  const rs2Name = regOf(ops[0])
  const mem = memOf(ops[1])
  if (!mem) return errResult(RV32_ERRORS[ctx.locale].badMem('?'), ctx)

  const baseVal = getReg(mem.base, state)
  const addr = u32(baseVal + mem.offset)
  const val = getReg(rs2Name, state)

  let sizeStr: string
  let storedVal: number

  if (m === 'sw')      { storedVal = u32(val); sizeStr = 'word' }
  else if (m === 'sh') { storedVal = val & 0xffff; sizeStr = 'halfword' }
  else                 { storedVal = val & 0xff; sizeStr = 'byte' }  // sb

  const metaKind = rs2Name === 'ra' ? 'hw' : 'sw'
  const addrStr = `${hexU32(addr)}(${mem.base}+${mem.offset})`

  return {
    update: {
      stackSet: { [addr]: storedVal },
      metaSet: { [addr]: { label: rs2Name, kind: metaKind } },
    },
    explain: E.store(sizeStr),
    effect: `[${hexU32(addr)}] ← ${rs2Name}(${hexU32(val)})`,
    comment: C.store(rs2Name, addrStr),
    phase: ctx.phase,
    ptrReg: mem.base !== 'sp' ? mem.base : undefined,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handleBranch(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const C = RV32_COMMENTS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands

  // 2レジスタ形式: beq rs1, rs2, label
  // 疑似1レジスタ形式: beqz rs, label
  let rs1v: number
  let rs2v: number
  let labelOp: RV32Operand | undefined
  let cond: string

  const pseudo1 = ['beqz', 'bnez', 'blez', 'bgez', 'bltz', 'bgtz']
  if (pseudo1.includes(m)) {
    rs1v = getReg(regOf(ops[0]), state)
    rs2v = 0
    labelOp = ops[1]
    cond = m
  } else {
    rs1v = getReg(regOf(ops[0]), state)
    rs2v = getReg(regOf(ops[1]), state)
    labelOp = ops[2]
    cond = m
  }

  const labelIdx = resolveLabel(labelOp, ctx.labels, ctx.nextDefault)
  const labelName = labelOp?.type === 'label' ? labelOp.name : '?'

  let taken: boolean
  switch (m) {
    case 'beq':  case 'beqz': taken = u32(rs1v) === u32(rs2v); break
    case 'bne':  case 'bnez': taken = u32(rs1v) !== u32(rs2v); break
    case 'blt':  case 'bltz': taken = i32(rs1v) < i32(rs2v);  break
    case 'bge':  case 'bgez': taken = i32(rs1v) >= i32(rs2v); break
    case 'bltu':              taken = (rs1v >>> 0) < (rs2v >>> 0); break
    case 'bgeu':              taken = (rs1v >>> 0) >= (rs2v >>> 0); break
    case 'blez':              taken = i32(rs1v) <= 0; break
    case 'bgtz':              taken = i32(rs1v) > 0; break
    default:                  taken = false
  }

  const nextIdx = taken ? labelIdx : ctx.nextDefault

  return {
    update: {},
    explain: E.branch(taken, cond, labelName),
    effect: taken ? `PC → ${labelName}` : `PC → 次の命令`,
    comment: C.branch(cond, labelName, taken),
    phase: ctx.phase,
    nextInstrIdx: nextIdx,
  }
}

function handleJump(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
  callStack: { name: string; returnInstrIdx: number }[],
  newFrameColor: 'purple' | 'green' | 'orange',
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const C = RV32_COMMENTS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands

  // jal rd, label
  if (m === 'jal') {
    const rd = regOf(ops[0])
    const labelOp = ops[1]
    const labelIdx = resolveLabel(labelOp, ctx.labels, ctx.nextDefault)
    const labelName = labelOp?.type === 'label' ? labelOp.name : '?'
    const returnAddr = state.pc + 4

    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = returnAddr
    if (rd === 'ra') {
      // 関数呼び出し
      callStack.push({ name: labelName, returnInstrIdx: ctx.nextDefault })
      const newFrame = {
        name: labelName,
        lo: state.sp,
        hi: state.sp,
        color: newFrameColor,
      }
      const frames = [...state.frames, newFrame]
      const raHex = hexU32(returnAddr)
      return {
        update: { regs: { ...regs, ra: returnAddr }, lr: returnAddr, frames },
        explain: E.jal(rd, labelName),
        effect: `ra ← ${hexU32(returnAddr)}, PC → ${labelName}`,
        comment: C.call(labelName, raHex),
        phase: ctx.phase,
        nextInstrIdx: labelIdx,
      }
    }
    // rd = zero → 無条件ジャンプ（j の pseudo）
    return {
      update: { regs },
      explain: E.jal(rd, labelName),
      effect: `PC → ${labelName}`,
      comment: `→ ${labelName}`,
      phase: ctx.phase,
      nextInstrIdx: labelIdx,
    }
  }

  // jalr rd, rs1, imm
  if (m === 'jalr') {
    const rd = regOf(ops[0])
    const rs1 = regOf(ops[1])
    const imm = immOf(ops[2])
    const rs1v = getReg(rs1, state)
    const targetAddr = u32((rs1v + imm) & ~1)  // 最下位ビットをクリア
    const returnAddr = state.pc + 4

    // ret の実体: jalr zero, ra, 0
    if (rd === 'zero' && rs1 === 'ra' && imm === 0) {
      const top = callStack.pop()
      const retIdx = top?.returnInstrIdx ?? ctx.nextDefault
      const frames = state.frames.slice(0, -1)
      return {
        update: { frames },
        explain: RV32_EXPLAINS[ctx.locale].ret(),
        effect: `PC ← ra(${hexU32(rs1v)})`,
        comment: C.ret(hexU32(rs1v)),
        phase: 'ret',
        nextInstrIdx: retIdx,
      }
    }

    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = returnAddr

    return {
      update: { regs },
      explain: E.jalr(rd),
      effect: `${rd} ← ${hexU32(returnAddr)}, PC → ${hexU32(targetAddr)}`,
      comment: `→ ${hexU32(targetAddr)}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,  // 動的ジャンプ先は静的解決不可
    }
  }

  return errResult('unknown jump', ctx)
}

function handleMul(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands
  const rd = regOf(ops[0])
  const rs1v = getReg(regOf(ops[1]), state)
  const rs2v = getReg(regOf(ops[2]), state)

  let result: number
  let opName: string

  if (m === 'mul')        { result = u32(Math.imul(rs1v, rs2v)); opName = 'MUL' }
  else if (m === 'mulh')  { result = u32(Math.floor((i32(rs1v) * i32(rs2v)) / 0x100000000)); opName = 'MULH' }
  else if (m === 'mulhu') { result = u32(Math.floor(((rs1v >>> 0) * (rs2v >>> 0)) / 0x100000000)); opName = 'MULHU' }
  else if (m === 'mulhsu'){ result = u32(Math.floor((i32(rs1v) * (rs2v >>> 0)) / 0x100000000)); opName = 'MULHSU' }
  else if (m === 'div')   { const b = i32(rs2v); result = b === 0 ? 0xffffffff : u32(Math.trunc(i32(rs1v) / b)); opName = 'DIV' }
  else if (m === 'divu')  { const b = rs2v >>> 0; result = b === 0 ? 0xffffffff : u32(Math.trunc((rs1v >>> 0) / b)); opName = 'DIVU' }
  else if (m === 'rem')   { const b = i32(rs2v); result = b === 0 ? u32(rs1v) : u32(i32(rs1v) % b); opName = 'REM' }
  else                    { const b = rs2v >>> 0; result = b === 0 ? u32(rs1v) : u32((rs1v >>> 0) % b); opName = 'REMU' }

  const regs: Partial<Record<string, number>> = {}
  if (rd !== 'zero') regs[rd] = result

  const explainFn = m.startsWith('mul') ? E.mul : (m.startsWith('div') ? E.div : E.rem)

  return {
    update: { regs },
    explain: explainFn(opName, rd),
    effect: `${rd} ← ${hexU32(result)}`,
    comment: `${rd} ← ${hexU32(result)}`,
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

function handlePseudo(
  instr: RV32Instruction,
  state: MachineState,
  ctx: InterpCtx,
  callStack: { name: string; returnInstrIdx: number }[],
  newFrameColor: 'purple' | 'green' | 'orange',
): RV32InterpretResult {
  const E = RV32_EXPLAINS[ctx.locale]
  const C = RV32_COMMENTS[ctx.locale]
  const m = instr.mnemonic
  const ops = instr.operands

  if (m === 'mv') {
    const rd = regOf(ops[0])
    const rs = regOf(ops[1])
    const val = getReg(rs, state)
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = val
    return {
      update: { regs },
      explain: E.mv(rd, rs),
      effect: `${rd} ← ${rs}(${hexU32(val)})`,
      comment: `${rd} ← ${rs}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'li') {
    const rd = regOf(ops[0])
    const imm = immOf(ops[1])
    const val = u32(imm)
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = val
    return {
      update: { regs },
      explain: E.li(rd),
      effect: `${rd} ← ${hexU32(val)}`,
      comment: `${rd} ← ${hexU32(val)}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'ret') {
    // ret = jalr zero, ra, 0
    const raVal = getReg('ra', state)
    const top = callStack.pop()
    const retIdx = top?.returnInstrIdx ?? ctx.nextDefault
    const frames = state.frames.slice(0, -1)
    return {
      update: { frames },
      explain: E.ret(),
      effect: `PC ← ra(${hexU32(raVal)})`,
      comment: C.ret(hexU32(raVal)),
      phase: 'ret',
      nextInstrIdx: retIdx,
    }
  }

  if (m === 'nop') {
    return {
      update: {},
      explain: E.nop(),
      effect: '(no-op)',
      comment: '',
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'j') {
    // j label = jal zero, label
    const labelOp = ops[0]
    const labelIdx = resolveLabel(labelOp, ctx.labels, ctx.nextDefault)
    const labelName = labelOp?.type === 'label' ? labelOp.name : '?'
    return {
      update: {},
      explain: E.jal('zero', labelName),
      effect: `PC → ${labelName}`,
      comment: `→ ${labelName}`,
      phase: ctx.phase,
      nextInstrIdx: labelIdx,
    }
  }

  if (m === 'call') {
    // call label = auipc ra, hi20 + jalr ra, lo12(ra)
    const labelOp = ops[0]
    const labelIdx = resolveLabel(labelOp, ctx.labels, ctx.nextDefault)
    const labelName = labelOp?.type === 'label' ? labelOp.name : '?'
    const returnAddr = state.pc + 4

    callStack.push({ name: labelName, returnInstrIdx: ctx.nextDefault })
    const newFrame = {
      name: labelName,
      lo: state.sp,
      hi: state.sp,
      color: newFrameColor,
    }
    const frames = [...state.frames, newFrame]

    return {
      update: { regs: { ra: returnAddr }, lr: returnAddr, frames },
      explain: E.call(labelName),
      effect: `ra ← ${hexU32(returnAddr)}, PC → ${labelName}`,
      comment: C.call(labelName, hexU32(returnAddr)),
      phase: ctx.phase,
      nextInstrIdx: labelIdx,
    }
  }

  if (m === 'jr') {
    // jr rs = jalr zero, rs, 0
    const rs = regOf(ops[0])
    const rsVal = getReg(rs, state)
    // jr ra は ret と等価（GCC の RISC-V がよく使う形式）
    if (rs === 'ra') {
      const top = callStack.pop()
      const retIdx = top?.returnInstrIdx ?? ctx.nextDefault
      const frames = state.frames.slice(0, -1)
      return {
        update: { frames },
        explain: RV32_EXPLAINS[ctx.locale].ret(),
        effect: `PC ← ra(${hexU32(rsVal)})`,
        comment: C.ret(hexU32(rsVal)),
        phase: 'ret',
        nextInstrIdx: retIdx,
      }
    }
    return {
      update: {},
      explain: E.jalr('zero'),
      effect: `PC ← ${rs}(${hexU32(rsVal)})`,
      comment: `→ ${hexU32(rsVal)}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'la') {
    // la rd, symbol — シンボルアドレスは静的解決できないため 0 とする
    const rd = regOf(ops[0])
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = 0
    return {
      update: { regs },
      explain: E.la(rd),
      effect: `${rd} ← (symbol address)`,
      comment: `${rd} ← symbol`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'not') {
    // not rd, rs = xori rd, rs, -1
    const rd = regOf(ops[0])
    const rs = regOf(ops[1])
    const val = u32(~getReg(rs, state))
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = val
    return {
      update: { regs },
      explain: E.pseudo1('NOT', rd),
      effect: `${rd} ← ~${rs}(${hexU32(val)})`,
      comment: `${rd} ← ~${rs}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  if (m === 'neg') {
    // neg rd, rs = sub rd, zero, rs
    const rd = regOf(ops[0])
    const rs = regOf(ops[1])
    const val = u32(-i32(getReg(rs, state)))
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = val
    return {
      update: { regs },
      explain: E.pseudo1('NEG', rd),
      effect: `${rd} ← -${rs}(${hexU32(val)})`,
      comment: `${rd} ← -${rs}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  // seqz, snez, sltz, sgtz — 疑似比較
  const cmpPseudo: Record<string, (v: number) => boolean> = {
    seqz: v => v === 0,
    snez: v => v !== 0,
    sltz: v => i32(v) < 0,
    sgtz: v => i32(v) > 0,
  }
  if (m in cmpPseudo) {
    const rd = regOf(ops[0])
    const rs = regOf(ops[1])
    const rsVal = getReg(rs, state)
    const result = cmpPseudo[m]!(rsVal) ? 1 : 0
    const regs: Partial<Record<string, number>> = {}
    if (rd !== 'zero') regs[rd] = result
    return {
      update: { regs },
      explain: E.slt(rd, true),
      effect: `${rd} ← ${result}`,
      comment: `${rd} ← ${result}`,
      phase: ctx.phase,
      nextInstrIdx: ctx.nextDefault,
    }
  }

  return errResult(RV32_ERRORS[ctx.locale].unknownInstr(m), ctx)
}

function errResult(msg: string, ctx: InterpCtx): RV32InterpretResult {
  return {
    update: {},
    explain: msg,
    effect: '',
    comment: '',
    phase: ctx.phase,
    nextInstrIdx: ctx.nextDefault,
  }
}

// ---- メインエクスポート ----

const ARITH_MNEMONICS  = new Set(['add', 'addi', 'sub', 'lui', 'auipc'])
const LOGIC_MNEMONICS  = new Set(['and', 'andi', 'or', 'ori', 'xor', 'xori'])
const SHIFT_MNEMONICS  = new Set(['sll', 'slli', 'srl', 'srli', 'sra', 'srai'])
const CMP_MNEMONICS    = new Set(['slt', 'slti', 'sltu', 'sltiu'])
const LOAD_MNEMONICS   = new Set(['lw', 'lh', 'lb', 'lhu', 'lbu'])
const STORE_MNEMONICS  = new Set(['sw', 'sh', 'sb'])
const BRANCH_MNEMONICS = new Set(['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu',
                                   'beqz', 'bnez', 'blez', 'bgez', 'bltz', 'bgtz'])
const JUMP_MNEMONICS   = new Set(['jal', 'jalr'])
const MUL_MNEMONICS    = new Set(['mul', 'mulh', 'mulhu', 'mulhsu', 'div', 'divu', 'rem', 'remu'])
const PSEUDO_MNEMONICS = new Set(['mv', 'li', 'ret', 'nop', 'j', 'call', 'jr', 'la',
                                   'not', 'neg', 'seqz', 'snez', 'sltz', 'sgtz'])

/**
 * RV32 命令を 1 つ解釈してスナップショット差分と表示メタデータを返す。
 *
 * @param instr - パーサーが生成した RV32Instruction
 * @param instrIdx - 現在の命令インデックス
 * @param state - 実行前の MachineState
 * @param labels - ラベル名 → 命令インデックスのマップ
 * @param phase - 現在のフェーズ
 * @param callStack - 呼び出しスタック（tracer が管理、参照渡し）
 * @param locale - 表示言語
 * @returns 実行結果 + 次命令インデックス
 */
export function interpretRV32(
  instr: RV32Instruction,
  instrIdx: number,
  state: MachineState,
  labels: Map<string, number>,
  phase: Phase,
  callStack: { name: string; returnInstrIdx: number }[],
  locale: Locale = 'ja',
): RV32InterpretResult | { error: string } {
  const ctx: InterpCtx = {
    nextDefault: instrIdx + 1,
    phase,
    instrCount: instrIdx,
    callDepth: callStack.length,
    labels,
    locale,
  }

  const newFrameColor = FRAME_COLORS_CYCLE[(callStack.length + 1) % FRAME_COLORS_CYCLE.length]!

  const m = instr.mnemonic

  if (ARITH_MNEMONICS.has(m))  return handleArith(instr, state, ctx)
  if (LOGIC_MNEMONICS.has(m))  return handleLogic(instr, state, ctx)
  if (SHIFT_MNEMONICS.has(m))  return handleShift(instr, state, ctx)
  if (CMP_MNEMONICS.has(m))    return handleCompare(instr, state, ctx)
  if (LOAD_MNEMONICS.has(m))   return handleLoad(instr, state, ctx)
  if (STORE_MNEMONICS.has(m))  return handleStore(instr, state, ctx)
  if (BRANCH_MNEMONICS.has(m)) return handleBranch(instr, state, ctx)
  if (JUMP_MNEMONICS.has(m))   return handleJump(instr, state, ctx, callStack, newFrameColor)
  if (MUL_MNEMONICS.has(m))    return handleMul(instr, state, ctx)
  if (PSEUDO_MNEMONICS.has(m)) return handlePseudo(instr, state, ctx, callStack, newFrameColor)

  return { error: RV32_ERRORS[locale].unknownInstr(m) }
}
