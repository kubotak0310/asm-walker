import { describe, it, expect } from 'vitest'
import { buildStates } from '@/core/simulator'
import { x86FuncCall } from '@/presets/x86/funcCall'
import { x86Arithmetic } from '@/presets/x86/arithmetic'
import { x86Pointer } from '@/presets/x86/pointer'
import { BASE_SP_X86 } from '@/core/types'

describe('x86 Simulator: call / ret (funcCall preset)', () => {
  it('call add でスタックに戻りアドレスが積まれる', () => {
    const states = buildStates(x86FuncCall)
    const afterCall = states[3]! // step 2 = call add

    expect(afterCall.sp).toBe(BASE_SP_X86 - 8)
    expect(afterCall.stack[BASE_SP_X86 - 8]).toBe(0x401009) // 戻りアドレス
  })

  it('push rbp でさらにSPが8下がる', () => {
    const states = buildStates(x86FuncCall)
    const afterPushRbp = states[4]! // step 3 = push rbp

    expect(afterPushRbp.sp).toBe(BASE_SP_X86 - 16)
    expect(afterPushRbp.stack[BASE_SP_X86 - 16]).toBe(0) // 旧RBP
  })

  it('add の戻り値 EAX = 8 になる', () => {
    const states = buildStates(x86FuncCall)
    const afterAdd = states[7]! // step 6 = add eax, esi

    expect(afterAdd.regs.rax).toBe(8)
  })

  it('ret でSPが戻りスタックが空になる', () => {
    const states = buildStates(x86FuncCall)
    const afterRet = states[9]! // step 8 = ret (from add)

    expect(afterRet.sp).toBe(BASE_SP_X86)
    expect(Object.keys(afterRet.stack).length).toBe(0)
  })
})

describe('x86 Simulator: idiv（四則演算プリセット）', () => {
  it('idiv の前に rdx が 0 にクリアされる', () => {
    const states = buildStates(x86Arithmetic)
    const afterXor = states[9]! // step 8 = xor rdx, rdx

    expect(afterXor.regs.rdx).toBe(0)
    expect(afterXor.flags.zero).toBe(true)
  })

  it('idiv で商と余りが正しく計算される', () => {
    const states = buildStates(x86Arithmetic)
    const afterDiv = states[10]! // step 9 = idiv rbx

    expect(afterDiv.regs.rax).toBe(3) // 10 / 3 = 3
    expect(afterDiv.regs.rdx).toBe(1) // 10 % 3 = 1
  })
})

describe('x86 Simulator: ポインタ間接参照', () => {
  it('lea でアドレス値がレジスタに入る', () => {
    const states = buildStates(x86Pointer)
    // step 4 = lea rax, [rbp-4]
    const afterLea = states[5]!
    expect(afterLea.regs.rax).toBeGreaterThan(0)
  })

  it('*ptr = 100 でスタック上の x の値が更新される', () => {
    const states = buildStates(x86Pointer)
    // After *ptr = 100 (step 7 = mov [rax], 100)
    const afterWrite = states[8]!
    const xAddr = afterWrite.regs.rax
    // The value at xAddr should be 100 (or the x variable should now be 100)
    const allVals = Object.values(afterWrite.stack)
    expect(allVals).toContain(100)
  })
})

describe('buildStates: スナップショット配列の件数', () => {
  it('初期状態 + ステップ数 = states の長さ', () => {
    const states = buildStates(x86FuncCall)
    expect(states.length).toBe(x86FuncCall.steps.length + 1)
  })
})
