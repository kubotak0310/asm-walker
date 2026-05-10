<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold rounded-t-lg">{{ $t('explainPanel.header') }}</div>
    <div class="p-4 min-h-24">
    <!-- HWステップ -->
    <div v-if="step?.type === 'hw'" class="space-y-3">
      <div class="flex items-center gap-2 bg-orange-900/40 border border-orange-700 rounded px-3 py-2">
        <span class="text-orange-400 font-bold">⚡</span>
        <span class="text-orange-200 text-sm font-bold">{{ $t('explainPanel.hwAuto') }}</span>
      </div>
      <p class="text-gray-200 text-sm">{{ step.explain }}</p>
      <p class="text-gray-300 text-xs font-mono">{{ step.effect }}</p>
    </div>

    <!-- SWステップ -->
    <div v-else-if="step" class="space-y-2">
      <div class="flex items-center gap-2 flex-wrap">
        <code class="bg-gray-900 text-green-300 px-2 py-0.5 rounded text-sm font-mono">{{ step.instr }}</code>
        <span v-if="step.syntax" class="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">FORMAT</span>
        <code v-if="step.syntax" class="text-gray-300 text-xs font-mono">{{ step.syntax }}</code>
        <!-- 構文記法ヘルプ -->
        <div v-if="step.syntax" ref="helpWrapRef" class="relative inline-block">
          <button
            @click.stop="showHelp = !showHelp"
            class="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-xs font-bold hover:bg-gray-500 flex items-center justify-center leading-none"
          >?</button>
          <div
            v-if="showHelp"
            class="absolute top-6 left-0 z-50 w-[480px] bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-xl"
          >
            <p class="text-gray-300 text-xs font-bold mb-2">{{ $t('explainPanel.syntaxGuide') }}</p>
            <table class="w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col class="w-28" />
                <col />
                <col class="w-36" />
              </colgroup>
              <tbody>
                <tr v-for="row in HELP_ROWS" :key="row.sym" class="border-t border-gray-700">
                  <td class="py-1 pr-3 font-mono text-yellow-300 whitespace-nowrap align-top">{{ row.sym }}</td>
                  <td class="py-1 pr-3 text-gray-300 align-top">{{ row.desc }}</td>
                  <td class="py-1 text-gray-500 font-mono break-all align-top">{{ row.ex }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <BadgeLabel v-if="step.isArr" kind="arr" :text="$t('explainPanel.arrayBadge')" />
      </div>
      <p class="text-gray-200 text-sm pl-2">
        <span v-if="step.fullName" class="text-blue-400 font-bold tracking-wide">{{ step.fullName }}</span>
        <span v-if="step.fullName" class="text-gray-500"> : </span>
        {{ step.explain }}
      </p>
      <p class="text-gray-300 text-xs font-mono pl-2">{{ step.effect }}</p>

      <div v-if="step.isArr" class="bg-green-900/30 border border-green-800 rounded p-2 text-xs text-green-200">
        💡 {{ $t('explainPanel.arrayTip') }}
      </div>
    </div>

    <!-- 全ステップ完了 -->
    <div v-else class="text-gray-500 text-sm flex items-center gap-2">
      <span>{{ $t('explainPanel.done') }}</span>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSimulator } from '@/composables/useSimulator'
import BadgeLabel from './BadgeLabel.vue'
import { getFullName as getFullNameARM, getSyntax as getSyntaxARM } from '@/core/arm/mnemonics'
import { getFullName as getFullNameX86, getSyntax as getSyntaxX86 } from '@/core/x86/mnemonics'
import { getFullName as getFullNameRV32, getSyntax as getSyntaxRV32 } from '@/core/rv32/mnemonics'

const { arch, currentStepData, preset } = useSimulator()
const { tm } = useI18n()

function getFullName(instr: string): string | undefined {
  if (arch.value === 'x86') return getFullNameX86(instr)
  if (arch.value === 'rv32') return getFullNameRV32(instr)
  return getFullNameARM(instr)
}
function getSyntax(instr: string): string | undefined {
  if (arch.value === 'x86') return getSyntaxX86(instr)
  if (arch.value === 'rv32') return getSyntaxRV32(instr)
  return getSyntaxARM(instr)
}

const showHelp = ref(false)
const helpWrapRef = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (helpWrapRef.value && !helpWrapRef.value.contains(e.target as Node)) {
    showHelp.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
watch(currentStepData, () => { showHelp.value = false })

const HELP_ROWS = computed(() => {
  const key = arch.value === 'x86' ? 'explainPanel.helpX86'
    : arch.value === 'rv32' ? 'explainPanel.helpRv32'
    : 'explainPanel.helpArm'
  return tm(key) as { sym: string; desc: string; ex: string }[]
})

const step = computed(() => {
  const s = currentStepData.value
  if (!s || !preset.value) return null
  const idx = preset.value.steps.indexOf(s)
  if (idx < 0) return null
  const raw = preset.value.asmCode[s.asmLine]?.text ?? ''
  const commentStart = Math.min(
    ...[raw.indexOf(';'), raw.indexOf('@')].filter(i => i >= 0).concat([Infinity]),
  )
  const instr = (commentStart < Infinity ? raw.slice(0, commentStart) : raw).trim()
  const fullName = getFullName(instr)
  const syntax = getSyntax(instr)
  return { ...s, instr, fullName, syntax }
})
</script>
