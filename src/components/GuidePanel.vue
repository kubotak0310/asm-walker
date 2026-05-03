<template>
  <div
    :class="[
      'overflow-hidden transition-all duration-300',
      guideOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
    ]"
  >
    <div v-if="guide" class="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
      <div class="flex items-start gap-2">
        <span class="text-yellow-400 text-sm font-bold shrink-0">🎯 ゴール</span>
        <p class="text-gray-200 text-sm">{{ guide.goal }}</p>
      </div>

      <div>
        <p class="text-gray-400 text-xs font-bold mb-2">📍 注目ポイント</p>
        <ul class="space-y-1">
          <li
            v-for="h in guide.highlights"
            :key="h.step + h.text"
            :class="[
              'text-sm flex gap-2 items-start px-2 py-1 rounded',
              isCurrentHighlight(h.step) ? 'bg-yellow-900/40 text-yellow-200' : 'text-gray-300'
            ]"
          >
            <span class="shrink-0 font-mono text-xs text-gray-500 pt-0.5">Step {{ h.step + 1 }}</span>
            <span>{{ h.text }}</span>
          </li>
        </ul>
      </div>

      <div>
        <p class="text-gray-400 text-xs font-bold mb-2">💡 覚えておくべきこと</p>
        <ul class="space-y-1">
          <li v-for="tip in guide.tips" :key="tip" class="text-sm text-gray-300 flex gap-2">
            <span class="text-gray-500 shrink-0">•</span>
            <span>{{ tip }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSimulator } from '@/composables/useSimulator'

const { guideOpen, guide, currentStep } = useSimulator()

function isCurrentHighlight(step: number): boolean {
  return currentStep.value === step + 1
}
</script>
