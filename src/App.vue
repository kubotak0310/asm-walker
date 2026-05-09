<template>
  <div class="min-h-screen bg-gray-900 text-gray-100">
    <div class="max-w-screen-2xl mx-auto px-4 py-4 space-y-3 pb-24 md:pb-4">
      <AppHeader />

      <!-- Top controls -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-3">
          <ArchSwitch />
        </div>
        <!-- デスクトップのみ表示 -->
        <div class="hidden md:block">
          <StepController />
        </div>
      </div>

      <!-- C compile editor -->
      <CCompilePanel />

      <!-- Top: C source (5/12) + Assembly (7/12) -->
      <div class="grid grid-cols-12 gap-3">
        <div v-if="showCSource" class="col-span-12 lg:col-span-5">
          <CSourcePanel />
        </div>
        <div :class="showCSource ? 'col-span-12 lg:col-span-7' : 'col-span-12'">
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
        <div class="col-span-12 md:col-span-4">
          <StackPanel />
        </div>
        <div class="col-span-12 md:col-span-2">
          <FrameViz />
        </div>
      </div>

      <!-- Diff panel: 最下部、デフォルト非表示 -->
      <DiffPanel />
    </div>

    <!-- スマホ用固定ステップコントローラー -->
    <div class="fixed bottom-0 left-0 right-0 md:hidden bg-gray-900 border-t border-gray-700 px-4 py-3 flex justify-center z-50">
      <StepController />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import ArchSwitch from '@/components/ArchSwitch.vue'
import StepController from '@/components/StepController.vue'
import CSourcePanel from '@/components/CSourcePanel.vue'
import CodePanel from '@/components/CodePanel.vue'
import ExplainPanel from '@/components/ExplainPanel.vue'
import RegisterPanel from '@/components/RegisterPanel.vue'
import SpecialRegPanel from '@/components/SpecialRegPanel.vue'
import StackPanel from '@/components/StackPanel.vue'
import FrameViz from '@/components/FrameViz.vue'
import DiffPanel from '@/components/DiffPanel.vue'
import CCompilePanel from '@/components/CCompilePanel.vue'
import { useSimulator } from '@/composables/useSimulator'

const { preset, prevStep, nextStep } = useSimulator()

const showCSource = computed(() => preset.value?.id === 'compile')

function onKeydown(e: KeyboardEvent) {
  if (e.repeat) return
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextStep() }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>
