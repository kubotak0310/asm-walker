import type { PresetData } from '@/core/types'
import { BASE_SP_ARM } from '@/core/types'

const SP0 = BASE_SP_ARM

export const armFuncCall: PresetData = {
  id: 'funcCall',
  name: '関数呼び出し',
  arch: 'arm',

  cCode: [
    'int add(int a, int b) {',
    '    return a + b;',
    '}',
    '',
    'int main() {',
    '    return add(3, 5);',
    '}',
  ],

  asmCode: [
    { text: '; === main (caller) ===', isHeader: true, phase: 'caller' },
    { text: '    MOV  R0, #3         ; 第1引数 a = 3' },
    { text: '    MOV  R1, #5         ; 第2引数 b = 5' },
    { text: '    BL   add            ; add呼び出し（LR = 戻りアドレス）' },
    { text: '    BX   LR             ; main から戻る' },
    { text: '' },
    { text: '; === add (callee) ===', isHeader: true, phase: 'callee' },
    { text: '    PUSH {R4, LR}       ; R4とLRを保存' },
    { text: '    MOV  R4, R0         ; R4 = a（R0は ADDS で上書きされるため退避）' },
    { text: '    ADDS R0, R4, R1     ; R0 = a + b（戻り値）' },
    { text: '    POP  {R4, PC}       ; R4復元、LR→PCにポップ（= return）' },
  ],

  initialState: {
    regs: { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0, r8: 0, r9: 0, r10: 0, r11: 0, r12: 0 },
    sp: SP0,
    fp: 0,
    lr: 0x00000001,
    pc: 0x08000000,
    stack: {},
    stackMeta: {},
    flags: { zero: false, negative: false, carry: false, overflow: false },
    mode: 'thread',
    frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
  },

  steps: [
    {
      type: 'sw', phase: 'caller', asmLine: 1, cLine: 5,
      explain: 'MOV R0, #3 — 第1引数をR0にセット',
      effect: 'R0 = 3（AAPCS: 第1引数はR0）',
      update: { regs: { r0: 3 } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 2, cLine: 5,
      explain: 'MOV R1, #5 — 第2引数をR1にセット',
      effect: 'R1 = 5（AAPCS: 第2引数はR1）',
      update: { regs: { r1: 5 } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 3, cLine: 5,
      explain: 'BL add — 関数 add を呼び出す（Branch with Link）',
      effect: 'LR = 次の命令アドレス（戻りアドレス）、PC = add の先頭。x86のcallとの違い：スタックを使わずLRに格納！',
      update: { lr: 0x08000009, pc: 0x08000010 },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 7, cLine: 0,
      explain: 'PUSH {R4, LR} — R4（callee保存）とLR（戻りアドレス）をスタックに退避',
      effect: 'SP -= 8、[SP+0] = R4、[SP+4] = LR（0x08000009）',
      update: {
        sp: SP0 - 8,
        stackSet: { [SP0 - 8]: 0, [SP0 - 4]: 0x08000009 },
        metaSet: {
          [SP0 - 8]: { label: '保存 R4', kind: 'sw' },
          [SP0 - 4]: { label: '保存 LR', kind: 'sw' },
        },
        frames: [
          { name: 'main', lo: SP0, hi: SP0, color: 'purple' },
          { name: 'add', lo: SP0 - 8, hi: SP0, color: 'green' },
        ],
      },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 8, cLine: 0,
      explain: 'MOV R4, R0 — a を R4 に退避（ADDS で R0 が上書きされるため）',
      effect: 'R4 = R0 = 3',
      update: { regs: { r4: 3 } },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 9, cLine: 1,
      explain: 'ADDS R0, R4, R1 — R0 = R4 + R1（a + b）',
      effect: 'R0 = 3 + 5 = 8（Sサフィックス: フラグも更新）',
      update: { regs: { r0: 8 }, flags: { zero: false, negative: false } },
    },
    {
      type: 'sw', phase: 'ret', asmLine: 10, cLine: 2,
      explain: 'POP {R4, PC} — R4を復元し、スタックの戻りアドレスをPCにポップ（関数から戻る）',
      effect: 'R4 = [SP+0] = 0、PC = [SP+4] = 0x08000009（mainに戻る）、SP += 8',
      update: {
        regs: { r4: 0 },
        sp: SP0,
        pc: 0x08000009,
        stackRemove: [SP0 - 8, SP0 - 4],
        metaRemove: [SP0 - 8, SP0 - 4],
        frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 4, cLine: 5,
      explain: 'BX LR — LRにある戻りアドレスにジャンプしてmainから戻る',
      effect: 'PC = LR = 0x00000001（起動コードに戻る）。R0 = 8 が戻り値',
      update: { pc: 0x00000001 },
    },
  ],
}
