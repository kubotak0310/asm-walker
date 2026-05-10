<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

    <!-- コンパイル済みのバー（view mode） -->
    <div v-if="hasResult && compileBarState" class="px-3 py-2 bg-gray-700 flex items-center gap-2 h-[38px]">
      <!-- ① bl命令: 関数呼び出し + 引数値 -->
      <template v-if="compileBarState.type === 'call'">
        <span class="text-blue-400 text-xs font-bold shrink-0">→ {{ compileBarState.display }}</span>
        <span class="text-blue-300 text-xs">{{ $t('cCompilePanel.calling') }}</span>
        <span class="text-gray-300 text-xs hidden lg:inline">{{ arch === 'x86' ? $t('cCompilePanel.abiArgX86') : arch === 'rv32' ? $t('cCompilePanel.abiArgRv32') : $t('cCompilePanel.abiArgArm') }}</span>
      </template>
      <!-- ② return命令: 実行完了 + 戻り値 -->
      <template v-else-if="compileBarState.type === 'return'">
        <span class="text-green-400 text-xs font-bold shrink-0">✅ {{ compileBarState.func }}() {{ $t('cCompilePanel.returnDone') }}</span>
        <span class="text-gray-500 text-xs">—</span>
        <span class="text-gray-300 text-xs">{{ $t('cCompilePanel.returnValue') }}</span>
        <span class="text-yellow-200 text-xs font-bold font-mono">{{ compileBarState.reg }} = {{ compileBarState.hex }}</span>
        <span class="text-gray-300 text-xs">({{ compileBarState.dec }})</span>
        <span class="text-gray-300 text-xs hidden lg:inline">{{ arch === 'x86' ? $t('cCompilePanel.abiRetX86') : arch === 'rv32' ? $t('cCompilePanel.abiRetRv32') : $t('cCompilePanel.abiRetArm') }}</span>
      </template>
      <!-- ③ 関数内実行中 -->
      <template v-else-if="compileBarState.type === 'running'">
        <span class="text-gray-300 text-xs font-bold shrink-0">▶ {{ compileBarState.display }}</span>
        <span class="text-gray-300 text-xs">{{ $t('cCompilePanel.running') }}</span>
      </template>
      <!-- ④ 初期状態（step=0）: コンパイラ情報 -->
      <template v-else>
        <span class="text-green-400 text-xs font-bold shrink-0">{{ $t('cCompilePanel.compileSuccess') }}</span>
        <span class="text-gray-500 text-xs">·</span>
        <span class="text-gray-400 text-xs font-mono truncate">{{ compileBarState.compiler }} / {{ compileBarState.opt }}{{ compileBarState.extra ? ' ' + compileBarState.extra : '' }}</span>
      </template>
      <button
        class="ml-auto text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors shrink-0 font-medium"
        @click="() => { clearSimulation(); hasResult = false }"
      >
        {{ $t('cCompilePanel.editCode') }}
      </button>
    </div>

    <!-- エディタ全体（edit mode） -->
    <div v-show="!hasResult">
      <!-- Header -->
      <div class="px-3 py-2 bg-gray-700 flex flex-wrap items-center gap-2">
        <span class="text-gray-300 text-xs font-bold shrink-0">{{ $t('cCompilePanel.header') }}</span>
        <span class="text-gray-400 text-xs shrink-0">{{ $t('cCompilePanel.editable') }}</span>
        <div class="flex items-center gap-2 ml-auto flex-wrap">
          <span class="text-gray-400 text-xs shrink-0">{{ $t('cCompilePanel.sampleLoad') }}</span>
          <select
            v-model="selectedSampleId"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
            @change="onSampleSelect"
          >
            <option value="" disabled hidden>{{ $t('cCompilePanel.selectPlaceholder') }}</option>
            <option v-for="s in SAMPLES" :key="s.id" :value="s.id">{{ sampleName(s) }}</option>
          </select>
          <span class="border-l border-gray-500 self-stretch mx-1" />
          <select
            v-model="compilerId"
            :disabled="currentCompilers.length <= 1"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500 disabled:opacity-50 disabled:cursor-default"
            @change="onCompilerChange"
          >
            <option v-for="c in currentCompilers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select
            v-model="optLevel"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
          >
            <option value="-O0">{{ $t('cCompilePanel.optO0') }}</option>
            <option value="-O1">-O1</option>
            <option value="-O2">-O2</option>
          </select>
          <label
            :class="['flex items-center gap-1.5 text-xs shrink-0 select-none', optLevel === '-O0' ? 'text-gray-500 cursor-default' : 'text-gray-300 cursor-pointer']"
            :title="$t('cCompilePanel.noInlineTitle')"
          >
            <input type="checkbox" v-model="noInline" :disabled="optLevel === '-O0'" class="accent-blue-500 w-3.5 h-3.5" :class="optLevel === '-O0' ? 'cursor-default opacity-40' : 'cursor-pointer'" />
            {{ $t('cCompilePanel.noInline') }}
          </label>
          <input
            v-model="extraFlags"
            type="text"
            :placeholder="$t('cCompilePanel.extraFlagsPlaceholder')"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500 w-64 font-mono"
          />
        </div>
      </div>

      <!-- CodeMirror editor -->
      <div ref="editorEl" class="text-sm" style="min-height: 280px;" />

      <!-- Footer: compile button + errors -->
      <div class="border-t border-gray-700 px-3 py-2 space-y-2">
        <div class="flex items-center gap-3">
          <button
            class="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-1.5 rounded transition-colors flex items-center gap-2"
            :disabled="isCompiling"
            @click="compile"
          >
            <span v-if="isCompiling" class="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>{{ isCompiling ? $t('cCompilePanel.compiling') : $t('cCompilePanel.compileBtn') }}</span>
          </button>
          <span v-if="!isCompiling && !errors.length" class="text-gray-500 text-xs font-mono">
            {{ arch === 'arm' ? 'ARM' : arch === 'rv32' ? 'RISC-V RV32' : 'x86-64' }} / {{ optLevel }}{{ displayFlags ? ' ' + displayFlags : '' }}
          </span>
        </div>
        <div v-if="gccOutput" class="rounded overflow-hidden border border-gray-600">
          <div class="px-2 py-1 bg-gray-700 text-gray-400 text-xs">{{ $t('cCompilePanel.gccOutput') }}</div>
          <pre class="text-xs font-mono bg-gray-900 text-gray-200 px-3 py-2 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">{{ gccOutput }}</pre>
        </div>
        <div v-else-if="errors.length" class="rounded overflow-hidden border border-red-700">
          <div class="px-2 py-1 bg-red-900/50 text-red-400 text-xs">{{ $t('cCompilePanel.simError') }}</div>
          <pre class="text-xs font-mono bg-gray-900 text-red-300 px-3 py-2 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">{{ errors.join('\n') }}</pre>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorView, basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useSimulator } from '@/composables/useSimulator'
import { SAMPLES } from '@/samples'
import type { SampleDef } from '@/samples'
import type { Arch } from '@/core/types'

const { locale } = useI18n()
const {
  arch, simulateCompiled, compileError, isCompiling, setArch, currentStep, gccOutput,
  isReturnStep, currentFuncName, returnReg, returnHex, returnDec, callTarget, callDisplay,
  clearSimulation,
  capturedCallDisplay,
} = useSimulator()

const ARM_COMPILERS = [
  { id: 'carmug1520', name: 'ARM GCC 15.2.0' },
]
const X86_COMPILERS = [
  { id: 'cg142', name: 'x86-64 GCC 14.2.0' },
]
const RV32_COMPILERS = [
  { id: 'rv32-gcc1610', name: 'RISC-V GCC 16.1.0' },
]
const ALL_COMPILERS = [...ARM_COMPILERS, ...X86_COMPILERS, ...RV32_COMPILERS]
const currentCompilers = computed(() => {
  if (arch.value === 'arm')  return ARM_COMPILERS
  if (arch.value === 'rv32') return RV32_COMPILERS
  return X86_COMPILERS
})

const COMPILER_DEFAULT_FLAGS: Record<string, string> = {
  carmug1520:     '-mcpu=cortex-m3 -mthumb',
  'cg142':        '-masm=intel',
  'rv32-gcc1610': '-march=rv32gc -mabi=ilp32',
}

function compilerArch(id: string): Arch {
  if (id === 'cg142') return 'x86'
  if (id.startsWith('rv32')) return 'rv32'
  return 'arm'
}

function sampleName(s: SampleDef): string {
  return s.name[locale.value === 'ja' ? 'ja' : 'en']
}

const editorEl = ref<HTMLElement | null>(null)
const compilerId = ref('carmug1520')
const optLevel = ref('-O0')
const extraFlags = ref('-mcpu=cortex-m3 -mthumb')
const noInline = ref(true)
const selectedSampleId = ref(SAMPLES[0]?.id ?? '')
const errors = ref<string[]>([])
const hasResult = ref(false)
let view: EditorView | null = null

// コンパイル時・表示時に使う実効フラグ文字列（noInline が true なら -fno-inline を付加）
const displayFlags = computed(() => {
  const parts = [extraFlags.value, noInline.value ? '-fno-inline' : '']
  return parts.filter(Boolean).join(' ')
})

const compilerDisplayName = computed(() =>
  ALL_COMPILERS.find(c => c.id === compilerId.value)?.name ?? compilerId.value
)

const compileBarState = computed(() => {
  if (!hasResult.value) return null
  if (callTarget.value) return { type: 'call' as const, display: callDisplay.value }
  if (isReturnStep.value) return { type: 'return' as const, func: currentFuncName.value, reg: returnReg.value, hex: returnHex.value, dec: returnDec.value }
  if (currentStep.value > 0) return { type: 'running' as const, display: capturedCallDisplay.value ?? `${currentFuncName.value}()` }
  return { type: 'success' as const, compiler: compilerDisplayName.value, opt: optLevel.value, extra: displayFlags.value }
})

const DEFAULT_TEXT = SAMPLES[0]?.cCode ?? ''

const cHighlight = HighlightStyle.define([
  { tag: tags.keyword,                    color: '#60a5fa', fontWeight: 'bold' },
  { tag: tags.typeName,                   color: '#34d399' },
  { tag: tags.comment,                    color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.string,                     color: '#fbbf24' },
  { tag: tags.number,                     color: '#f472b6' },
  { tag: tags.operator,                   color: '#a78bfa' },
  { tag: tags.punctuation,                color: '#94a3b8' },
  { tag: tags.function(tags.variableName), color: '#38bdf8' },
  { tag: tags.definition(tags.variableName), color: '#e2e8f0' },
  { tag: tags.variableName,              color: '#e2e8f0' },
  { tag: tags.macroName,                  color: '#fb923c' },
  { tag: tags.bool,                       color: '#f472b6' },
])

onMounted(() => {
  view = new EditorView({
    doc: DEFAULT_TEXT,
    extensions: [
      basicSetup,
      cpp(),
      indentUnit.of('  '),
      EditorView.theme({
        '&': { backgroundColor: '#1f2937', color: '#e2e8f0' },
        '.cm-content': { fontFamily: 'monospace', fontSize: '15px', lineHeight: '1.6' },
        '.cm-gutters': { backgroundColor: '#111827', color: '#6b7280', borderRight: '1px solid #374151', fontSize: '14px' },
        '.cm-activeLineGutter': { backgroundColor: '#1e293b' },
        '.cm-activeLine': { backgroundColor: '#1e293b' },
        '.cm-cursor': { borderLeftColor: '#60a5fa' },
        '.cm-selectionBackground, ::selection': { backgroundColor: '#374151 !important' },
      }),
      syntaxHighlighting(cHighlight),
    ],
    parent: editorEl.value!,
  })
})

onBeforeUnmount(() => {
  view?.destroy()
})

watch(compileError, (err) => {
  errors.value = err ? err.split('\n').filter(Boolean) : []
})

function onSampleSelect() {
  const s = SAMPLES.find(s => s.id === selectedSampleId.value)
  if (!s || !view) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s.cCode } })
  errors.value = []
}

function onCompilerChange() {
  setArch(compilerArch(compilerId.value))
  extraFlags.value = COMPILER_DEFAULT_FLAGS[compilerId.value] ?? ''
}

watch(() => arch.value, (newArch) => {
  const currentArch = compilerArch(compilerId.value)
  if (currentArch !== newArch) {
    if (newArch === 'x86') {
      compilerId.value = 'cg142'
    } else if (newArch === 'rv32') {
      compilerId.value = 'rv32-gcc1610'
    } else {
      compilerId.value = 'carmug1520'
    }
    extraFlags.value = COMPILER_DEFAULT_FLAGS[compilerId.value] ?? ''
  }
  hasResult.value = false
  errors.value = []
})

async function compile() {
  if (!view) return
  errors.value = []
  hasResult.value = false
  const source = view.state.doc.toString()
  const flags = [optLevel.value, displayFlags.value].filter(Boolean).join(' ')
  await simulateCompiled(source, compilerId.value, flags)
  if (!compileError.value) hasResult.value = true
}
</script>
