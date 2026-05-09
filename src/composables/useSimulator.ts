import { ref, computed, watch } from 'vue'
import { i18n } from '@/i18n'
import type { MachineState, Arch, PresetData } from '@/core/types'
import { BASE_SP_ARM, BASE_PC_ARM, BASE_SP_X86, BASE_PC_X86, MAX_TRACE_STEPS, ARG_REGS } from '@/core/types'
import { hexU32 } from '@/core/simulator'
import { parseARM } from '@/core/arm/parser'
import { traceProgram } from '@/core/arm/tracer'
import { parseX86 } from '@/core/x86/parser'
import { traceX86 } from '@/core/x86/tracer'
import { adaptGodboltResponse } from '@/core/compiler'
import type { GodboltResponse } from '@/core/compiler'

const INITIAL_STATE: MachineState = {
  regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
  sp: BASE_SP_ARM,
  fp: 0,
  // 0x08000001 = ARM Flash 先頭 + Thumb ビット。main から BX LR したとき
  // この値が命令インデックス範囲外になり、トレーサーが正常終了と判断する。
  lr: 0x08000001,
  pc: BASE_PC_ARM,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_ARM, hi: BASE_SP_ARM, color: 'purple' }],
}

const X86_INITIAL_STATE: MachineState = {
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

// モジュールスコープのシングルトン: Vue の provide/inject や props を経由せず
// 全コンポーネントが同じ状態を参照できる。ステップ移動・コンパイル結果がどこからでも読める。
// ── Module-level state (singleton) ──────────────────────────────────────────
const arch = ref<Arch>('arm')
const currentStep = ref(0)
const diffOpen = ref(false)
const states = ref<MachineState[]>([INITIAL_STATE])
const preset = ref<PresetData | null>(null)
const compileError = ref<string | null>(null)
const isCompiling = ref<boolean>(false)
const gccOutput = ref<string>('')

// ── Module-level derived state ───────────────────────────────────────────────
const currentState = computed<MachineState>(() =>
  (states.value[currentStep.value] ?? states.value[0]) as MachineState,
)

const prevState = computed<MachineState | null>(() => {
  if (currentStep.value === 0) return null
  return states.value[currentStep.value - 1] ?? null
})

const currentStepData = computed(() => {
  if (!preset.value) return null
  return preset.value.steps[currentStep.value] ?? null
})

/**
 * 直前に実行が完了したステップデータ（post-execution）。
 *
 * currentStepData が「次に実行する命令」であるのに対し、
 * prevStepData は「今実行し終えた命令」を返す。
 * ExplainPanel はこちらを使うことでアセンブラコメントと表示タイミングが一致する。
 * step=0（未実行）のときは null を返す。
 */
const prevStepData = computed(() => {
  if (!preset.value || currentStep.value === 0) return null
  return preset.value.steps[currentStep.value - 1] ?? null
})

const totalSteps = computed(() => preset.value?.steps.length ?? 0)

const displayPc = computed<number>(() => currentState.value.pc)

const displayPcChanged = computed<boolean>(() => {
  if (!prevState.value) return false
  return currentState.value.pc !== prevState.value.pc
})

const isFirst = computed(() => currentStep.value === 0)
const isLast = computed(() => currentStep.value >= totalSteps.value)

const showDiff = computed(() => false)

// ── ARM ABI helpers ──────────────────────────────────────────────────────────

/**
 * Cソースを正規表現で解析し、指定した関数定義の引数個数を返す。
 *
 * RegisterPanel が「引数1」「引数2」バッジを何個表示するかを決めるために使う。
 * 可変長引数・関数ポインタ引数は判定が難しいため null を返してバッジ非表示にする。
 *
 * @param funcName - 引数個数を調べたい関数の名前
 * @param cCode - Cソースコードを行単位に分割した配列
 * @returns 引数個数（void/引数なしは 0）。判定不能な場合は null
 * @example
 * parseArgCount('add', ['int add(int a, int b) {', '  return a + b;', '}'])
 * // => 2
 * parseArgCount('printf', ['printf("%d", x);'])
 * // => null（可変長引数のため）
 */
function parseArgCount(funcName: string, cCode: string[]): number | null {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\s*\\(([^)]*)\\)`, 'i')
  for (const line of cCode) {
    const m = re.exec(line)
    if (!m || m[1] === undefined) continue
    const before = line.slice(0, m.index).trim()
    if (/\breturn\b|[=,(]/.test(before)) continue
    const params = m[1].trim()
    if (params === '' || params === 'void') return 0
    if (params.includes('...') || params.includes('(')) return null
    return params.split(',').length
  }
  return null
}

/**
 * 指定ステップデータのアセンブラ行テキストを小文字で返す。
 *
 * isReturnStep・callTarget の正規表現マッチに先立って呼び出す共通ヘルパー。
 * テキストが存在しない場合は空文字を返す。
 *
 * @returns アセンブラ命令テキスト（小文字・トリム済み）
 */
function asmLineTextOf(step: typeof currentStepData.value): string {
  if (!step || step.asmLine < 0) return ''
  return (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
}

/**
 * 直前に実行した命令が関数の return 命令かどうかを返す（post-execution 判定）。
 *
 * prevStepData ベースにすることで、return 実行後に「実行完了」バーが表示される。
 * ARM では `bx lr` / `pop {…, pc}` / `ldm …, {…, pc}` を、
 * x86 では `ret` を return 命令と判定する。
 *
 * @returns 直前のステップが return 命令であれば true
 */
const isReturnStep = computed(() => {
  if (!prevStepData.value) return false
  const text = asmLineTextOf(prevStepData.value)
  if (arch.value === 'x86') {
    return text === 'ret' || text.startsWith('ret ')
  }
  return (text.startsWith('bx') && text.includes('lr'))
    || (text.startsWith('pop') && text.includes('pc'))
    || (text.startsWith('ldm') && text.includes('pc'))
})

/**
 * 現在実行中の関数名を frames 配列の末尾エントリから取得する。
 *
 * CCompilePanel バーの「▶ funcName() 実行中」表示に使う。
 * frames が空の場合は安全のため 'main' を返す。
 *
 * @returns 現在実行中の関数名
 */
const currentFuncName = computed(() => {
  const frames = currentState.value.frames
  return frames[frames.length - 1]?.name ?? 'main'
})

/**
 * アーキテクチャに応じた戻り値レジスタ名を返す。
 *
 * ARM ABI では r0、x86-64 System V ABI では rax が戻り値レジスタ。
 *
 * @returns ARM なら 'r0'、x86 なら 'rax'
 */
const returnReg = computed(() => arch.value === 'x86' ? 'rax' : 'r0')

/**
 * 戻り値レジスタの現在値を返す。
 *
 * CCompilePanel の「実行完了 — r0 = X (N)」表示に使う。
 * アーキテクチャに応じて rax（x86）または r0（ARM）を参照する。
 *
 * @returns 戻り値レジスタに格納された数値
 */
const returnVal = computed(() => {
  const regs = currentState.value.regs
  return arch.value === 'x86' ? (regs['rax'] ?? 0) : (regs['r0'] ?? 0)
})

/**
 * 戻り値を 16 進数文字列で返す。
 *
 * CCompilePanel バーの「0xXXXXXXXX」形式の表示に使う。
 *
 * @returns 16 進数表現の文字列（例: '0x00000003'）
 */
const returnHex = computed(() => hexU32(returnVal.value))

/**
 * 戻り値を 10 進数文字列で返す。
 *
 * CCompilePanel バーの「(N)」形式の10進数表示に使う。
 *
 * @returns 10 進数表現の文字列（例: '3'）
 */
const returnDec = computed(() => returnVal.value.toString(10))

/**
 * 現在ステップが BL/CALL 命令の場合、呼び出し先の関数名を返す。
 *
 * レジスタ間接呼び出し（`blx r0`・`call [rax]` など）は関数名が取得できないため null を返す。
 * callDisplay・callArgCount の基点となる computed。
 *
 * @returns 呼び出し先の関数名。BL/CALL でない場合やレジスタ間接呼び出しの場合は null
 */
const callTarget = computed<string | null>(() => {
  if (!currentStepData.value) return null
  const text = asmLineTextOf(currentStepData.value)
  if (arch.value === 'x86') {
    const m = text.match(/^call\s+(\S+)/)
    if (!m || !m[1]) return null
    // CALL [rax] や CALL QWORD PTR [...] のようなレジスタ間接呼び出しは
    // 関数名が不明なためバッジ表示をスキップする
    if (m[1].includes('[') || m[1].includes('ptr')) return null
    return m[1].split('(')[0] ?? null
  }
  const m = text.match(/^blx?\s+(\w+)/)
  if (!m || !m[1]) return null
  // BLX r0 のようなレジスタ間接呼び出し（関数ポインタ経由）は名前が取れないためスキップ
  if (/^(r\d+|sp|lr|pc|fp|ip|sl)$/.test(m[1])) return null
  return m[1]
})

/**
 * 呼び出し先関数の引数個数を Cソース解析で取得する。
 *
 * RegisterPanel の「引数1」「引数2」バッジを何個表示するかの決定に使う。
 * callTarget が null または Cソースが存在しない場合は null を返す。
 *
 * @returns 引数個数。判定不能または呼び出し命令でない場合は null
 */
const callArgCount = computed<number | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const cCode = preset.value?.cCode ?? []
  if (!cCode.length) return null
  return parseArgCount(name, cCode)
})

/**
 * CCompilePanel バーの「→ funcName(r0=val, r1=val) 呼び出し」表示用文字列を構築する。
 *
 * 引数個数が取得できない場合は `funcName()` のみを返す。
 * 呼び出し命令でない場合は null を返す。
 * 引数レジスタは ARM: r0〜r3、x86: rdi/rsi/rdx/rcx/r8/r9 の順で参照する。
 *
 * @returns 表示用の呼び出し文字列（例: 'add(r0=1, r1=2)'）。非呼び出しステップは null
 */
const callDisplay = computed<string | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const count = callArgCount.value
  if (count === null) return `${name}()`
  const argRegs = ARG_REGS[arch.value]
  const args = argRegs.slice(0, count).map(r => `${r}=${currentState.value.regs[r] ?? 0}`)
  return `${name}(${args.join(', ')})`
})

/**
 * 直前に実行された BL/CALL 命令の引数付き表示文字列を保持する。
 *
 * callTarget が非 null になった瞬間（= BL/CALL ステップ）に引数値を確定し、
 * 以降の「実行中」バー表示でその値を使い続ける。
 * アーキ切り替え・再編集時にリセットされる。
 *
 * @example 'compare(3, 3)' / 'add(1, 2)' / 'func()'（引数不明時）
 */
const capturedCallDisplay = ref<string | null>(null)

watch(callTarget, (target) => {
  if (!target) return
  const count = callArgCount.value
  if (count === null) { capturedCallDisplay.value = `${target}()`; return }
  const argRegs = ARG_REGS[arch.value]
  const args = argRegs.slice(0, count).map(r => String(currentState.value.regs[r] ?? 0))
  capturedCallDisplay.value = `${target}(${args.join(', ')})`
})

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * アーキテクチャを切り替える。
 *
 * CCompilePanel でコンパイラ選択時に呼ばれ、
 * isReturnStep・callTarget・RegisterPanel バッジなど arch 依存の computed に連鎖する。
 *
 * @param newArch - 切り替え先のアーキテクチャ（'arm' または 'x86'）
 */
function setArch(newArch: Arch) {
  if (arch.value === newArch) return
  // アーキ切り替え時はステップ列・エラーをリセットする。
  // ARM ステップ列のまま x86 インタープリタが走ると誤動作するため。
  arch.value = newArch
  preset.value = null
  currentStep.value = 0
  states.value = [newArch === 'x86' ? X86_INITIAL_STATE : INITIAL_STATE]
  compileError.value = null
  gccOutput.value = ''
  capturedCallDisplay.value = null
}

/**
 * 次のステップへ進む。
 *
 * preset が存在しない場合、または最終ステップに達している場合は何もしない。
 * StepController の「▶」ボタンおよびキーボードの → キーから呼ばれる。
 */
function nextStep() {
  if (!preset.value) return
  if (currentStep.value < preset.value.steps.length) {
    currentStep.value++
  }
}

/**
 * 前のステップへ戻る。
 *
 * ステップ 0 より前には戻れない（ガード済み）。
 * StepController の「◀」ボタンおよびキーボードの ← キーから呼ばれる。
 */
function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

/**
 * ステップカウンタを 0 に戻し、プログラム開始直前の状態へリセットする。
 *
 * states 配列は破棄しない。currentStep を 0 に戻すだけで
 * スナップショットの再計算コストなしに初期状態を表示できる。
 */
function reset() {
  currentStep.value = 0
}

/**
 * コード編集モードに戻る際にシミュレーション結果を破棄する。
 *
 * preset を null にすることで totalSteps が 0 になり、ステップボタンが無効化される。
 */
function clearSimulation() {
  preset.value = null
  currentStep.value = 0
  capturedCallDisplay.value = null
}

/**
 * レジスタ差分パネルの表示/非表示をトグルする。
 *
 * 現在は showDiff が `computed(() => false)` で固定されているため実質未使用。
 * 将来的に差分パネルを復活させる際のフックとして残してある。
 */
function toggleDiff() {
  diffOpen.value = !diffOpen.value
}

/**
 * Godbolt API にCソースを送信してコンパイルし、生成されたアセンブリをトレースする。
 *
 * ARM/x86 の判定はコンパイラ ID に 'arm' が含まれるかどうかで行い、
 * パース・トレース結果を preset / states に格納する。
 * エラー時（コンパイルエラー・パースエラー・ネットワークエラー）は
 * compileError に文字列をセットして呼び出し元に通知する。
 *
 * @param cSource - コンパイルするCソースコード文字列
 * @param compilerId - Godbolt コンパイラ ID（例: 'carm1121', 'cg142'）
 * @param optLevel - GCC 最適化オプション文字列（例: '-O0', '-O1'）
 */
async function simulateCompiled(cSource: string, compilerId: string, optLevel: string) {
  isCompiling.value = true
  compileError.value = null
  gccOutput.value = ''
  try {
    const res = await fetch(
      `https://godbolt.org/api/compiler/${compilerId}/compile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ source: cSource, options: { userArguments: optLevel } }),
      },
    )
    const data = await res.json() as GodboltResponse
    const output = adaptGodboltResponse(data)
    gccOutput.value = output.gccOutput
    if (output.error) {
      compileError.value = output.error
      return
    }

    // Godbolt のコンパイラ ID 命名規則に依存（例: "carm1121", "armug1320"）。
    // x86 用コンパイラ（"cg142" 等）は 'arm' を含まないためこの判定が成立する。
    const isArm = compilerId.includes('arm')
    arch.value = isArm ? 'arm' : 'x86'
    const cSourceLines = cSource.split('\n')

    if (isArm) {
      const parseResult = parseARM(output.asmText)
      if (parseResult.errors.length > 0) {
        compileError.value = parseResult.errors.map(e => `行${e.line + 1}: ${e.message}`).join('\n')
        return
      }
      const locale = i18n.global.locale.value === 'ja' ? 'ja' : 'en'
      const result = traceProgram(parseResult, INITIAL_STATE, MAX_TRACE_STEPS, output.cLineMap, locale)
      compileError.value = result.error ?? null
      states.value = result.states
      preset.value = {
        id: 'compile',
        name: 'Cコンパイル結果',
        arch: 'arm',
        cCode: cSourceLines,
        asmCode: result.asmLines,
        steps: result.steps,
        initialState: result.states[0] ?? INITIAL_STATE,
      }
    } else {
      const parseResult = parseX86(output.asmText)
      if (parseResult.errors.length > 0) {
        compileError.value = parseResult.errors.map(e => `行${e.line + 1}: ${e.message}`).join('\n')
        return
      }
      const result = traceX86(parseResult, X86_INITIAL_STATE, MAX_TRACE_STEPS, output.cLineMap)
      compileError.value = result.error ?? null
      states.value = result.states
      preset.value = {
        id: 'compile',
        name: 'Cコンパイル結果 (x86)',
        arch: 'x86',
        cCode: cSourceLines,
        asmCode: result.asmLines,
        steps: result.steps,
        initialState: result.states[0] ?? X86_INITIAL_STATE,
      }
    }
    currentStep.value = 0
  } catch (e) {
    compileError.value = `ネットワークエラー: ${String(e)}`
  } finally {
    isCompiling.value = false
  }
}

/**
 * モジュールシングルトンの状態と操作関数をまとめて返す Vue composable。
 *
 * モジュールスコープで状態を保持するため、全コンポーネントが同一インスタンスを参照する。
 * provide/inject を使わずにグローバル状態を共有でき、
 * ステップ移動・コンパイル結果がどのコンポーネントからでも読み書きできる。
 *
 * @returns シミュレーター状態（refs・computed）と操作関数のオブジェクト
 */
export function useSimulator() {
  return {
    arch,
    currentStep,
    preset,
    currentState,
    prevState,
    currentStepData,
    prevStepData,
    totalSteps,
    isFirst,
    isLast,
    showDiff,
    diffOpen,
    displayPc,
    displayPcChanged,
    compileError,
    isCompiling,
    gccOutput,
    isReturnStep,
    currentFuncName,
    returnReg,
    returnHex,
    returnDec,
    callTarget,
    callArgCount,
    callDisplay,
    capturedCallDisplay,
    setArch,
    nextStep,
    prevStep,
    reset,
    clearSimulation,
    toggleDiff,
    simulateCompiled,
  }
}
