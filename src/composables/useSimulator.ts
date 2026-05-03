import { ref, computed } from 'vue'
import type { MachineState, Arch } from '@/core/types'
import type { PresetData } from '@/presets/index'
import { buildStates } from '@/core/simulator'
import { getPresets, getPreset } from '@/presets/index'
import { x86Guides } from '@/guides/x86'
import { armGuides } from '@/guides/arm'
import type { GuideData } from '@/guides/x86'

const arch = ref<Arch>('arm')
const currentPresetId = ref('funcCall')
const currentStep = ref(0)
const guideOpen = ref(false)
const diffOpen = ref(false)
const states = ref<MachineState[]>([])
const preset = ref<PresetData | null>(null)

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

// Initialize
loadPreset('x86', 'funcCall')

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
    setArch,
    selectPreset,
    nextStep,
    prevStep,
    reset,
    toggleGuide,
    toggleDiff,
  }
}
