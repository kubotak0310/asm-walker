<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

    <!-- コンパイル済みのバー（view mode）: 高さ固定でレイアウトシフトなし -->
    <div v-if="hasResult" class="px-3 py-2 bg-gray-700 flex items-center gap-2 min-h-[38px]">
      <!-- ① bl命令: 関数呼び出し + 引数値 -->
      <template v-if="callTarget">
        <span class="text-blue-400 text-xs font-bold shrink-0">→ {{ callDisplay }}</span>
        <span class="text-blue-300 text-xs">呼び出し</span>
        <span class="text-gray-300 text-xs hidden lg:inline">{{ arch === 'x86' ? 'x86-64 ABI: rdi〜r9 が引数レジスタ' : 'ARM ABI: r0〜r3 が引数レジスタ' }}</span>
      </template>
      <!-- ② return命令: 実行完了 + 戻り値 -->
      <template v-else-if="isReturnStep">
        <span class="text-green-400 text-xs font-bold shrink-0">✅ {{ currentFuncName }}() 実行完了</span>
        <span class="text-gray-500 text-xs">—</span>
        <span class="text-gray-300 text-xs">戻り値:</span>
        <span class="text-yellow-200 text-xs font-bold font-mono">{{ returnReg }} = {{ returnHex }}</span>
        <span class="text-gray-300 text-xs">({{ returnDec }})</span>
        <span class="text-gray-300 text-xs hidden lg:inline">{{ arch === 'x86' ? 'x86-64 ABI: rax が戻り値レジスタ' : 'ARM ABI: r0 が関数の戻り値レジスタ' }}</span>
      </template>
      <!-- ③ 関数内実行中 -->
      <template v-else-if="currentStep > 0">
        <span class="text-gray-300 text-xs font-bold shrink-0">▶ {{ currentFuncName }}()</span>
        <span class="text-gray-300 text-xs">実行中</span>
      </template>
      <!-- ④ 初期状態（step=0）: コンパイラ情報 -->
      <template v-else>
        <span class="text-green-400 text-xs font-bold shrink-0">✅ コンパイル成功</span>
        <span class="text-gray-500 text-xs">·</span>
        <span class="text-gray-400 text-xs font-mono truncate">{{ compilerDisplayName }} / {{ optLevel }}{{ extraFlags ? ' ' + extraFlags : '' }}</span>
      </template>
      <button
        class="ml-auto text-xs bg-gray-600 hover:bg-gray-500 text-gray-200 px-3 py-1 rounded transition-colors shrink-0"
        @click="hasResult = false"
      >
        ✏ 再編集
      </button>
    </div>

    <!-- エディタ全体（edit mode） -->
    <div v-show="!hasResult">
      <!-- Header -->
      <div class="px-3 py-2 bg-gray-700 flex flex-wrap items-center gap-2">
        <span class="text-gray-300 text-xs font-bold shrink-0">C コンパイル</span>
        <div class="flex items-center gap-2 ml-auto flex-wrap">
          <!-- Sample selector -->
          <select
            v-model="selectedSampleId"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
            @change="onSampleSelect"
          >
            <option value="" disabled hidden>サンプルを選択してください...</option>
            <option v-for="s in SAMPLES" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <!-- Compiler selector -->
          <select
            v-model="compilerId"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
            @change="onCompilerChange"
          >
            <template v-if="arch === 'arm'">
              <option value="carm1121">ARM GCC 11.2.1</option>
              <option value="armug1320">ARM GCC 13.2.0</option>
              <option value="armug1430">ARM GCC 14.3.0</option>
            </template>
            <template v-else>
              <option value="cg142">x86-64 GCC 14.2.0</option>
            </template>
          </select>
          <!-- Optimization selector -->
          <select
            v-model="optLevel"
            class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
          >
            <option value="-O0">-O0 (最適化なし)</option>
            <option value="-O1">-O1</option>
            <option value="-O2">-O2</option>
          </select>
          <!-- Extra flags -->
          <input
            v-model="extraFlags"
            type="text"
            placeholder="追加フラグ（例: -mcpu=cortex-m3 -mthumb）"
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
            <span>{{ isCompiling ? 'コンパイル中...' : '▶ コンパイル & シミュレーション' }}</span>
          </button>
          <span v-if="!isCompiling && !errors.length" class="text-gray-500 text-xs font-mono">
            {{ compilerId.includes('arm') ? 'ARM' : 'x86-64' }} / {{ optLevel }}{{ extraFlags ? ' ' + extraFlags : '' }}
          </span>
        </div>
        <!-- gcc raw output（エラー時 + 警告あり時） -->
        <div v-if="gccOutput" class="rounded overflow-hidden border border-gray-600">
          <div class="px-2 py-1 bg-gray-700 text-gray-400 text-xs">コンパイラ出力 (gcc stderr)</div>
          <pre class="text-xs font-mono bg-gray-900 text-gray-200 px-3 py-2 overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">{{ gccOutput }}</pre>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useSimulator } from '@/composables/useSimulator'
import { SAMPLES } from '@/samples'

const {
  arch, simulateCompiled, compileError, isCompiling, setArch, currentStep, gccOutput,
  isReturnStep, currentFuncName, returnReg, returnHex, returnDec, callTarget, callDisplay,
} = useSimulator()

const COMPILER_DEFAULT_FLAGS: Record<string, string> = {
  carm1121:     '-mcpu=cortex-m3 -mthumb',
  armug1320:    '-mcpu=cortex-m3 -mthumb',
  armug1430:    '-mcpu=cortex-m3 -mthumb',
  'cg142': '-masm=intel',
}

const editorEl = ref<HTMLElement | null>(null)
const compilerId = ref('carm1121')
const optLevel = ref('-O0')
const extraFlags = ref('-mcpu=cortex-m3 -mthumb')
const selectedSampleId = ref('')
const errors = ref<string[]>([])
const hasResult = ref(false)
let view: EditorView | null = null

const COMPILER_NAMES: Record<string, string> = {
  carm1121: 'ARM GCC 11.2.1',
  armug1320: 'ARM GCC 13.2.0',
  armug1430: 'ARM GCC 14.3.0',
  'cg142': 'x86-64 GCC 14.2.0',
}
const compilerDisplayName = computed(() => COMPILER_NAMES[compilerId.value] ?? compilerId.value)

const DEFAULT_TEXT = SAMPLES[0]?.cCode ?? ''

const cHighlight = HighlightStyle.define([
  { tag: tags.keyword,                    color: '#60a5fa', fontWeight: 'bold' }, // int, return, if ...
  { tag: tags.typeName,                   color: '#34d399' },                     // type identifiers
  { tag: tags.comment,                    color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.string,                     color: '#fbbf24' },
  { tag: tags.number,                     color: '#f472b6' },
  { tag: tags.operator,                   color: '#a78bfa' },
  { tag: tags.punctuation,                color: '#94a3b8' },
  { tag: tags.function(tags.variableName), color: '#38bdf8' },                    // function calls
  { tag: tags.definition(tags.variableName), color: '#e2e8f0' },                 // definitions
  { tag: tags.variableName,              color: '#e2e8f0' },
  { tag: tags.macroName,                  color: '#fb923c' },                     // #define etc.
  { tag: tags.bool,                       color: '#f472b6' },
])

onMounted(() => {
  view = new EditorView({
    doc: DEFAULT_TEXT,
    extensions: [
      basicSetup,
      cpp(),
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
  setArch(compilerId.value.includes('arm') ? 'arm' : 'x86')
  extraFlags.value = COMPILER_DEFAULT_FLAGS[compilerId.value] ?? ''
}

watch(() => arch.value, (newArch) => {
  if (newArch === 'x86' && compilerId.value !== 'cg142') {
    compilerId.value = 'cg142'
    extraFlags.value = COMPILER_DEFAULT_FLAGS['cg142'] ?? ''
  } else if (newArch === 'arm' && compilerId.value === 'cg142') {
    compilerId.value = 'carm1121'
    extraFlags.value = COMPILER_DEFAULT_FLAGS['carm1121'] ?? ''
  }
})

async function compile() {
  if (!view) return
  errors.value = []
  hasResult.value = false
  const source = view.state.doc.toString()
  const flags = [optLevel.value, extraFlags.value].filter(Boolean).join(' ')
  await simulateCompiled(source, compilerId.value, flags)
  if (!compileError.value) hasResult.value = true
}
</script>
