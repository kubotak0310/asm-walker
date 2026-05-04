// ARM instruction interpreter: ParsedInstruction + MachineState → StateUpdate + metadata

import type { MachineState, StateUpdate, Phase, StackFrame, StackMeta, Flags } from '../types'
import { BASE_PC_ARM } from '../types'
import { hexU32 } from '../simulator'
import type { ParsedInstruction, Operand } from './parser'

export interface InterpretResult {
  update: StateUpdate
  explain: string
  effect: string
  comment: string   // concise inline annotation for CodePanel
  phase: Phase
  isPtr?: boolean
  isArr?: boolean
  nextInstrIdx: number
}

const BASE_PC = BASE_PC_ARM
const FRAME_COLORS: Array<'purple' | 'green' | 'orange'> = ['purple', 'green', 'orange']
const ADDR_REGS = new Set(['sp', 'lr', 'pc', 'fp'])

function fmtVal(regName: string, val: number): string {
  if (ADDR_REGS.has(regName)) return hexU32(val)
  return `0x${val.toString(16)}`
}

// Decimal for small values, hex for address-like values
function fmtDec(val: number): string {
  const u = val >>> 0
  if (u >= 0x08000000) return hexU32(u)
  return (val | 0).toString(10)
}

// Format register with its current value: r0(3) or sp(0x20007ff0)
function fmtRV(name: string, val: number): string {
  const s = ADDR_REGS.has(name) ? hexU32(val >>> 0) : fmtDec(val)
  return `${name}(${s})`
}

// Format memory address expression: [r7+4]=0x20007fec
function fmtMA(base: string, offset: number, baseVal: number): string {
  const addr = (baseVal + offset) >>> 0
  const off = offset === 0 ? '' : offset > 0 ? `+${offset}` : `${offset}`
  return `[${base}${off}]=${hexU32(addr)}`
}

function regOrder(name: string): number {
  if (name === 'pc') return 15
  if (name === 'lr') return 14
  if (name === 'sp') return 13
  const m = name.match(/r(\d+)/)
  return m ? parseInt(m[1] ?? '0', 10) : 0
}

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

export function interpretInstruction(
  instr: ParsedInstruction,
  instrIdx: number,
  state: MachineState,
  labels: Map<string, number>,
  instrCount: number,
  callDepth: number,
): InterpretResult | { error: string } {
  const { mnemonic, cond, sFlag, operands } = instr
  const phase: Phase = callDepth === 0 ? 'caller' : 'callee'
  const defaultNext = instrIdx + 1

  // --- Helpers ---

  function getReg(name: string): number {
    if (name === 'sp') return state.sp
    if (name === 'lr') return state.lr
    if (name === 'pc') return state.pc
    return state.regs[name] ?? 0
  }

  function setRegUpdate(name: string, value: number): Partial<StateUpdate> {
    if (name === 'sp') return { sp: value }
    if (name === 'lr') return { lr: value }
    if (name === 'pc') return { pc: value }
    return { regs: { [name]: value } }
  }

  function resolveVal(op: Operand | undefined): number {
    if (!op) return 0
    if (op.type === 'reg') {
      let v = getReg(op.name)
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

  function computeFlags(result: number, a: number, b: number, isSub: boolean): Partial<Flags> {
    const r32 = result >>> 0
    return {
      zero: r32 === 0,
      negative: (r32 >>> 31) !== 0,
      carry: isSub ? (a >>> 0) >= (b >>> 0) : result > 0xffffffff,
      overflow: (() => {
        const as = (a >>> 31) !== 0
        const bs = isSub ? ((~b >>> 0) >>> 31) !== 0 : (b >>> 31) !== 0
        const rs = (r32 >>> 31) !== 0
        return as === bs && rs !== as
      })(),
    }
  }

  function checkCond(c: string): boolean {
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

  // Update the topmost stack frame's lo bound (called when SP decreases)
  function updateTopFrame(newSp: number): StackFrame[] {
    if (state.frames.length === 0) return []
    const frames = [...state.frames]
    const last = frames[frames.length - 1]
    if (!last) return frames
    frames[frames.length - 1] = { ...last, lo: newSp }
    return frames
  }

  // --- Instruction dispatch ---

  switch (mnemonic) {

    // ── Data transfer ──────────────────────────────────────────
    case 'MOV':
    case 'MVN': {
      const dst = operands[0]
      const src = operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: レジスタが必要: ${instr.raw}` }
      if (dst.name === 'pc') return { error: 'PC への直接書き込みは非対応 (BX LR を使用)' }
      const srcVal = resolveVal(src)
      let val = srcVal >>> 0
      if (mnemonic === 'MVN') val = (~val) >>> 0
      const update: StateUpdate = { ...setRegUpdate(dst.name, val), pc: BASE_PC + defaultNext * 4 }
      if (sFlag) update.flags = computeFlags(val, val, 0, false)
      const comment = mnemonic === 'MVN'
        ? `${dst.name} ← ~${src?.type === 'reg' ? fmtRV(src.name, srcVal) : srcVal} = ${fmtDec(val)}`
        : src?.type === 'reg'
          ? `${dst.name} ← ${fmtRV(src.name, srcVal)}`
          : `${dst.name} ← ${fmtDec(val)}`
      return {
        update,
        explain: `${opLabel(dst)} に値をセット${sFlag ? '（フラグ更新）' : ''}`,
        effect: `${dst.name} ← ${fmtVal(dst.name, val)}`,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    // ── Arithmetic ─────────────────────────────────────────────
    case 'ADD':
    case 'ADC': {
      const dst = operands[0]
      const src1 = operands.length >= 3 ? operands[1] : operands[0]
      const src2 = operands.length >= 3 ? operands[2] : operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(src1)
      const b = resolveVal(src2)
      const c = mnemonic === 'ADC' ? (state.flags.carry ? 1 : 0) : 0
      const result = (a + b + c) >>> 0
      const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
      if (dst.name === 'sp') update.frames = updateTopFrame(result)
      if (sFlag) update.flags = computeFlags(a + b + c, a, b, false)
      const aLabel = src1?.type === 'reg' ? fmtRV(src1.name, a) : `${a | 0}`
      const bLabel = src2?.type === 'reg' ? fmtRV(src2.name, b) : `#${b}`
      const exprStr = dst.name === 'sp'
        ? `sp ← sp(${hexU32(a)}) + ${b} = ${hexU32(result)}`
        : `${dst.name} ← ${aLabel} + ${bLabel}${c ? ' + carry' : ''} = ${fmtDec(result)}`
      return {
        update,
        explain: `加算${sFlag ? '（フラグ更新）' : ''}`,
        effect: exprStr,
        comment: exprStr,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'SUB':
    case 'SBC':
    case 'RSB': {
      const dst = operands[0]
      const src1 = operands.length >= 3 ? operands[1] : operands[0]
      const src2 = operands.length >= 3 ? operands[2] : operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(src1)
      const b = resolveVal(src2)
      const borrow = mnemonic === 'SBC' ? (state.flags.carry ? 0 : 1) : 0
      const result = (mnemonic === 'RSB' ? b - a - borrow : a - b - borrow) >>> 0
      const update: StateUpdate = { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 }
      if (dst.name === 'sp') update.frames = updateTopFrame(result)
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
        explain: `減算${sFlag ? '（フラグ更新）' : ''}`,
        effect: exprStr,
        comment: exprStr,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'MUL':
    case 'MLA':
    case 'MLS': {
      const dst = operands[0]
      const rn = operands[1] ?? operands[0]
      const rm = operands[2] ?? operands[1]
      const ra = operands[3]  // MLA/MLS only
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(rn)
      const b = resolveVal(rm)
      const acc = ra ? resolveVal(ra) : 0
      const mul = Math.imul(a, b)
      const result = (mnemonic === 'MLA' ? mul + acc : mnemonic === 'MLS' ? acc - mul : mul) >>> 0
      const aLabel = rn?.type === 'reg' ? fmtRV(rn.name, a) : `${a}`
      const bLabel = rm?.type === 'reg' ? fmtRV(rm.name, b) : `${b}`
      const comment = mnemonic === 'MUL'
        ? `${dst.name} ← ${aLabel} × ${bLabel} = ${fmtDec(result)}`
        : `${dst.name} ← ${aLabel} × ${bLabel} ${mnemonic === 'MLA' ? '+' : '-'} ${fmtDec(acc)} = ${fmtDec(result)}`
      return {
        update: { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 },
        explain: `乗算${sFlag ? '（フラグ更新）' : ''}`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'SDIV':
    case 'UDIV': {
      const dst = operands[0]
      const rn = operands.length >= 3 ? operands[1] : operands[0]
      const rm = operands.length >= 3 ? operands[2] : operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(rn)
      const b = resolveVal(rm)
      if (b === 0) return { error: `${mnemonic}: ゼロ除算: ${instr.raw}` }
      const result = Math.trunc(a / b) >>> 0
      const aLabel = rn?.type === 'reg' ? fmtRV(rn.name, a) : `${a}`
      const bLabel = rm?.type === 'reg' ? fmtRV(rm.name, b) : `${b}`
      const comment = `${dst.name} ← ${aLabel} ÷ ${bLabel} = ${fmtDec(result)}`
      return {
        update: { ...setRegUpdate(dst.name, result), pc: BASE_PC + defaultNext * 4 },
        explain: `除算`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    // ── Bitwise / shift ────────────────────────────────────────
    case 'AND':
    case 'ORR':
    case 'EOR':
    case 'BIC': {
      const dst = operands[0]
      const src1 = operands.length >= 3 ? operands[1] : operands[0]
      const src2 = operands.length >= 3 ? operands[2] : operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(src1)
      const b = resolveVal(src2)
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
        explain: `ビット演算${sFlag ? '（フラグ更新）' : ''}`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'LSL':
    case 'LSR':
    case 'ASR':
    case 'ROR': {
      const dst = operands[0]
      const src = operands.length >= 3 ? operands[1] : operands[0]
      const shiftOp = operands.length >= 3 ? operands[2] : operands[1]
      if (dst?.type !== 'reg') return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const val = resolveVal(src) >>> 0
      const shamt = resolveVal(shiftOp) & 0x1f
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
        explain: `シフト演算${sFlag ? '（フラグ更新）' : ''}`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    // ── Compare / test ─────────────────────────────────────────
    case 'CMP':
    case 'CMN':
    case 'TST':
    case 'TEQ': {
      const src1 = operands[0]
      const src2 = operands[1]
      if (!src1 || !src2) return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      const a = resolveVal(src1)
      const b = resolveVal(src2)
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
        explain: `比較（フラグのみ更新）`,
        effect: flagStr,
        comment: `${aLabel} と ${bLabel} を比較: ${flagStr}`,
        phase, nextInstrIdx: defaultNext,
      }
    }

    // ── Memory ─────────────────────────────────────────────────
    case 'LDR':
    case 'LDRB':
    case 'LDRH': {
      const dst = operands[0]
      const src = operands[1]
      if (dst?.type !== 'reg') return { error: `LDR: レジスタが必要: ${instr.raw}` }
      if (src?.type !== 'mem') return { error: `LDR: メモリオペランドが必要: ${instr.raw}` }
      const baseVal = getReg(src.base)
      const addr = src.postIndex !== undefined ? baseVal : baseVal + src.offset
      const val = state.stack[addr] ?? 0
      const update: StateUpdate = { ...setRegUpdate(dst.name, val), pc: BASE_PC + defaultNext * 4 }
      if (src.writeBack) Object.assign(update, setRegUpdate(src.base, addr))
      if (src.postIndex !== undefined) Object.assign(update, setRegUpdate(src.base, baseVal + src.postIndex))
      const memDesc = fmtMA(src.base, src.postIndex !== undefined ? 0 : src.offset, baseVal)
      const extra = src.writeBack ? '（ライトバック）' : src.postIndex !== undefined ? '（ポストインデックス）' : ''
      const comment = `${dst.name} ← ${memDesc}(${fmtDec(val)})`
      return {
        update,
        explain: `メモリからロード${extra}`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'STR':
    case 'STRB':
    case 'STRH': {
      const src = operands[0]
      const dst = operands[1]
      if (src?.type !== 'reg') return { error: `STR: レジスタが必要: ${instr.raw}` }
      if (dst?.type !== 'mem') return { error: `STR: メモリオペランドが必要: ${instr.raw}` }
      const baseVal = getReg(dst.base)
      const addr = dst.postIndex !== undefined ? baseVal : baseVal + dst.offset
      const val = getReg(src.name)
      const metaSet: Record<number, StackMeta> = { [addr]: { label: `${src.name.toUpperCase()} → [0x${addr.toString(16)}]`, kind: 'sw' } }
      const update: StateUpdate = { stackSet: { [addr]: val }, metaSet, pc: BASE_PC + defaultNext * 4 }
      if (dst.writeBack) Object.assign(update, setRegUpdate(dst.base, addr))
      if (dst.postIndex !== undefined) Object.assign(update, setRegUpdate(dst.base, baseVal + dst.postIndex))
      const memDesc = fmtMA(dst.base, dst.postIndex !== undefined ? 0 : dst.offset, baseVal)
      const extra = dst.writeBack ? '（ライトバック）' : dst.postIndex !== undefined ? '（ポストインデックス）' : ''
      const comment = `${memDesc} ← ${fmtRV(src.name, val)}`
      return {
        update,
        explain: `メモリにストア${extra}`,
        effect: comment,
        comment,
        phase, nextInstrIdx: defaultNext,
      }
    }

    // ── Stack ──────────────────────────────────────────────────
    case 'PUSH': {
      const reglist = operands[0]
      if (reglist?.type !== 'reglist') return { error: `PUSH: レジスタリストが必要: ${instr.raw}` }
      const regs = [...reglist.regs].sort((a, b) => regOrder(a) - regOrder(b))
      const newSp = state.sp - 4 * regs.length
      const stackSet: Record<number, number> = {}
      const metaSet: Record<number, StackMeta> = {}
      let addr = newSp
      for (const reg of regs) {
        stackSet[addr] = getReg(reg)
        metaSet[addr] = { label: `保存 ${reg.toUpperCase()}`, kind: 'sw' }
        addr += 4
      }
      const frames = updateTopFrame(newSp)
      const regLabels = regs.map(r => fmtRV(r, getReg(r))).join(', ')
      return {
        update: { sp: newSp, stackSet, metaSet, frames, pc: BASE_PC + defaultNext * 4 },
        explain: `レジスタをスタックに保存`,
        effect: `sp ← ${hexU32(newSp)}; [sp] ← ${regLabels}`,
        comment: `${regLabels} をスタックに保存`,
        phase, nextInstrIdx: defaultNext,
      }
    }

    case 'POP': {
      const reglist = operands[0]
      if (reglist?.type !== 'reglist') return { error: `POP: レジスタリストが必要: ${instr.raw}` }
      const regs = [...reglist.regs].sort((a, b) => regOrder(a) - regOrder(b))
      let sp = state.sp
      const newRegs: Record<string, number> = {}
      const stackRemove: number[] = []
      const metaRemove: number[] = []
      let newLr: number | undefined
      let nextIdx = defaultNext
      let retPhase = false

      // Collect values for comment before modifying sp
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
          const ti = (val - BASE_PC) / 4
          nextIdx = Number.isInteger(ti) && ti >= 0 && ti < instrCount ? ti : instrCount
        } else if (reg === 'lr') {
          newLr = val
        } else {
          newRegs[reg] = val
        }
        sp += 4
      }

      const frames = updateTopFrame(sp)
      const update: StateUpdate = { regs: newRegs, sp, stackRemove, metaRemove, frames, pc: BASE_PC + nextIdx * 4 }
      if (newLr !== undefined) update.lr = newLr
      return {
        update,
        explain: `スタックからレジスタを復元`,
        effect: `${popLabels} ← [旧sp]; sp ← ${hexU32(sp)}`,
        comment: `スタックから ${popLabels} を復元`,
        phase: retPhase ? 'ret' : phase,
        nextInstrIdx: nextIdx,
      }
    }

    // ── Branch ─────────────────────────────────────────────────
    case 'B': {
      const taken = checkCond(cond)
      if (!taken) {
        return {
          update: { pc: BASE_PC + defaultNext * 4 },
          explain: `条件不成立、次へ`,
          effect: `${cond} 不成立、スキップ`,
          comment: `${cond} 不成立、スキップ`,
          phase, nextInstrIdx: defaultNext,
        }
      }
      const labelOp = operands[0]
      if (labelOp?.type !== 'label') return { error: `B: ラベルが必要: ${instr.raw}` }
      const target = labels.get(labelOp.name)
      if (target === undefined) return { error: `B: 未定義ラベル: ${labelOp.name}` }
      const condStr = cond === 'AL' ? '' : `${cond} 成立、`
      return {
        update: { pc: BASE_PC + target * 4 },
        explain: `分岐`,
        effect: `PC ← ${labelOp.name}(${hexU32(BASE_PC + target * 4)})`,
        comment: `${condStr}${labelOp.name} へ分岐`,
        phase, nextInstrIdx: target,
      }
    }

    case 'BL': {
      const labelOp = operands[0]
      if (labelOp?.type !== 'label') return { error: `BL: ラベルが必要: ${instr.raw}` }
      const target = labels.get(labelOp.name)
      if (target === undefined) return { error: `BL: 未定義ラベル: ${labelOp.name}` }
      const retAddr = BASE_PC + defaultNext * 4
      const targetAddr = BASE_PC + target * 4
      const newColor = FRAME_COLORS[(callDepth + 1) % FRAME_COLORS.length] ?? 'purple'
      const newFrame: StackFrame = { name: labelOp.name, lo: state.sp, hi: state.sp, color: newColor }
      return {
        update: { lr: retAddr, frames: [...state.frames, newFrame], pc: targetAddr },
        explain: `関数呼び出し（LRに戻りアドレスを保存）`,
        effect: `LR ← ${hexU32(retAddr)}, PC ← ${labelOp.name}`,
        comment: `${labelOp.name}() を呼び出し（LR=${hexU32(retAddr)}）`,
        phase, nextInstrIdx: target,
      }
    }

    case 'BX': {
      const reg = operands[0]
      if (reg?.type !== 'reg') return { error: `BX: レジスタが必要: ${instr.raw}` }
      const lrVal = getReg(reg.name)
      const ti = (lrVal - BASE_PC) / 4
      const valid = Number.isInteger(ti) && ti >= 0 && ti < instrCount
      const nextIdx = valid ? ti : instrCount
      const frames = state.frames.length > 1 ? state.frames.slice(0, -1) : [...state.frames]
      return {
        update: { frames, pc: lrVal },
        explain: `レジスタにジャンプ（関数復帰）`,
        effect: `PC ← ${fmtRV(reg.name, lrVal)}`,
        comment: `${fmtRV(reg.name, lrVal)} へ戻る（関数復帰）`,
        phase: 'ret', nextInstrIdx: nextIdx,
      }
    }

    case 'CBZ':
    case 'CBNZ': {
      const reg = operands[0]
      const labelOp = operands[1]
      if (reg?.type !== 'reg' || labelOp?.type !== 'label') {
        return { error: `${mnemonic}: オペランドエラー: ${instr.raw}` }
      }
      const val = getReg(reg.name)
      const taken = mnemonic === 'CBZ' ? val === 0 : val !== 0
      if (taken && !labels.has(labelOp.name)) {
        return { error: `${mnemonic}: 未定義ラベル: ${labelOp.name}` }
      }
      const target = taken ? (labels.get(labelOp.name) ?? defaultNext) : defaultNext
      const regLabel = fmtRV(reg.name, val)
      const comment = taken
        ? mnemonic === 'CBZ'
          ? `${regLabel} = 0、${labelOp.name} へ分岐`
          : `${regLabel} ≠ 0、${labelOp.name} へ分岐`
        : mnemonic === 'CBZ'
          ? `${regLabel} ≠ 0、スキップ`
          : `${regLabel} = 0、スキップ`
      const effect = taken
        ? `PC ← ${labelOp.name}(${hexU32(BASE_PC + target * 4)})`
        : `スキップ`
      return {
        update: { pc: BASE_PC + target * 4 },
        explain: `ゼロ比較分岐`,
        effect,
        comment,
        phase, nextInstrIdx: target,
      }
    }

    case 'NOP':
      return {
        update: { pc: BASE_PC + defaultNext * 4 },
        explain: '何もしない',
        effect: '（処理なし）',
        comment: '（何もしない）',
        phase, nextInstrIdx: defaultNext,
      }

    default:
      return { error: `未対応の命令: ${mnemonic} (${instr.raw})` }
  }
}
