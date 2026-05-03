import type { PresetData } from '@/core/types'
import { BASE_SP_X86 } from '@/core/types'

const SP0 = BASE_SP_X86

export const x86Arithmetic: PresetData = {
  id: 'arithmetic',
  name: '四則演算',
  arch: 'x86',

  cCode: [
    'int a = 10, b = 3;',
    'int sum  = a + b;   // 13',
    'int diff = a - b;   // 7',
    'int prod = a * b;   // 30',
    'int quot = a / b;   // 3',
  ],

  asmCode: [
    { text: '; === 値の初期化 ===', isHeader: true, phase: 'main' },
    { text: '    mov eax, 10      ; a = 10' },
    { text: '    mov ebx, 3       ; b = 3' },
    { text: '' },
    { text: '; === 加算 ===', isHeader: true, phase: 'main' },
    { text: '    mov ecx, eax     ; ecx = a' },
    { text: '    add ecx, ebx     ; ecx = a + b' },
    { text: '' },
    { text: '; === 減算 ===', isHeader: true, phase: 'main' },
    { text: '    mov ecx, eax     ; ecx = a' },
    { text: '    sub ecx, ebx     ; ecx = a - b' },
    { text: '' },
    { text: '; === 乗算 ===', isHeader: true, phase: 'main' },
    { text: '    mov ecx, eax     ; ecx = a' },
    { text: '    imul ecx, ebx    ; ecx = a * b' },
    { text: '' },
    { text: '; === 除算（注意: RDXを0にする必要あり）===', isHeader: true, phase: 'main' },
    { text: '    xor rdx, rdx     ; RDX:RAX の上位をゼロクリア（必須）' },
    { text: '    idiv rbx         ; RAX = EAX / EBX, RDX = 余り' },
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
      explain: 'mov eax, 10 — EAXに10（変数a）をロード',
      effect: 'EAX = 10',
      update: { regs: { rax: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'mov ebx, 3 — EBXに3（変数b）をロード',
      effect: 'EBX = 3',
      update: { regs: { rbx: 3 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 5, cLine: 1,
      explain: 'mov ecx, eax — ECXにaをコピー（上書きを避けるため）',
      effect: 'ECX = 10',
      update: { regs: { rcx: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 6, cLine: 1,
      explain: 'add ecx, ebx — ECX += EBX（加算）',
      effect: 'ECX = 10 + 3 = 13（sum = 13）',
      update: { regs: { rcx: 13 }, flags: { zero: false, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 9, cLine: 2,
      explain: 'mov ecx, eax — ECXにaをコピー',
      effect: 'ECX = 10',
      update: { regs: { rcx: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 10, cLine: 2,
      explain: 'sub ecx, ebx — ECX -= EBX（減算）',
      effect: 'ECX = 10 - 3 = 7（diff = 7）',
      update: { regs: { rcx: 7 }, flags: { zero: false, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 13, cLine: 3,
      explain: 'mov ecx, eax — ECXにaをコピー',
      effect: 'ECX = 10',
      update: { regs: { rcx: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 14, cLine: 3,
      explain: 'imul ecx, ebx — ECX *= EBX（乗算）',
      effect: 'ECX = 10 × 3 = 30（prod = 30）',
      update: { regs: { rcx: 30 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 17, cLine: 4,
      explain: 'xor rdx, rdx — RDXを0にクリア（idiv前の必須準備）',
      effect: 'RDX = 0（idivはRDX:RAXの128bit値÷EBXを計算する）',
      update: { regs: { rdx: 0 }, flags: { zero: true } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 18, cLine: 4,
      explain: 'idiv rbx — 符号付き除算（RDX:RAX ÷ RBX）',
      effect: 'RAX = 10 ÷ 3 = 3（商）、RDX = 1（余り）',
      update: { regs: { rax: 3, rdx: 1 }, flags: { zero: false } },
    },
  ],
}
