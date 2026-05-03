import type { PresetData } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'

const SP0 = BASE_SP_ARM
const HW_FRAME_SIZE = 32  // 8 registers × 4 bytes
const SP_AFTER_HW = SP0 - HW_FRAME_SIZE

const COUNTER_ADDR = 0x20000004
const IRQ_PC = 0x08001234      // 割り込み発生時のPC（mainの実行中）
const IRQ_LR = 0x08001200      // 割り込み発生時のLR
const XPSR = 0x01000000        // 通常のxPSR値

export const armInterrupt: PresetData = {
  id: 'interrupt',
  name: '割り込みスタック退避',
  arch: 'arm',

  cCode: [
    'volatile int counter = 0;       // メモリアドレス 0x20000004',
    '',
    'void TIM2_IRQHandler(void) {',
    '    counter++;',
    '}',
    '',
    'int main(void) {',
    '    // 通常処理を実行中...',
    '    counter++;  // ← ここで TIM2 割り込みが発生！',
    '    return 0;',
    '}',
  ],

  asmCode: [
    { text: '; === main（通常処理中）===', isHeader: true, phase: 'main' },
    { text: '    ; ... 通常処理 ...' },
    { text: '    ; ← TIM2 割り込み発生（ここでCPUが自動処理を開始）' },
    { text: '' },
    { text: '; ★ ハードウェア自動処理（アセンブラ命令なし）===', isHeader: true, phase: 'hw' },
    { text: '    ; SP -= 32（8レジスタ × 4バイト）' },
    { text: '    ; [SP+0]  = R0（退避）' },
    { text: '    ; [SP+4]  = R1' },
    { text: '    ; [SP+8]  = R2' },
    { text: '    ; [SP+12] = R3' },
    { text: '    ; [SP+16] = R12' },
    { text: '    ; [SP+20] = LR（割り込み前のリンクレジスタ）' },
    { text: '    ; [SP+24] = PC（割り込み前の実行アドレス）' },
    { text: '    ; [SP+28] = xPSR（プログラムステータスレジスタ）' },
    { text: '    ; LR = 0xFFFFFFF9（EXC_RETURN値）' },
    { text: '    ; モード: Thread → Handler に切り替え' },
    { text: '' },
    { text: '; === TIM2_IRQHandler ===', isHeader: true, phase: 'isr' },
    { text: '    LDR  R0, =counter   ; R0 = &counter（カウンタのアドレス）' },
    { text: '    LDR  R1, [R0]       ; R1 = counter（現在値を読み込み）' },
    { text: '    ADDS R1, R1, #1     ; R1 = counter + 1' },
    { text: '    STR  R1, [R0]       ; counter = R1（書き戻し）' },
    { text: '    BX   LR             ; EXC_RETURN で例外復帰をトリガー' },
    { text: '' },
    { text: '; ★ ハードウェア自動処理（復帰）===', isHeader: true, phase: 'hw' },
    { text: '    ; SP += 32（スタックから8レジスタを復元）' },
    { text: '    ; R0, R1, R2, R3, R12, LR, PC, xPSR を復元' },
    { text: '    ; モード: Handler → Thread に切り替え' },
  ],

  initialState: {
    regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
    sp: SP0,
    fp: 0,
    lr: IRQ_LR,
    pc: IRQ_PC,
    stack: {},
    stackMeta: {},
    flags: { zero: false, negative: false, carry: false, overflow: false },
    mode: 'thread',
    frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
  },

  steps: [
    {
      type: 'hw', phase: 'hw', asmLine: -1, cLine: 8,
      explain: '【ハードウェア自動処理】TIM2割り込み発生 — CPUが8レジスタをスタックに自動退避',
      effect: `SP -= 32（0x${SP0.toString(16)} → 0x${SP_AFTER_HW.toString(16)}）、R0〜R3・R12・LR・PC・xPSRをスタックに積む、LR = 0xFFFFFFF9（EXC_RETURN）、モードをHandler Modeに切り替え`,
      update: {
        sp: SP_AFTER_HW,
        lr: 0xfffffff9,
        pc: 0x08002000,
        mode: 'handler',
        stackSet: {
          [SP_AFTER_HW + 0]:  0,         // R0
          [SP_AFTER_HW + 4]:  0,         // R1
          [SP_AFTER_HW + 8]:  0,         // R2
          [SP_AFTER_HW + 12]: 0,         // R3
          [SP_AFTER_HW + 16]: 0,         // R12
          [SP_AFTER_HW + 20]: IRQ_LR,    // LR（割り込み前）
          [SP_AFTER_HW + 24]: IRQ_PC,    // PC（割り込み前）
          [SP_AFTER_HW + 28]: XPSR,      // xPSR
        },
        metaSet: {
          [SP_AFTER_HW + 0]:  { label: '退避 R0',   kind: 'hw' },
          [SP_AFTER_HW + 4]:  { label: '退避 R1',   kind: 'hw' },
          [SP_AFTER_HW + 8]:  { label: '退避 R2',   kind: 'hw' },
          [SP_AFTER_HW + 12]: { label: '退避 R3',   kind: 'hw' },
          [SP_AFTER_HW + 16]: { label: '退避 R12',  kind: 'hw' },
          [SP_AFTER_HW + 20]: { label: '退避 LR',   kind: 'hw' },
          [SP_AFTER_HW + 24]: { label: '退避 PC',   kind: 'hw' },
          [SP_AFTER_HW + 28]: { label: '退避 xPSR', kind: 'hw' },
        },
        frames: [
          { name: 'main', lo: SP0, hi: SP0, color: 'purple' },
          { name: 'TIM2_ISR', lo: SP_AFTER_HW, hi: SP0, color: 'orange' },
        ],
      },
    },
    {
      type: 'sw', phase: 'isr', asmLine: 18, cLine: 2,
      explain: 'LDR R0, =counter — counter変数のアドレスをR0にロード',
      effect: `R0 = 0x${COUNTER_ADDR.toString(16)}（counter のアドレス）`,
      update: { regs: { r0: COUNTER_ADDR } },
    },
    {
      type: 'sw', phase: 'isr', asmLine: 19, cLine: 3,
      explain: 'LDR R1, [R0] — R0が指すアドレスから counter の現在値を読み込み',
      effect: 'R1 = counter = 0（現在値）',
      update: { regs: { r1: 0 } },
    },
    {
      type: 'sw', phase: 'isr', asmLine: 20, cLine: 3,
      explain: 'ADDS R1, R1, #1 — counter を1増加',
      effect: 'R1 = 0 + 1 = 1',
      update: { regs: { r1: 1 } },
    },
    {
      type: 'sw', phase: 'isr', asmLine: 21, cLine: 3,
      explain: 'STR R1, [R0] — 新しいcounter値をメモリに書き戻し',
      effect: `[0x${COUNTER_ADDR.toString(16)}] = 1（counter = 1）`,
      update: {},
    },
    {
      type: 'sw', phase: 'isr', asmLine: 22, cLine: 4,
      explain: 'BX LR — LR = 0xFFFFFFF9（EXC_RETURN）でハードウェア例外復帰をトリガー',
      effect: 'PC に 0xFFFFFFF9 をロード → CPUが特殊アドレスと認識して例外復帰処理を開始',
      update: { pc: 0xfffffff9 },
    },
    {
      type: 'hw', phase: 'hw', asmLine: -1, cLine: 8,
      explain: '【ハードウェア自動処理】例外復帰 — スタックから8レジスタを自動復元',
      effect: `SP += 32（0x${SP_AFTER_HW.toString(16)} → 0x${SP0.toString(16)}）、R0〜R3・R12・LR・PC・xPSRを復元、モードをThread Modeに切り替え、mainの割り込み発生箇所に戻る`,
      update: {
        sp: SP0,
        lr: IRQ_LR,
        pc: IRQ_PC,
        mode: 'thread',
        regs: { r0: 0, r1: 1, r2: 0, r3: 0, r12: 0 },
        stackRemove: [
          SP_AFTER_HW,
          SP_AFTER_HW + 4,
          SP_AFTER_HW + 8,
          SP_AFTER_HW + 12,
          SP_AFTER_HW + 16,
          SP_AFTER_HW + 20,
          SP_AFTER_HW + 24,
          SP_AFTER_HW + 28,
        ],
        metaRemove: [
          SP_AFTER_HW,
          SP_AFTER_HW + 4,
          SP_AFTER_HW + 8,
          SP_AFTER_HW + 12,
          SP_AFTER_HW + 16,
          SP_AFTER_HW + 20,
          SP_AFTER_HW + 24,
          SP_AFTER_HW + 28,
        ],
        frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
      },
    },
  ],
}
