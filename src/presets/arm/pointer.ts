import type { PresetData } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'

const SP0 = BASE_SP_ARM
const X_ADDR = SP0 - 8  // x のスタック上のアドレス

export const armPointer: PresetData = {
  id: 'pointer',
  name: 'ポインタとアドレス',
  arch: 'arm',

  cCode: [
    'int main() {',
    '    int x = 42;',
    '    int *ptr;',
    '    ptr = &x;        // xのアドレスを取得',
    '    *ptr = 100;      // ポインタ経由で書き込み',
    '    int y = *ptr;    // ポインタ経由で読み込み',
    '    return y;',
    '}',
  ],

  asmCode: [
    { text: '; === プロローグ ===', isHeader: true, phase: 'main' },
    { text: '    PUSH {LR}' },
    { text: '    SUB  SP, SP, #12    ; x, ptr, y 用の領域' },
    { text: '' },
    { text: '; === int x = 42 ===', isHeader: true, phase: 'main' },
    { text: '    MOV  R0, #42' },
    { text: '    STR  R0, [SP, #0]   ; x = 42' },
    { text: '' },
    { text: '; === ptr = &x ===', isHeader: true, phase: 'main' },
    { text: '    ADD  R4, SP, #0     ; R4 = &x（SP+0 = xのアドレス）' },
    { text: '    STR  R4, [SP, #4]   ; ptr = &x（ptrをスタックに保存）' },
    { text: '' },
    { text: '; === *ptr = 100 ===', isHeader: true, phase: 'main' },
    { text: '    LDR  R4, [SP, #4]   ; R4 = ptr（ポインタの値 = xのアドレス）' },
    { text: '    MOV  R0, #100' },
    { text: '    STR  R0, [R4]       ; *ptr = 100（R4が指すアドレスに書き込み）' },
    { text: '' },
    { text: '; === y = *ptr ===', isHeader: true, phase: 'main' },
    { text: '    LDR  R4, [SP, #4]   ; R4 = ptr（ポインタの値 = xのアドレス）' },
    { text: '    LDR  R5, [R4]       ; y = *ptr（R4が指すアドレスから読み込み）' },
  ],

  initialState: {
    regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
    sp: SP0,
    fp: 0,
    lr: 0x08000001,
    pc: 0,
    stack: {},
    stackMeta: {},
    flags: { zero: false, negative: false, carry: false, overflow: false },
    mode: 'thread',
    frames: [],
  },

  steps: [
    {
      type: 'sw', phase: 'main', asmLine: 1, cLine: 0,
      explain: 'PUSH {LR} — LRをスタックに保存',
      effect: 'SP -= 4、[SP] = LR',
      update: {
        sp: SP0 - 4,
        stackSet: { [SP0 - 4]: 0x08000001 },
        metaSet: { [SP0 - 4]: { label: '保存 LR', kind: 'sw' } },
        frames: [{ name: 'main', lo: SP0 - 4, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'SUB SP, SP, #12 — ローカル変数用の領域を確保',
      effect: 'SP -= 12（x: 4バイト、ptr: 4バイト、y: 4バイト）',
      update: {
        sp: SP0 - 16,
        frames: [{ name: 'main', lo: SP0 - 16, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 5, cLine: 1,
      explain: 'MOV R0, #42',
      effect: 'R0 = 42',
      update: { regs: { r0: 42 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 6, cLine: 1,
      explain: 'STR R0, [SP, #0] — x = 42 をスタックに保存',
      effect: `[SP+0] = [0x${(SP0 - 16).toString(16)}] = 42`,
      update: {
        stackSet: { [SP0 - 16]: 42 },
        metaSet: { [SP0 - 16]: { label: 'x = 42', kind: 'sw' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 9, cLine: 3,
      explain: 'ADD R4, SP, #0 — R4 = SP + 0 = x のアドレス（&x）',
      effect: `R4 = 0x${(SP0 - 16).toString(16)}（xのスタック上のアドレス。x86のleaに相当）`,
      isPtr: true,
      update: { regs: { r4: SP0 - 16 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 10, cLine: 3,
      explain: 'STR R4, [SP, #4] — ptr に xのアドレスを格納',
      effect: `[SP+4] = 0x${(SP0 - 16).toString(16)}（ptrにアドレス値を保存）`,
      isPtr: true,
      update: {
        stackSet: { [SP0 - 12]: SP0 - 16 },
        metaSet: { [SP0 - 12]: { label: `ptr = 0x${(SP0 - 16).toString(16)}`, kind: 'ptr' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 13, cLine: 4,
      explain: 'LDR R4, [SP, #4] — ptr の値（xのアドレス）をR4にロード（ステップ1/2）',
      effect: `R4 = [SP+4] = 0x${(SP0 - 16).toString(16)}（まずポインタの値＝アドレスを取得）`,
      isPtr: true,
      update: { regs: { r4: SP0 - 16 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 14, cLine: 4,
      explain: 'MOV R0, #100',
      effect: 'R0 = 100',
      update: { regs: { r0: 100 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 15, cLine: 4,
      explain: 'STR R0, [R4] — R4が指すアドレスに100を書き込み（間接参照、ステップ2/2）',
      effect: `[0x${(SP0 - 16).toString(16)}] = 100（*ptr = 100）`,
      isPtr: true,
      update: {
        stackSet: { [SP0 - 16]: 100 },
        metaSet: { [SP0 - 16]: { label: 'x = 100', kind: 'sw' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 18, cLine: 5,
      explain: 'LDR R4, [SP, #4] — ptr の値をR4にロード（ステップ1/2）',
      effect: `R4 = 0x${(SP0 - 16).toString(16)}（アドレスを取得）`,
      isPtr: true,
      update: { regs: { r4: SP0 - 16 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 19, cLine: 5,
      explain: 'LDR R5, [R4] — R4が指すアドレスから値を読み込み（間接参照、ステップ2/2）',
      effect: `R5 = [0x${(SP0 - 16).toString(16)}] = 100（y = *ptr = 100）`,
      isPtr: true,
      update: { regs: { r5: 100 } },
    },
  ],
}
