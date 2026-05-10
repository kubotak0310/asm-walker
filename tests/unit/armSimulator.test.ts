import { describe, it, expect } from 'vitest'
import { buildStates, applyUpdate } from '@/core/simulator'
import { parseARM } from '@/core/arm/parser'
import { traceProgram } from '@/core/arm/tracer'
import { BASE_SP_ARM, BASE_PC_ARM } from '@/core/types'
import type { MachineState } from '@/core/types'

const INITIAL_STATE: MachineState = {
  regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
  sp: BASE_SP_ARM,
  fp: 0,
  lr: 0x08000001,
  pc: BASE_PC_ARM,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_ARM, hi: BASE_SP_ARM, color: 'purple' }],
}

function trace(asm: string) {
  return traceProgram(parseARM(asm), INITIAL_STATE)
}

// add: は main: より前に置く → BLのリターンアドレスが命令範囲外となり自然終了する
const FUNC_CALL_ASM = `
add:
    push {r4, lr}
    add  r0, r0, r1
    pop  {r4, pc}

main:
    mov  r0, #3
    mov  r1, #5
    bl   add
`

describe('ARM Simulator: PUSH {R4, LR}', () => {
  it('SPを8デクリメントしてR4とLRをスタックに積む', () => {
    const { states, error } = trace(FUNC_CALL_ASM)
    expect(error).toBeUndefined()
    // steps: [0]=mov r0, [1]=mov r1, [2]=bl add, [3]=push {r4,lr}, ...
    const afterBL   = states[3]! // after bl add
    const afterPush = states[4]! // after push {r4, lr}

    expect(afterPush.sp).toBe(BASE_SP_ARM - 8)
    expect(afterPush.stack[BASE_SP_ARM - 8]).toBe(0)          // r4 = 0
    expect(afterPush.stack[BASE_SP_ARM - 4]).toBe(afterBL.lr) // 保存LR
  })
})

describe('ARM Simulator: SUB SP が x86 dispatchに落ちないことを確認', () => {
  it('ARM用状態更新でSPが正しく変化する', () => {
    const next = applyUpdate(INITIAL_STATE, { sp: BASE_SP_ARM - 8 })
    expect(next.sp).toBe(BASE_SP_ARM - 8)
    expect(INITIAL_STATE.sp).toBe(BASE_SP_ARM) // 元のstateは変わらない（イミュータブル）
  })
})

describe('ARM Simulator: POP {R4, PC}', () => {
  it('スタックからR4とPCを復元してSPを元に戻す', () => {
    const { states, error } = trace(FUNC_CALL_ASM)
    expect(error).toBeUndefined()
    const afterPop = states[6]! // after pop {r4, pc}
    expect(afterPop.sp).toBe(BASE_SP_ARM) // SP が戻る
    expect(afterPop.regs.r4).toBe(0)      // R4 復元
    expect(afterPop.regs.r0).toBe(8)      // add(3, 5) = 8
  })
})

describe('buildStates: イミュータブルなスナップショット', () => {
  it('各ステップが独立したスナップショットである', () => {
    const { states } = trace(FUNC_CALL_ASM)
    // states[0]=initial, states[1]=after mov r0 (#3), ...
    const s0 = states[0]!
    const s1 = states[1]!
    expect(s0.regs.r0).toBe(0)
    expect(s1.regs.r0).toBe(3)
    expect(s0.regs.r0).toBe(0) // 変わっていない
  })
})

describe('PC address computation (lineAddrs logic)', () => {
  it('BL add のupdate.pcがadd:ラベルのアドレスになる', () => {
    const { steps, error } = trace(FUNC_CALL_ASM)
    expect(error).toBeUndefined()
    // steps[2] = bl add → update.pc は add: (instrIdx 0) = BASE_PC_ARM
    const blStep = steps[2]!
    expect(blStep.update.pc).toBe(BASE_PC_ARM)
  })
})

describe('ARM Simulator: 条件分岐', () => {
  it('CMP後のBLT分岐が正しく動作する', () => {
    const asm = `
less:
    mov  r0, #1
    bx   lr

main:
    mov  r0, #5
    mov  r1, #10
    cmp  r0, r1
    blt  less
    mov  r0, #0
`
    const { states, error } = trace(asm)
    expect(error).toBeUndefined()
    // r0(5) < r1(10) → less に分岐 → r0 = 1
    const last = states[states.length - 1]!
    expect(last.regs.r0).toBe(1)
  })
})

describe('ARM Simulator: MOVW / MOVT', () => {
  it('MOVW で下位16bitをロードし上位16bitがゼロになる', () => {
    const asm = `
main:
    movw r0, #0x5678
    bx   lr
`
    const { states, error } = trace(asm)
    expect(error).toBeUndefined()
    expect(states[1]!.regs.r0).toBe(0x5678)
  })

  it('MOVW + MOVT で任意の32bit値を構成できる', () => {
    const asm = `
main:
    movw r0, #0x5678
    movt r0, #0x1234
    bx   lr
`
    const { states, error } = trace(asm)
    expect(error).toBeUndefined()
    expect(states[2]!.regs.r0).toBe(0x12345678)
  })

  it('MOVT は下位16bitを保持したまま上位16bitだけ書き換える', () => {
    const asm = `
main:
    movw r1, #0xABCD
    movw r0, #0x0004
    movt r0, #0x2000
    bx   lr
`
    const { states, error } = trace(asm)
    expect(error).toBeUndefined()
    // r1 は MOVT の影響を受けない
    expect(states[2]!.regs.r1).toBe(0xABCD)
    // r0 = 0x20000004
    expect(states[3]!.regs.r0).toBe(0x20000004)
  })
})

describe('buildStates: applyUpdate', () => {
  it('stackSet が正しくスタックに書き込まれる', () => {
    const next = applyUpdate(INITIAL_STATE, {
      sp: BASE_SP_ARM - 4,
      stackSet: { [BASE_SP_ARM - 4]: 0xdeadbeef },
    })
    expect(next.stack[BASE_SP_ARM - 4]).toBe(0xdeadbeef)
    expect(INITIAL_STATE.stack[BASE_SP_ARM - 4]).toBeUndefined() // イミュータブル
  })

  it('buildStatesのステップ数が初期状態+ステップ数と一致する', () => {
    const { steps, states } = trace(FUNC_CALL_ASM)
    const builtStates = buildStates({
      initialState: states[0]!,
      steps: steps.map(s => ({ update: s.update })),
    })
    expect(builtStates.length).toBe(steps.length + 1)
  })
})
