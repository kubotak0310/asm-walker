import type { PresetData } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'

export const armBranch: PresetData = {
  id: 'branch',
  name: '条件分岐',
  arch: 'arm',

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
    { text: '    MOV  R0, #5         ; a = 5' },
    { text: '    MOV  R1, #10        ; b = 10' },
    { text: '' },
    { text: '; === if (a < b) ===', isHeader: true, phase: 'main' },
    { text: '    CMP  R0, R1         ; フラグ更新（R0 - R1 の結果でフラグのみ更新）' },
    { text: '    BLT  less           ; N≠V なら .less へジャンプ（符号付き小なり）' },
    { text: '    ; ここには来ない' },
    { text: 'less:' },
    { text: '' },
    { text: '; === if (c == 0) ===', isHeader: true, phase: 'main' },
    { text: '    MOV  R2, #0         ; c = 0' },
    { text: '    CBZ  R2, zero       ; R2 == 0 ならジャンプ（Compare and Branch if Zero）' },
    { text: '    ; ここには来ない' },
    { text: 'zero:' },
  ],

  initialState: {
    regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
    sp: BASE_SP_ARM,
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
      explain: 'MOV R0, #5 — a = 5 をR0に',
      effect: 'R0 = 5',
      update: { regs: { r0: 5 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'MOV R1, #10 — b = 10 をR1に',
      effect: 'R1 = 10',
      update: { regs: { r1: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 5, cLine: 1,
      explain: 'CMP R0, R1 — R0 - R1 を計算してフラグのみ更新（x86の cmp と同様）',
      effect: '5 - 10 = -5 → N=1（負）、Z=0、C=0、V=0 → N≠V なので "less than" と判定',
      update: { flags: { zero: false, negative: true, carry: false, overflow: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 6, cLine: 1,
      explain: 'BLT less — N≠V（符号付き小なり）なら less へ分岐',
      effect: '条件成立（N=1, V=0 → N≠V）→ less にジャンプ',
      update: {},
    },
    {
      type: 'sw', phase: 'main', asmLine: 11, cLine: 4,
      explain: 'MOV R2, #0 — c = 0',
      effect: 'R2 = 0',
      update: { regs: { r2: 0 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 12, cLine: 5,
      explain: 'CBZ R2, zero — R2 == 0 なら zero へ分岐（Compare and Branch if Zero）',
      effect: '条件成立（R2=0）→ zero にジャンプ（x86のtest+jzと違い1命令でゼロ比較＋分岐できる！Thumb-2固有）',
      update: {},
    },
  ],
}
