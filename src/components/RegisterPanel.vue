<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">汎用レジスタ</div>
    <div class="p-2 grid grid-cols-2 gap-y-1 gap-x-6 font-mono text-xs">
      <div
        v-for="reg in registers"
        :key="reg.name"
        :class="[
          'flex justify-between px-2 py-1 rounded transition-colors',
          cellClass(reg.name, reg.value)
        ]"
      >
        <span :class="labelClass(reg.name)">
          {{ reg.name }}
          <span
            v-if="isReturnStep && reg.name === returnReg"
            class="ml-1 bg-yellow-700/70 text-yellow-200 px-1 rounded text-xs align-middle"
          >戻り値</span>
          <span
            v-else-if="argBadgeIndex(reg.name) !== null"
            class="ml-1 bg-blue-700/70 text-blue-200 px-1 rounded text-xs align-middle"
          >引数{{ argBadgeIndex(reg.name)! + 1 }}</span>
        </span>
        <span :class="valueClass(reg.name, reg.value)">{{ hexU32(reg.value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { isAddressLike, hexU32 } from '@/core/simulator'
import type { Arch } from '@/core/types'

const { arch, currentState, prevState, isReturnStep, returnReg, callArgCount } = useSimulator()

const x86Regs = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi']
const armRegs = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12']
const ARM_ARG_REGS = ['r0', 'r1', 'r2', 'r3']

const registers = computed(() => {
  const names = arch.value === 'x86' ? x86Regs : armRegs
  return names.map(name => ({
    name,
    value: currentState.value.regs[name] ?? 0,
  }))
})

function argBadgeIndex(regName: string): number | null {
  if (isReturnStep.value) return null
  const count = callArgCount.value
  if (count === null) return null
  const idx = ARM_ARG_REGS.indexOf(regName)
  if (idx < 0 || idx >= count) return null
  return idx
}

function changed(name: string): boolean {
  if (!prevState.value) return false
  return (prevState.value.regs[name] ?? 0) !== (currentState.value.regs[name] ?? 0)
}

function cellClass(name: string, val: number): string {
  if (isReturnStep.value && name === returnReg.value) return 'bg-yellow-900/40 ring-1 ring-yellow-600/50'
  if (argBadgeIndex(name) !== null) return 'bg-blue-900/30 ring-1 ring-blue-600/40'
  if (changed(name)) return isAddressLike(val, arch.value as Arch) ? 'bg-purple-900/40' : 'bg-green-900/40'
  return ''
}

function labelClass(name: string): string {
  if (isReturnStep.value && name === returnReg.value) return 'text-yellow-300 font-bold'
  if (argBadgeIndex(name) !== null) return 'text-blue-300 font-bold'
  return changed(name) ? 'text-white font-bold' : 'text-gray-300'
}

function valueClass(name: string, val: number): string {
  if (isReturnStep.value && name === returnReg.value) return 'text-yellow-200 font-bold'
  if (argBadgeIndex(name) !== null) return 'text-blue-200 font-bold'
  if (changed(name)) return isAddressLike(val, arch.value as Arch) ? 'text-purple-300 font-bold' : 'text-green-300 font-bold'
  if (isAddressLike(val, arch.value as Arch)) return 'text-purple-400'
  return 'text-gray-300'
}

</script>
