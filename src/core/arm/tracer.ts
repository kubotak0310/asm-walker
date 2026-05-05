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

/**
 * パース済みARM命令列を先頭から順に実行し、各ステップのスナップショットを収集して返す。
 *
 * 'main' ラベルが存在する場合はそこをエントリポイントとし、
 * maxSteps を超えたら無限ループとして打ち切る。
 *
 * @param parseResult - ARM パーサーが返す命令列・ラベルマップ・ソース行の集合
 * @param initialState - 実行開始時のマシン状態
 * @param maxSteps - 無限ループ検出のための最大実行ステップ数（デフォルト 200）
 * @param cLineMap - アセンブラ行インデックス → C ソース行番号のマップ（CSourcePanel 対応時に使用）
 * @returns states（状態スナップショット列）・steps（ステップデータ列）・asmLines・エラー文字列を含む TraceResult
 */
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

    const { update, explain, effect, comment, phase, isArr, nextInstrIdx } = result

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
      comment,
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

  return { states, steps, asmLines }
}
