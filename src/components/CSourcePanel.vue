<template>
  <div class="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">C ソースコード</div>
    <div class="p-2 font-mono text-sm overflow-auto max-h-96" ref="cCodeEl">
      <div
        v-for="(line, i) in preset?.cCode ?? []"
        :key="i"
        :class="[
          'px-2 py-0.5 rounded transition-colors leading-relaxed',
          activeCLine === i
            ? isHW ? 'bg-orange-900/60 text-orange-200' : 'bg-green-900/60 text-green-200'
            : 'text-gray-300'
        ]"
      >
        <span class="text-gray-600 select-none mr-3 text-xs inline-block w-7 text-right">{{ i + 1 }}</span><span class="whitespace-pre-wrap">{{ line || ' ' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { preset, currentStepData } = useSimulator()

const cCodeEl = ref<HTMLElement | null>(null)
const activeCLine = computed(() => currentStepData.value?.cLine ?? -1)
const isHW = computed(() => currentStepData.value?.type === 'hw')

watch(activeCLine, async (line) => {
  if (line < 0 || !cCodeEl.value) return
  await nextTick()
  ;(cCodeEl.value.children[line] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>
