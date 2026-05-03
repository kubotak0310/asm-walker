# CLAUDE.md — Claude Code 向け開発ガイド

このファイルは Claude Code が `asm-walker` リポジトリで作業する際に参照するガイドです。

---

## プロジェクト概要

**AsmWalker** — ARM Cortex-M / x86-64 アセンブラの学習ツール。ブラウザ上でCコードとアセンブラを対応表示しながら1命令ずつステップ実行できる。

- **SPEC.md**: 機能要件・プリセット仕様・画面構成
- **ARCHITECTURE.md**: 技術構成・ディレクトリ設計・型定義

---

## 現在のフェーズ

**フェーズ1.5完了（Vue移行・デバッグ済み）→ フェーズ2着手予定**

### フェーズ1.5で完成した機能
- x86-64 / ARM Cortex-M のステップ実行シミュレーター（Vue 3 + TypeScript）
- 6プリセット（x86/ARM切り替え）+ 割り込みプリセット（ARM専用）
- 学習ガイドパネル・スタックフレーム色分け図（FrameViz）統合済み
- スタックメモリのセルハイライト（紫=ポインタ値、緑=配列要素、橙=HW自動処理）
- スタックメモリの左ボーダーでフレーム帰属を色表示（FrameViz と色統一）
- 起動時デフォルト: ARM「関数呼び出し」

---

## フェーズ2以降の開発方針

### ARM先行・x86後追い戦略

**フェーズ2・3はARM版を先に完成させ、その後x86版を移植する。**

理由:
- ARMの命令記法（`[SP, #8]`、`PUSH {R0, LR}` 等）がx86より複雑なため、ARM側でパーサー設計を固めてからx86に適用する方が手戻りが少ない
- デバッグ実績があるのはARM側のみ
- Cortex-M特化が本ツールの差別化ポイントであり、ARMを先に完成させた方が価値が早く出る

**ただし設計上の注意:**
- 型定義・アーキ分岐構造はx86を見据えて最初から `'x86' | 'arm'` で作る
- `src/core/simulator.ts` の「x86とARMの完全分離」ルールは維持する
- プリセットの内容最適化はフェーズ2完了後に行う（フェーズ2で自由入力が実現してから見直す）

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

### 4. 学習ガイドの表示制御は className のみで行う

```typescript
// ✅ 正しい（classNameのみで制御）
guidePanel.className = guideOpen ? 'guide-panel open' : 'guide-panel'

// ❌ 禁止: style.display を直接セットするとclassNameと競合してバグになる
guidePanel.style.display = 'none'  // これをやると className の変更が無効になる
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
- アクティブ行は自動スクロールで画面内に収める
- ポインタ操作命令（`isPtr=true`）には「ポインタ操作」バッジを表示
- 配列要素命令（`isArr=true`）には「配列要素」バッジを表示

### GuidePanel

- HWステップには「ハードウェアが自動実行 — アセンブラ命令は存在しません」バナーを表示
- 位相バッジの色:
  - main/caller → 紫
  - callee/isr → 緑
  - hw → 橙
  - ret → 珊瑚

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

## フェーズ2実装時の注意点（自由入力）

命令パーサーを実装する際は以下の点に注意:

1. 大文字小文字を正規化する（`toLowerCase()`）
2. カンマと空白の混在を許容する
3. ARM の `[SP, #0]` 形式のオペランド解析は専用のパーサーを書く
4. ラベル（`.less:` 等）はジャンプ先の解決に使うが、フェーズ2では「命令ではない」としてスキップしてよい
5. コメント（`;` 以降）は除去してから解析する
6. 最初は対応命令を絞り、エラーメッセージを丁寧に出すことで乗り切る（完璧なパーサーを最初から作ろうとしない）

---

## プリセット一覧（実装済み）

### x86-64 / ARM 共通（6種）
| プリセット名 | ファイル | isPtr/isArrフラグ |
|---|---|---|
| 関数呼び出し | `presets/{arch}/funcCall.ts` | なし |
| 関数プロローグ | `presets/{arch}/prologue.ts` | なし |
| 四則演算 | `presets/{arch}/arithmetic.ts` | なし |
| 条件分岐 | `presets/{arch}/branch.ts` | なし |
| ポインタとアドレス | `presets/{arch}/pointer.ts` | `isPtr: true` |
| 配列を関数に渡す | `presets/{arch}/array.ts` | `isPtr: true`, `isArr: true` |

### ARM 専用（1種）
| プリセット名 | ファイル | 備考 |
|---|---|---|
| 割り込みスタック退避 | `presets/arm/interrupt.ts` | `type: 'hw'` ステップを含む |

---

## Git コミットの粒度

```
feat: StackPanel コンポーネントを追加
feat: ARM PUSH/POP 命令のシミュレーターを実装
feat: ポインタプリセットを追加（x86/ARM両対応）
feat: スタックフレームビジュアライザ（FrameViz）を追加
test: ARM PUSH命令のユニットテストを追加
fix: SUB SP がx86 dispatchに落ちるバグを修正
fix: GuidePanel の表示制御を className のみに統一
```

---

## スタックアドレス定数

```typescript
export const BASE_SP_X86 = 0x7FFF00  // x86-64 ユーザースタック領域
export const BASE_SP_ARM = 0x20008000 // ARM Cortex-M SRAM末尾
```
