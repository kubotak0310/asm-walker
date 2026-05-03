<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="p in availablePresets"
      :key="p.id"
      @click="selectPreset(p.id)"
      :class="[
        'px-3 py-1.5 rounded text-xs font-medium transition-colors',
        currentPresetId === p.id
          ? 'bg-purple-600 text-white'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      ]"
    >
      {{ p.name }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useSimulator } from '@/composables/useSimulator'

const { availablePresets, currentPresetId, selectPreset } = useSimulator()
</script>
