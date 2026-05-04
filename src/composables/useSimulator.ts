import { ref, computed } from 'vue'
import type { MachineState, Arch, PresetData } from '@/core/types'
import { BASE_SP_ARM, BASE_PC_ARM, BASE_SP_X86, BASE_PC_X86 } from '@/core/types'
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

function asmLineText(): string {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return ''
  return (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
}

const isReturnStep = computed(() => {
  if (!currentStepData.value) return false
  const text = asmLineText()
  if (arch.value === 'x86') {
    return text === 'ret' || text.startsWith('ret ')
  }
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
  if (!currentStepData.value) return null
  const text = asmLineText()
  if (arch.value === 'x86') {
    const m = text.match(/^call\s+(\S+)/)
    if (!m || !m[1]) return null
    if (m[1].includes('[') || m[1].includes('ptr')) return null
    return m[1].split('(')[0] ?? null
  }
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
  const argRegs = arch.value === 'x86'
    ? ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9']
    : ['r0', 'r1', 'r2', 'r3']
  const args = argRegs.slice(0, count).map(r => `${r}=${currentState.value.regs[r] ?? 0}`)
  return `${name}(${args.join(', ')})`
})

// ── Actions ──────────────────────────────────────────────────────────────────
function setArch(newArch: Arch) {
  arch.value = newArch
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

function toggleDiff() {
  diffOpen.value = !diffOpen.value
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
      const result = traceProgram(parseResult, INITIAL_STATE, 500, output.cLineMap)
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
      const result = traceX86(parseResult, X86_INITIAL_STATE, 500, output.cLineMap)
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

export function useSimulator() {
  return {
    arch,
    currentStep,
    preset,
    currentState,
    prevState,
    currentStepData,
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
    setArch,
    nextStep,
    prevStep,
    reset,
    toggleDiff,
    simulateCompiled,
  }
}
