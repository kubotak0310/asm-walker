<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">汎用レジスタ</div>
    <div class="p-2 grid grid-cols-2 gap-1 font-mono text-xs">
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

const { arch, currentState, prevState, currentStepData, preset } = useSimulator()

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

const returnReg = computed(() => arch.value === 'x86' ? 'rax' : 'r0')

// return命令を検出: bx lr / pop {..., pc} / ldm ..., {..., pc}
const isReturnStep = computed(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return false
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  return (text.startsWith('bx') && text.includes('lr')) ||
    (text.startsWith('pop') && text.includes('pc')) ||
    (text.startsWith('ldm') && text.includes('pc'))
})

// bl funcName を検出（blx r3 のようなレジスタ間接呼び出しは除外）
const callTarget = computed<string | null>(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return null
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  const m = text.match(/^blx?\s+(\w+)/)
  if (!m || !m[1]) return null
  const target = m[1]
  // レジスタ名（r0-r15, sp, lr, pc など）は除外
  if (/^(r\d+|sp|lr|pc|fp|ip|sl)$/.test(target)) return null
  return target
})

// Cソースから関数の引数個数を取得。失敗・複雑な場合は null を返す
function parseArgCount(funcName: string, cCode: string[]): number | null {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\s*\\(([^)]*)\\)`)
  for (const line of cCode) {
    const m = re.exec(line)
    if (!m || m[1] === undefined) continue
    // 定義行の判定: funcName の前に return / = がある場合は呼び出し側なのでスキップ
    const before = line.slice(0, m.index).trim()
    if (/\breturn\b|[=,(]/.test(before)) continue
    const params = m[1].trim()
    if (params === '' || params === 'void') return 0
    // 可変長引数・関数ポインタ引数は判定不能 → null
    if (params.includes('...') || params.includes('(')) return null
    return params.split(',').length
  }
  return null
}

// 現在の呼び出し先関数の引数個数（null = バッジ表示なし）
const callArgCount = computed<number | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const cCode = preset.value?.cCode ?? []
  if (!cCode.length) return null  // 自由入力モードはCソースなし → バッジなし
  return parseArgCount(name, cCode)
})

// 引数バッジの番号（0-based）を返す。バッジ不要なら null
function argBadgeIndex(regName: string): number | null {
  if (isReturnStep.value) return null  // return時は戻り値バッジが優先
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
  return changed(name) ? 'text-white font-bold' : 'text-gray-400'
}

function valueClass(name: string, val: number): string {
  if (isReturnStep.value && name === returnReg.value) return 'text-yellow-200 font-bold'
  if (argBadgeIndex(name) !== null) return 'text-blue-200 font-bold'
  if (changed(name)) return isAddressLike(val, arch.value as Arch) ? 'text-purple-300 font-bold' : 'text-green-300 font-bold'
  if (isAddressLike(val, arch.value as Arch)) return 'text-purple-400'
  return 'text-gray-300'
}

function formatVal(v: number): string {
  if (v === 0) return '0x00000000'
  return `0x${v.toString(16).padStart(8, '0')}`
}
</script>
