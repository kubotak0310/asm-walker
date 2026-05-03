import type { PresetData } from '@/core/types'
import { BASE_SP_X86 } from '@/core/types'

const SP0 = BASE_SP_X86
const RET_ADDR = 0x401009
const ADD_ENTRY = 0x401010

export const x86FuncCall: PresetData = {
  id: 'funcCall',
  name: '関数呼び出し',
  arch: 'x86',

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
    { text: '    mov edi, 3' },
    { text: '    mov esi, 5' },
    { text: '    call add' },
    { text: '    ret' },
    { text: '' },
    { text: '; === add (callee) ===', isHeader: true, phase: 'callee' },
    { text: '    push rbp' },
    { text: '    mov rbp, rsp' },
    { text: '    mov eax, edi' },
    { text: '    add eax, esi' },
    { text: '    pop rbp' },
    { text: '    ret' },
  ],

  initialState: {
    regs: { rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0 },
    sp: SP0,
    fp: 0,
    lr: 0,
    pc: 0x401000,
    stack: {},
    stackMeta: {},
    flags: { zero: false, negative: false, carry: false, overflow: false },
    mode: 'thread',
    frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
  },

  steps: [
    {
      type: 'sw', phase: 'caller', asmLine: 1, cLine: 5,
      explain: 'mov edi, 3 — 第1引数をEDIレジスタにセット',
      effect: 'EDI = 3（System V ABIでは第1引数はRDI/EDI）',
      update: { regs: { rdi: 3 } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 2, cLine: 5,
      explain: 'mov esi, 5 — 第2引数をESIレジスタにセット',
      effect: 'ESI = 5（System V ABIでは第2引数はRSI/ESI）',
      update: { regs: { rsi: 5 } },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 3, cLine: 5,
      explain: 'call add — 関数addを呼び出す',
      effect: `戻りアドレス(0x${RET_ADDR.toString(16)})をスタックに積み、addにジャンプ`,
      update: {
        sp: SP0 - 8,
        pc: ADD_ENTRY,
        stackSet: { [SP0 - 8]: RET_ADDR },
        metaSet: { [SP0 - 8]: { label: '戻りアドレス', kind: 'sw' } },
        frames: [{ name: 'main', lo: SP0 - 8, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 7, cLine: 0,
      explain: 'push rbp — 呼び出し元のRBP（フレームポインタ）を保存',
      effect: 'RSP -= 8、[RSP] = 呼び出し元RBP（この時点では0）',
      update: {
        sp: SP0 - 16,
        stackSet: { [SP0 - 16]: 0 },
        metaSet: { [SP0 - 16]: { label: '保存 RBP', kind: 'sw' } },
        frames: [
          { name: 'main', lo: SP0 - 8, hi: SP0, color: 'purple' },
          { name: 'add', lo: SP0 - 16, hi: SP0 - 8, color: 'green' },
        ],
      },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 8, cLine: 0,
      explain: 'mov rbp, rsp — 新しいフレームポインタをセット',
      effect: 'RBP = RSP（現在のスタックポインタをフレームポインタに設定）',
      update: { fp: SP0 - 16 },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 9, cLine: 1,
      explain: 'mov eax, edi — 引数aをEAXに移動',
      effect: 'EAX = EDI = 3',
      update: { regs: { rax: 3 } },
    },
    {
      type: 'sw', phase: 'callee', asmLine: 10, cLine: 1,
      explain: 'add eax, esi — EAX = EAX + ESI（a + b）',
      effect: 'EAX = 3 + 5 = 8（戻り値はEAX/RAXに格納）',
      update: { regs: { rax: 8 } },
    },
    {
      type: 'sw', phase: 'ret', asmLine: 11, cLine: 2,
      explain: 'pop rbp — 保存していたRBPを復元',
      effect: 'RBP = [RSP] = 0（元の値）、RSP += 8',
      update: {
        fp: 0,
        sp: SP0 - 8,
        stackRemove: [SP0 - 16],
        metaRemove: [SP0 - 16],
        frames: [{ name: 'main', lo: SP0 - 8, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'ret', asmLine: 12, cLine: 2,
      explain: 'ret — スタックから戻りアドレスをポップしてジャンプ',
      effect: `PC = [RSP] = 0x${RET_ADDR.toString(16)}、RSP += 8（addから戻る）`,
      update: {
        sp: SP0,
        pc: RET_ADDR,
        stackRemove: [SP0 - 8],
        metaRemove: [SP0 - 8],
        frames: [{ name: 'main', lo: SP0, hi: SP0, color: 'purple' }],
      },
    },
    {
      type: 'sw', phase: 'caller', asmLine: 4, cLine: 5,
      explain: 'ret — mainから戻る（EAXに戻り値8が入っている）',
      effect: 'EAX = 8でプログラムを終了',
      update: {},
    },
  ],
}
