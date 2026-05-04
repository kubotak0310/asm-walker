<template>
  <div class="space-y-2">
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
        v-if="guide"
        @click="toggleGuide"
        :class="[
          'px-3 py-2 rounded text-sm transition-colors',
          guideOpen ? 'bg-yellow-700 text-yellow-100' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        ]"
      >
        学習ガイド {{ guideOpen ? '▲' : '▼' }}
      </button>
    </div>

    <!-- 関数リターン時の戻り値バナー（コンパイルモードは CCompilePanel バーで代替） -->
    <div
      v-if="isReturnStep && inputMode !== 'compile'"
      class="flex items-center gap-2 px-3 py-1.5 rounded bg-green-900/40 border border-green-700/50 font-mono text-xs"
    >
      <span class="text-green-400 font-bold">✅ {{ currentFuncName }}() 実行完了</span>
      <span class="text-gray-500">—</span>
      <span class="text-gray-400">戻り値:</span>
      <span class="text-yellow-200 font-bold">{{ returnReg }} = {{ returnHex }}</span>
      <span class="text-gray-500">({{ returnDec }})</span>
      <span class="text-gray-600 text-xs ml-1">ARM ABI: r0 が関数の戻り値レジスタ</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const {
  currentStep, totalSteps, isFirst, isLast, guideOpen, guide,
  prevStep, nextStep, reset, toggleGuide, inputMode,
  isReturnStep, currentFuncName, returnReg, returnHex, returnDec,
} = useSimulator()

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextStep() }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
