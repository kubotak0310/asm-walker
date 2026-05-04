// x86-64 program tracer: dynamically executes parsed instructions and collects state snapshots

import type { MachineState, StepData, AsmLine } from '../types'
import { BASE_PC_X86 } from '../types'
import { applyUpdate } from '../simulator'
import type { X86ParseResult } from './parser'
import { interpretX86 } from './interpreter'

export interface TraceResult {
  states: MachineState[]
  steps: StepData[]
  asmLines: AsmLine[]
  error?: string
}

const BASE_PC = BASE_PC_X86
const INSTR_SIZE = 4  // virtual instruction size (x86 is variable-length, but we use fixed for visualization)

export function traceX86(
  parseResult: X86ParseResult,
  initialState: MachineState,
  maxSteps = 200,
  cLineMap?: Map<number, number>,
): TraceResult {
  const { instructions, labels, sourceLines } = parseResult
  const instrCount = instructions.length

  // Build asmLines from source text (preserves all lines including blank/labels)
  const asmLines: AsmLine[] = sourceLines.map(line => {
    const stripped = line.trim()
    const commentOnly = stripped.startsWith(';') || stripped.startsWith('#')
    const isLabel = !commentOnly && /^[A-Za-z_.@][\w.@()]*\s*:/.test(stripped)
    return {
      text: line,
      isHeader: isLabel || commentOnly || stripped === '' || stripped.startsWith('.'),
    }
  })

  if (instrCount === 0) {
    return { states: [initialState], steps: [], asmLines, error: '実行可能な命令がありません' }
  }

  // Start from 'main' label if defined, otherwise from the first instruction
  const startInstrIdx = labels.get('MAIN') ?? 0
  const startPc = BASE_PC + startInstrIdx * INSTR_SIZE
  const startState: MachineState = startInstrIdx > 0
    ? { ...initialState, pc: startPc }
    : initialState

  const states: MachineState[] = [startState]
  const steps: StepData[] = []

  // callStack tracks nested CALL/RET for phase/frame determination
  const callStack: { name: string; returnInstrIdx: number }[] = []

  let instrIdx = startInstrIdx
  let stepCount = 0
  let state = startState

  while (instrIdx < instrCount && stepCount < maxSteps) {
    const instr = instructions[instrIdx]
    if (!instr) break

    const result = interpretX86(
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

    const { update, explain, effect, comment, phase, isPtr, isArr, nextInstrIdx } = result

    const nextState = applyUpdate(state, update)
    states.push(nextState)
    steps.push({
      type: 'sw',
      phase,
      asmLine: instr.lineIndex,
      cLine: cLineMap?.get(instr.lineIndex) ?? 0,
      explain,
      effect,
      comment,
      isPtr,
      isArr,
      update,
    })

    // Maintain callStack for depth and RET targeting
    if (instr.mnemonic === 'CALL') {
      const labelOp = instr.operands[0]
      const name = labelOp?.type === 'label' ? labelOp.name.split('(')[0]?.toLowerCase() ?? 'func' : 'func'
      callStack.push({ name, returnInstrIdx: instrIdx + 1 })
    } else if (instr.mnemonic === 'RET') {
      if (callStack.length === 0) {
        // Returning from main — end of trace
        state = nextState
        break
      }
      const frame = callStack.pop()
      // nextInstrIdx is instrCount (sentinel from interpreter); use the actual return address
      state = nextState
      instrIdx = frame?.returnInstrIdx ?? instrCount
      stepCount++
      continue
    }

    state = nextState
    // If nextInstrIdx is instrCount, interpreter signaled end-of-function (indirect jmp, etc.)
    if (nextInstrIdx >= instrCount) break
    instrIdx = nextInstrIdx
    stepCount++
  }

  if (stepCount >= maxSteps) {
    return {
      states, steps, asmLines,
      error: `最大ステップ数 (${maxSteps}) を超えました。無限ループの可能性があります。`,
    }
  }

  // Annotate each executed line with its first-visit comment for inline display in CodePanel
  const annotated = new Set<number>()
  for (const step of steps) {
    if (step.asmLine >= 0 && !annotated.has(step.asmLine)) {
      const line = asmLines[step.asmLine]
      if (line && !line.isHeader) {
        line.comment = step.comment ?? step.explain
        annotated.add(step.asmLine)
      }
    }
  }

  return { states, steps, asmLines }
}
