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
        @click="toggleGuide"
        :class="[
          'px-3 py-2 rounded text-sm transition-colors',
          guideOpen ? 'bg-yellow-700 text-yellow-100' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        ]"
      >
        学習ガイド {{ guideOpen ? '▲' : '▼' }}
      </button>
    </div>

    <!-- C案: 関数リターン時の戻り値バナー（コンパイルモードは CCompilePanel バーで代替） -->
    <div
      v-if="isReturnStep && inputMode !== 'compile'"
      class="flex items-center gap-2 px-3 py-1.5 rounded bg-green-900/40 border border-green-700/50 font-mono text-xs"
    >
      <span class="text-green-400 font-bold">✅ {{ currentFuncName }}() 実行完了</span>
      <span class="text-gray-500">—</span>
      <span class="text-gray-400">戻り値:</span>
      <span class="text-yellow-200 font-bold">{{ returnRegName }} = {{ returnHex }}</span>
      <span class="text-gray-500">({{ returnDec }})</span>
      <span class="text-gray-600 text-xs ml-1">ARM ABI: r0 が関数の戻り値レジスタ</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { currentStep, totalSteps, isFirst, isLast, guideOpen, prevStep, nextStep, reset, toggleGuide, currentState, arch, currentStepData, preset, inputMode } = useSimulator()

// return命令を検出: bx lr / pop {..., pc} / ldm ..., {..., pc}
const isReturnStep = computed(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return false
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  return (text.startsWith('bx') && text.includes('lr')) ||
    (text.startsWith('pop') && text.includes('pc')) ||
    (text.startsWith('ldm') && text.includes('pc'))
})

// frames の末尾 = 現在実行中の関数
const currentFuncName = computed(() => {
  const frames = currentState.value.frames
  return frames[frames.length - 1]?.name ?? 'main'
})

const returnRegName = computed(() => arch.value === 'x86' ? 'rax' : 'r0')
const returnVal = computed(() => {
  const regs = currentState.value.regs
  return arch.value === 'x86' ? (regs['rax'] ?? 0) : (regs['r0'] ?? 0)
})
const returnHex = computed(() => `0x${returnVal.value.toString(16).padStart(8, '0')}`)
const returnDec = computed(() => returnVal.value.toString(10))

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextStep() }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
