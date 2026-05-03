import type { PresetData } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'

export const armArithmetic: PresetData = {
  id: 'arithmetic',
  name: '四則演算',
  arch: 'arm',

  cCode: [
    'int a = 10, b = 3;',
    'int sum  = a + b;   // 13',
    'int diff = a - b;   // 7',
    'int prod = a * b;   // 30',
    'int quot = a / b;   // 3',
  ],

  asmCode: [
    { text: '; === 値の初期化 ===', isHeader: true, phase: 'main' },
    { text: '    MOV  R0, #10        ; a = 10' },
    { text: '    MOV  R1, #3         ; b = 3' },
    { text: '' },
    { text: '; === 加算 ===', isHeader: true, phase: 'main' },
    { text: '    ADDS R2, R0, R1     ; R2 = a + b（3オペランド形式）' },
    { text: '' },
    { text: '; === 減算 ===', isHeader: true, phase: 'main' },
    { text: '    SUBS R3, R0, R1     ; R3 = a - b' },
    { text: '' },
    { text: '; === 乗算 ===', isHeader: true, phase: 'main' },
    { text: '    MUL  R4, R0, R1     ; R4 = a * b（Sサフィックスなし、フラグ更新しない）' },
    { text: '' },
    { text: '; === 除算（ARM特有: SDIV命令）===', isHeader: true, phase: 'main' },
    { text: '    SDIV R5, R0, R1     ; R5 = a / b（余りは自動消滅、RDX初期化不要）' },
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
      explain: 'MOV R0, #10 — R0 に即値10をロード',
      effect: 'R0 = 10',
      update: { regs: { r0: 10 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 2, cLine: 0,
      explain: 'MOV R1, #3 — R1 に即値3をロード',
      effect: 'R1 = 3',
      update: { regs: { r1: 3 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 5, cLine: 1,
      explain: 'ADDS R2, R0, R1 — R2 = R0 + R1（3オペランド：デスティネーションが別）',
      effect: 'R2 = 10 + 3 = 13（x86の add ecx,ebx と違い結果を別レジスタに書ける）',
      update: { regs: { r2: 13 }, flags: { zero: false, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 8, cLine: 2,
      explain: 'SUBS R3, R0, R1 — R3 = R0 - R1',
      effect: 'R3 = 10 - 3 = 7',
      update: { regs: { r3: 7 }, flags: { zero: false, negative: false } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 11, cLine: 3,
      explain: 'MUL R4, R0, R1 — R4 = R0 × R1（乗算）',
      effect: 'R4 = 10 × 3 = 30（Sサフィックスなし: フラグ更新なし）',
      update: { regs: { r4: 30 } },
    },
    {
      type: 'sw', phase: 'main', asmLine: 14, cLine: 4,
      explain: 'SDIV R5, R0, R1 — R5 = R0 ÷ R1（符号付き除算）',
      effect: 'R5 = 10 ÷ 3 = 3（余りは自動消滅。x86と違いRDX初期化不要！）',
      update: { regs: { r5: 3 } },
    },
  ],
}
