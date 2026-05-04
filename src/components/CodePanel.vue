<template>
  <div class="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 flex items-center justify-between">
      <span class="text-gray-300 text-xs font-bold">アセンブラ</span>
      <span
        v-if="activeAsmLine >= 0 && lineAddrs[activeAsmLine] !== undefined"
        class="text-xs font-mono bg-yellow-900/60 text-yellow-200 px-2 py-0.5 rounded"
      >
        PC → {{ hexU32(lineAddrs[activeAsmLine]!) }}
      </span>
      <span v-else-if="activeAsmLine < 0 && currentStepData?.type === 'hw'" class="text-xs text-orange-400">
        PC → HW処理中
      </span>
    </div>
    <div class="p-2 font-mono text-xs overflow-auto max-h-96" ref="asmCodeEl">
      <template v-for="(line, i) in preset?.asmCode ?? []" :key="i">
        <div
          :data-asm-line="i"
          :class="outerLineClass(line, i)"
        >
          <!-- Section header -->
          <template v-if="line.isHeader">
            <span :class="[phaseColor(line.phase), unreachableInfo.lines.has(i) ? 'opacity-40' : '']">{{ line.text }}</span>
          </template>

          <!-- Empty line -->
          <template v-else-if="!line.text.trim()">
            <span class="text-transparent select-none">·</span>
          </template>

          <!-- Executable instruction -->
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

            <span :class="instrTextClass(i)">
              <span
                v-if="currentStepData?.isPtr && activeAsmLine === i"
                class="bg-purple-800 text-purple-200 px-1 rounded mr-1"
              >ptr</span>
              <span
                v-if="currentStepData?.isArr && activeAsmLine === i"
                class="bg-green-800 text-green-200 px-1 rounded mr-1"
              >arr</span>
              {{ line.text.trim() }}
            </span>
          </template>
        </div>

        <!-- Unreachable block end note -->
        <div
          v-if="unreachableInfo.blockEnds.has(i)"
          class="text-xs text-gray-600 italic px-2 py-1 mb-1 border-l-2 border-gray-700"
        >
          ↑ この関数はシミュレーション中に実行されません（最適化によりインライン展開された可能性があります）
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { BASE_PC_ARM } from '@/core/types'
import { hexU32 } from '@/core/simulator'
import type { AsmLine, Phase } from '@/core/types'

const { preset, currentStepData } = useSimulator()

const asmCodeEl = ref<HTMLElement | null>(null)
const activeAsmLine = computed(() => currentStepData.value?.asmLine ?? -1)
const isHW = computed(() => currentStepData.value?.type === 'hw')

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

  // Split asmCode into segments separated by section headers
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
  // Build address map from step execution (for x86 presets with non-sequential PCs)
  const stepAddrMap: Record<number, number> = {}
  let prevPc = p.initialState.pc
  for (const step of p.steps) {
    if (step.asmLine >= 0) {
      stepAddrMap[step.asmLine] = prevPc
    }
    prevPc = step.update.pc ?? prevPc + 4
  }

  // Assign addresses: stepAddrMap for executed lines, sequential fallback for others.
  // Sequential fallback (BASE_PC + instrIdx * 4) matches the ARM tracer model and
  // correctly handles functions that are present in the assembly but not called
  // (e.g. when the compiler inlines a call at -O1).
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

watch(activeAsmLine, async (line) => {
  if (line < 0 || !asmCodeEl.value) return
  await nextTick()
  const el = asmCodeEl.value.querySelector(`[data-asm-line="${line}"]`) as HTMLElement | null
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>
