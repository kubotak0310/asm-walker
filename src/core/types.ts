// プロジェクト全体で共有する型定義と定数。アーキテクチャ非依存の共通データ構造を置く。

export type Arch = 'x86' | 'arm' | 'rv32'
export type Locale = 'ja' | 'en'

export interface Flags {
  zero: boolean
  negative: boolean
  carry: boolean
  overflow: boolean
}

export interface StackMeta {
  label: string
  // sw=ソフトウェア書き込み / hw=HW自動退避 / arr=配列要素
  // StackPanel のセル色分けに使う
  kind: 'sw' | 'hw' | 'arr'
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
  isArr?: boolean
  ptrReg?: string  // base register used inside [] — shown as ptr badge in RegisterPanel
  update: StateUpdate
}

export interface AsmLine {
  text: string
  isHeader?: boolean  // ラベル行・コメント行・空行は命令ではないため true にしてハイライト対象外にする
  phase?: Phase
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
export const BASE_SP_RV32 = 0x00080000 // RV32 スタック上端（下方向に成長）
export const BASE_PC_X86 = 0x401000   // x86-64 ELF の典型的なコードセグメント先頭
export const BASE_PC_ARM = 0x08000000 // ARM Cortex-M Flash メモリ先頭
export const BASE_PC_RV32 = 0x00010000 // RISC-V テキストセグメント先頭
export const BASE_ROM_DATA = 0x08010000 // リテラルプール疑似 ROM 領域の先頭（スタックパネル表示対象外）

// 無限ループ対策のトレース上限ステップ数（ARM / x86 トレーサー共通）
export const MAX_TRACE_STEPS = 500

// 仮想命令サイズ（ARM Thumb / x86-64 は可変長だが、シミュレーター内部では 4byte に統一して PC を管理する）
export const VIRTUAL_INSTR_SIZE = 4

// アーキテクチャ別の引数レジスタ順（ARM ABI: r0〜r3 / x86-64 System V ABI: rdi/rsi/rdx/rcx/r8/r9）
export const ARG_REGS: Record<Arch, readonly string[]> = {
  arm: ['r0', 'r1', 'r2', 'r3'],
  x86: ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'],
  rv32: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
}

// フレーム深度でローテーションする色（FrameViz・StackPanel・インタープリタ共通で 3 色をループ）
export const FRAME_COLORS_CYCLE: ReadonlyArray<'purple' | 'green' | 'orange'> = ['purple', 'green', 'orange']
