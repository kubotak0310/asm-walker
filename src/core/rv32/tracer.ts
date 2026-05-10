// RISC-V RV32IM program tracer: dynamically executes parsed instructions
// and collects MachineState snapshots + StepData for the UI.

import type { MachineState, StepData, AsmLine, Locale } from '../types'
import { BASE_PC_RV32 } from '../types'
import { applyUpdate } from '../simulator'
import type { RV32ParseResult } from './parser'
import { interpretRV32 } from './interpreter'

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

const INSTR_SIZE = 4  // 仮想命令サイズ（RV32 は固定 32bit）

/**
 * パース済み RV32 命令列を先頭から順に実行し、各ステップのスナップショットを収集して返す。
 *
 * 'main' ラベルが存在する場合はそこをエントリポイントとする。
 * call/ret によるフレーム管理はインタープリタ内部で行い、
 * callStack は参照渡しでインタープリタと共有する。
 *
 * @param parseResult - RV32 パーサーが返す命令列・ラベルマップ・ソース行の集合
 * @param initialState - 実行開始時のマシン状態
 * @param maxSteps - 無限ループ検出のための最大実行ステップ数（デフォルト 200）
 * @param cLineMap - アセンブラ行インデックス → C ソース行番号のマップ
 * @param locale - 説明文の言語（'ja' | 'en'）
 * @returns states・steps・asmLines・エラー文字列を含む TraceResult
 */
export function traceRV32(
  parseResult: RV32ParseResult,
  initialState: MachineState,
  maxSteps = 200,
  cLineMap?: Map<number, number>,
  locale: Locale = 'ja',
): TraceResult {
  const { instructions, labels, sourceLines } = parseResult
  const instrCount = instructions.length
  const ERR = TRACE_ERRORS[locale]

  // ソース行から asmLines を構築（ラベル行・コメント行・空行は isHeader=true）
  const asmLines: AsmLine[] = sourceLines.map(line => {
    const stripped = line.trim()
    const commentOnly = stripped.startsWith('#')
    // "add(int, int):" や ".L2:" を含むあらゆるラベル形式を検出する
    const isLabel = !commentOnly && /^[.A-Za-z_][^:]*:/.test(stripped)
    return {
      text: line,
      isHeader: isLabel || commentOnly || stripped === '' || stripped.startsWith('.'),
    }
  })

  if (instrCount === 0) {
    return { states: [initialState], steps: [], asmLines, error: ERR.noInstructions }
  }

  // 'main' ラベルが存在すればそこから開始
  const normalizedLabels = new Map<string, number>()
  for (const [k, v] of labels) {
    normalizedLabels.set(k.toUpperCase(), v)
  }
  const startInstrIdx = normalizedLabels.get('MAIN') ?? 0
  const startPc = BASE_PC_RV32 + startInstrIdx * INSTR_SIZE
  const startState: MachineState = startInstrIdx > 0
    ? { ...initialState, pc: startPc }
    : initialState

  const states: MachineState[] = [startState]
  const steps: StepData[] = []

  // callStack はインタープリタと共有する（参照渡し）
  const callStack: { name: string; returnInstrIdx: number }[] = []

  let instrIdx = startInstrIdx
  let stepCount = 0
  let state = startState

  while (instrIdx < instrCount && stepCount < maxSteps) {
    const instr = instructions[instrIdx]
    if (!instr) break

    // フェーズ: call 深度 0 = main、1 以上 = callee
    const callDepthBefore = callStack.length
    const phase = callDepthBefore === 0 ? 'main' : 'callee'

    const result = interpretRV32(
      instr,
      instrIdx,
      state,
      labels,
      phase,
      callStack,  // インタープリタが push/pop を行う
      locale,
    )

    if ('error' in result) {
      return { states, steps, asmLines, error: ERR.lineError(instr.lineIndex + 1, result.error) }
    }

    const { update, explain, effect, comment, phase: resultPhase, isArr, ptrReg, nextInstrIdx } = result

    // PC を仮想アドレスで設定（CodePanel の stepAddrMap 用）
    const finalPc = BASE_PC_RV32 + instrIdx * INSTR_SIZE
    const fixedUpdate = { ...update, pc: finalPc }

    const nextState = applyUpdate(state, fixedUpdate)
    states.push(nextState)
    steps.push({
      type: 'sw',
      phase: resultPhase,
      asmLine: instr.lineIndex,
      cLine: cLineMap?.get(instr.lineIndex) ?? 0,
      explain,
      effect,
      comment,
      isArr,
      ptrReg,
      update: fixedUpdate,
    })

    state = nextState

    // callDepthBefore === 0 かつ ret = main 自身からの return → 終了。
    // callee（add など）からの return 後は callStack がいったん空になるが、
    // その時点は callDepthBefore > 0 なので終了せず main の続きを実行する。
    if (resultPhase === 'ret' && callDepthBefore === 0) {
      break
    }

    if (nextInstrIdx >= instrCount) break
    instrIdx = nextInstrIdx
    stepCount++
  }

  if (stepCount >= maxSteps) {
    return { states, steps, asmLines, error: ERR.maxSteps(maxSteps) }
  }

  return { states, steps, asmLines }
}
