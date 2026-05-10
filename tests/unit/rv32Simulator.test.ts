import { describe, it, expect } from 'vitest'
import { parseRV32 } from '@/core/rv32/parser'
import { traceRV32 } from '@/core/rv32/tracer'
import { BASE_SP_RV32, BASE_PC_RV32 } from '@/core/types'
import type { MachineState } from '@/core/types'

const INITIAL_STATE: MachineState = {
  regs: {
    zero: 0, ra: 0, sp: BASE_SP_RV32, gp: 0, tp: 0,
    t0: 0, t1: 0, t2: 0,
    s0: 0, s1: 0,
    a0: 0, a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, a6: 0, a7: 0,
    s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0, s8: 0, s9: 0, s10: 0, s11: 0,
    t3: 0, t4: 0, t5: 0, t6: 0,
  },
  sp: BASE_SP_RV32,
  fp: 0,
  lr: 0,
  pc: BASE_PC_RV32,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_RV32, hi: BASE_SP_RV32, color: 'purple' }],
}

function trace(asm: string) {
  return traceRV32(parseRV32(asm), INITIAL_STATE)
}

// Case 1: Godbolt が "add(int, int):" と "call add(int, int)" を出力するケース
const FUNC_CALL_DEMANGLED = `
add(int, int):
        add     a5,a0,a1
        mv      a0,a5
        jr      ra

main:
        li      a1,5
        li      a0,3
        call    add(int, int)
        jr      ra
`

// Case 2: ラベルが "add:" で call も "call add" のシンプルなケース
const FUNC_CALL_PLAIN = `
add:
        add     a5,a0,a1
        mv      a0,a5
        jr      ra

main:
        li      a1,5
        li      a0,3
        call    add
        jr      ra
`

// Case 3: ラベルが "add(int, int):" だが call は "call add" のケース（不一致）
const FUNC_CALL_MISMATCH = `
add(int, int):
        add     a5,a0,a1
        mv      a0,a5
        jr      ra

main:
        li      a1,5
        li      a0,3
        call    add
        jr      ra
`

describe('RV32 Parser: ラベル検出', () => {
  it('スペース入りラベル "add(int, int):" を正しく登録する', () => {
    const result = parseRV32(FUNC_CALL_DEMANGLED)
    expect(result.labels.has('add(int, int)')).toBe(true)
    expect(result.labels.has('main')).toBe(true)
  })

  it('プレーンラベル "add:" を正しく登録する', () => {
    const result = parseRV32(FUNC_CALL_PLAIN)
    expect(result.labels.has('add')).toBe(true)
    expect(result.labels.has('main')).toBe(true)
  })

  it('call 命令のオペランドが label 型として解析される (デマングル形式)', () => {
    const result = parseRV32(FUNC_CALL_DEMANGLED)
    const callInstr = result.instructions.find(i => i.mnemonic === 'call')
    expect(callInstr).toBeDefined()
    expect(callInstr?.operands[0]?.type).toBe('label')
    expect((callInstr?.operands[0] as { type: 'label'; name: string }).name).toBe('add(int, int)')
  })

  it('call 命令のオペランドが label 型として解析される (プレーン形式)', () => {
    const result = parseRV32(FUNC_CALL_PLAIN)
    const callInstr = result.instructions.find(i => i.mnemonic === 'call')
    expect(callInstr).toBeDefined()
    expect(callInstr?.operands[0]?.type).toBe('label')
    expect((callInstr?.operands[0] as { type: 'label'; name: string }).name).toBe('add')
  })
})

describe('RV32 Tracer: 関数呼び出し', () => {
  it('デマングル形式: add 関数が実行される', () => {
    const { steps, error } = trace(FUNC_CALL_DEMANGLED)
    expect(error).toBeUndefined()
    // add 関数の命令が steps に含まれること
    const mnemonics = steps.map(s => {
      const result = parseRV32(FUNC_CALL_DEMANGLED)
      return result.instructions.find(i => i.lineIndex === s.asmLine)?.mnemonic
    })
    // add 関数内の "add a5,a0,a1" が実行されること
    const addExecuted = steps.some(s => {
      const asm = FUNC_CALL_DEMANGLED.split('\n')[s.asmLine] ?? ''
      return asm.trim().startsWith('add ')
    })
    expect(addExecuted).toBe(true)
  })

  it('プレーン形式: add 関数が実行される', () => {
    const { steps, error } = trace(FUNC_CALL_PLAIN)
    expect(error).toBeUndefined()
    const addExecuted = steps.some(s => {
      const asm = FUNC_CALL_PLAIN.split('\n')[s.asmLine] ?? ''
      return asm.trim().startsWith('add ')
    })
    expect(addExecuted).toBe(true)
  })

  it('デマングル形式: 戻り値 a0 = 8 (3+5) になる', () => {
    const { steps, states, error } = trace(FUNC_CALL_DEMANGLED)
    expect(error).toBeUndefined()
    const lastState = states[states.length - 1]!
    expect(lastState.regs['a0']).toBe(8)
  })

  it('プレーン形式: 戻り値 a0 = 8 (3+5) になる', () => {
    const { steps, states, error } = trace(FUNC_CALL_PLAIN)
    expect(error).toBeUndefined()
    const lastState = states[states.length - 1]!
    expect(lastState.regs['a0']).toBe(8)
  })

  it('不一致形式 (label="add(int,int)" call="add"): エラーなく実行される', () => {
    const { error } = trace(FUNC_CALL_MISMATCH)
    // 現時点ではラベル不一致で add 関数に飛ばないが、エラーは出ないはず
    // このテストは不一致が修正された後に pass するよう書き換える
    expect(error).toBeUndefined()
  })
})
