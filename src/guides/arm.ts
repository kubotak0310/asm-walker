import type { GuideData } from './x86'

export const armGuides: Record<string, GuideData> = {
  funcCall: {
    goal: 'BL命令によるLRへの戻りアドレス保存と、PUSH/POPによるフレーム管理を理解する',
    highlights: [
      { step: 0, text: 'R0/R1 に引数をセット（AAPCS: 第1引数=R0、第2引数=R1）' },
      { step: 2, text: 'BL add: LR = 次の命令アドレス、PC = add。スタックを使わずLRに保存！（x86のcallと大きな違い）' },
      { step: 3, text: 'PUSH {R4, LR}: callee-saved R4 と 戻りアドレス LR をスタックに退避' },
      { step: 6, text: 'POP {R4, PC}: R4を復元し、LRをPCに直接ポップ（これがreturnの実体）' },
    ],
    tips: [
      'AAPCS（ARM Procedure Call Standard）: 引数はR0〜R3、戻り値はR0',
      'BLは「LR = PC+4; PC = target」（call = push + jmp のx86と違いスタック不使用）',
      'PUSH {R4, LR} して POP {R4, PC} で復帰するのがARMの典型パターン',
      'ネスト呼び出しがない場合はLRを保存しなくてよい（leaf function 最適化）',
    ],
    diffs: [
      { aspect: '戻りアドレスの保存', x86: 'callでスタックにプッシュ', arm: 'BLでLRレジスタに保存' },
      { aspect: '第1引数', x86: 'RDI/EDI', arm: 'R0' },
      { aspect: '第2引数', x86: 'RSI/ESI', arm: 'R1' },
      { aspect: '戻り値', x86: 'RAX/EAX', arm: 'R0' },
      { aspect: '関数の戻り方', x86: 'ret（スタックからPC復元）', arm: 'BX LR（LRからPC復元）' },
    ],
  },

  arithmetic: {
    goal: 'ARM の3オペランド命令形式と、SDIV による前準備不要の除算を理解する',
    highlights: [
      { step: 2, text: 'ADDS R2, R0, R1: 結果をR2に書く（元のR0/R1を破壊しない! x86の2オペランドと大きな違い）' },
      { step: 3, text: 'SUBS R3, R0, R1: 同様に3オペランド' },
      { step: 4, text: 'MUL R4, R0, R1: 乗算（Sサフィックスなし）' },
      { step: 5, text: 'SDIV R5, R0, R1: RDX:RAXの準備不要！1命令で除算完了（x86との最大の違い）' },
    ],
    tips: [
      'Sサフィックス（ADDS, SUBS）付きでフラグを更新、なし（ADD, SUB）では更新しない',
      '3オペランド形式: Rd = Rn OP Rm（デスティネーションを明示できる）',
      'SDIV は ARMv7-M/Cortex-M3以上で使用可能（Cortex-M0はサポートなし）',
    ],
    diffs: [
      { aspect: 'オペランド形式', x86: '2オペランド（add eax, ebx → eaxに上書き）', arm: '3オペランド（ADDS R0, R1, R2 → 結果をR0に）' },
      { aspect: '除算の前準備', x86: 'RDX:RAXの128bitで計算（RDXのクリアが必須）', arm: 'SDIV R0, R1, R2 — 前準備不要' },
      { aspect: '余り', x86: 'idiv実行後にRDXに残る', arm: 'SDIVには余り命令なし（MSRCPを使う）' },
    ],
  },

  branch: {
    goal: 'CMP+BLT による符号付き条件分岐と、CBZ（Thumb-2固有）の1命令ゼロ分岐を理解する',
    highlights: [
      { step: 2, text: 'CMP R0, R1: R0 - R1 でフラグ更新（x86 の cmp と同じ仕組み）' },
      { step: 3, text: 'BLT: N≠V なら分岐（x86のjlと同じ条件）' },
      { step: 4, text: 'MOV R2, #0: c = 0' },
      { step: 5, text: 'CBZ R2, zero: R2==0 なら分岐（Compare and Branch if Zero）— x86では test+jzの2命令が必要！' },
    ],
    tips: [
      'CBZ/CBNZ は Thumb-2 固有の便利命令（ゼロ比較+分岐を1命令で実現）',
      'ARM の条件コードは CPSR の N, Z, C, V フラグ（x86の SF, ZF, CF, OF に対応）',
      '全命令に条件サフィックス付加可（ADDEQ, MOVNE 等）— x86にはない機能',
    ],
    diffs: [
      { aspect: 'ゼロ比較分岐', x86: 'test eax,eax + jz（2命令）', arm: 'CBZ R0, label（1命令）— Thumb-2の便利機能' },
      { aspect: '条件コード', x86: 'EFLAGS（ZF, SF, OF, CF）', arm: 'CPSR（Z, N, C, V）— 名前が違うが意味は同じ' },
      { aspect: '条件付き実行', x86: '条件付きジャンプのみ', arm: '全命令に条件サフィックス付加可（ADDEQ, MOVNE 等）' },
    ],
  },

  pointer: {
    goal: 'ADD SP,#n による&演算子の実装と、LDR/STR による間接参照の2ステップ構造を理解する',
    highlights: [
      { step: 4, text: 'ADD R4, SP, #0: R4 = SP+0 = xのアドレス（&x）— x86のlea rax,[rbp-4]に相当' },
      { step: 5, text: 'STR R4, [SP, #4]: ptrにアドレス値を格納' },
      { step: 6, text: '*ptr = 100 は2命令: まずLDRでアドレスを取得' },
      { step: 8, text: 'STR R0, [R4]: R4のアドレスに書き込み（間接参照の実体）' },
    ],
    tips: [
      'ADD Rn, SP, #n でスタック上の変数のアドレスを取得できる（x86のlea相当）',
      'ポインタの間接参照は常に2ステップ: (1)アドレスロード、(2)そのアドレスでLDR/STR',
      'LDR Rn, [Rm] は「Rmが指すアドレスのメモリから読み込む」',
    ],
  },

  array: {
    goal: '配列の先頭アドレス渡しと、[R4, #n] オフセットアクセスによる要素アクセスを理解する',
    highlights: [
      { step: 8, text: 'MOV R0, SP: arrの先頭アドレスをR0に（配列全体はコピーされない！）' },
      { step: 10, text: 'BL sum_array: R0 = 先頭アドレス、R1 = 要素数で呼び出し' },
      { step: 11, text: 'MOV R4, R0: arrポインタをcallee-saved R4に退避（呼び出しでR0が変わるため）' },
      { step: 13, text: 'LDR R3, [R4, #0]: R4（先頭アドレス）+オフセット0でa[0]にアクセス' },
      { step: 15, text: '[R4, #4]: オフセット4バイト → a[1]' },
      { step: 17, text: '[R4, #8]: オフセット8バイト → a[2]' },
    ],
    tips: [
      '配列は常にポインタ渡し（先頭アドレスのみ）— コピーは発生しない',
      'arr[i] は [R4, i*4]（int は4バイトなのでオフセット = i × 4）',
      'R4〜R11はcallee-saved（呼び出しで保存が必要、R0〜R3は呼び出しで破壊される可能性）',
    ],
  },

  interrupt: {
    goal: 'Cortex-M の例外スタックフレーム（ハードウェア自動退避）とEXC_RETURNの仕組みを理解する',
    highlights: [
      { step: 0, text: '【HW】割り込み発生時にCPUが自動で8レジスタを退避（アセンブラ命令なし！）— ISRをC関数として書ける理由' },
      { step: 0, text: 'LR = 0xFFFFFFF9（EXC_RETURN値）: ビット構造で復帰後の状態を指定' },
      { step: 5, text: 'BX LR with LR=0xFFFFFFF9: 特殊アドレスへのジャンプで例外復帰をトリガー' },
      { step: 6, text: '【HW】復帰時に8レジスタを自動復元してThread Modeに戻る' },
    ],
    tips: [
      'EXC_RETURN = 0xFFFFFFF9: Thread Mode / MSP使用で復帰（ベアメタル組み込みで最も一般的）',
      'HW自動退避があるのでISRはC関数として書ける（プロローグ不要）',
      '例外スタックフレームの8レジスタ（積む順）: xPSR, PC, LR, R12, R3, R2, R1, R0',
      'Handler Mode（ISR実行中）↔ Thread Mode（通常処理）の切り替えはハードウェアが自動管理',
    ],
  },
}
