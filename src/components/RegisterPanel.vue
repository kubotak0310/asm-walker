<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">汎用レジスタ</div>
    <div class="p-2 grid grid-cols-2 gap-1 font-mono text-xs">
      <div
        v-for="reg in registers"
        :key="reg.name"
        :class="[
          'flex justify-between px-2 py-1 rounded',
          cellClass(reg.name, reg.value)
        ]"
      >
        <span :class="changed(reg.name) ? 'text-white font-bold' : 'text-gray-400'">{{ reg.name }}</span>
        <span :class="valueClass(reg.name, reg.value)">{{ formatVal(reg.value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { isAddressLike } from '@/core/simulator'
import type { Arch } from '@/core/types'

const { arch, currentState, prevState } = useSimulator()

const x86Regs = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi']
const armRegs = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12']

const registers = computed(() => {
  const names = arch.value === 'x86' ? x86Regs : armRegs
  return names.map(name => ({
    name,
    value: currentState.value.regs[name] ?? 0,
  }))
})

function changed(name: string): boolean {
  if (!prevState.value) return false
  return (prevState.value.regs[name] ?? 0) !== (currentState.value.regs[name] ?? 0)
}

function cellClass(name: string, val: number): string {
  if (changed(name)) return isAddressLike(val, arch.value as Arch) ? 'bg-purple-900/40' : 'bg-green-900/40'
  return ''
}

function valueClass(name: string, val: number): string {
  if (changed(name)) return isAddressLike(val, arch.value as Arch) ? 'text-purple-300 font-bold' : 'text-green-300 font-bold'
  if (isAddressLike(val, arch.value as Arch)) return 'text-purple-400'
  return 'text-gray-300'
}

function formatVal(v: number): string {
  if (v === 0) return '0x00000000'
  return `0x${v.toString(16).padStart(8, '0')}`
}
</script>
