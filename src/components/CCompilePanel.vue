<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <!-- Header -->
    <div class="px-3 py-2 bg-gray-700 flex flex-wrap items-center gap-2">
      <span class="text-gray-300 text-xs font-bold shrink-0">C コンパイル</span>
      <div class="flex items-center gap-2 ml-auto flex-wrap">
        <!-- Sample selector -->
        <select
          class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
          @change="onSampleSelect"
        >
          <option value="">サンプルを読み込む...</option>
          <option value="add">加算関数</option>
          <option value="factorial">階乗（再帰）</option>
          <option value="sumArray">配列合計</option>
          <option value="branch">条件分岐</option>
        </select>
        <!-- Compiler selector -->
        <select
          v-model="compilerId"
          class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
          @change="onCompilerChange"
        >
          <optgroup label="ARM (Cortex-M)">
            <option value="carm1121">ARM GCC 11.2.1</option>
            <option value="armug1320">ARM GCC 13.2.0</option>
            <option value="armug1430">ARM GCC 14.3.0</option>
          </optgroup>
          <optgroup label="x86-64">
            <option value="x86-64g1420">x86-64 gcc 14.2.0</option>
          </optgroup>
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
      <!-- x86 notice -->
      <div v-if="!isCompiling && !errors.length && !compilerId.includes('arm') && hasResult" class="text-yellow-400 text-xs bg-yellow-900/20 px-2 py-1 rounded">
        ⚠ x86 ステップ実行は未対応です。アセンブリ表示のみ。
      </div>
      <!-- Errors -->
      <div v-if="errors.length > 0" class="space-y-0.5">
        <div
          v-for="(err, i) in errors"
          :key="i"
          class="text-red-400 text-xs font-mono bg-red-900/20 px-2 py-1 rounded whitespace-pre-wrap"
        >
          ⚠ {{ err }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { useSimulator } from '@/composables/useSimulator'

const { simulateCompiled, compileError, isCompiling, setArch } = useSimulator()

const editorEl = ref<HTMLElement | null>(null)
const compilerId = ref('carm1121')
const optLevel = ref('-O0')
const extraFlags = ref('-mcpu=cortex-m3 -mthumb')
const errors = ref<string[]>([])
const hasResult = ref(false)
let view: EditorView | null = null

const SAMPLES: Record<string, string> = {
  add:
`int add(int a, int b) {
    return a + b;
}

int main() {
    return add(3, 5);
}`,

  factorial:
`int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    return factorial(5);
}`,

  sumArray:
`int sum(int *arr, int n) {
    int s = 0;
    for (int i = 0; i < n; i++) {
        s += arr[i];
    }
    return s;
}`,

  branch:
`int abs_val(int x) {
    if (x < 0) return -x;
    return x;
}

int main() {
    return abs_val(-7);
}`,
}

const DEFAULT_TEXT = SAMPLES.add

onMounted(() => {
  view = new EditorView({
    doc: DEFAULT_TEXT,
    extensions: [
      basicSetup,
      cpp(),
      EditorView.theme({
        '&': { backgroundColor: '#1f2937', color: '#d1d5db' },
        '.cm-content': { fontFamily: 'monospace', fontSize: '13px' },
        '.cm-gutters': { backgroundColor: '#111827', color: '#6b7280', borderRight: '1px solid #374151' },
        '.cm-activeLineGutter': { backgroundColor: '#1e293b' },
        '.cm-activeLine': { backgroundColor: '#1e293b' },
        '.cm-cursor': { borderLeftColor: '#60a5fa' },
        '.cm-selectionBackground, ::selection': { backgroundColor: '#374151 !important' },
      }),
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

function onSampleSelect(e: Event) {
  const key = (e.target as HTMLSelectElement).value
  if (!key || !view) return
  const text = SAMPLES[key] ?? ''
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  ;(e.target as HTMLSelectElement).value = ''
  errors.value = []
}

function onCompilerChange() {
  setArch(compilerId.value.includes('arm') ? 'arm' : 'x86')
}

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
