<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <!-- Header -->
    <div class="px-3 py-2 bg-gray-700 flex items-center justify-between gap-2">
      <span class="text-gray-300 text-xs font-bold shrink-0">ARMアセンブラ 自由入力</span>
      <div class="flex items-center gap-2 ml-auto">
        <select
          class="bg-gray-600 text-gray-200 text-xs rounded px-2 py-1 border border-gray-500"
          @change="onSampleSelect"
        >
          <option value="">サンプルを読み込む...</option>
          <option value="funcCall">関数呼び出し</option>
          <option value="branch">条件分岐</option>
          <option value="array">配列合計</option>
          <option value="arithmetic">四則演算</option>
        </select>
      </div>
    </div>

    <!-- CodeMirror editor -->
    <div ref="editorEl" class="text-sm" style="min-height: 280px;" />

    <!-- Footer: simulate button + errors -->
    <div class="border-t border-gray-700 px-3 py-2 space-y-2">
      <div class="flex items-center gap-3">
        <button
          class="bg-green-700 hover:bg-green-600 text-white text-xs font-bold px-4 py-1.5 rounded transition-colors"
          @click="simulate"
        >
          ▶ シミュレーション開始
        </button>
        <span class="text-gray-500 text-xs">命令入力後にクリック</span>
      </div>
      <div v-if="errors.length > 0" class="space-y-0.5">
        <div
          v-for="(err, i) in errors"
          :key="i"
          class="text-red-400 text-xs font-mono bg-red-900/20 px-2 py-1 rounded"
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

const { simulateFreeInput, freeInputError } = useSimulator()

const editorEl = ref<HTMLElement | null>(null)
const errors = ref<string[]>([])
let view: EditorView | null = null

const SAMPLES: Record<string, string> = {
  funcCall: `; === main ===
MOV  R0, #3         ; 第1引数 a = 3
MOV  R1, #5         ; 第2引数 b = 5
BL   add            ; add 呼び出し
BX   LR             ; main から戻る

; === add(R0=a, R1=b) ===
add:
PUSH {R4, LR}       ; R4 と LR を保存
MOV  R4, R0         ; R4 = a（R0 は ADDS で上書きされる）
ADDS R0, R4, R1     ; R0 = a + b
POP  {R4, PC}       ; R4 復元、戻る`,

  branch: `; abs(R0): 絶対値を計算する例
MOV  R0, #-5        ; 入力値 = -5
CMP  R0, #0         ; R0 と 0 を比較
BGE  done           ; R0 >= 0 なら終了
RSB  R0, R0, #0     ; R0 = 0 - R0（符号反転）
done:
BX   LR`,

  array: `; sum_array: arr[0]+arr[1]+arr[2] を計算
PUSH {LR}
SUB  SP, SP, #16    ; arr[3] + アライメント確保
MOV  R0, #1
STR  R0, [SP, #0]   ; arr[0] = 1
MOV  R0, #2
STR  R0, [SP, #4]   ; arr[1] = 2
MOV  R0, #3
STR  R0, [SP, #8]   ; arr[2] = 3
MOV  R0, SP         ; 第1引数 = arr 先頭アドレス
MOV  R1, #3         ; 第2引数 = n = 3
BL   sum_array
POP  {PC}

; === sum_array(R0=arr, R1=n) ===
sum_array:
MOV  R4, R0         ; R4 = arr ポインタ
MOV  R2, #0         ; s = 0
LDR  R3, [R4, #0]   ; a[0]
ADDS R2, R2, R3     ; s += a[0]
LDR  R3, [R4, #4]   ; a[1]
ADDS R2, R2, R3     ; s += a[1]
LDR  R3, [R4, #8]   ; a[2]
ADDS R2, R2, R3     ; s += a[2]
MOV  R0, R2         ; 戻り値 = s
BX   LR`,

  arithmetic: `; 四則演算の例
MOV  R0, #10        ; a = 10
MOV  R1, #3         ; b = 3
ADDS R2, R0, R1     ; R2 = a + b = 13
SUBS R3, R0, R1     ; R3 = a - b = 7
MUL  R4, R0, R1     ; R4 = a * b = 30
SDIV R5, R0, R1     ; R5 = a / b = 3
BX   LR`,
}

const DEFAULT_TEXT = SAMPLES.funcCall

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
        '.cm-cursor': { borderLeftColor: '#86efac' },
        '.cm-selectionBackground, ::selection': { backgroundColor: '#374151 !important' },
      }),
    ],
    parent: editorEl.value!,
  })
})

onBeforeUnmount(() => {
  view?.destroy()
})

// Watch for external errors from useSimulator
watch(freeInputError, (err) => {
  errors.value = err ? err.split('\n').filter(Boolean) : []
})

function onSampleSelect(e: Event) {
  const key = (e.target as HTMLSelectElement).value
  if (!key || !view) return
  const text = SAMPLES[key] ?? ''
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  })
  // Reset select back to placeholder
  ;(e.target as HTMLSelectElement).value = ''
  errors.value = []
}

function simulate() {
  if (!view) return
  const text = view.state.doc.toString()
  errors.value = []
  simulateFreeInput(text)
}
</script>
