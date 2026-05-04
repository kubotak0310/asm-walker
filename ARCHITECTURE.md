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
│   │   ├── StepController.vue      # ◀ 戻る / 次のステップ ▶ / リセット / ステップカウンター（← → キーショートカット付き）
│   │   ├── CSourcePanel.vue        # Cソース表示（コンパイル後のみ表示）
│   │   ├── CodePanel.vue           # アセンブラ表示（PCアドレス付き、コメントは `;` 区切り）
│   │   ├── ExplainPanel.vue        # 命令の日本語説明（フルネーム・構文フォーマット・記法ヘルプ付き）
│   │   ├── RegisterPanel.vue       # 汎用レジスタ表示（ARM ABI 引数/戻り値バッジ付き）
│   │   ├── SpecialRegPanel.vue     # SP / LR / PC / Mode 表示
│   │   ├── StackPanel.vue          # スタックメモリ表示（未初期化スロット表示対応）
│   │   ├── FrameViz.vue            # スタックフレーム色分け図（3層ネスト）
│   │   ├── CCompilePanel.vue       # Cコンパイルモード（CodeMirror 6 + サンプル選択 + Godbolt API + 状態表示バー）
│   │   └── DiffPanel.vue           # x86 vs ARM 差分（最下部、デフォルト非表示）
│   ├── core/
│   │   ├── simulator.ts            # ステップ実行エンジン（applyUpdate / buildStates）
│   │   ├── types.ts                # 共通型定義（MachineState, StepData, StackFrame 等）
│   │   ├── compiler.ts             # Godbolt APIレスポンス → asmText + cLineMap 変換
│   │   └── arm/
│   │       ├── parser.ts           # ARMアセンブラ2パスパーサー（fp/sl/ip エイリアス・シフト・pre/post-indexed 対応）
│   │       ├── interpreter.ts      # ParsedInstruction + MachineState → StateUpdate + 説明テキスト
│   │       └── tracer.ts           # 動的実行でスナップショット列を生成（cLineMap 引数追加）
│   ├── samples/
│   │   └── index.ts                # ARMサンプル定義（SampleDef × 5種 — コンパイル可能なCコードテンプレート）
│   ├── composables/
│   │   └── useSimulator.ts         # シミュレーター・アーキ状態管理（Vue Composable、シングルトン）
│   ├── App.vue
│   └── main.ts
├── public/
├── tests/
│   ├── unit/
│   │   ├── x86Simulator.test.ts    # applyUpdate / buildStates のユニットテスト
│   │   └── armSimulator.test.ts    # parseARM + traceProgram ベースのインラインテスト
│   └── e2e/
├── api/
│   └── compile.ts                  # Vercel Serverless Function（Godbolt API CORSプロキシ）
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
// モジュールレベルのシングルトン（ref / computed をモジュールスコープで保持）

interface SimulatorState {
  arch: 'x86' | 'arm'
  currentStep: number
  totalSteps: number          // preset.steps.length
  states: MachineState[]      // 各ステップのスナップショット配列
  preset: PresetData | null   // コンパイル後に設定される（id='compile'）
  compileError: string | null
  isCompiling: boolean
  diffOpen: boolean
}

// 主要アクション
// simulateCompiled(cSource, compilerId, optLevel): Godbolt API → parseARM → traceProgram → states/steps を更新
// nextStep() / prevStep() / reset(): ステップ移動

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

## ARMコンパイルパイプライン

```
[Cソース (CodeMirror)] → [Godbolt API] → [compiler.ts] → asmText + cLineMap
                                                                ↓
                                                          [parser.ts]
                                                                ↓
                                                  ParsedInstruction[] + labels Map
                                                                ↓
                                                          [tracer.ts]
                                                                ↓
                                                     states[] + steps[]
                                                                ↓
                                                  ← 既存の可視化コンポーネント群
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

**対応範囲:** Compiler Explorer 出力形式（`square(int):` ラベル、`@` / `;` コメント、`bl sum(int, int)` BL operand）に対応済み。

### interpreter.ts — 命令実行

- `interpretInstruction(instr, instrIndex, state, labels): InterpretResult`
- `comment`: CodePanel インライン表示用の簡潔な注釈（`r0 ← 3`、`[r7+4]=0x20007fec ← r0(3)` など `←` 記法で統一）
- `effect`: ExplainPanel 下段表示用（`comment` と同形式）
- `explain`: ExplainPanel 上段の日本語説明（`ADD : 加算` のように fullName と連結表示）
- S-suffix命令はフラグ更新 + explain に「（フラグ更新）」追記

### tracer.ts — 動的実行

- `traceProgram(parseResult, initialState, maxSteps=200, cLineMap?: Map<number, number>): TraceResult`
- `main:` エントリポイントから開始（なければ先頭から）
- 200ステップ超過で無限ループ検出エラー
- `cLineMap`: Godbolt の asmLineIndex → Cソース行番号（0-based）のマッピング（省略時は全行 cLine=0）

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
interface StepData {
  type: 'sw' | 'hw'   // hw = ハードウェア自動処理（Cortex-M割り込み退避等）
  phase: Phase        // 'main' | 'caller' | 'callee' | 'hw' | 'isr' | 'ret'
  asmLine: number     // アセンブラソース行インデックス
  cLine: number       // 対応するCソースの行番号
  explain: string     // 日本語説明（ExplainPanel 上段）
  effect: string      // 実行結果（ExplainPanel 下段、← 記法）
  comment?: string    // CodePanel インライン注釈（← 記法、簡潔版）
  isPtr?: boolean     // ポインタ操作命令フラグ → 紫バッジ表示
  isArr?: boolean     // 配列要素命令フラグ → 緑バッジ表示
  update: StateUpdate // 状態差分
}
```

### 例外スタックフレーム処理（ARM専用）

Cortex-M の割り込みスタック退避はソフトウェア命令ではなくハードウェア処理のため、`type: 'hw'` フラグを持つステップとして定義し、UI側で橙色ハイライト表示する。

---

## フェーズ3: Godbolt API 連携（実装済み）

```
ブラウザ (Vue) — 開発時
  ↓ POST https://godbolt.org/api/compiler/{compilerId}/compile（直接）
Godbolt API
  ↓ { asm: [{text, source: {line}}], ... }

ブラウザ (Vue) — 本番時
  ↓ POST /api/compile { compilerId, source, options }
Vercel Serverless Function (api/compile.ts)
  ↓ POST https://godbolt.org/api/compiler/{compilerId}/compile
Godbolt API
  ↓ { asm: [{text, source: {line}}], ... }

共通（Vue側）:
  adaptGodboltResponse() → asmText + cLineMap
  parseARM(asmText) → ParseResult
  traceProgram(parseResult, initialState, 500, cLineMap) → states[] + steps[]
  → 既存の可視化コンポーネント群（変更不要）
```

**CORS**: 開発時は Godbolt が直接 POST を許可しているため `import.meta.env.DEV` で分岐。

**実際のコンパイラID**（Godbolt API で確認済み）:

| ID | コンパイラ |
|---|---|
| `carm1121` | arm-none-eabi gcc 11.2.1 |
| `armug1320` | arm-none-eabi gcc 13.2.0 |
| `armug1430` | arm-none-eabi gcc 14.3.0 |
| `x86-64g1420` | x86-64 gcc 14.2.0 |

### compiler.ts — Godbolt レスポンスアダプター

```typescript
interface GodboltAsmItem {
  text: string
  source: { file: null | string; line: number } | null
}
interface GodboltResponse {
  code: number
  asm: GodboltAsmItem[]
  stderr?: Array<{ text: string }>
}
interface CompilerOutput {
  asmText: string               // parseARM() に渡す文字列
  cLineMap: Map<number, number> // asmLineIdx(0-based) → Cソース行(0-based)
  rawAsm: GodboltAsmItem[]
  error?: string
}
function adaptGodboltResponse(response: GodboltResponse): CompilerOutput
```

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
