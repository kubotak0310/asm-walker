import { describe, it, expect } from 'vitest'
import { buildStates, applyUpdate } from '@/core/simulator'
import { armFuncCall } from '@/presets/arm/funcCall'
import { armInterrupt } from '@/presets/arm/interrupt'
import { BASE_SP_ARM } from '@/core/types'

describe('ARM Simulator: PUSH {R4, LR} (funcCall preset step 4)', () => {
  it('SPを8デクリメントしてR4とLRをスタックに積む', () => {
    const states = buildStates(armFuncCall)
    // Step 3 is BL add (sets LR), step 4 is PUSH {R4, LR}
    const afterBL = states[3]!
    const afterPush = states[4]!

    expect(afterBL.lr).toBe(0x08000009)
    expect(afterPush.sp).toBe(BASE_SP_ARM - 8)
    expect(afterPush.stack[BASE_SP_ARM - 8]).toBe(0)        // R4
    expect(afterPush.stack[BASE_SP_ARM - 4]).toBe(0x08000009) // LR
  })
})

describe('ARM Simulator: SUB SP が x86 dispatchに落ちないことを確認', () => {
  it('ARM用状態更新で SP が正しく変化する', () => {
    const state = armFuncCall.initialState
    const next = applyUpdate(state, { sp: BASE_SP_ARM - 8 })
    expect(next.sp).toBe(BASE_SP_ARM - 8)
    expect(state.sp).toBe(BASE_SP_ARM) // 元のstateは変わらない（イミュータブル）
  })
})

describe('ARM Simulator: POP {R4, PC} (funcCall preset step 7)', () => {
  it('スタックから R4 と PC を復元する', () => {
    const states = buildStates(armFuncCall)
    const afterPop = states[7]!
    expect(afterPop.sp).toBe(BASE_SP_ARM) // SP が戻る
    expect(afterPop.regs.r4).toBe(0)      // R4 復元
    expect(afterPop.pc).toBe(0x08000009)  // PC = 保存した LR
  })
})

describe('ARM Interrupt: HW自動退避', () => {
  it('割り込み時にSPが32バイト下がり8レジスタが積まれる', () => {
    const states = buildStates(armInterrupt)
    const afterHW = states[1]! // step 0 = HW push

    expect(afterHW.sp).toBe(BASE_SP_ARM - 32)
    expect(afterHW.mode).toBe('handler')
    expect(afterHW.lr).toBe(0xfffffff9) // EXC_RETURN

    // xPSR at highest address
    expect(afterHW.stack[BASE_SP_ARM - 4]).toBe(0x01000000)
  })

  it('例外復帰後にThread Modeに戻りSPが元に戻る', () => {
    const states = buildStates(armInterrupt)
    const afterRestore = states[7]! // step 6 = HW pop

    expect(afterRestore.sp).toBe(BASE_SP_ARM)
    expect(afterRestore.mode).toBe('thread')
    expect(Object.keys(afterRestore.stack).length).toBe(0)
  })
})

describe('buildStates: イミュータブルなスナップショット', () => {
  it('各ステップが独立したスナップショットである', () => {
    const states = buildStates(armFuncCall)
    const s0 = states[0]!
    const s1 = states[1]!

    // R0: s0 = 0, s1 = 3 (after MOV R0, #3)
    expect(s0.regs.r0).toBe(0)
    expect(s1.regs.r0).toBe(3)

    // 前のステップに変更しても後のステップに影響しない
    expect(s0.regs.r0).toBe(0)
  })
})

describe('PC address computation (lineAddrs logic)', () => {
  it('ARM funcCall: BL add のアドレスが initialState.pc + 8 になる', () => {
    // BL add は 3番目の実行命令（index 0, 1, 2）→ 0x08000000 + 8 = 0x08000008
    const p = armFuncCall
    let prevPc = p.initialState.pc
    const stepAddrMap: Record<number, number> = {}
    for (const step of p.steps) {
      if (step.asmLine >= 0) stepAddrMap[step.asmLine] = prevPc
      prevPc = step.update.pc ?? prevPc + 4
    }
    // step 2 (BL add) のアドレスを確認
    const blStep = p.steps[2]!
    expect(stepAddrMap[blStep.asmLine]).toBe(0x08000008)
    // BL後の prevPc = update.pc = 0x08000010 (add 関数の先頭)
    expect(blStep.update.pc).toBe(0x08000010)
  })

  it('ARM funcCall: PUSH {R4, LR} のアドレスが 0x08000010 になる', () => {
    const p = armFuncCall
    let prevPc = p.initialState.pc
    const stepAddrMap: Record<number, number> = {}
    for (const step of p.steps) {
      if (step.asmLine >= 0) stepAddrMap[step.asmLine] = prevPc
      prevPc = step.update.pc ?? prevPc + 4
    }
    // step 3 (PUSH {R4, LR}) = add 関数の先頭
    const pushStep = p.steps[3]!
    expect(stepAddrMap[pushStep.asmLine]).toBe(0x08000010)
  })
})
