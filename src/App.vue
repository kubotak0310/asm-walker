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
          <PresetSelector />
        </div>
        <StepController />
      </div>

      <!-- Guide panel (collapsible) -->
      <GuidePanel />

      <!-- Top: C source (4/12) + Assembly (8/12) -->
      <div class="grid grid-cols-12 gap-3">
        <div class="col-span-12 lg:col-span-4">
          <CSourcePanel />
        </div>
        <div class="col-span-12 lg:col-span-8">
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
</script>
