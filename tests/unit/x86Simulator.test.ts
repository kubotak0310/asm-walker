import { describe, it, expect } from 'vitest'
import { buildStates, applyUpdate } from '@/core/simulator'
import { BASE_SP_X86, BASE_SP_ARM, BASE_PC_X86 } from '@/core/types'
import type { MachineState } from '@/core/types'
import { parseX86 } from '@/core/x86/parser'
import { traceX86 } from '@/core/x86/tracer'

const X86_INITIAL: MachineState = {
  regs: { rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0, r13: 0, r14: 0, r15: 0 },
  sp: BASE_SP_X86,
  fp: 0,
  lr: 0,
  pc: BASE_PC_X86,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_X86, hi: BASE_SP_X86, color: 'purple' }],
}

// Helper: trace a short assembly snippet
function trace(asm: string, initial: MachineState = X86_INITIAL) {
  const parseResult = parseX86(asm)
  expect(parseResult.errors).toHaveLength(0)
  return traceX86(parseResult, initial, 100)
}

// ── applyUpdate ──────────────────────────────────────────────────────────────

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

// ── parseX86 ─────────────────────────────────────────────────────────────────

describe('parseX86: 基本パース', () => {
  it('命令とラベルを正しく解析する', () => {
    const result = parseX86(`
main:
        push    rbp
        mov     rbp, rsp
        mov     eax, 5
        pop     rbp
        ret
`)
    expect(result.errors).toHaveLength(0)
    expect(result.labels.get('MAIN')).toBe(0)
    expect(result.instructions).toHaveLength(5)
    expect(result.instructions[0]?.mnemonic).toBe('PUSH')
    expect(result.instructions[1]?.mnemonic).toBe('MOV')
  })

  it('DWORD PTR メモリオペランドを解析する', () => {
    const result = parseX86(`
main:
        mov     DWORD PTR [rbp-4], edi
        mov     eax, DWORD PTR [rbp-4]
        ret
`)
    expect(result.errors).toHaveLength(0)
    const mov1 = result.instructions[0]!
    expect(mov1.operands[0]?.type).toBe('mem')
    if (mov1.operands[0]?.type === 'mem') {
      expect(mov1.operands[0].size).toBe(4)
      expect(mov1.operands[0].base).toBe('rbp')
      expect(mov1.operands[0].disp).toBe(-4)
    }
  })

  it('サブレジスタを正規化する', () => {
    const result = parseX86(`
main:
        mov     eax, 1
        mov     al, 2
        ret
`)
    expect(result.errors).toHaveLength(0)
    // eax → rax, al → rax
    const op0 = result.instructions[0]?.operands[0]
    expect(op0?.type).toBe('reg')
    if (op0?.type === 'reg') expect(op0.name).toBe('rax')
  })
})

// ── traceX86 ─────────────────────────────────────────────────────────────────

describe('traceX86: push / pop', () => {
  it('push rbp でスタックに rbp の値が積まれ rsp が減る', () => {
    const init: MachineState = { ...X86_INITIAL, fp: 0x7ffef0 }
    const result = trace(`
main:
        push    rbp
        ret
`, init)
    expect(result.error).toBeUndefined()
    const s1 = result.states[1]!
    expect(s1.sp).toBe(X86_INITIAL.sp - 8)
    expect(s1.stack[X86_INITIAL.sp - 8]).toBe(0x7ffef0)
  })

  it('pop rax でスタックから rax に値が復元され rsp が増える', () => {
    const withStack = applyUpdate(X86_INITIAL, {
      sp: BASE_SP_X86 - 8,
      stackSet: { [BASE_SP_X86 - 8]: 42 },
    })
    const result = trace(`
main:
        pop     rax
        ret
`, withStack)
    expect(result.error).toBeUndefined()
    const s1 = result.states[1]!
    expect(s1.regs['rax']).toBe(42)
    expect(s1.sp).toBe(BASE_SP_X86)
  })
})

describe('traceX86: mov / add / sub', () => {
  it('mov eax, 5 で rax = 5 になる', () => {
    const result = trace(`
main:
        mov     eax, 5
        ret
`)
    expect(result.error).toBeUndefined()
    expect(result.states[1]!.regs['rax']).toBe(5)
  })

  it('add eax, edx で rax に加算される', () => {
    const init = applyUpdate(X86_INITIAL, { regs: { rax: 3, rdx: 5 } })
    const result = trace(`
main:
        add     eax, edx
        ret
`, init)
    expect(result.error).toBeUndefined()
    expect(result.states[1]!.regs['rax']).toBe(8)
  })

  it('sub eax, 2 で rax から減算される', () => {
    const init = applyUpdate(X86_INITIAL, { regs: { rax: 10 } })
    const result = trace(`
main:
        sub     eax, 2
        ret
`, init)
    expect(result.error).toBeUndefined()
    expect(result.states[1]!.regs['rax']).toBe(8)
  })
})

describe('traceX86: cmp / jmp 条件分岐', () => {
  it('je で ZF=1 の時にジャンプする', () => {
    const result = trace(`
main:
        cmp     eax, eax
        je      done
        mov     eax, 99
done:
        mov     eax, 42
        ret
`)
    expect(result.error).toBeUndefined()
    // cmp eax,eax → ZF=1 → je taken → skip mov 99 → mov eax,42
    const finalState = result.states[result.states.length - 1]!
    expect(finalState.regs['rax']).toBe(42)
    // rax should NOT be 99 (je was taken)
    const passedThrough99 = result.states.some(s => s.regs['rax'] === 99)
    expect(passedThrough99).toBe(false)
  })
})

describe('traceX86: call / ret', () => {
  it('call で rsp が減り戻り先アドレスがスタックに積まれる', () => {
    const result = trace(`
main:
        call    add_func
        ret
add_func:
        mov     eax, 8
        ret
`)
    expect(result.error).toBeUndefined()
    // add_func が実行されて rax = 8 になる
    const finalState = result.states[result.states.length - 1]!
    expect(finalState.regs['rax']).toBe(8)
    // call で rsp が一度減り、add_func の ret で戻ることを中間ステップで確認
    const spAfterCall = result.states[1]!.sp
    expect(spAfterCall).toBe(X86_INITIAL.sp - 8)
  })
})

describe('traceX86: imul', () => {
  it('imul eax, edx で乗算される', () => {
    const init = applyUpdate(X86_INITIAL, { regs: { rax: 3, rdx: 7 } })
    const result = trace(`
main:
        imul    eax, edx
        ret
`, init)
    expect(result.error).toBeUndefined()
    expect(result.states[1]!.regs['rax']).toBe(21)
  })
})
