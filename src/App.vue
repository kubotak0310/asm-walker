<template>
  <div class="min-h-screen bg-gray-900 text-gray-100">
    <div class="max-w-screen-2xl mx-auto px-4 py-4 space-y-3">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <h1 class="text-white font-bold text-lg shrink-0">AsmWalker</h1>
        <span class="text-gray-600 text-xs">ARM Cortex-M / x86-64 アセンブラ学習ツール</span>
        <div class="ml-auto flex items-center gap-3 text-sm">
          <!-- Guide dropdown -->
          <div class="relative group">
            <button class="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800">
              <span class="material-icons text-base leading-none">menu_book</span>
              <span>ガイド</span>
              <span class="material-icons text-sm leading-none">expand_more</span>
            </button>
            <div class="absolute right-0 top-full pt-1 z-50 hidden group-hover:block">
              <div class="w-52 bg-gray-800 border border-gray-700 rounded shadow-lg">
                <a href="/guide/asm-reading.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">article</span>アセンブラの読み方
                </a>
                <a href="/guide/stack.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">article</span>スタックとは
                </a>
                <a href="/guide/function-call.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">article</span>関数呼び出しの仕組み
                </a>
                <a href="/guide/branch.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">article</span>条件分岐
                </a>
                <a href="/guide/pointer.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">article</span>ポインタとアドレス
                </a>
                <div class="border-t border-gray-700 my-1"></div>
                <a href="/about.html" target="_blank" rel="noopener"
                   class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                  <span class="material-icons text-sm text-gray-500">info</span>このツールについて
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top controls -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-3">
          <ArchSwitch />
        </div>
        <StepController />
      </div>

      <!-- C compile editor -->
      <CCompilePanel />

      <!-- Top: C source (4/12) + Assembly (8/12) -->
      <div class="grid grid-cols-12 gap-3">
        <div v-if="showCSource" class="col-span-12 lg:col-span-4">
          <CSourcePanel />
        </div>
        <div :class="showCSource ? 'col-span-12 lg:col-span-8' : 'col-span-12'">
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
  </div>
</template>

<script setup lang="ts">
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
import { computed } from 'vue'

const { preset } = useSimulator()

const showCSource = computed(() => preset.value?.id === 'compile')
</script>
