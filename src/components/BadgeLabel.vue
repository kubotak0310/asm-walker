<template>
  <span :class="cls">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  kind: 'arg' | 'return' | 'ptr' | 'arr'
  text: string
}>()

const cls = computed(() => {
  const base = 'ml-1 px-1 rounded text-xs align-middle'
  if (props.kind === 'return') return `${base} bg-yellow-700/70 text-yellow-200`
  if (props.kind === 'arg')    return `${base} bg-blue-700/70 text-blue-200`
  if (props.kind === 'ptr')    return `${base} bg-purple-700/70 text-purple-200`
  return `${base} bg-green-700/70 text-green-200`
})
</script>
