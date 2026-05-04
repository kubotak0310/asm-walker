# CLAUDE.md — Claude Code 向け開発ガイド

このファイルは Claude Code が `asm-walker` リポジトリで作業する際に参照するガイドです。

---

## プロジェクト概要

**AsmWalker** — ARM Cortex-M / x86-64 アセンブラの学習ツール。ブラウザ上でCコードとアセンブラを対応表示しながら1命令ずつステップ実行できる。

- **SPEC.md**: 機能要件・プリセット仕様・画面構成
- **ARCHITECTURE.md**: 技術構成・ディレクトリ設計・型定義

---

## 現在のフェーズ

**フェーズ3完了**

### フェーズ1.5で完成した機能
- x86-64 / ARM Cortex-M のステップ実行シミュレーター（Vue 3 + TypeScript）
- 6プリセット（x86/ARM切り替え）+ 割り込みプリセット（ARM専用）
- 学習ガイドパネル・スタックフレーム色分け図（FrameViz）統合済み
- スタックメモリのセルハイライト（紫=ポインタ値、緑=配列要素、橙=HW自動処理）
- スタックメモリの左ボーダーでフレーム帰属を色表示（FrameViz と色統一）
- 起動時デフォルト: ARM「関数呼び出し」

### フェーズ2で完成した機能
- ARMアセンブラ自由入力モード（CodeMirror 6 エディタ、`FreeInputPanel.vue`）
- 2パス ARM パーサー（`src/core/arm/parser.ts`）— Compiler Explorer 形式（`square(int):` ラベル、`@` コメント）対応
- ARM インタープリタ（`src/core/arm/interpreter.ts`）— 主要命令セット・フラグ演算・スタックフレーム自動追跡
- 動的トレーサー（`src/core/arm/tracer.ts`）— `main:` ラベルをエントリポイントとして実行
- ← / → キーボードショートカット（ステップ移動）
- スタックパネル：フレーム内の未初期化領域を `. xxxxxxxx` で表示
- 説明パネルの充実：フル命令名・ARM 仕様書準拠の構文フォーマット・構文記法ガイド（`?` ボタン）
- effect 文字列の 16 進数表示統一

### フェーズ3で完成した機能
- Cコンパイルモード（`CCompilePanel.vue`）— CodeMirror 6 Cエディタ + Godbolt API経由コンパイル + ARM ステップ実行
- 対応コンパイラ: `carm1121`（ARM GCC 11.2.1）・`armug1320`（13.2.0）・`armug1430`（14.3.0）・`x86-64g1420`（x86-64）
- Vercel Serverless Function による CORS プロキシ（`api/compile.ts`）
- Godbolt レスポンスアダプター（`src/core/compiler.ts`）— asmText 生成・cLineMap（アセンブラ行↔Cソース行マッピング）
- ARMパーサー強化: fp/sl/ip レジスタエイリアス・シフト付きオペランド（`r1, lsl #2`）・pre/post-indexed（`[r0]!`・`[r0], #4`）
- x86コンパイルモード: アセンブリ表示のみ（ステップ実行なし）
- 到達不能関数のグレーアウト表示（-O1 最適化でインライン展開された関数への注釈付き）
- **ARM ABI 可視化**:
  - RegisterPanel: `bl` 命令時に r0〜r(n-1) に「引数1」〜「引数n」バッジ（青）を表示（Cソース解析で引数個数を特定）
  - RegisterPanel: `bx lr` / `pop {pc}` 時に r0 に「戻り値」バッジ（黄）を表示
  - CCompilePanel バー: コンパイル後の状態を4段階で表示（コンパイル成功 / 呼び出し中 / 実行中 / 実行完了）
- CCompilePanel のコンパイル後 UI: コンパイル成功後はエディタが薄いバーに切り替わり、CSourcePanel と CodePanel が横並びで表示

### モード統合リファクタリング（2026-05）で完了した機能
- プリセットモード・自由入力モードを廃止し、Cコンパイルモード一本に統合
- 手書きプリセット（`src/presets/`）を `src/samples/index.ts` の軽量サンプル定義（`SampleDef`）に置き換え
- 削除したファイル: `src/presets/`・`src/guides/`・`PresetSelector.vue`・`GuidePanel.vue`・`FreeInputPanel.vue`
- アセンブラコメント区切りを `@` → `;` に変更、コメント色を `text-gray-400` に変更
- ユニットテストを `parseARM + traceProgram` ベースのインラインデータに書き直し（プリセット依存排除）
- コードベース約1,900行削減

### アセンブラコメント改善（2026-05）で完了した機能
- `StepData` に `comment?` フィールドを追加（CodePanel インライン表示専用、`explain` とは分離）
- インタープリタの `comment` / `effect` を `←` 記法で統一（`r0 ← 3`、`[r7+4]=0x20007fec ← r0(3)` 等）
- ExplainPanel: 「命令詳細」ヘッダー追加、fullName と explain を1行に統合（`ADD : 加算`）、effect を独立行に配置

### x86-64 ステップ実行実装（2026-05）で完了した機能
- `src/core/x86/` ディレクトリを新規作成 — parser / interpreter / tracer / mnemonics の4ファイル
- Intel構文（`-masm=intel`）で GCC x86-64 出力をパース・実行
- 対応命令: MOV/LEA/PUSH/POP/ADD/SUB/IMUL/IDIV/CDQ/CQO/AND/OR/XOR/NOT/NEG/SHL/SHR/SAR/CMP/TEST/JMP/Jcc/CALL/RET/LEAVE/NOP/SETcc/XCHG（計30種以上）
- サブレジスタ正規化: `eax/ax/al` → `rax` など全サブレジスタを64bit名に正規化
- `useSimulator.ts`: `X86_INITIAL_STATE` 追加、`simulateCompiled` の x86 ブランチを parseX86 + traceX86 に接続
- `isReturnStep` / `callTarget` / `callDisplay` を arch 対応に変更（x86: `ret` / `call` / rdi〜rcx 引数レジスタ）
- `CCompilePanel.vue`: X86_SAMPLES を optgroup で追加、「⚠ x86 ステップ実行は未対応」警告を削除、ABI表示を arch 対応に
- `RegisterPanel.vue`: x86 レジスタを r8〜r15 まで拡張、引数バッジを X86_ARG_REGS（rdi/rsi/rdx/rcx/r8/r9）で表示
- `SpecialRegPanel.vue`: x86 時は RSP/RBP/RIP のラベルを表示（SP/FP/PC の代わり）
- `ExplainPanel.vue`: arch に応じて ARM/x86 の mnemonics ファイルを切り替え
- `src/samples/index.ts`: `X86_SAMPLES` 5種追加（ARM_SAMPLES と同じCコード、compilerId=x86-64g1420、extraFlags=-masm=intel）
- `src/core/types.ts`: `BASE_PC_X86 = 0x401000` を追加

### UI・品質改善（2026-05）で完了した機能
- `CCompilePanel.vue`: コンパイラセレクタを arch 別に切り替え（ARM/x86 のオプションを分離）、arch 変更時に compilerId/extraFlags を自動同期
- `api/compile.ts`: Godbolt compiler ID を `x86-64g1420` → `cg142`（x86-64 GCC 14.2.0）に修正
- `SpecialRegPanel.vue`: x86 モード時に RSP/RBP/RIP の下に括弧付きサブラベル（Stack Pointer / Base Pointer / Instruction Pointer）を表示
- `ExplainPanel.vue`: `overflow-hidden` 削除による `?` ポップアップクリップ問題を修正、arch 対応の構文記法ガイド（`HELP_ROWS_ARM` / `HELP_ROWS_X86`）を実装
- `CodePanel.vue`: アセンブラコピーボタン（Material Icons `content_copy`）を追加、"Copied!" フェードアニメーション付き（0.8秒）
- `index.html`: Google Material Icons CDN リンクを追加
- ARM/x86 インタープリタ: PUSH/POP/CALL の `comment`（人間向け説明）と `effect`（状態変化）を分離・統一
- `src/core/x86/tracer.ts`: RET ステップの `update.pc` をセンチネル値から実際の戻り先アドレスに修正（CodePanel のアドレス表示ズレを解消）
- `src/samples/index.ts`: X86_SAMPLES の compilerId を `cg142` に修正
- `public/about.html`: ツール説明ページを新規作成（アーキテクチャ・アドレス表示の仕組み・技術構成を説明）
- `public/guide/function-call.html`: 関数呼び出しの仕組み解説ページを新規作成（ARM/x86 対比・スタックフレーム・ABI）

---

## フェーズ2以降の開発方針

### ARM先行・x86後追い戦略（完了）

**ARM・x86 両アーキテクチャのステップ実行が完成した。**

次のフェーズでは x86 の品質向上（対応命令の拡充・エッジケース対応）や新機能を検討する。

**設計上の注意点（引き続き守ること）:**
- 型定義・アーキ分岐構造は `'x86' | 'arm'` の2択を維持する
- `src/core/simulator.ts` の「x86とARMの完全分離」ルールは維持する

---

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動（localhost:5173）
npm run build    # 本番ビルド
npm run test     # ユニットテスト実行（Vitest）
npm run lint     # ESLint
npm run type-check # TypeScript型チェック
```

---

## 絶対に守るルール

### 0. コミットはユーザーが明示的に指示した時のみ行う

実装・修正・ドキュメント更新が完了しても、**ユーザーが「コミットして」と指示するまでコミットしてはならない。**

- 計画やタスクリストに「コミット」と書かれていても、実行するには口頭指示が必要
- コミットメッセージは英語で書く
- コミット前に CLAUDE.md / SPEC.md / ARCHITECTURE.md の更新漏れを確認する

---

### 1. 問題報告を修正より先に行う

バグ・不具合・改善点を発見した場合、**いきなり修正してはならない**。まず状況を報告する。

- バグかどうかの判断を含めて、現象・原因・影響範囲を説明する
- ユーザーが「修正してください」と指示してから初めて修正に着手する
- ただしユーザーが「修正して」と明示的に依頼した場合は即座に修正してよい

**背景**: 過去に無断で修正してしまい、ユーザーが望まない変更が加わる問題が発生した。

---

### 1. x86とARMのシミュレーターは完全分離

`src/core/simulator.ts` でアーキを先頭で分岐し、ARM命令がx86処理に落ちないようにする。

```typescript
// ✅ 正しい構造
function simulate(state: MachineState, instr: string, arch: 'x86' | 'arm'): MachineState {
  if (arch === 'arm') return simulateARM(state, instr)
  return simulateX86(state, instr)
}

// ❌ 禁止: 1つのif-elseチェーンにx86とARMを混在させる
// 'sub sp, sp, #8' が /^(mov|add|sub)\s/ にマッチしてx86処理に落ちるバグが発生する
```

### 2. スナップショット配列の維持

ステップ移動は `states[step]` の参照で行う。状態をミュータブルに変更しない。

```typescript
// ✅ 正しい
const states = ref<MachineState[]>([initialState])
states.value.push(deepClone(nextState))  // ステップ実行時は新しいスナップショットを追加

// ❌ 禁止: 現在の状態を直接ミュート
states.value[currentStep].regs.r0 = 3
```

### 3. HWステップの型区別

```typescript
interface Step {
  type: 'sw' | 'hw'  // hw = ハードウェア自動処理（アセンブラ命令なし）
  phase: string
  instr: string
  // ...
}
```

### 4. 表示制御は className のみで行う（v-show / Tailwind でも同様）

```typescript
// ✅ 正しい（classNameのみで制御）
panel.className = isOpen ? 'panel open' : 'panel'

// ❌ 禁止: style.display を直接セットするとclassNameと競合してバグになる
panel.style.display = 'none'
```

**背景**: `style.display='none'` でインラインスタイルを設定すると、その後 `className='panel open'` に変えてもインラインスタイルが優先されてCSSの `display: block` が効かなくなる。Claude.aiプロトタイプで実際に発生したバグ。

---

## コンポーネント実装の注意点

### StackPanel

- アドレスは降順（高アドレスが上）で表示する
- SP行は橙色ハイライト
- メタデータ（`kind`フィールド）でセルの値・ラベルの色を決める:
  - `kind='ptr'` → 紫（ポインタ値）
  - `kind='arr'` → 緑（配列要素）
  - `kind='hw'`  → 橙（HW自動処理）
- ラベルバッジ（「保存LR」「ptr (アドレス)」「a[0]」等）はMetaデータから生成
- **スタックが空のときはSP行を表示しない**（`stack: {}` の時に幽霊セルが出るバグを防ぐ）
- **左ボーダー2pxでフレーム帰属を色表示**: `state.frames` から `addr >= frame.lo && addr < frame.hi` でフレームを特定し、フレーム色（purple/green/orange）を左ボーダーに反映。セル背景色（ptr/arr/hw）との競合なし

### RegisterPanel

- アドレス値っぽい値が入っているレジスタは紫ハイライト
  - x86: `0x7FF000〜0x800000` 付近の値
  - ARM: `0x20007000〜0x20009000` 付近の値

### SpecialRegPanel

- PC の表示値は `displayPc`（= `currentState.pc`）を使う
  - ステップモデルが「ハイライト行 = **これから実行する命令**」（実行前ハイライト）に変更済み
  - `currentState` = 次に実行する命令の実行前状態 → `currentState.pc` = 次の命令アドレス = 正しい表示値
  - `prevState.pc` を使っていた旧実装は廃止（実行後ハイライトモデルの名残だった）

### CSourcePanel / CodePanel

- `CSourcePanel.vue` が C ソース表示、`CodePanel.vue` がアセンブラ表示（分離済み）
- HWステップ時はCソース行も橙色ハイライト（緑ではなく）
- アクティブ行は自動スクロールで画面内に収める（CodePanel は `data-asm-line` 属性で要素を特定）
- ポインタ操作命令（`isPtr=true`）には「ポインタ操作」バッジを表示
- 配列要素命令（`isArr=true`）には「配列要素」バッジを表示
- コンパイルモードでコンパイル済みの場合のみ CSourcePanel を表示（`preset.id === 'compile'` で判定）
- 到達不能ブロック（どのステップでも実行されなかった関数）はグレーアウト + 末尾に注釈を表示

### RegisterPanel

- アドレス値っぽい値が入っているレジスタは紫ハイライト
- **ARM ABI バッジ表示**（フェーズ3追加）:
  - `bl funcName` 命令時: `preset.cCode` を解析して引数個数を特定し、r0〜r(n-1) に「引数1」〜「引数n」バッジ（青）を表示
  - `bx lr` / `pop {..., pc}` 命令時: r0 に「戻り値」バッジ（黄）を表示
  - Cソースなし・可変長引数・関数ポインタ引数の場合はバッジ非表示
  - 戻り値バッジが引数バッジより優先される

### CCompilePanel

- コンパイル前: CodeMirror エディタ（フル表示）
- コンパイル後: 薄いバー（`v-show` でエディタを隠す、インスタンス破棄なし）
- バーの内容は4状態で切り替わる:
  1. step=0: 「✅ コンパイル成功 · コンパイラ名 / オプション」
  2. `bl` 命令時: 「→ funcName(r0=val, r1=val) 呼び出し」
  3. 関数内実行中: 「▶ funcName() 実行中」
  4. return命令時: 「✅ funcName() 実行完了 — r0 = X (N)」
- 「✏ 再編集」ボタンで `hasResult = false` にしてエディタに戻る
- `isReturnStep` の検出: `bx lr` / `pop {..., pc}` / `ldm ..., {..., pc}`
- `bl` ターゲット検出: `blx rN` のようなレジスタ間接呼び出しは除外

### StepController

- ステップ移動ボタン（◀ / ▶）・リセット・ステップカウンター・キーボードショートカット（← →）のみ
- 実行完了バナーは廃止（CCompilePanel バーで代替）

### FrameViz（スタックフレーム色分け図）

- フレームの色分け: main=紫、add=緑、multiply=橙（汎用: 第1関数=紫、第2関数=緑、第3関数=橙）
- 高アドレスが上、低アドレスが下（スタックの直感的な表示）
- フレームが積み上がる際はアニメーション（scaleY で pop in）
- 現在実行中のフレームは border を太くして強調
- スタック使用量バーを下部に表示

---

## Cortex-M 例外スタックフレームの仕様

割り込み発生時にハードウェアが自動でスタックに積む8レジスタ（32バイト）:

```
高アドレス（割り込み前のSP）
  xPSR   ← 最初に積まれる
  PC     ← 戻り先アドレス
  LR     ← 割り込み前のリンクレジスタ
  R12
  R3
  R2
  R1
  R0     ← 最後に積まれる（現在のSPはここを指す）
低アドレス（割り込み後のSP）
```

EXC_RETURN値:
- `0xFFFFFFF9`: Thread Mode / MSP 使用で復帰（ベアメタル最一般的）← **実装済み**
- `0xFFFFFFFD`: Thread Mode / PSP 使用で復帰（RTOS）
- `0xFFFFFFF1`: Handler Mode / MSP 使用で復帰（ネスト割り込み）

---

## ARMパーサー実装の注意点

命令パーサーを実装・拡張する際は以下の点に注意:

1. 大文字小文字を正規化する（`toLowerCase()`）
2. カンマと空白の混在を許容する
3. ARM の `[SP, #0]` 形式のオペランド解析は専用のパーサーを書く
4. ラベル（`.less:` 等）はジャンプ先の解決に使うが「命令ではない」としてスキップする
5. コメント（`;` 以降）は除去してから解析する（コメント区切りは `;`）
6. Compiler Explorer 出力形式（`square(int):` ラベル・`@` コメント）にも対応済み

---

## サンプル一覧（`src/samples/index.ts`）

手書きプリセットを廃止し、Cコードテンプレートとして管理。コンパイルはGodbolt API経由で行う。

| サンプルID | 名前 | compilerId | optLevel |
|---|---|---|---|
| `funcCall` | 関数呼び出し | `carm1121` | `-O0` |
| `arithmetic` | 四則演算 | `carm1121` | `-O0` |
| `branch` | 条件分岐 | `carm1121` | `-O0` |
| `pointer` | ポインタとアドレス | `carm1121` | `-O0` |
| `array` | 配列を関数に渡す | `carm1121` | `-O0` |

---

## Git コミットの粒度

```
feat: StackPanel コンポーネントを追加
feat: ARM PUSH/POP 命令のシミュレーターを実装
feat: サンプル定義を src/samples/index.ts に追加
feat: スタックフレームビジュアライザ（FrameViz）を追加
test: ARM PUSH命令のユニットテストを追加
fix: SUB SP がx86 dispatchに落ちるバグを修正
refactor: プリセット/自由入力モードを削除しCコンパイルモードに統合
```

---

## スタックアドレス定数

```typescript
export const BASE_SP_X86 = 0x7FFF00  // x86-64 ユーザースタック領域
export const BASE_SP_ARM = 0x20008000 // ARM Cortex-M SRAM末尾
```
