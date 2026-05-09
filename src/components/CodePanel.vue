<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 rounded-t-lg flex items-center justify-between">
      <span class="text-gray-300 text-xs font-bold">{{ $t('codePanel.header') }}</span>
      <div class="flex items-center gap-2">
        <span
          v-if="pcDisplay?.mode === 'address'"
          class="text-xs font-mono bg-yellow-900/60 text-yellow-200 px-2 py-0.5 rounded"
        >
          PC → {{ hexU32(pcDisplay.value) }}
        </span>
        <span v-else-if="pcDisplay?.mode === 'hw'" class="text-xs text-orange-400">
          {{ $t('codePanel.hwLabel') }}
        </span>
        <div v-if="preset?.asmCode?.length" class="relative flex items-center">
          <Transition name="fade">
            <span v-if="copied" class="absolute bottom-7 left-1/2 -translate-x-1/2 text-xs text-green-400 whitespace-nowrap pointer-events-none bg-gray-900 px-1.5 py-0.5 rounded border border-gray-600">Copied!</span>
          </Transition>
          <button
            @click="copyAsm"
            :title="$t('codePanel.copyTitle')"
            class="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-600 transition-colors"
          >
            <span class="material-icons text-base text-gray-400">content_copy</span>
          </button>
        </div>
      </div>
    </div>
    <div class="p-2 font-mono text-xs overflow-auto max-h-96" ref="asmCodeEl">
      <template v-for="(line, i) in preset?.asmCode ?? []" :key="i">
        <div
          :data-asm-line="i"
          :class="outerLineClass(line, i)"
        >
          <template v-if="line.isHeader">
            <span :class="[phaseColor(line.phase), unreachableInfo.lines.has(i) ? 'opacity-40' : '']">{{ line.text }}</span>
          </template>

          <template v-else-if="!line.text.trim()">
            <span class="text-transparent select-none">·</span>
          </template>

          <template v-else>
            <span
              :class="[
                'shrink-0 w-22 text-right pr-2',
                unreachableInfo.lines.has(i) ? 'text-gray-700' : activeAsmLine === i ? 'text-yellow-300 font-bold' : 'text-gray-400'
              ]"
            >{{ lineAddrs[i] !== undefined ? hexU32(lineAddrs[i]!) : '' }}</span>

            <span
              :class="[
                'shrink-0 w-5 text-center',
                activeAsmLine === i ? (isHW ? 'text-orange-400' : 'text-yellow-400') : 'text-transparent'
              ]"
            >▶</span>

            <span :class="[instrTextClass(i), 'shrink-0 min-w-[30ch]']">
              <span
                v-if="currentStepData?.isArr && activeAsmLine === i"
                class="bg-green-800 text-green-200 px-1 rounded mr-1"
              >arr</span>
              {{ line.text.trim() }}
            </span>
            <span
              v-if="lineCommentMap.get(i) && !unreachableInfo.lines.has(i)"
              class="text-gray-400 truncate"
            >; {{ lineCommentMap.get(i) }}</span>
          </template>
        </div>

        <div
          v-if="unreachableInfo.blockEnds.has(i)"
          class="text-xs text-gray-600 italic px-2 py-1 mb-1 border-l-2 border-gray-700"
        >
          {{ $t('codePanel.unreachable') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { BASE_PC_ARM } from '@/core/types'
import { hexU32 } from '@/core/simulator'
import type { AsmLine, Phase } from '@/core/types'

const { preset, currentStepData, currentStep } = useSimulator()

const asmCodeEl = ref<HTMLElement | null>(null)
const activeAsmLine = computed(() => currentStepData.value?.asmLine ?? -1)
const isHW = computed(() => currentStepData.value?.type === 'hw')

const lineCommentMap = computed(() => {
  const map = new Map<number, string>()
  const steps = preset.value?.steps ?? []
  const phaseEntryLine = new Map<string, number>()
  const phaseActiveLines = new Map<string, Set<number>>()

  for (let i = 0; i <= currentStep.value; i++) {
    const step = steps[i]
    if (!step || step.asmLine < 0) continue
    const phase = step.phase ?? ''
    if (!phaseActiveLines.has(phase)) phaseActiveLines.set(phase, new Set())

    if (!phaseEntryLine.has(phase)) {
      phaseEntryLine.set(phase, step.asmLine)
    } else if (phaseEntryLine.get(phase) === step.asmLine && phaseActiveLines.get(phase)!.size > 0) {
      for (const line of phaseActiveLines.get(phase)!) map.delete(line)
      phaseActiveLines.get(phase)!.clear()
    }

    if (step.comment) {
      map.set(step.asmLine, step.comment)
      phaseActiveLines.get(phase)!.add(step.asmLine)
    }
  }
  return map
})

const pcDisplay = computed(() => {
  if (activeAsmLine.value >= 0 && lineAddrs.value[activeAsmLine.value] !== undefined)
    return { mode: 'address' as const, value: lineAddrs.value[activeAsmLine.value]! }
  if (activeAsmLine.value < 0 && currentStepData.value?.type === 'hw')
    return { mode: 'hw' as const }
  return null
})

const executedLines = computed(() => {
  const set = new Set<number>()
  for (const step of preset.value?.steps ?? []) {
    if (step.asmLine >= 0) set.add(step.asmLine)
  }
  return set
})

const unreachableInfo = computed(() => {
  const p = preset.value
  if (!p) return { lines: new Set<number>(), blockEnds: new Set<number>() }
  const executed = executedLines.value

  const segments: number[][] = []
  let seg: number[] = []
  for (let i = 0; i < p.asmCode.length; i++) {
    const line = p.asmCode[i]
    if (!line) continue
    if (line.isHeader && seg.length > 0) { segments.push(seg); seg = [] }
    seg.push(i)
  }
  if (seg.length > 0) segments.push(seg)

  const lines = new Set<number>()
  const blockEnds = new Set<number>()
  for (const segment of segments) {
    const hasInstructions = segment.some(i => { const l = p.asmCode[i]; return l && !l.isHeader && l.text.trim() !== '' })
    if (!hasInstructions) continue
    const hasExecuted = segment.some(i => { const l = p.asmCode[i]; return l && !l.isHeader && l.text.trim() !== '' && executed.has(i) })
    if (!hasExecuted) {
      segment.forEach(i => lines.add(i))
      const lastInstr = [...segment].reverse().find(i => { const l = p.asmCode[i]; return l && !l.isHeader && l.text.trim() !== '' })
      if (lastInstr !== undefined) blockEnds.add(lastInstr)
    }
  }
  return { lines, blockEnds }
})

const lineAddrs = computed<Record<number, number>>(() => {
  const p = preset.value
  if (!p) return {}
  const stepAddrMap: Record<number, number> = {}
  let prevPc = p.initialState.pc
  for (const step of p.steps) {
    if (step.asmLine >= 0) {
      stepAddrMap[step.asmLine] = prevPc
    }
    prevPc = step.update.pc ?? prevPc + 4
  }

  const result: Record<number, number> = {}
  let instrIdx = 0
  for (let i = 0; i < p.asmCode.length; i++) {
    const line = p.asmCode[i]
    if (!line || line.isHeader || !line.text.trim()) continue
    result[i] = stepAddrMap[i] ?? BASE_PC_ARM + instrIdx * 4
    instrIdx++
  }
  return result
})

function outerLineClass(line: AsmLine, i: number): string[] {
  if (line.isHeader) return ['px-2 py-0.5']
  if (!line.text.trim()) return ['py-0.5']
  const active = activeAsmLine.value === i
  const hw = isHW.value
  return [
    'flex items-center gap-0 px-1 py-0.5 rounded transition-colors',
    active
      ? hw ? 'bg-orange-900/50' : 'bg-green-900/50'
      : 'hover:bg-gray-700/30',
  ]
}

function instrTextClass(i: number): string {
  const active = activeAsmLine.value === i
  const hw = isHW.value
  if (active) return hw ? 'text-orange-200 font-bold' : 'text-green-200 font-bold'
  return 'text-gray-300'
}

function phaseColor(phase?: Phase): string {
  const map: Record<string, string> = {
    main: 'text-purple-400',
    caller: 'text-purple-400',
    callee: 'text-green-400',
    hw: 'text-orange-400',
    isr: 'text-green-400',
    ret: 'text-red-400',
  }
  return `${map[phase ?? ''] ?? 'text-gray-400'} text-xs`
}

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function copyAsm() {
  const lines = preset.value?.asmCode ?? []
  const text = lines.map(line => line.text).join('\n').trim()
  navigator.clipboard.writeText(text)
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 800)
}

onUnmounted(() => { if (copyTimer) clearTimeout(copyTimer) })

watch(activeAsmLine, async (line) => {
  if (line < 0 || !asmCodeEl.value) return
  await nextTick()
  const el = asmCodeEl.value.querySelector(`[data-asm-line="${line}"]`) as HTMLElement | null
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
