import { ref, computed } from 'vue'
import type { MachineState, Arch } from '@/core/types'
import { BASE_SP_ARM, BASE_PC_ARM } from '@/core/types'
import { hexU32 } from '@/core/simulator'
import type { PresetData } from '@/presets/index'
import { buildStates } from '@/core/simulator'
import { getPresets, getPreset } from '@/presets/index'
import { x86Guides } from '@/guides/x86'
import { armGuides } from '@/guides/arm'
import type { GuideData } from '@/guides/x86'
import { parseARM } from '@/core/arm/parser'
import { traceProgram } from '@/core/arm/tracer'
import { adaptGodboltResponse } from '@/core/compiler'
import type { GodboltResponse } from '@/core/compiler'

// ── Module-level state (singleton) ──────────────────────────────────────────
const arch = ref<Arch>('arm')
const currentPresetId = ref('funcCall')
const currentStep = ref(0)
const guideOpen = ref(false)
const diffOpen = ref(false)
const states = ref<MachineState[]>([])
const preset = ref<PresetData | null>(null)
const inputMode = ref<'preset' | 'free' | 'compile'>('preset')
const freeInputError = ref<string | null>(null)
const compileError = ref<string | null>(null)
const isCompiling = ref<boolean>(false)
const gccOutput = ref<string>('')

const FREE_INPUT_INITIAL_STATE: MachineState = {
  regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
  sp: BASE_SP_ARM,
  fp: 0,
  lr: 0x08000001,
  pc: BASE_PC_ARM,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_ARM, hi: BASE_SP_ARM, color: 'purple' }],
}

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

const totalSteps = computed(() => preset.value?.steps.length ?? 0)

const displayPc = computed<number>(() => currentState.value.pc)

const displayPcChanged = computed<boolean>(() => {
  if (!prevState.value) return false
  return currentState.value.pc !== prevState.value.pc
})

const isFirst = computed(() => currentStep.value === 0)
const isLast = computed(() => currentStep.value >= totalSteps.value)

const guide = computed<GuideData | null>(() => {
  if (!preset.value) return null
  const guides = arch.value === 'x86' ? x86Guides : armGuides
  return guides[preset.value.id] ?? null
})

const availablePresets = computed(() => getPresets(arch.value))

const showDiff = computed(() => {
  if (!preset.value) return false
  return !['pointer', 'array', 'interrupt'].includes(preset.value.id)
})

// ── ARM ABI helpers ──────────────────────────────────────────────────────────

function parseArgCount(funcName: string, cCode: string[]): number | null {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\s*\\(([^)]*)\\)`)
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

const isReturnStep = computed(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return false
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  return (text.startsWith('bx') && text.includes('lr'))
    || (text.startsWith('pop') && text.includes('pc'))
    || (text.startsWith('ldm') && text.includes('pc'))
})

const currentFuncName = computed(() => {
  const frames = currentState.value.frames
  return frames[frames.length - 1]?.name ?? 'main'
})

const returnReg = computed(() => arch.value === 'x86' ? 'rax' : 'r0')

const returnVal = computed(() => {
  const regs = currentState.value.regs
  return arch.value === 'x86' ? (regs['rax'] ?? 0) : (regs['r0'] ?? 0)
})

const returnHex = computed(() => hexU32(returnVal.value))
const returnDec = computed(() => returnVal.value.toString(10))

const callTarget = computed<string | null>(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return null
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  const m = text.match(/^blx?\s+(\w+)/)
  if (!m || !m[1]) return null
  if (/^(r\d+|sp|lr|pc|fp|ip|sl)$/.test(m[1])) return null
  return m[1]
})

const callArgCount = computed<number | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const cCode = preset.value?.cCode ?? []
  if (!cCode.length) return null
  return parseArgCount(name, cCode)
})

const callDisplay = computed<string | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const count = callArgCount.value
  if (count === null) return `${name}()`
  const argRegs = ['r0', 'r1', 'r2', 'r3']
  const args = argRegs.slice(0, count).map(r => `${r}=${currentState.value.regs[r] ?? 0}`)
  return `${name}(${args.join(', ')})`
})

// ── Actions ──────────────────────────────────────────────────────────────────
function loadPreset(newArch: Arch, presetId: string) {
  const p = getPreset(newArch, presetId)
  if (!p) return
  preset.value = p
  states.value = buildStates(p)
  currentStep.value = 0
  guideOpen.value = false
}

function setArch(newArch: Arch) {
  arch.value = newArch
  const available = getPresets(newArch)
  const sameId = available.find(p => p.id === currentPresetId.value)
  const targetId = sameId ? currentPresetId.value : (available[0]?.id ?? 'funcCall')
  currentPresetId.value = targetId
  loadPreset(newArch, targetId)
}

function selectPreset(presetId: string) {
  currentPresetId.value = presetId
  loadPreset(arch.value, presetId)
}

function nextStep() {
  if (!preset.value) return
  if (currentStep.value < preset.value.steps.length) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function reset() {
  currentStep.value = 0
}

function toggleGuide() {
  guideOpen.value = !guideOpen.value
}

function toggleDiff() {
  diffOpen.value = !diffOpen.value
}

function setInputMode(mode: 'preset' | 'free' | 'compile') {
  inputMode.value = mode
  if (mode === 'preset') {
    loadPreset(arch.value, currentPresetId.value)
  }
}

function simulateFreeInput(asmText: string) {
  const parseResult = parseARM(asmText)
  if (parseResult.errors.length > 0) {
    freeInputError.value = parseResult.errors.map(e => `行${e.line + 1}: ${e.message}`).join('\n')
    return
  }
  const result = traceProgram(parseResult, FREE_INPUT_INITIAL_STATE)
  freeInputError.value = result.error ?? null
  states.value = result.states
  preset.value = {
    id: 'free',
    name: '自由入力',
    arch: 'arm',
    cCode: [],
    asmCode: result.asmLines,
    steps: result.steps,
    initialState: result.states[0] ?? FREE_INPUT_INITIAL_STATE,
  }
  currentStep.value = 0
}

async function simulateCompiled(cSource: string, compilerId: string, optLevel: string) {
  isCompiling.value = true
  compileError.value = null
  gccOutput.value = ''
  try {
    const isDev = import.meta.env.DEV
    const res = await fetch(
      isDev
        ? `https://godbolt.org/api/compiler/${compilerId}/compile`
        : '/api/compile',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: isDev
          ? JSON.stringify({ source: cSource, options: { userArguments: optLevel } })
          : JSON.stringify({ compilerId, source: cSource, options: { userArguments: optLevel } }),
      },
    )
    const data = await res.json() as GodboltResponse
    const output = adaptGodboltResponse(data)
    gccOutput.value = output.gccOutput
    if (output.error) {
      compileError.value = output.error
      return
    }

    const isArm = compilerId.includes('arm')
    arch.value = isArm ? 'arm' : 'x86'
    const cSourceLines = cSource.split('\n')

    if (isArm) {
      const parseResult = parseARM(output.asmText)
      if (parseResult.errors.length > 0) {
        compileError.value = parseResult.errors.map(e => `行${e.line + 1}: ${e.message}`).join('\n')
        return
      }
      const result = traceProgram(parseResult, FREE_INPUT_INITIAL_STATE, 500, output.cLineMap)
      compileError.value = result.error ?? null
      states.value = result.states
      preset.value = {
        id: 'compile',
        name: 'Cコンパイル結果',
        arch: 'arm',
        cCode: cSourceLines,
        asmCode: result.asmLines,
        steps: result.steps,
        initialState: result.states[0] ?? FREE_INPUT_INITIAL_STATE,
      }
    } else {
      const asmLines = output.rawAsm.map(item => ({ text: item.text, isHeader: false }))
      states.value = [FREE_INPUT_INITIAL_STATE]
      preset.value = {
        id: 'compile',
        name: 'Cコンパイル結果 (x86)',
        arch: 'x86',
        cCode: cSourceLines,
        asmCode: asmLines,
        steps: [],
        initialState: FREE_INPUT_INITIAL_STATE,
      }
    }
    currentStep.value = 0
  } catch (e) {
    compileError.value = `ネットワークエラー: ${String(e)}`
  } finally {
    isCompiling.value = false
  }
}

// Initialize
loadPreset('arm', 'funcCall')

export function useSimulator() {
  return {
    arch,
    currentPresetId,
    currentStep,
    guideOpen,
    preset,
    currentState,
    prevState,
    currentStepData,
    totalSteps,
    isFirst,
    isLast,
    guide,
    availablePresets,
    showDiff,
    diffOpen,
    displayPc,
    displayPcChanged,
    inputMode,
    freeInputError,
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
    setArch,
    selectPreset,
    nextStep,
    prevStep,
    reset,
    toggleGuide,
    toggleDiff,
    setInputMode,
    simulateFreeInput,
    simulateCompiled,
  }
}
