import type { PresetData } from '@/core/types'
import { BASE_SP_X86 } from '@/core/types'

const SP0 = BASE_SP_X86
// x のアドレス: rbp - 4 → SP0 - 4 + (frameの分だけずれる)
// プロローグ後: RBP = SP0 - 8, x は [RBP-4] = SP0 - 12
const X_ADDR = SP0 - 12

export const x86Pointer: PresetData = {
  id: 'pointer',
  name: 'ポインタとアドレス',
  arch: 'x86',

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
    { text: '; === main プロローグ ===', isHeader: true, phase: 'main' },
    { text: '    push rbp' },
    { text: '    mov rbp, rsp' },
    { text: '    sub rsp, 16         ; x, ptr, y 用の領域' },
    { text: '' },
    { text: '; === int x = 42 ===', isHeader: true, phase: 'main' },
    { text: '    mov [rbp-4], 42     ; x = 42' },
    { text: '' },
    { text: '; === ptr = &x ===', isHeader: true, phase: 'main' },
    { text: '    lea rax, [rbp-4]    ; RAX = &x（xのアドレスを取得）' },
    { text: '    mov [rbp-8], rax    ; ptr = &x（ptrに格納）' },
    { text: '' },
    { text: '; === *ptr = 100 ===', isHeader: true, phase: 'main' },
    { text: '    mov rax, [rbp-8]    ; RAX = ptr（ポインタの値 = xのアドレス）' },
    { text: '    mov [rax], 100      ; *ptr = 100（RAXが指すアドレスに書き込み）' },
    { text: '' },
    { text: '; === y = *ptr ===', isHeader: true, phase: 'main' },
    { text: '    mov rax, [rbp-8]    ; RAX = ptr（ポインタの値 = xのアドレス）' },
    { text: '    mov ebx, [rax]      ; y = *ptr（RAXが指すアドレスから読み込み）' },
  ],

  initialState: {
    regs: { rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0 },
    sp: SP0,
    fp: 0,
    lr: 0,
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
      explain: 'push rbp — フレームポインタを保存',
      effect: 'RSP -= 8、[RSP] = RBP',
      update: {
        sp: SP0 - 8,
        stackSet: { [SP0 - 8]: 0 },
        metaSet: { [SP0 - 8]: { label: '保存 RBP', kind: 'sw' } },
        frames: [{ name: 'main', lo: SP0 - 8, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'mov rbp, rsp — フレームポインタを設定',
      effect: 'RBP = RSP',
      update: { fp: SP0 - 8 },
    },
    {
      type: 'sw', phase: 'main', asmLine: 3, cLine: 0,
      explain: 'sub rsp, 16 — ローカル変数領域を確保',
      effect: 'RSP -= 16',
      update: {
        sp: SP0 - 24,
        frames: [{ name: 'main', lo: SP0 - 24, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 6, cLine: 1,
      explain: 'mov [rbp-4], 42 — ローカル変数 x に 42 を代入',
      effect: `[RBP-4] = [0x${X_ADDR.toString(16)}] = 42`,
      update: {
        stackSet: { [X_ADDR]: 42 },
        metaSet: { [X_ADDR]: { label: 'x = 42', kind: 'sw' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 9, cLine: 3,
      explain: 'lea rax, [rbp-4] — x のアドレスをRAXに取得',
      effect: `RAX = RBP - 4 = 0x${X_ADDR.toString(16)}（&x、アドレスそのもの）`,
      isPtr: true,
      update: { regs: { rax: X_ADDR } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 10, cLine: 3,
      explain: 'mov [rbp-8], rax — ptr に xのアドレスを格納',
      effect: `[RBP-8] = 0x${X_ADDR.toString(16)}（ptrにアドレス値を保存）`,
      isPtr: true,
      update: {
        stackSet: { [X_ADDR - 4]: X_ADDR },
        metaSet: { [X_ADDR - 4]: { label: `ptr = 0x${X_ADDR.toString(16)}`, kind: 'ptr' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 13, cLine: 4,
      explain: 'mov rax, [rbp-8] — ptr の値（xのアドレス）をRAXにロード',
      effect: `RAX = [RBP-8] = 0x${X_ADDR.toString(16)}（ステップ1/2: まずアドレスを取得）`,
      isPtr: true,
      update: { regs: { rax: X_ADDR } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 14, cLine: 4,
      explain: 'mov [rax], 100 — RAXが指すアドレスに100を書き込み（間接参照）',
      effect: `[0x${X_ADDR.toString(16)}] = 100（*ptr = 100）（ステップ2/2: そのアドレスに書き込み）`,
      isPtr: true,
      update: {
        stackSet: { [X_ADDR]: 100 },
        metaSet: { [X_ADDR]: { label: 'x = 100', kind: 'sw' } },
      },
    },
    {
      type: 'sw', phase: 'main', asmLine: 17, cLine: 5,
      explain: 'mov rax, [rbp-8] — ptr の値をRAXにロード（ステップ1/2）',
      effect: `RAX = 0x${X_ADDR.toString(16)}（まずポインタの値＝アドレスを取得）`,
      isPtr: true,
      update: { regs: { rax: X_ADDR } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 18, cLine: 5,
      explain: 'mov ebx, [rax] — RAXが指すアドレスから値を読み込み（間接参照）',
      effect: `EBX = [0x${X_ADDR.toString(16)}] = 100（*ptr = 100）（ステップ2/2: そのアドレスから読み込み）`,
      isPtr: true,
      update: { regs: { rbx: 100 } },
    },
  ],
}
