import type { MachineState, StateUpdate } from './types'

export function applyUpdate(state: MachineState, update: StateUpdate): MachineState {
  const newStack = { ...state.stack }
  const newMeta = { ...state.stackMeta }

  if (update.stackSet) {
    for (const [addrStr, val] of Object.entries(update.stackSet)) {
      newStack[Number(addrStr)] = val
    }
  }
  if (update.stackRemove) {
    for (const addr of update.stackRemove) {
      delete newStack[addr]
    }
  }
  if (update.metaSet) {
    for (const [addrStr, meta] of Object.entries(update.metaSet)) {
      newMeta[Number(addrStr)] = meta
    }
  }
  if (update.metaRemove) {
    for (const addr of update.metaRemove) {
      delete newMeta[addr]
    }
  }

  const mergedRegs: Record<string, number> = { ...state.regs }
  if (update.regs) {
    for (const [k, v] of Object.entries(update.regs)) {
      if (v !== undefined) mergedRegs[k] = v
    }
  }

  return {
    regs: mergedRegs,
    sp: update.sp ?? state.sp,
    fp: update.fp ?? state.fp,
    lr: update.lr ?? state.lr,
    pc: update.pc ?? state.pc,
    stack: newStack,
    stackMeta: newMeta,
    flags: update.flags ? { ...state.flags, ...update.flags } : { ...state.flags },
    mode: update.mode ?? state.mode,
    frames: update.frames ? [...update.frames] : [...state.frames],
  }
}

export function buildStates(preset: { initialState: MachineState; steps: { update: StateUpdate }[] }): MachineState[] {
  const states: MachineState[] = [preset.initialState]
  let prevPc = preset.initialState.pc
  for (const step of preset.steps) {
    const last = states[states.length - 1]
    if (!last) break
    // PC は明示 (call/BL/ret/BX LR) がなければ +4 進める
    const nextPc = step.update.pc ?? prevPc + 4
    states.push(applyUpdate(last, { ...step.update, pc: nextPc }))
    prevPc = nextPc
  }
  return states
}

export function hexU32(v: number): string {
  return `0x${v.toString(16).padStart(8, '0')}`
}

export function isAddressLike(val: number, arch: 'x86' | 'arm'): boolean {
  if (arch === 'x86') return val >= 0x7ff000 && val <= 0x800000
  return val >= 0x20007000 && val <= 0x20009000
}
