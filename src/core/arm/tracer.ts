// ARM program tracer: dynamically executes parsed instructions and collects state snapshots

import type { MachineState, StepData, AsmLine } from '../types'
import { BASE_PC_ARM } from '../types'
import { applyUpdate } from '../simulator'
import type { ParseResult } from './parser'
import { interpretInstruction } from './interpreter'

export interface TraceResult {
  states: MachineState[]
  steps: StepData[]
  asmLines: AsmLine[]   // for CodePanel — one entry per source line
  error?: string
}

const BASE_PC = BASE_PC_ARM

export function traceProgram(
  parseResult: ParseResult,
  initialState: MachineState,
  maxSteps = 200,
  cLineMap?: Map<number, number>,
): TraceResult {
  const { instructions, labels, sourceLines } = parseResult
  const instrCount = instructions.length

  // Build asmLines from source text (preserves all lines including blank/labels)
  const asmLines: AsmLine[] = sourceLines.map(line => {
    const stripped = line.trim()
    const commentOnly = stripped.startsWith(';') || stripped.startsWith('@')
    // Label line: starts with identifier/dot and ends with ':' (possibly with trailing instruction)
    const isLabel = !commentOnly && /^[A-Za-z_.][^:]*:/.test(stripped)
    return {
      text: line,
      isHeader: isLabel || commentOnly || stripped === '',
    }
  })

  if (instrCount === 0) {
    return { states: [initialState], steps: [], asmLines, error: '実行可能な命令がありません' }
  }

  // Start from 'main' if defined, otherwise from the first instruction
  const startInstrIdx = labels.get('MAIN') ?? 0
  const startPc = BASE_PC + startInstrIdx * 4
  const startState: MachineState = startInstrIdx > 0
    ? { ...initialState, pc: startPc }
    : initialState

  const states: MachineState[] = [startState]
  const steps: StepData[] = []

  // callStack tracks nested BL calls for phase/frame determination
  const callStack: { name: string; returnIdx: number }[] = []

  let instrIdx = startInstrIdx
  let stepCount = 0
  let state = startState

  while (instrIdx < instrCount && stepCount < maxSteps) {
    const instr = instructions[instrIdx]
    if (!instr) break

    const result = interpretInstruction(
      instr,
      instrIdx,
      state,
      labels,
      instrCount,
      callStack.length,
    )

    if ('error' in result) {
      return { states, steps, asmLines, error: `行${instr.lineIndex + 1}: ${result.error}` }
    }

    const { update, explain, effect, phase, isPtr, isArr, nextInstrIdx } = result

    // Finalize PC: already set in update by interpreter
    const nextState = applyUpdate(state, update)
    states.push(nextState)
    steps.push({
      type: 'sw',
      phase,
      asmLine: instr.lineIndex,
      cLine: cLineMap?.get(instr.lineIndex) ?? 0,
      explain,
      effect,
      isPtr,
      isArr,
      update,
    })

    // Maintain callStack for depth tracking
    if (instr.mnemonic === 'BL') {
      const labelOp = instr.operands[0]
      const name = labelOp?.type === 'label' ? labelOp.name : 'func'
      callStack.push({ name, returnIdx: instrIdx + 1 })
    } else if (instr.mnemonic === 'BX' || (instr.mnemonic === 'POP' && instr.operands[0]?.type === 'reglist' && instr.operands[0].regs.includes('pc'))) {
      if (callStack.length > 0) callStack.pop()
    }

    state = nextState
    instrIdx = nextInstrIdx
    stepCount++
  }

  if (stepCount >= maxSteps) {
    return {
      states, steps, asmLines,
      error: `最大ステップ数 (${maxSteps}) を超えました。無限ループの可能性があります。`,
    }
  }

  // Append a terminal "done" state so the user can see the final register state
  // (no additional step — user is at the last state after the last instruction)

  return { states, steps, asmLines }
}
