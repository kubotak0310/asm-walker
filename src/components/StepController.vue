<template>
  <div class="flex items-center gap-3">
    <button
      @click="prevStep"
      :disabled="isFirst"
      class="px-3 py-2 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      ◀ 戻る <kbd class="ml-1 text-xs text-gray-400">←</kbd>
    </button>
    <button
      @click="nextStep"
      :disabled="isLast"
      class="px-4 py-2 rounded bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      次のステップ ▶ <kbd class="ml-1 text-xs text-green-300">→</kbd>
    </button>
    <button
      @click="reset"
      class="px-3 py-2 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
    >
      リセット
    </button>
    <span class="text-gray-400 text-sm font-mono">{{ currentStep }} / {{ totalSteps }}</span>
    <button
      @click="toggleGuide"
      :class="[
        'px-3 py-2 rounded text-sm transition-colors',
        guideOpen ? 'bg-yellow-700 text-yellow-100' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      ]"
    >
      学習ガイド {{ guideOpen ? '▲' : '▼' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { currentStep, totalSteps, isFirst, isLast, guideOpen, prevStep, nextStep, reset, toggleGuide } = useSimulator()

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextStep() }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
