export type Arch = 'x86' | 'arm'

export interface Flags {
  zero: boolean
  negative: boolean
  carry: boolean
  overflow: boolean
}

export interface StackMeta {
  label: string
  kind: 'sw' | 'hw' | 'ptr' | 'arr'
}

export interface StackFrame {
  name: string
  lo: number
  hi: number
  color: 'purple' | 'green' | 'orange'
}

export interface MachineState {
  regs: Record<string, number>
  sp: number
  fp: number
  lr: number
  pc: number
  stack: Record<number, number>
  stackMeta: Record<number, StackMeta>
  flags: Flags
  mode: 'thread' | 'handler'
  frames: StackFrame[]
}

export interface StateUpdate {
  regs?: Partial<Record<string, number>>
  sp?: number
  fp?: number
  lr?: number
  pc?: number
  stackSet?: Record<number, number>
  stackRemove?: number[]
  metaSet?: Record<number, StackMeta>
  metaRemove?: number[]
  flags?: Partial<Flags>
  mode?: 'thread' | 'handler'
  frames?: StackFrame[]
}

export type Phase = 'main' | 'caller' | 'callee' | 'hw' | 'isr' | 'ret'

export interface StepData {
  type: 'sw' | 'hw'
  phase: Phase
  asmLine: number
  cLine: number
  explain: string
  effect: string
  isPtr?: boolean
  isArr?: boolean
  update: StateUpdate
}

export interface AsmLine {
  text: string
  isHeader?: boolean
  phase?: Phase
}

export interface PresetData {
  id: string
  name: string
  arch: Arch
  cCode: string[]
  asmCode: AsmLine[]
  steps: StepData[]
  initialState: MachineState
}

export const BASE_SP_X86 = 0x7fff00
export const BASE_SP_ARM = 0x20008000

export const PHASE_COLORS: Record<Phase, string> = {
  main: 'purple',
  caller: 'purple',
  callee: 'green',
  hw: 'orange',
  isr: 'green',
  ret: 'coral',
}
