import type { PresetData } from '@/core/types'
import { BASE_SP_X86 } from '@/core/types'

const SP0 = BASE_SP_X86
const ARR_BASE = SP0 - 32  // arr[3] のベースアドレス

export const x86Array: PresetData = {
  id: 'array',
  name: '配列を関数に渡す',
  arch: 'x86',

  cCode: [
    'int sum_array(int *a, int n) {',
    '    int s = 0;',
    '    s += a[0];',
    '    s += a[1];',
    '    s += a[2];',
    '    return s;',
    '}',
    '',
    'int main() {',
    '    int arr[3] = {1, 2, 3};',
    '    return sum_array(arr, 3);',
    '}',
  ],

  asmCode: [
    { text: '; === main ===', isHeader: true, phase: 'caller' },
    { text: '    sub rsp, 32        ; arr[3] + アライメント用' },
    { text: '    mov [rsp+0], 1     ; arr[0] = 1' },
    { text: '    mov [rsp+4], 2     ; arr[1] = 2' },
    { text: '    mov [rsp+8], 3     ; arr[2] = 3' },
    { text: '    mov rdi, rsp       ; 第1引数 = arr の先頭アドレス' },
    { text: '    mov esi, 3         ; 第2引数 = n = 3' },
    { text: '    call sum_array' },
    { text: '' },
    { text: '; === sum_array(rdi=arr, esi=n) ===', isHeader: true, phase: 'callee' },
    { text: '    xor eax, eax       ; s = 0' },
    { text: '    add eax, [rdi+0]   ; s += a[0]' },
    { text: '    add eax, [rdi+4]   ; s += a[1]' },
    { text: '    add eax, [rdi+8]   ; s += a[2]' },
    { text: '    ret' },
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
    frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
  },

  steps: [
    {
      type: 'sw', phase: 'caller', asmLine: 1, cLine: 9,
      explain: 'sub rsp, 32 — arr[3] のためにスタック領域を確保',
      effect: 'RSP -= 32（配列3要素 + アライメント）',
      update: {
        sp: ARR_BASE,
        frames: [{ name: 'main', lo: ARR_BASE, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 2, cLine: 9,
      explain: 'mov [rsp+0], 1 — arr[0] = 1 をスタックに書き込み',
      effect: '[RSP+0] = 1',
      isArr: true,
      update: {
        stackSet: { [ARR_BASE]: 1 },
        metaSet: { [ARR_BASE]: { label: 'arr[0] = 1', kind: 'arr' } },
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 3, cLine: 9,
      explain: 'mov [rsp+4], 2 — arr[1] = 2',
      effect: '[RSP+4] = 2',
      isArr: true,
      update: {
        stackSet: { [ARR_BASE + 4]: 2 },
        metaSet: { [ARR_BASE + 4]: { label: 'arr[1] = 2', kind: 'arr' } },
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 4, cLine: 9,
      explain: 'mov [rsp+8], 3 — arr[2] = 3',
      effect: '[RSP+8] = 3',
      isArr: true,
      update: {
        stackSet: { [ARR_BASE + 8]: 3 },
        metaSet: { [ARR_BASE + 8]: { label: 'arr[2] = 3', kind: 'arr' } },
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 5, cLine: 10,
      explain: 'mov rdi, rsp — arr の先頭アドレスを第1引数に設定',
      effect: `RDI = RSP = 0x${ARR_BASE.toString(16)}（配列はポインタ渡し—コピーなし）`,
      isArr: true,
      isPtr: true,
      update: { regs: { rdi: ARR_BASE } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 6, cLine: 10,
      explain: 'mov esi, 3 — 要素数3を第2引数に設定',
      effect: 'ESI = 3',
      update: { regs: { rsi: 3 } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 7, cLine: 10,
      explain: 'call sum_array — 関数呼び出し',
      effect: 'RDI = arr の先頭アドレス、ESI = 3 で sum_array を呼び出す',
      update: {
        sp: ARR_BASE - 8,
        stackSet: { [ARR_BASE - 8]: 0x401020 },
        metaSet: { [ARR_BASE - 8]: { label: '戻りアドレス', kind: 'sw' } },
        frames: [
          { name: 'main', lo: ARR_BASE, hi: SP0, color: 'purple' },
          { name: 'sum_array', lo: ARR_BASE - 8, hi: ARR_BASE, color: 'green' },
        ],
      },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 10, cLine: 1,
      explain: 'xor eax, eax — s = 0（EAXをゼロクリア）',
      effect: 'EAX = 0（sum初期化）',
      update: { regs: { rax: 0 }, flags: { zero: true } },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 11, cLine: 2,
      explain: 'add eax, [rdi+0] — s += a[0]（RDI基準オフセット0でa[0]にアクセス）',
      effect: 'EAX = 0 + [RDI+0] = 0 + 1 = 1',
      isArr: true,
      update: { regs: { rax: 1 } },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 12, cLine: 3,
      explain: 'add eax, [rdi+4] — s += a[1]（オフセット4 = 4バイト × 1要素目）',
      effect: 'EAX = 1 + [RDI+4] = 1 + 2 = 3',
      isArr: true,
      update: { regs: { rax: 3 } },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 13, cLine: 4,
      explain: 'add eax, [rdi+8] — s += a[2]（オフセット8 = 4バイト × 2要素目）',
      effect: 'EAX = 3 + [RDI+8] = 3 + 3 = 6',
      isArr: true,
      update: { regs: { rax: 6 } },
    },
    {
      type: 'sw', phase: 'ret', asmLine: 14, cLine: 5,
      explain: 'ret — sum_array から戻る（EAX = 6 が戻り値）',
      effect: 'EAX = 6、mainに戻る',
      update: {
        sp: ARR_BASE,
        stackRemove: [ARR_BASE - 8],
        metaRemove: [ARR_BASE - 8],
        frames: [{ name: 'main', lo: ARR_BASE, hi: SP0, color: 'purple' }],
      },
    },
  ],
}
