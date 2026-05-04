import { describe, it, expect } from 'vitest'
import { buildStates, applyUpdate } from '@/core/simulator'
import { BASE_SP_X86, BASE_SP_ARM } from '@/core/types'
import type { MachineState } from '@/core/types'

const X86_INITIAL: MachineState = {
  regs: { rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0, rsp: BASE_SP_X86, rbp: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0, r13: 0, r14: 0, r15: 0 },
  sp: BASE_SP_X86,
  fp: 0,
  lr: 0,
  pc: 0x401000,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_X86, hi: BASE_SP_X86, color: 'purple' }],
}

describe('applyUpdate: x86 レジスタ更新', () => {
  it('rax が正しく更新される', () => {
    const next = applyUpdate(X86_INITIAL, { regs: { rax: 8 } })
    expect(next.regs.rax).toBe(8)
    expect(X86_INITIAL.regs.rax).toBe(0) // イミュータブル
  })

  it('flags が正しく更新される', () => {
    const next = applyUpdate(X86_INITIAL, { flags: { zero: true } })
    expect(next.flags.zero).toBe(true)
    expect(X86_INITIAL.flags.zero).toBe(false) // イミュータブル
  })

  it('sp が正しく更新される', () => {
    const next = applyUpdate(X86_INITIAL, { sp: BASE_SP_X86 - 8 })
    expect(next.sp).toBe(BASE_SP_X86 - 8)
    expect(X86_INITIAL.sp).toBe(BASE_SP_X86) // イミュータブル
  })
})

describe('applyUpdate: スタック操作', () => {
  it('stackSet でスタックに値を書き込める', () => {
    const next = applyUpdate(X86_INITIAL, {
      sp: BASE_SP_X86 - 8,
      stackSet: { [BASE_SP_X86 - 8]: 0x401009 },
    })
    expect(next.stack[BASE_SP_X86 - 8]).toBe(0x401009)
    expect(X86_INITIAL.stack[BASE_SP_X86 - 8]).toBeUndefined()
  })

  it('stackRemove でスタックから値を削除できる', () => {
    const withStack = applyUpdate(X86_INITIAL, {
      stackSet: { [BASE_SP_X86 - 8]: 42 },
    })
    const cleared = applyUpdate(withStack, {
      stackRemove: [BASE_SP_X86 - 8],
    })
    expect(cleared.stack[BASE_SP_X86 - 8]).toBeUndefined()
  })
})

describe('buildStates: スナップショット配列', () => {
  it('初期状態 + ステップ数 = states の長さ', () => {
    const preset = {
      initialState: X86_INITIAL,
      steps: [
        { update: { regs: { rax: 3 } } },
        { update: { regs: { rax: 5 } } },
        { update: { regs: { rax: 8 } } },
      ],
    }
    const states = buildStates(preset)
    expect(states.length).toBe(preset.steps.length + 1)
  })

  it('各ステップが前のステップに影響しない（イミュータブル）', () => {
    const preset = {
      initialState: X86_INITIAL,
      steps: [
        { update: { regs: { rax: 3 }, sp: BASE_SP_X86 - 8 } },
        { update: { regs: { rax: 5 } } },
      ],
    }
    const states = buildStates(preset)
    expect(states[0]!.regs.rax).toBe(0)
    expect(states[1]!.regs.rax).toBe(3)
    expect(states[2]!.regs.rax).toBe(5)
    expect(states[0]!.regs.rax).toBe(0) // 変わっていない
  })
})

describe('applyUpdate: ARM と x86 の独立性', () => {
  it('ARM の sp 更新が x86 の状態に影響しない', () => {
    const armState: MachineState = {
      ...X86_INITIAL,
      sp: BASE_SP_ARM,
    }
    const armNext = applyUpdate(armState, { sp: BASE_SP_ARM - 8 })
    const x86Next = applyUpdate(X86_INITIAL, { sp: BASE_SP_X86 - 8 })

    expect(armNext.sp).toBe(BASE_SP_ARM - 8)
    expect(x86Next.sp).toBe(BASE_SP_X86 - 8)
    expect(X86_INITIAL.sp).toBe(BASE_SP_X86) // 元のstateは変わらない
  })
})
