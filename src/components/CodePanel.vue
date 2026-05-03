<template>
  <div class="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 flex items-center justify-between">
      <span class="text-gray-300 text-xs font-bold">アセンブラ</span>
      <span
        v-if="activeAsmLine >= 0 && lineAddrs[activeAsmLine] !== undefined"
        class="text-xs font-mono bg-yellow-900/60 text-yellow-200 px-2 py-0.5 rounded"
      >
        PC → {{ hexAddr(lineAddrs[activeAsmLine]!) }}
      </span>
      <span v-else-if="activeAsmLine < 0 && currentStepData?.type === 'hw'" class="text-xs text-orange-400">
        PC → HW処理中
      </span>
    </div>
    <div class="p-2 font-mono text-xs overflow-auto max-h-96" ref="asmCodeEl">
      <div
        v-for="(line, i) in preset?.asmCode ?? []"
        :key="i"
        :class="outerLineClass(line, i)"
      >
        <!-- Section header -->
        <template v-if="line.isHeader">
          <span :class="phaseColor(line.phase)">{{ line.text }}</span>
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
              activeAsmLine === i ? 'text-yellow-300 font-bold' : 'text-gray-600'
            ]"
          >{{ lineAddrs[i] !== undefined ? hexAddr(lineAddrs[i]!) : '' }}</span>

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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import type { AsmLine, Phase } from '@/core/types'

const { preset, currentStepData } = useSimulator()

const asmCodeEl = ref<HTMLElement | null>(null)
const activeAsmLine = computed(() => currentStepData.value?.asmLine ?? -1)
const isHW = computed(() => currentStepData.value?.type === 'hw')

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
  let lastAddr = p.initialState.pc
  for (let i = 0; i < p.asmCode.length; i++) {
    const line = p.asmCode[i]
    if (!line || line.isHeader || !line.text.trim()) continue
    const knownAddr = stepAddrMap[i]
    if (knownAddr !== undefined) {
      result[i] = knownAddr
      lastAddr = knownAddr + 4
    } else {
      result[i] = lastAddr
      lastAddr += 4
    }
  }
  return result
})

function hexAddr(v: number): string {
  return `0x${v.toString(16).padStart(8, '0')}`
}

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
  return `${map[phase ?? ''] ?? 'text-gray-500'} text-xs`
}

watch(activeAsmLine, async (line) => {
  if (line < 0 || !asmCodeEl.value) return
  await nextTick()
  ;(asmCodeEl.value.children[line] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>
