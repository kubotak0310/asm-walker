<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">スタックメモリ</div>
    <div class="overflow-auto max-h-64 font-mono text-xs p-2 space-y-0.5">
      <div v-if="cells.length === 0" class="text-gray-600 text-center py-4">
        スタック空
      </div>
      <div
        v-for="cell in cells"
        :key="cell.addr"
        :class="rowClass(cell)"
      >
        <span class="text-gray-500 shrink-0">{{ hex(cell.addr) }}</span>
        <span :class="valueClass(cell)">{{ cell.uninit ? '. xxxxxxxx' : hex(cell.value) }}</span>
        <span :class="labelClass(cell)">{{ cell.label }}</span>
        <span v-if="cell.isSP" class="text-orange-400 text-xs ml-auto shrink-0">← SP</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { currentState, prevState } = useSimulator()

interface Cell {
  addr: number
  value: number
  label: string
  kind: string
  isSP: boolean
  isNew: boolean
  frameColor: 'purple' | 'green' | 'orange' | null
  uninit: boolean
}

const cells = computed<Cell[]>(() => {
  const state = currentState.value
  const prev = prevState.value
  const prevAddrs = prev ? new Set(Object.keys(prev.stack).map(Number)) : new Set<number>()

  const addrSet = new Set<number>()
  for (const a of Object.keys(state.stack).map(Number)) addrSet.add(a)

  // Fill all 4-byte slots within each frame (shows uninitialized reserved area)
  for (const frame of state.frames) {
    for (let a = frame.lo; a < frame.hi; a += 4) addrSet.add(a)
  }

  if (addrSet.size > 0) addrSet.add(state.sp)

  const addrs = [...addrSet].sort((a, b) => b - a)

  return addrs.map(addr => {
    const frame = state.frames.find(f => addr >= f.lo && addr < f.hi)
    const hasValue = addr in state.stack
    return {
      addr,
      value: state.stack[addr] ?? 0,
      label: state.stackMeta[addr]?.label ?? '',
      kind: hasValue ? (state.stackMeta[addr]?.kind ?? 'sw') : 'uninit',
      isSP: addr === state.sp,
      isNew: !prevAddrs.has(addr) && hasValue,
      frameColor: frame?.color ?? null,
      uninit: !hasValue,
    }
  })
})

function rowClass(cell: Cell): string[] {
  const borderColor =
    cell.frameColor === 'purple' ? 'border-l-2 border-purple-500' :
    cell.frameColor === 'green'  ? 'border-l-2 border-green-500' :
    cell.frameColor === 'orange' ? 'border-l-2 border-orange-500' :
                                   'border-l-2 border-transparent'
  return [
    'flex gap-2 items-center px-2 py-0.5 rounded',
    borderColor,
    cell.isSP ? 'bg-orange-900/40' : cell.isNew ? 'bg-gray-700' : '',
  ]
}

function valueClass(cell: Cell): string {
  if (cell.uninit) return 'text-gray-600 italic'
  if (cell.kind === 'ptr') return 'text-purple-300 font-bold'
  if (cell.kind === 'arr') return 'text-green-300 font-bold'
  if (cell.kind === 'hw') return 'text-orange-300 font-bold'
  if (cell.isSP) return 'text-orange-300'
  if (cell.isNew) return 'text-white'
  return 'text-gray-300'
}

function labelClass(cell: Cell): string {
  if (cell.kind === 'ptr') return 'text-purple-400 text-xs ml-2'
  if (cell.kind === 'arr') return 'text-green-400 text-xs ml-2'
  if (cell.kind === 'hw') return 'text-orange-400 text-xs ml-2'
  return 'text-gray-500 text-xs ml-2'
}

function hex(v: number): string {
  return `0x${v.toString(16).padStart(8, '0')}`
}
</script>
