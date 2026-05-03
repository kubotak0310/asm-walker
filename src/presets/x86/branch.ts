import type { PresetData } from '@/core/types'
import { BASE_SP_X86 } from '@/core/types'

export const x86Branch: PresetData = {
  id: 'branch',
  name: '条件分岐',
  arch: 'x86',

  cCode: [
    'int a = 5, b = 10;',
    'if (a < b) {',
    '    // a < b なので分岐する',
    '}',
    'int c = 0;',
    'if (c == 0) {',
    '    // c == 0 なので分岐する',
    '}',
  ],

  asmCode: [
    { text: '; === 変数セット ===', isHeader: true, phase: 'main' },
    { text: '    mov eax, 5       ; a = 5' },
    { text: '    mov ebx, 10      ; b = 10' },
    { text: '' },
    { text: '; === if (a < b) ===', isHeader: true, phase: 'main' },
    { text: '    cmp eax, ebx     ; フラグ更新（EAX - EBX を計算してフラグのみ更新）' },
    { text: '    jl  .less        ; ZF=0かつSF=OFならジャンプ（符号付き小なり）' },
    { text: '    ; ここには来ない' },
    { text: '.less:' },
    { text: '' },
    { text: '; === if (c == 0) ===', isHeader: true, phase: 'main' },
    { text: '    xor eax, eax     ; c = 0（xorで自分自身をクリア）' },
    { text: '    test eax, eax    ; フラグ更新（EAX AND EAX の結果でフラグのみ更新）' },
    { text: '    jz  .zero        ; ZF=1ならジャンプ（結果がゼロなら分岐）' },
    { text: '    ; ここには来ない' },
    { text: '.zero:' },
  ],

  initialState: {
    regs: { rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0 },
    sp: BASE_SP_X86,
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
      explain: 'mov eax, 5 — a = 5 をEAXに',
      effect: 'EAX = 5',
      update: { regs: { rax: 5 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'mov ebx, 10 — b = 10 をEBXに',
      effect: 'EBX = 10',
      update: { regs: { rbx: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 5, cLine: 1,
      explain: 'cmp eax, ebx — EAX - EBX を計算してフラグのみ更新（結果は捨てる）',
      effect: '5 - 10 = -5 → SF=1（負）、ZF=0、OF=0 → SF ≠ OF なので "less" と判定',
      update: { flags: { zero: false, negative: true, carry: true, overflow: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 6, cLine: 1,
      explain: 'jl .less — SF≠OF（符号付き小なり）なら .less へジャンプ',
      effect: '条件成立（SF=1, OF=0 → SF≠OF）→ .less にジャンプ',
      update: {},
    },
    {
      type: 'sw', phase: 'main', asmLine: 11, cLine: 4,
      explain: 'xor eax, eax — EAX = 0（c = 0 の慣用表現）',
      effect: 'EAX = 0、ZF=1（xorで同じ値を使うのが高速なゼロクリア手法）',
      update: { regs: { rax: 0 }, flags: { zero: true, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 12, cLine: 5,
      explain: 'test eax, eax — EAX AND EAX を計算してフラグのみ更新',
      effect: '0 AND 0 = 0 → ZF=1（ゼロフラグ立つ）',
      update: { flags: { zero: true, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 13, cLine: 5,
      explain: 'jz .zero — ZF=1（結果がゼロ）なら .zero へジャンプ',
      effect: '条件成立（ZF=1）→ .zero にジャンプ',
      update: {},
    },
  ],
}
