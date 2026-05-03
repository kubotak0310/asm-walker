export interface GuideHighlight {
  step: number
  text: string
}

export interface GuideDiff {
  aspect: string
  x86: string
  arm: string
}

export interface GuideData {
  goal: string
  highlights: GuideHighlight[]
  tips: string[]
  diffs?: GuideDiff[]
}

export const x86Guides: Record<string, GuideData> = {
  funcCall: {
    goal: 'call/ret 命令によるスタックフレームの生成と、引数・戻り値の渡し方を理解する',
    highlights: [
      { step: 0, text: 'EDI/ESI に引数をセット（System V ABI: 第1引数=RDI、第2引数=RSI）' },
      { step: 2, text: 'call 命令: 戻りアドレスをスタックにプッシュし add にジャンプ。スタックを見てみよう！' },
      { step: 3, text: 'push rbp: 呼び出し元のフレームポインタを保存（callee責任）' },
      { step: 4, text: 'mov rbp, rsp: 新しいフレームのベースを設定（スタックフレームの確立）' },
      { step: 7, text: 'pop rbp: フレームポインタを復元（プロローグの逆）' },
      { step: 8, text: 'ret 命令: スタックから戻りアドレスをポップして mainに戻る' },
    ],
    tips: [
      'System V AMD64 ABI: 引数は RDI, RSI, RDX, RCX, R8, R9 の順',
      '戻り値は RAX/EAX に格納',
      'call は「SP -= 8; [SP] = 次のPC; PC = 関数先頭」の3操作',
      'ret は「PC = [SP]; SP += 8」の逆操作',
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
    goal: 'x86-64 の四則演算命令と、idiv の特殊な前準備（RDX クリア）を理解する',
    highlights: [
      { step: 2, text: 'add ecx, ebx: 2オペランド形式（ECX = ECX + EBX）— 元の値が上書きされる' },
      { step: 3, text: 'sub: 同様に2オペランド' },
      { step: 6, text: 'imul ecx, ebx: 符号付き乗算（2オペランド）' },
      { step: 7, text: 'xor rdx, rdx: RDXを0にする（idivの必須前準備）— これを忘れると不正な計算に！' },
      { step: 8, text: 'idiv rbx: RDX:RAXを被除数として計算（商→RAX、余り→RDX）' },
    ],
    tips: [
      'idiv の前に必ず「xor rdx, rdx」または「cdq」でRDXをクリアする（0除算より厄介なバグになる）',
      '「xor reg, reg」は「mov reg, 0」より1バイト短くて高速なゼロクリアの慣用表現',
      'ARM の SDIV と違い、x86 の idiv は余りも計算してRDXに残す',
    ],
    diffs: [
      { aspect: 'オペランド形式', x86: '2オペランド（add eax, ebx → eaxに上書き）', arm: '3オペランド（ADDS R0, R1, R2 → 結果をR0に）' },
      { aspect: '除算の前準備', x86: 'RDX:RAXの128bitで計算（RDXのクリアが必須）', arm: 'SDIV R0, R1, R2 — 前準備不要' },
      { aspect: '余り', x86: 'idiv実行後にRDXに残る', arm: 'SDIVには余り命令なし（MSRCPを使う）' },
    ],
  },

  branch: {
    goal: 'cmp/jl によるフラグを使った条件分岐と、test/jz によるゼロ判定を理解する',
    highlights: [
      { step: 2, text: 'cmp: EAX - EBX の結果でフラグのみ更新（計算結果は捨てる）' },
      { step: 3, text: 'jl: SF ≠ OF ならジャンプ（符号付き小なり判定）— フラグの組み合わせに注目' },
      { step: 4, text: 'xor eax, eax: c = 0（高速ゼロクリアの慣用表現）' },
      { step: 5, text: 'test eax, eax: EAX AND EAX でフラグのみ更新（cmp eax,0 の高速版）' },
      { step: 6, text: 'jz: ZF=1 ならジャンプ（ゼロフラグ立っていれば分岐）' },
    ],
    tips: [
      'cmp は「比較のためだけに引き算する」命令（結果はフラグにのみ記録）',
      'test は「ビット確認のためだけにANDする」命令（ゼロ確認に最適）',
      'jl（signed less）は SF≠OF で判定（符号付き数の大小比較）',
    ],
    diffs: [
      { aspect: 'ゼロ比較分岐', x86: 'test eax,eax + jz（2命令）', arm: 'CBZ R0, label（1命令）— Thumb-2の便利機能' },
      { aspect: '条件コード', x86: 'EFLAGS（ZF, SF, OF, CF）', arm: 'CPSR（Z, N, C, V）— 名前が違うが意味は同じ' },
      { aspect: '条件付き実行', x86: '条件付きジャンプのみ', arm: '全命令に条件サフィックス付加可（ADDEQ, MOVNE 等）' },
    ],
  },

  pointer: {
    goal: 'lea命令による&演算子と、2ステップの間接参照（アドレス取得→アクセス）の仕組みを理解する',
    highlights: [
      { step: 3, text: 'mov [rbp-4], 42: xの値をスタックに格納' },
      { step: 4, text: 'lea rax, [rbp-4]: RAX = xのアドレス（メモリにアクセスせずアドレス計算だけ）' },
      { step: 6, text: '*ptr = 100 は2命令: まず mov rax,[rbp-8] でアドレスをロード' },
      { step: 7, text: 'mov [rax], 100: RAXのアドレスに書き込み（間接参照の実体）' },
      { step: 8, text: 'y = *ptr も同様に2命令: アドレスロード → そのアドレスから読み込み' },
    ],
    tips: [
      'lea（Load Effective Address）はアドレスを計算するだけでメモリアクセスしない',
      'ポインタの間接参照は常に2ステップ: (1)アドレス取得、(2)そのアドレスのメモリアクセス',
      '[rax] はRAXが保持するアドレスのメモリを意味する（RAXを引数として「その先」を見る）',
    ],
  },

  array: {
    goal: '配列が「先頭アドレスのみ渡される」ことと、[rdi+n] オフセットアクセスの仕組みを理解する',
    highlights: [
      { step: 4, text: 'mov rdi, rsp: arr の先頭アドレスをRDIに設定（配列全体はコピーされない！）' },
      { step: 7, text: 'xor eax, eax: s = 0（sum の初期化）' },
      { step: 8, text: 'add eax, [rdi+0]: RDI（先頭アドレス）+オフセット0でa[0]にアクセス' },
      { step: 9, text: '[rdi+4]: オフセット4 = int(4バイト) × 1 → a[1]' },
      { step: 10, text: '[rdi+8]: オフセット8 = int(4バイト) × 2 → a[2]' },
    ],
    tips: [
      '配列は常にポインタ渡し（先頭アドレスのみ）— コピーは発生しない',
      'arr[i] は [rdi + i*4]（int は4バイトなのでオフセット = i × sizeof(int)）',
      '関数内では配列の長さを知る方法がない（だからnを別引数で渡す）',
    ],
  },
}
