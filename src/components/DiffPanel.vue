<template>
  <div v-if="showDiff && diffs.length > 0" class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 bg-gray-700">
      <span class="text-gray-300 text-xs font-bold">{{ $t('diffPanel.header') }}</span>
      <button
        @click="toggleDiff"
        :class="[
          'px-2 py-0.5 rounded text-xs transition-colors',
          diffOpen
            ? 'bg-blue-700 text-blue-100 hover:bg-blue-600'
            : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
        ]"
      >
        {{ diffOpen ? $t('diffPanel.close') : $t('diffPanel.open') }}
      </button>
    </div>
    <div :class="['overflow-hidden transition-all duration-200', diffOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0']">
      <div class="p-3 overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-gray-700">
              <th class="text-left py-1.5 px-2 text-gray-400 w-1/3">{{ $t('diffPanel.perspective') }}</th>
              <th class="text-left py-1.5 px-2 text-blue-400">x86-64</th>
              <th class="text-left py-1.5 px-2 text-green-400">ARM Cortex-M</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in diffs"
              :key="d.aspect"
              class="border-b border-gray-700/50 hover:bg-gray-700/30"
            >
              <td class="py-1.5 px-2 text-gray-400">{{ d.aspect }}</td>
              <td class="py-1.5 px-2 text-blue-300 font-mono">{{ d.x86 }}</td>
              <td class="py-1.5 px-2 text-green-300 font-mono">{{ d.arm }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { showDiff, diffOpen, toggleDiff } = useSimulator()

const diffs = computed((): { aspect: string; x86: string; arm: string }[] => [])
</script>
