# AsmWalker — アーキテクチャ設計書

## 技術スタック

| レイヤー | 技術
| 選定理由 |
|---|---|---|
| フロントエンド | Vue 3 + Composition API | コンポーネント分割しやすい・学習コストが低い |
| ビルドツール | Vite | 高速・Vue との親和性が高い |
| 言語 | TypeScript | 命令パーサーの型安全性が重要 |
| スタイリング | Tailwind CSS | ユーティリティファースト・レスポンシブ対応が容易 |
| コードエディタ | CodeMirror 6 | シンタックスハイライト・フェーズ2の自由入力に対応 |
| バックエンド（将来）| Vercel Serverless Functions | Godbolt API プロキシ（約30行） |
| 認証・DB（将来） | Supabase | Auth + PostgreSQL でコード保存・共有 |
| デプロイ | Vercel | フロントのみなら無料・自動デプロイ・カスタムドメイン対応 |
| リポジトリ | GitHub | Vercel との CI/CD 連携 |

---

## ディレクトリ構成

```
asm-walker/
├── src/
│   ├── components/
│   │   ├── ArchSwitch.vue          # x86 / ARM 切り替えスイッチ
│   │   ├── PresetSelector.vue      # プリセット選択
│   │   ├── StepController.vue      # ◀ 戻る / 次のステップ ▶ / リセット（← → キーショートカット付き）
│   │   ├── GuidePanel.vue          # 学習ガイドパネル（開閉式）
│   │   ├── CSourcePanel.vue        # Cソース表示（CodePanelから分離）
│   │   ├── CodePanel.vue           # アセンブラ表示（PCアドレス付き）
│   │   ├── ExplainPanel.vue        # 命令の日本語説明（フルネーム・構文フォーマット・記法ヘルプ付き）
│   │   ├── RegisterPanel.vue       # 汎用レジスタ表示
│   │   ├── SpecialRegPanel.vue     # SP / LR / PC / Mode 表示
│   │   ├── StackPanel.vue          # スタックメモリ表示（未初期化スロット表示対応）
│   │   ├── FrameViz.vue            # スタックフレーム色分け図（3層ネスト）
│   │   ├── FreeInputPanel.vue      # 自由入力エディタ（CodeMirror 6 + 実行ボタン）
│   │   └── DiffPanel.vue           # x86 vs ARM 差分（x86/ARM両対応、最下部、デフォルト非表示）
│   ├── core/
│   │   ├── simulator.ts            # ステップ実行エンジン（applyUpdate / buildStates）
│   │   ├── types.ts                # 共通型定義（MachineState, StepData, StackFrame 等）
│   │   └── arm/
│   │       ├── parser.ts           # ARMアセンブラ2パースパーサー（ラベル収集 + 命令解析）
│   │       ├── interpreter.ts      # ParsedInstruction + MachineState → StateUpdate + 説明テキスト
│   │       └── tracer.ts           # 動的実行でスナップショット列を生成（分岐・ループ対応）
│   ├── presets/
│   │   ├── index.ts                # プリセット一覧エクスポート
│   │   ├── x86/
│   │   │   ├── funcCall.ts
│   │   │   ├── arithmetic.ts
│   │   │   ├── branch.ts
│   │   │   ├── pointer.ts          # ポインタとアドレス
│   │   │   └── array.ts            # 配列を関数に渡す
│   │   └── arm/
│   │       ├── funcCall.ts
│   │       ├── arithmetic.ts
│   │       ├── branch.ts
│   │       ├── pointer.ts
│   │       ├── array.ts
│   │       └── interrupt.ts        # 割り込みスタック退避プリセット
│   ├── guides/
│   │   ├── x86.ts                  # x86 各プリセットの学習ガイドデータ
│   │   └── arm.ts                  # ARM 各プリセットの学習ガイドデータ
│   ├── composables/
│   │   └── useSimulator.ts         # シミュレーター・プリセット・アーキ状態管理（Vue Composable）
│   ├── App.vue
│   └── main.ts
├── public/
├── tests/
│   ├── unit/
│   │   ├── x86Simulator.test.ts
│   │   └── armSimulator.test.ts
│   └── e2e/
├── server/                         # フェーズ3以降（バックエンド）
│   └── api/
│       └── compile.ts              # Godbolt API プロキシ（約30行）
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── vercel.json
```

---

## 状態管理設計

Vue 3 の Composition API + `reactive` / `ref` でグローバルな状態を管理する。Pinia は将来的に複雑化した場合に導入を検討する。

```typescript
// src/composables/useSimulator.ts のイメージ

interface SimulatorState {
  arch: 'x86' | 'arm'
  preset: string
  step: number
  totalSteps: number
  states: MachineState[] // 各ステップのスナップショット配列
  guideOpen: boolean
  // フェーズ2追加
  inputMode: 'preset' | 'free'
  freeInputText: string
  freeInputError: string | null
}

// フェーズ2追加関数
// simulateFreeInput(asmText): parse → trace → states/steps を更新
// setInputMode(mode): preset / free を切り替え

interface MachineState {
  regs: Record<string, number> // { r0: 3, r1: 5, ... }
  sp: number
  fp: number
  lr: number
  pc: number
  stack: Record<number, number> // { 0x20007FF0: 3, ... }
  stackMeta: Record<number, StackMeta>
  flags: Flags
  mode: 'thread' | 'handler'
  frames: StackFrame[] // スタックフレーム一覧（FrameViz / StackPanel ボーダー色に使用）
}

interface StackMeta {
  label: string
  kind: 'sw' | 'hw' | 'ptr' | 'arr'
  // kind='ptr' → 紫ハイライト
  // kind='arr' → 緑ハイライト
  // kind='hw'  → 橙ハイライト
}
```

---

## フェーズ2: 自由入力パイプライン

```
[ユーザー入力 (CodeMirror)] → [parser.ts] → [tracer.ts] → states[] + steps[]
                                   ↓                             ↓
                            ParsedInstruction[]         ← 既存の可視化コンポーネント群
                            + labels Map                  (変更不要)
```

### parser.ts — 2パスARMパーサー

```typescript
interface ParsedInstruction {
  lineIndex: number    // 元のテキスト行番号
  raw: string          // 元テキスト（表示用）
  mnemonic: string     // 大文字正規化済み, e.g. 'MOV', 'PUSH'
  cond: string         // 条件コード, e.g. 'EQ', 'AL'
  sFlag: boolean       // S サフィックス（フラグ更新）
  operands: Operand[]  // パース済みオペランド
}

type Operand =
  | { type: 'reg', name: string }
  | { type: 'imm', value: number }
  | { type: 'mem', base: string, offset: number }
  | { type: 'reglist', regs: string[] }
  | { type: 'label', name: string }

interface ParseResult {
  instructions: ParsedInstruction[]
  labels: Map<string, number>  // name → instruction index
  errors: ParseError[]
}
```

**対応範囲:** Compiler Explorer 出力形式（`square(int):` ラベル、`@` コメント、`bl sum(int, int)` BL operand）に対応済み。

### interpreter.ts — 命令実行

- `interpretInstruction(instr, instrIndex, state, labels): InterpretResult`
- 全レジスタ値は16進数で effect/explain に表示（`fmtVal()` 関数）
- S-suffix命令はフラグ更新 + explain に「（フラグ更新）」追記

### tracer.ts — 動的実行

- `traceProgram(parseResult, initialState, maxSteps=200): TraceResult`
- `main:` エントリポイントから開始（なければ先頭から）
- 200ステップ超過で無限ループ検出エラー

---

## コアロジック設計（simulator.ts）

### 設計方針

- x86 と ARM のシミュレーターを**完全に分離**する（前バージョンでの if-else 混在バグの教訓）
- 各命令は純粋関数 `(state: MachineState, operands: string[]) => MachineState` として実装
- ステップ間は**イミュータブルなスナップショット配列**で管理し、前後ステップへの移動を O(1) で実現

```typescript
// アーキテクチャ抽象化インターフェース（フェーズ4のRISC-V追加に備える）
interface ArchSimulator {
  simulate(state: MachineState, instr: string): MachineState
  parseInstr(raw: string): ParsedInstr
  getRegisters(): RegisterDef[]
}

class X86Simulator implements ArchSimulator { ... }
class ArmSimulator implements ArchSimulator { ... }
// フェーズ4: class RiscVSimulator implements ArchSimulator { ... }
```

### ステップの型定義

```typescript
interface Step {
  type: 'sw' | 'hw' // hw = ハードウェア自動処理（Cortex-M割り込み退避等）
  phase: string // 'main' | 'caller' | 'callee' | 'hw' | 'isr' | 'ret'
  instr: string // アセンブラ命令文字列
  cLine: number // 対応するCソースの行番号
  explain: string // 日本語説明
  effect: string // 実行結果の説明
  flags: Partial<Flags> // 更新するフラグ
  isPtr?: boolean // ポインタ操作命令フラグ → 紫バッジ表示
  isArr?: boolean // 配列要素命令フラグ → 緑バッジ表示
}
```

### 例外スタックフレーム処理（ARM専用）

Cortex-M の割り込みスタック退避はソフトウェア命令ではなくハードウェア処理のため、`type: 'hw'` フラグを持つステップとして定義し、UI側で橙色ハイライト表示する。

---

## フェーズ3: Godbolt API 連携

```
ブラウザ (Vue)
  ↓ POST /api/compile { code, compilerId, options }
Vercel Serverless Function (server/api/compile.ts)
  ↓ POST https://godbolt.org/api/compiler/{compilerId}/compile
Godbolt API
  ↓ { asm: [{text, source: {line}}], ... }
Vue
  → アセンブラ行とCソース行の対応をマッピング（source.line を利用）
  → シミュレーターにロード
```

**CORS補足**: まず Vue から Godbolt に直接 POST を試す。CORSエラーが出たらプロキシを追加する（Godbolt の GET は直接叩ける可能性あり）。

**代表的なコンパイラID**:

- `g141`: x86-64 gcc 14.1
- `arm1220`: arm-none-eabi gcc 12.2
- `arm1320`: arm-none-eabi gcc 13.2

---

## デプロイ戦略

### フェーズ1・2（フロントエンドのみ）

```
GitHub main ブランチへの push
  → Vercel 自動デプロイ
  → https://asm-walker.vercel.app
```

Vercel は静的サイトであれば**無料プラン**で十分。

### フェーズ3（バックエンドあり）

Godbolt API のプロキシ程度であれば Vercel の Serverless Functions で対応可能。

---

## 開発環境セットアップ

```bash
# リポジトリ作成
git clone https://github.com/yourname/asm-walker.git
cd asm-walker

# Vue 3 + Vite + TypeScript プロジェクト作成
npm create vue@latest .
# ✔ TypeScript: Yes
# ✔ Vue Router: No（SPA・単一ページのため不要）
# ✔ Pinia: No（Composable で管理）
# ✔ Vitest: Yes（ユニットテスト）
# ✔ ESLint + Prettier: Yes

# 追加パッケージ
npm install tailwindcss @tailwindcss/vite
npm install codemirror @codemirror/lang-cpp  # フェーズ2

# 開発サーバー起動
npm run dev
```

---

## テスト方針

シミュレーターのコアロジックは必ずユニットテストを書く。

```typescript
// tests/unit/armSimulator.test.ts のイメージ
describe('ARM Simulator: PUSH {R4, LR}', () => {
  it('SPを8デクリメントしてR4とLRをスタックに積む', () => {
    const initial = createState({ regs: { r4: 42 }, sp: 0x20008000, lr: 0xbeef })
    const result = simulate(initial, 'PUSH {R4, LR}')
    expect(result.sp).toBe(0x20007ff8)
    expect(result.stack[0x20007ff8]).toBe(42) // R4
    expect(result.stack[0x20007ffc]).toBe(0xbeef) // LR
  })
})

describe('ARM Simulator: SUB SP, SP, #8', () => {
  it('x86のsimX86に落ちずARMのsimARM_fullで処理される', () => {
    const initial = createState({ sp: 0x20008000 })
    const result = simulate(initial, 'SUB SP, SP, #8')
    expect(result.sp).toBe(0x20007ff8)
  })
})
```
