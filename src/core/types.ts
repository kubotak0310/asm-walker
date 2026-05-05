// プロジェクト全体で共有する型定義と定数。アーキテクチャ非依存の共通データ構造を置く。

export type Arch = 'x86' | 'arm'

export interface Flags {
  zero: boolean
  negative: boolean
  carry: boolean
  overflow: boolean
}

export interface StackMeta {
  label: string
  // sw=ソフトウェア書き込み / hw=HW自動退避 / ptr=ポインタ値 / arr=配列要素
  // StackPanel のセル色分けに使う
  kind: 'sw' | 'hw' | 'ptr' | 'arr'
}

export interface StackFrame {
  name: string
  lo: number  // フレーム下端（現在の SP）— PUSH のたびに更新される
  hi: number  // フレーム上端（関数入口時の SP）
  color: 'purple' | 'green' | 'orange'
}

export interface MachineState {
  regs: Record<string, number>
  sp: number
  fp: number
  lr: number   // ARM のみ使用。x86 は 0 固定（戻りアドレスはスタックで管理）
  pc: number
  stack: Record<number, number>
  stackMeta: Record<number, StackMeta>
  flags: Flags
  mode: 'thread' | 'handler'  // Cortex-M の実行モード（ARM のみ意味を持つ）
  frames: StackFrame[]
}

// インタープリタが返す差分。applyUpdate() で前の MachineState に適用してスナップショットを作る。
// ミュータブルな変更を禁止するためイミュータブルな差分オブジェクトとして設計している。
export interface StateUpdate {
  regs?: Partial<Record<string, number>>
  sp?: number
  fp?: number
  lr?: number
  pc?: number
  stackSet?: Record<number, number>    // 追加・上書きするアドレス→値
  stackRemove?: number[]               // 削除するアドレス（POP 後のセルをクリア）
  metaSet?: Record<number, StackMeta>
  metaRemove?: number[]
  flags?: Partial<Flags>
  mode?: 'thread' | 'handler'
  frames?: StackFrame[]
}

export type Phase = 'main' | 'caller' | 'callee' | 'hw' | 'isr' | 'ret'

export interface StepData {
  type: 'sw' | 'hw'
  phase: Phase
  asmLine: number  // 0-based、ソース行インデックス（CodePanel のハイライトに使う）
  cLine: number    // 0-based、対応する C ソース行（CSourcePanel のハイライトに使う）
  explain: string
  effect: string
  comment?: string  // concise inline annotation for CodePanel (separate from explain)
  isPtr?: boolean
  isArr?: boolean
  update: StateUpdate
}

export interface AsmLine {
  text: string
  isHeader?: boolean  // ラベル行・コメント行・空行は命令ではないため true にしてハイライト対象外にする
  phase?: Phase
  comment?: string  // auto-generated from tracer explain (free input / compile mode)
}

export interface PresetData {
  id: string
  name: string
  arch: Arch
  cCode: string[]
  asmCode: AsmLine[]
  steps: StepData[]
  initialState: MachineState
}

// 仮想アドレス空間の配置。実機に近い値を使うことで「アドレスっぽい値」の判定が自然に機能する。
export const BASE_SP_X86 = 0x7fff00   // x86-64 ユーザースタック領域の上端付近
export const BASE_SP_ARM = 0x20008000 // ARM Cortex-M SRAM 末尾（スタックは下方向に成長）
export const BASE_PC_X86 = 0x401000   // x86-64 ELF の典型的なコードセグメント先頭
export const BASE_PC_ARM = 0x08000000 // ARM Cortex-M Flash メモリ先頭

// フェーズごとのテーマカラー（FrameViz・StackPanel の左ボーダー色と対応）
export const PHASE_COLORS: Record<Phase, string> = {
  main: 'purple',
  caller: 'purple',
  callee: 'green',
  hw: 'orange',
  isr: 'green',
  ret: 'coral',
}
