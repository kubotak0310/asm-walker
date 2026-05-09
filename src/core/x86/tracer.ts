// x86-64 program tracer: dynamically executes parsed instructions and collects state snapshots

import type { MachineState, StepData, AsmLine, Locale } from '../types'
import { BASE_PC_X86 } from '../types'
import { applyUpdate } from '../simulator'
import type { X86ParseResult } from './parser'
import { interpretX86 } from './interpreter'

const TRACE_ERRORS: Record<Locale, {
  noInstructions: string
  lineError: (n: number, msg: string) => string
  maxSteps: (n: number) => string
}> = {
  ja: {
    noInstructions: '実行可能な命令がありません',
    lineError: (n, msg) => `行${n}: ${msg}`,
    maxSteps: (n) => `最大ステップ数 (${n}) を超えました。無限ループの可能性があります。`,
  },
  en: {
    noInstructions: 'No executable instructions found',
    lineError: (n, msg) => `Line ${n}: ${msg}`,
    maxSteps: (n) => `Maximum steps (${n}) exceeded. Possible infinite loop.`,
  },
}

export interface TraceResult {
  states: MachineState[]
  steps: StepData[]
  asmLines: AsmLine[]
  error?: string
}

const BASE_PC = BASE_PC_X86
const INSTR_SIZE = 4  // virtual instruction size (x86 is variable-length, but we use fixed for visualization)

/**
 * パース済みx86命令列を先頭から順に実行し、各ステップのスナップショットを収集して返す。
 *
 * CALL/RET を callStack で追跡し、RET 時に正しいリターン先インデックスへジャンプする。
 * main から RET した時点で実行を終了する（callStack が空の RET = プログラム終端）。
 *
 * @param parseResult - x86 パーサーが返す命令列・ラベルマップ・ソース行の集合
 * @param initialState - 実行開始時のマシン状態
 * @param maxSteps - 無限ループ検出のための最大実行ステップ数（デフォルト 200）
 * @param cLineMap - アセンブラ行インデックス → C ソース行番号のマップ（CSourcePanel 対応時に使用）
 * @returns states（状態スナップショット列）・steps（ステップデータ列）・asmLines・エラー文字列を含む TraceResult
 */
export function traceX86(
  parseResult: X86ParseResult,
  initialState: MachineState,
  maxSteps = 200,
  cLineMap?: Map<number, number>,
  locale: Locale = 'ja',
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

  const ERR = TRACE_ERRORS[locale]

  if (instrCount === 0) {
    return { states: [initialState], steps: [], asmLines, error: ERR.noInstructions }
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
      locale,
    )

    if ('error' in result) {
      return { states, steps, asmLines, error: ERR.lineError(instr.lineIndex + 1, result.error) }
    }

    const { update, explain, effect, comment, phase, isArr, ptrReg, nextInstrIdx } = result

    // For RET returning to a caller, override update.pc with the real return address so
    // CodePanel's stepAddrMap assigns the correct virtual address to the instruction after CALL.
    let fixedUpdate = update
    if (instr.mnemonic === 'RET' && callStack.length > 0) {
      const returnFrame = callStack[callStack.length - 1]
      const returnIdx = returnFrame?.returnInstrIdx ?? instrCount
      fixedUpdate = { ...update, pc: BASE_PC + returnIdx * INSTR_SIZE }
    }

    const nextState = applyUpdate(state, fixedUpdate)
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
      ptrReg,
      update: fixedUpdate,
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
      error: ERR.maxSteps(maxSteps),
    }
  }



  return { states, steps, asmLines }
}
