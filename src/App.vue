<template>
  <div class="min-h-screen bg-gray-900 text-gray-100">
    <div class="max-w-screen-2xl mx-auto px-4 py-4 space-y-3">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <h1 class="text-white font-bold text-lg shrink-0">AsmWalker</h1>
        <span class="text-gray-600 text-xs">ARM Cortex-M / x86-64 アセンブラ学習ツール</span>
      </div>

      <!-- Top controls -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-3">
          <ArchSwitch />
          <div class="h-5 w-px bg-gray-700" />
          <!-- Mode toggle -->
          <div class="flex rounded overflow-hidden border border-gray-600 text-xs font-bold">
            <button
              :class="inputMode === 'preset' ? 'bg-purple-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
              class="px-3 py-1 transition-colors"
              @click="setInputMode('preset')"
            >プリセット</button>
            <button
              :class="inputMode === 'free' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
              class="px-3 py-1 transition-colors"
              @click="setInputMode('free')"
            >自由入力</button>
          </div>
          <PresetSelector v-if="inputMode === 'preset'" />
        </div>
        <StepController />
      </div>

      <!-- Guide panel (collapsible, preset mode only) -->
      <GuidePanel v-if="inputMode === 'preset'" />

      <!-- Free-input editor (full width, free mode only) -->
      <FreeInputPanel v-if="inputMode === 'free'" />

      <!-- Top: C source (4/12) + Assembly (8/12) -->
      <div class="grid grid-cols-12 gap-3">
        <div v-if="inputMode === 'preset'" class="col-span-12 lg:col-span-4">
          <CSourcePanel />
        </div>
        <div :class="inputMode === 'free' ? 'col-span-12' : 'col-span-12 lg:col-span-8'">
          <CodePanel />
        </div>
      </div>

      <!-- Explain -->
      <ExplainPanel />

      <!-- Bottom: Register / SpecialReg / Stack / FrameViz -->
      <div class="grid grid-cols-12 gap-3">
        <div class="col-span-12 md:col-span-4">
          <RegisterPanel />
        </div>
        <div class="col-span-12 md:col-span-2">
          <SpecialRegPanel />
        </div>
        <div class="col-span-12 md:col-span-3">
          <StackPanel />
        </div>
        <div class="col-span-12 md:col-span-3">
          <FrameViz />
        </div>
      </div>

      <!-- Diff panel: 最下部、デフォルト非表示 -->
      <DiffPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import ArchSwitch from '@/components/ArchSwitch.vue'
import PresetSelector from '@/components/PresetSelector.vue'
import StepController from '@/components/StepController.vue'
import GuidePanel from '@/components/GuidePanel.vue'
import CSourcePanel from '@/components/CSourcePanel.vue'
import CodePanel from '@/components/CodePanel.vue'
import ExplainPanel from '@/components/ExplainPanel.vue'
import RegisterPanel from '@/components/RegisterPanel.vue'
import SpecialRegPanel from '@/components/SpecialRegPanel.vue'
import StackPanel from '@/components/StackPanel.vue'
import FrameViz from '@/components/FrameViz.vue'
import DiffPanel from '@/components/DiffPanel.vue'
import FreeInputPanel from '@/components/FreeInputPanel.vue'
import { useSimulator } from '@/composables/useSimulator'

const { inputMode, setInputMode } = useSimulator()
</script>
