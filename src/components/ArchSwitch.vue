<template>
  <div class="flex gap-2">
    <button
      v-for="a in archs"
      :key="a.value"
      @click="setArch(a.value)"
      :class="[
        'px-4 py-2 rounded font-bold text-sm transition-colors',
        arch === a.value
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      ]"
    >
      {{ a.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useSimulator } from '@/composables/useSimulator'
import type { Arch } from '@/core/types'

const { arch, setArch } = useSimulator()

const archs: { value: Arch; label: string }[] = [
  { value: 'x86', label: 'x86-64' },
  { value: 'arm', label: 'ARM Cortex-M' },
]
</script>
