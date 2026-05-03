<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-24">
    <!-- HWステップ -->
    <div v-if="step?.type === 'hw'" class="space-y-3">
      <div class="flex items-center gap-2 bg-orange-900/40 border border-orange-700 rounded px-3 py-2">
        <span class="text-orange-400 font-bold">⚡</span>
        <span class="text-orange-200 text-sm font-bold">ハードウェアが自動実行 — アセンブラ命令は存在しません</span>
      </div>
      <p class="text-gray-200 text-sm">{{ step.explain }}</p>
      <p class="text-gray-400 text-xs font-mono">→ {{ step.effect }}</p>
    </div>

    <!-- SWステップ -->
    <div v-else-if="step" class="space-y-2">
      <div class="flex items-center gap-2 flex-wrap">
        <code class="bg-gray-900 text-green-300 px-2 py-0.5 rounded text-sm font-mono">{{ step.instr }}</code>
        <span v-if="step.syntax" class="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-mono">FORMAT</span>
        <code v-if="step.syntax" class="text-gray-400 text-xs font-mono">{{ step.syntax }}</code>
        <!-- 構文記法ヘルプ -->
        <div v-if="step.syntax" ref="helpWrapRef" class="relative inline-block">
          <button
            @click.stop="showHelp = !showHelp"
            class="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-xs font-bold hover:bg-gray-500 flex items-center justify-center leading-none"
          >?</button>
          <div
            v-if="showHelp"
            class="absolute top-6 left-0 z-50 w-80 bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-xl"
          >
            <p class="text-gray-300 text-xs font-bold mb-2">構文記法ガイド</p>
            <table class="w-full text-xs border-collapse">
              <tbody>
                <tr v-for="row in HELP_ROWS" :key="row.sym" class="border-t border-gray-700">
                  <td class="py-1 pr-3 font-mono text-yellow-300 whitespace-nowrap">{{ row.sym }}</td>
                  <td class="py-1 pr-3 text-gray-300">{{ row.desc }}</td>
                  <td class="py-1 text-gray-500 font-mono whitespace-nowrap">{{ row.ex }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <span v-if="step.isPtr" class="text-xs bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded">ポインタ操作</span>
        <span v-if="step.isArr" class="text-xs bg-green-800 text-green-200 px-1.5 py-0.5 rounded">配列要素</span>
      </div>
      <p v-if="step.fullName" class="text-blue-400 text-xs font-mono font-bold tracking-widest uppercase">{{ step.fullName }}</p>
      <p class="text-gray-200 text-sm">{{ step.explain }}</p>
      <p class="text-gray-400 text-xs font-mono">→ {{ step.effect }}</p>

      <div v-if="step.isPtr" class="bg-purple-900/30 border border-purple-800 rounded p-2 text-xs text-purple-200">
        💡 ポインタ操作: アドレス値の取得・設定・間接参照が含まれます
      </div>
      <div v-if="step.isArr" class="bg-green-900/30 border border-green-800 rounded p-2 text-xs text-green-200">
        💡 配列要素: ベースアドレス + オフセットで各要素にアクセスします
      </div>
    </div>

    <!-- 全ステップ完了 -->
    <div v-else class="text-gray-500 text-sm flex items-center gap-2">
      <span>✓ 全ステップ完了 — 「戻る」で見直せます</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { currentStepData, preset } = useSimulator()

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

const HELP_ROWS = [
  { sym: '{S}',      desc: '省略可能なSサフィックス。付けるとフラグ更新',  ex: 'MOV / MOVS' },
  { sym: '{ }',      desc: '省略可能な要素',                               ex: '{, #offset}' },
  { sym: '[ ]',      desc: 'メモリアドレスを参照（デリファレンス）',        ex: '[SP, #4]' },
  { sym: 'Rd',       desc: '宛先レジスタ (Destination)',                   ex: '' },
  { sym: 'Rn',       desc: 'ベース / 第1ソースレジスタ',                   ex: '' },
  { sym: 'Rm',       desc: '第2ソースレジスタ',                            ex: '' },
  { sym: 'Rt',       desc: '転送レジスタ (Transfer) — LDR/STR',           ex: '' },
  { sym: 'Ra',       desc: '積算レジスタ (Accumulate) — MLA/MLS',         ex: '' },
  { sym: '#imm',     desc: '即値リテラル (Immediate)',                      ex: '#16, #0x10' },
  { sym: 'reglist',  desc: 'レジスタリスト（{ }は構文の一部）',             ex: '{R0, R1, LR}' },
]

const FULL_NAMES: Record<string, string> = {
  MOV: 'MOVE', MVN: 'MOVE NOT',
  ADD: 'ADD', ADC: 'ADD WITH CARRY',
  SUB: 'SUBTRACT', SBC: 'SUBTRACT WITH CARRY', RSB: 'REVERSE SUBTRACT',
  MUL: 'MULTIPLY', MLA: 'MULTIPLY ACCUMULATE', MLS: 'MULTIPLY SUBTRACT',
  SDIV: 'SIGNED DIVIDE', UDIV: 'UNSIGNED DIVIDE',
  AND: 'AND', ORR: 'OR', EOR: 'EXCLUSIVE OR', BIC: 'BIT CLEAR',
  LSL: 'LOGICAL SHIFT LEFT', LSR: 'LOGICAL SHIFT RIGHT',
  ASR: 'ARITHMETIC SHIFT RIGHT', ROR: 'ROTATE RIGHT',
  CMP: 'COMPARE', CMN: 'COMPARE NEGATIVE', TST: 'TEST', TEQ: 'TEST EQUIVALENCE',
  LDR: 'LOAD REGISTER', LDRB: 'LOAD REGISTER BYTE', LDRH: 'LOAD REGISTER HALFWORD',
  STR: 'STORE REGISTER', STRB: 'STORE REGISTER BYTE', STRH: 'STORE REGISTER HALFWORD',
  PUSH: 'PUSH MULTIPLE REGISTERS', POP: 'POP MULTIPLE REGISTERS',
  B: 'BRANCH', BL: 'BRANCH WITH LINK', BX: 'BRANCH EXCHANGE', BLX: 'BRANCH WITH LINK AND EXCHANGE',
  BEQ: 'BRANCH IF EQUAL', BNE: 'BRANCH IF NOT EQUAL',
  BLT: 'BRANCH IF LESS THAN', BGT: 'BRANCH IF GREATER THAN',
  BLE: 'BRANCH IF LESS OR EQUAL', BGE: 'BRANCH IF GREATER OR EQUAL',
  BCS: 'BRANCH IF CARRY SET', BHS: 'BRANCH IF HIGHER OR SAME',
  BCC: 'BRANCH IF CARRY CLEAR', BLO: 'BRANCH IF LOWER',
  BMI: 'BRANCH IF MINUS', BPL: 'BRANCH IF PLUS',
  BVS: 'BRANCH IF OVERFLOW', BVC: 'BRANCH IF NO OVERFLOW',
  BHI: 'BRANCH IF HIGHER', BLS: 'BRANCH IF LOWER OR SAME',
  CBZ: 'COMPARE AND BRANCH IF ZERO', CBNZ: 'COMPARE AND BRANCH IF NOT ZERO',
  NOP: 'NO OPERATION',
}

const SYNTAX: Record<string, string> = {
  MOV: 'MOV{S} Rd, Rn / #imm', MVN: 'MVN{S} Rd, Rn / #imm',
  ADD: 'ADD{S} Rd, Rn, Rm / #imm', ADC: 'ADC{S} Rd, Rn, Rm',
  SUB: 'SUB{S} Rd, Rn, Rm / #imm', SBC: 'SBC{S} Rd, Rn, Rm', RSB: 'RSB{S} Rd, Rn, #imm',
  MUL: 'MUL{S} Rd, Rn, Rm', MLA: 'MLA{S} Rd, Rn, Rm, Ra', MLS: 'MLS Rd, Rn, Rm, Ra',
  SDIV: 'SDIV Rd, Rn, Rm', UDIV: 'UDIV Rd, Rn, Rm',
  AND: 'AND{S} Rd, Rn, Rm / #imm', ORR: 'ORR{S} Rd, Rn, Rm / #imm',
  EOR: 'EOR{S} Rd, Rn, Rm / #imm', BIC: 'BIC{S} Rd, Rn, Rm / #imm',
  LSL: 'LSL{S} Rd, Rn, Rm / #imm', LSR: 'LSR{S} Rd, Rn, Rm / #imm',
  ASR: 'ASR{S} Rd, Rn, Rm / #imm', ROR: 'ROR{S} Rd, Rn, Rm / #imm',
  CMP: 'CMP Rn, Rm / #imm', CMN: 'CMN Rn, Rm / #imm',
  TST: 'TST Rn, Rm / #imm', TEQ: 'TEQ Rn, Rm',
  LDR: 'LDR Rt, [Rn{, #offset}]', LDRB: 'LDRB Rt, [Rn{, #offset}]', LDRH: 'LDRH Rt, [Rn{, #offset}]',
  STR: 'STR Rt, [Rn{, #offset}]', STRB: 'STRB Rt, [Rn{, #offset}]', STRH: 'STRH Rt, [Rn{, #offset}]',
  PUSH: 'PUSH {reglist}', POP: 'POP {reglist}',
  B: 'B label', BL: 'BL label', BX: 'BX Rm', BLX: 'BLX Rm',
  BEQ: 'BEQ label', BNE: 'BNE label',
  BLT: 'BLT label', BGT: 'BGT label', BLE: 'BLE label', BGE: 'BGE label',
  BCS: 'BCS label', BCC: 'BCC label', BHS: 'BHS label', BLO: 'BLO label',
  BMI: 'BMI label', BPL: 'BPL label', BVS: 'BVS label', BVC: 'BVC label',
  BHI: 'BHI label', BLS: 'BLS label',
  CBZ: 'CBZ Rn, label', CBNZ: 'CBNZ Rn, label',
  NOP: 'NOP',
}

function getSyntax(instr: string): string {
  const mnemonic = instr.trim().split(/\s/)[0]?.toUpperCase() ?? ''
  if (SYNTAX[mnemonic]) return SYNTAX[mnemonic]
  if (mnemonic.endsWith('S')) {
    const base = mnemonic.slice(0, -1)
    const baseSyntax = SYNTAX[base]
    // S-variant: replace {S} placeholder (already baked into mnemonic)
    if (baseSyntax) return (mnemonic + baseSyntax.slice(base.length)).replace('{S}', '')
  }
  return ''
}

function getFullName(instr: string): string {
  const mnemonic = instr.trim().split(/\s/)[0]?.toUpperCase() ?? ''
  if (FULL_NAMES[mnemonic]) return FULL_NAMES[mnemonic]
  if (mnemonic.endsWith('S')) {
    const base = mnemonic.slice(0, -1)
    const baseName = FULL_NAMES[base]
    if (baseName) return `${baseName} (FLAGS UPDATE)`
  }
  return ''
}

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
