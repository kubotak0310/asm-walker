<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-24">
    <!-- HWステップ -->
    <div v-if="step?.type === 'hw'" class="space-y-3">
      <div class="flex items-center gap-2 bg-orange-900/40 border border-orange-700 rounded px-3 py-2">
        <span class="text-orange-400 font-bold">⚡</span>
        <span class="text-orange-200 text-sm font-bold">ハードウェアが自動実行 — アセンブラ命令は存在しません</span>
      </div>
      <div class="flex items-center gap-2">
        <PhaseBadge :phase="step.phase" />
      </div>
      <p class="text-gray-200 text-sm">{{ step.explain }}</p>
      <p class="text-gray-400 text-xs font-mono">→ {{ step.effect }}</p>
    </div>

    <!-- SWステップ -->
    <div v-else-if="step" class="space-y-2">
      <div class="flex items-center gap-2 flex-wrap">
        <PhaseBadge :phase="step.phase" />
        <code class="bg-gray-900 text-green-300 px-2 py-0.5 rounded text-sm font-mono">{{ step.instr }}</code>
        <span v-if="step.isPtr" class="text-xs bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded">ポインタ操作</span>
        <span v-if="step.isArr" class="text-xs bg-green-800 text-green-200 px-1.5 py-0.5 rounded">配列要素</span>
      </div>
      <p class="text-gray-200 text-sm">{{ step.explain }}</p>
      <p class="text-gray-400 text-xs font-mono">→ {{ step.effect }}</p>

      <div v-if="step.isPtr" class="bg-purple-900/30 border border-purple-800 rounded p-2 text-xs text-purple-200">
        💡 ポインタ操作: アドレス値の取得・設定・間接参照が含まれます
      </div>
      <div v-if="step.isArr" class="bg-green-900/30 border border-green-800 rounded p-2 text-xs text-green-200">
        💡 配列要素: ベースアドレス + オフセットで各要素にアクセスします
      </div>
    </div>

    <!-- 初期状態 -->
    <div v-else class="text-gray-500 text-sm flex items-center gap-2">
      <span>▶ 「次のステップ」を押してシミュレーションを開始してください</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import PhaseBadge from './PhaseBadge.vue'

const { currentStepData, preset } = useSimulator()

const step = computed(() => {
  const s = currentStepData.value
  if (!s || !preset.value) return null
  const idx = preset.value.steps.indexOf(s)
  if (idx < 0) return null
  return { ...s, instr: preset.value.asmCode[s.asmLine]?.text.trim() ?? '' }
})
</script>
