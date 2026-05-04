<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">

    <!-- コンパイル済みのバー（view mode）: 高さ固定でレイアウトシフトなし -->
    <div v-if="hasResult" class="px-3 py-2 bg-gray-700 flex items-center gap-2 min-h-[38px]">
      <!-- ① bl命令: 関数呼び出し + 引数値 -->
      <template v-if="callTarget">
        <span class="text-blue-400 text-xs font-bold shrink-0">→ {{ callDisplay }}</span>
        <span class="text-blue-300 text-xs">呼び出し</span>
        <span class="text-gray-300 text-xs hidden lg:inline">ARM ABI: r0〜r3 が引数レジスタ</span>
      </template>
      <!-- ② return命令: 実行完了 + 戻り値 -->
      <template v-else-if="isReturnStep">
        <span class="text-green-400 text-xs font-bold shrink-0">✅ {{ currentFuncName }}() 実行完了</span>
        <span class="text-gray-500 text-xs">—</span>
        <span class="text-gray-300 text-xs">戻り値:</span>
        <span class="text-yellow-200 text-xs font-bold font-mono">r0 = {{ returnHex }}</span>
        <span class="text-gray-300 text-xs">({{ returnDec }})</span>
        <span class="text-gray-300 text-xs hidden lg:inline">ARM ABI: r0 が関数の戻り値レジスタ</span>
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
        <span v-if="!compilerId.includes('arm')" class="text-yellow-400 text-xs shrink-0">⚠ x86 ステップ実行は未対応</span>
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

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { useSimulator } from '@/composables/useSimulator'

const { simulateCompiled, compileError, isCompiling, setArch, currentStepData, preset, currentState, arch, currentStep } = useSimulator()

// ── return命令検出 ──────────────────────────────────────────
const isReturnStep = computed(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return false
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  return (text.startsWith('bx') && text.includes('lr')) ||
    (text.startsWith('pop') && text.includes('pc')) ||
    (text.startsWith('ldm') && text.includes('pc'))
})

const currentFuncName = computed(() => {
  const frames = currentState.value.frames
  return frames[frames.length - 1]?.name ?? 'main'
})

const returnVal = computed(() => arch.value === 'x86' ? (currentState.value.regs['rax'] ?? 0) : (currentState.value.regs['r0'] ?? 0))
const returnHex = computed(() => `0x${returnVal.value.toString(16).padStart(8, '0')}`)
const returnDec = computed(() => returnVal.value.toString(10))

// ── bl命令検出 + 引数表示 ────────────────────────────────────
const callTarget = computed<string | null>(() => {
  const step = currentStepData.value
  if (!step || step.asmLine < 0) return null
  const text = (preset.value?.asmCode[step.asmLine]?.text ?? '').trim().toLowerCase()
  const m = text.match(/^blx?\s+(\w+)/)
  if (!m || !m[1]) return null
  if (/^(r\d+|sp|lr|pc|fp|ip|sl)$/.test(m[1])) return null
  return m[1]
})

function parseArgCount(funcName: string, cCode: string[]): number | null {
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\s*\\(([^)]*)\\)`)
  for (const line of cCode) {
    const m = re.exec(line)
    if (!m || m[1] === undefined) continue
    const before = line.slice(0, m.index).trim()
    if (/\breturn\b|[=,(]/.test(before)) continue
    const params = m[1].trim()
    if (params === '' || params === 'void') return 0
    if (params.includes('...') || params.includes('(')) return null
    return params.split(',').length
  }
  return null
}

const callArgCount = computed<number | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const cCode = preset.value?.cCode ?? []
  if (!cCode.length) return null
  return parseArgCount(name, cCode)
})

// "add(r0=3, r1=5)" 形式の文字列
const callDisplay = computed<string | null>(() => {
  const name = callTarget.value
  if (!name) return null
  const count = callArgCount.value
  if (count === null) return `${name}()`
  const argRegs = ['r0', 'r1', 'r2', 'r3']
  const args = argRegs.slice(0, count).map(r => `${r}=${currentState.value.regs[r] ?? 0}`)
  return `${name}(${args.join(', ')})`
})

const editorEl = ref<HTMLElement | null>(null)
const compilerId = ref('carm1121')
const optLevel = ref('-O0')
const extraFlags = ref('-mcpu=cortex-m3 -mthumb')
const errors = ref<string[]>([])
const hasResult = ref(false)
let view: EditorView | null = null

const COMPILER_NAMES: Record<string, string> = {
  carm1121: 'ARM GCC 11.2.1',
  armug1320: 'ARM GCC 13.2.0',
  armug1430: 'ARM GCC 14.3.0',
  'x86-64g1420': 'x86-64 GCC 14.2.0',
}
const compilerDisplayName = computed(() => COMPILER_NAMES[compilerId.value] ?? compilerId.value)

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
