<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">{{ $t('registerPanel.header') }}</div>
    <div class="p-2 grid grid-cols-2 gap-y-1 gap-x-6 font-mono text-xs">
      <div
        v-for="reg in registers"
        :key="reg.name"
        :class="[
          'flex justify-between px-2 py-1 rounded transition-colors',
          cellClass(reg.name)
        ]"
      >
        <span :class="labelClass(reg.name)">
          {{ reg.name }}<span v-if="reg.xNum" class="text-gray-500 font-normal">({{ reg.xNum }})</span>
          <BadgeLabel
            v-if="isReturnStep && reg.name === returnReg"
            kind="return"
            :text="$t('registerPanel.returnBadge')"
          />
          <BadgeLabel
            v-else-if="argBadgeIndex(reg.name) !== null"
            kind="arg"
            :text="`${$t('registerPanel.argBadge')}${argBadgeIndex(reg.name)! + 1}`"
          />
          <BadgeLabel
            v-else-if="currentStepData?.ptrReg === reg.name"
            kind="ptr"
            text="ptr"
          />
        </span>
        <span :class="valueClass(reg.name)">{{ hexU32(reg.value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { hexU32 } from '@/core/simulator'
import BadgeLabel from './BadgeLabel.vue'

const { arch, currentState, prevState, currentStepData, isReturnStep, returnReg, callArgCount } = useSimulator()

const x86Regs = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15']
const armRegs = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12']
const rv32Regs = [
  'zero', 'ra',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  't0', 't1', 't2', 't3', 't4', 't5', 't6',
  's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
]
const ARM_ARG_REGS = ['r0', 'r1', 'r2', 'r3']
const X86_ARG_REGS = ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9']
const RV32_ARG_REGS = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']

// ABI 名 → x 番号マッピング（RegisterPanel のラベル表示に使う）
const ABI_TO_X: Record<string, string> = {
  zero: 'x0', ra: 'x1', sp: 'x2', gp: 'x3', tp: 'x4',
  t0: 'x5', t1: 'x6', t2: 'x7',
  s0: 'x8', s1: 'x9',
  a0: 'x10', a1: 'x11', a2: 'x12', a3: 'x13',
  a4: 'x14', a5: 'x15', a6: 'x16', a7: 'x17',
  s2: 'x18', s3: 'x19', s4: 'x20', s5: 'x21',
  s6: 'x22', s7: 'x23', s8: 'x24', s9: 'x25',
  s10: 'x26', s11: 'x27',
  t3: 'x28', t4: 'x29', t5: 'x30', t6: 'x31',
}

const registers = computed(() => {
  const isRv32 = arch.value === 'rv32'
  const names = arch.value === 'x86' ? x86Regs : isRv32 ? rv32Regs : armRegs
  return names.map(name => ({
    name,
    value: currentState.value.regs[name] ?? 0,
    xNum: isRv32 ? (ABI_TO_X[name] ?? null) : null,
  }))
})

function argBadgeIndex(regName: string): number | null {
  if (isReturnStep.value) return null
  const count = callArgCount.value
  if (count === null) return null
  const argRegs = arch.value === 'x86' ? X86_ARG_REGS : arch.value === 'rv32' ? RV32_ARG_REGS : ARM_ARG_REGS
  const idx = argRegs.indexOf(regName)
  if (idx < 0 || idx >= count) return null
  return idx
}

function changed(name: string): boolean {
  if (!prevState.value) return false
  return (prevState.value.regs[name] ?? 0) !== (currentState.value.regs[name] ?? 0)
}

function cellClass(name: string): string {
  if (isReturnStep.value && name === returnReg.value) return 'bg-yellow-900/40 ring-1 ring-yellow-600/50'
  if (argBadgeIndex(name) !== null) return 'bg-blue-900/30 ring-1 ring-blue-600/40'
  if (currentStepData.value?.ptrReg === name) return 'bg-purple-900/40 ring-1 ring-purple-600/40'
  if (changed(name)) return 'bg-green-900/40'
  return ''
}

function labelClass(name: string): string {
  if (isReturnStep.value && name === returnReg.value) return 'text-yellow-300 font-bold'
  if (argBadgeIndex(name) !== null) return 'text-blue-300 font-bold'
  if (currentStepData.value?.ptrReg === name) return 'text-purple-300 font-bold'
  return changed(name) ? 'text-white font-bold' : 'text-gray-300'
}

function valueClass(name: string): string {
  if (isReturnStep.value && name === returnReg.value) return 'text-yellow-200 font-bold'
  if (argBadgeIndex(name) !== null) return 'text-blue-200 font-bold'
  if (currentStepData.value?.ptrReg === name) return 'text-purple-200 font-bold'
  if (changed(name)) return 'text-green-300 font-bold'
  return 'text-gray-300'
}
</script>
