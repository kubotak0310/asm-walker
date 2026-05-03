<template>
  <span :class="badgeClass">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Phase } from '@/core/types'

const props = defineProps<{ phase: Phase }>()

const config: Record<Phase, { label: string; cls: string }> = {
  main:   { label: 'main',   cls: 'bg-purple-800 text-purple-200' },
  caller: { label: 'caller', cls: 'bg-purple-800 text-purple-200' },
  callee: { label: 'callee', cls: 'bg-green-800 text-green-200'   },
  hw:     { label: 'HW',     cls: 'bg-orange-800 text-orange-200' },
  isr:    { label: 'ISR',    cls: 'bg-green-800 text-green-200'   },
  ret:    { label: 'return', cls: 'bg-red-900 text-red-200'       },
}

const badgeClass = computed(() =>
  `${config[props.phase]?.cls ?? 'bg-gray-700 text-gray-300'} text-xs px-1.5 py-0.5 rounded font-mono`
)
const label = computed(() => config[props.phase]?.label ?? props.phase)
</script>
