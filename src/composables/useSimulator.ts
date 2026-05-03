import { ref, computed } from 'vue'
import type { MachineState, Arch } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'
import type { PresetData } from '@/presets/index'
import { buildStates } from '@/core/simulator'
import { getPresets, getPreset } from '@/presets/index'
import { x86Guides } from '@/guides/x86'
import { armGuides } from '@/guides/arm'
import type { GuideData } from '@/guides/x86'
import { parseARM } from '@/core/arm/parser'
import { traceProgram } from '@/core/arm/tracer'

const arch = ref<Arch>('arm')
const currentPresetId = ref('funcCall')
const currentStep = ref(0)
const guideOpen = ref(false)
const diffOpen = ref(false)
const states = ref<MachineState[]>([])
const preset = ref<PresetData | null>(null)
const inputMode = ref<'preset' | 'free'>('preset')
const freeInputError = ref<string | null>(null)

const FREE_INPUT_INITIAL_STATE: MachineState = {
  regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
  sp: BASE_SP_ARM,
  fp: 0,
  lr: 0x08000001,
  pc: 0x08000000,
  stack: {},
  stackMeta: {},
  flags: { zero: false, negative: false, carry: false, overflow: false },
  mode: 'thread',
  frames: [{ name: 'main', lo: BASE_SP_ARM, hi: BASE_SP_ARM, color: 'purple' }],
}

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

function setInputMode(mode: 'preset' | 'free') {
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
    initialState: FREE_INPUT_INITIAL_STATE,
  }
  currentStep.value = 0
}

// Initialize
loadPreset('arm', 'funcCall')

export function useSimulator() {
  const currentState = computed<MachineState>(() => {
    return (states.value[currentStep.value] ?? states.value[0]) as MachineState
  })

  const prevState = computed<MachineState | null>(() => {
    if (currentStep.value === 0) return null
    return states.value[currentStep.value - 1] ?? null
  })

  const currentStepData = computed(() => {
    if (!preset.value) return null
    return preset.value.steps[currentStep.value] ?? null
  })

  const totalSteps = computed(() => preset.value?.steps.length ?? 0)

  // ハイライト中の命令のアドレス = currentState.pc（次に実行される命令のアドレス）
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
    setArch,
    selectPreset,
    nextStep,
    prevStep,
    reset,
    toggleGuide,
    toggleDiff,
    setInputMode,
    simulateFreeInput,
  }
}
