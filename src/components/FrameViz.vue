<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">スタックフレーム</div>
    <div class="p-3 space-y-2">
      <!-- No frames -->
      <div v-if="frames.length === 0" class="text-gray-600 text-xs text-center py-4">
        フレームなし
      </div>

      <!-- Frames (highest frame = deepest call = top of display) -->
      <TransitionGroup name="frame">
        <div
          v-for="frame in reversedFrames"
          :key="frame.name"
          :class="[
            'rounded border-2 transition-all',
            frameClass(frame),
            isCurrentFrame(frame) ? 'border-2' : 'border opacity-70',
          ]"
        >
          <div class="px-3 py-2 flex justify-between items-center">
            <span class="font-mono text-sm font-bold">{{ frame.name }}()</span>
            <span class="text-xs opacity-70 font-mono">{{ frameSize(frame) }} bytes</span>
          </div>
          <div class="px-3 pb-2 font-mono text-xs opacity-60">
            {{ hex(frame.hi) }} → {{ hex(frame.lo) }}
          </div>
        </div>
      </TransitionGroup>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import type { StackFrame } from '@/core/types'

const { currentState } = useSimulator()

const frames = computed(() => currentState.value.frames)
const reversedFrames = computed(() => [...frames.value].reverse())

function isCurrentFrame(frame: StackFrame): boolean {
  return frames.value[frames.value.length - 1]?.name === frame.name
}

function frameClass(frame: StackFrame): string {
  const map = {
    purple: 'bg-purple-900/40 border-purple-600 text-purple-200',
    green:  'bg-green-900/40 border-green-600 text-green-200',
    orange: 'bg-orange-900/40 border-orange-600 text-orange-200',
  }
  return map[frame.color] ?? 'bg-gray-700 border-gray-600 text-gray-200'
}

function frameSize(frame: StackFrame): number {
  return frame.hi - frame.lo
}

function hex(v: number): string {
  return `0x${v.toString(16).toUpperCase()}`
}
</script>

<style scoped>
.frame-enter-active,
.frame-leave-active {
  transition: all 0.3s ease;
}
.frame-enter-from {
  transform: scaleY(0);
  opacity: 0;
  transform-origin: top;
}
.frame-leave-to {
  transform: scaleY(0);
  opacity: 0;
  transform-origin: top;
}
</style>
