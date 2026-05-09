<template>
  <div class="flex items-center gap-3">
    <button
      @click="prevStep"
      :disabled="isFirst"
      class="px-3 py-2 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {{ $t('stepController.prev') }} <kbd class="ml-1 text-xs text-gray-400 hidden md:inline">←</kbd>
    </button>
    <button
      @click="nextStep"
      :disabled="isLast"
      class="px-4 py-2 rounded bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {{ $t('stepController.next') }} <kbd class="ml-1 text-xs text-green-300 hidden md:inline">→</kbd>
    </button>
    <button
      @click="reset"
      class="px-3 py-2 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
    >
      {{ $t('stepController.reset') }}
    </button>
    <span class="text-gray-400 text-sm font-mono hidden md:inline">{{ currentStep }} / {{ totalSteps }}</span>
  </div>
</template>

<script setup lang="ts">
import { useSimulator } from '@/composables/useSimulator'

const { currentStep, totalSteps, isFirst, isLast, prevStep, nextStep, reset } = useSimulator()
</script>
