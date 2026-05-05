// MachineState の不変更新ユーティリティ。インタープリタが作った StateUpdate を前の状態に適用し
// 新しいスナップショットを返す。直接ミュートしないことでステップの前後移動を O(1) で実現する。

import type { MachineState, StateUpdate } from './types'

/**
 * StateUpdate を前の状態に適用し、新しい MachineState スナップショットを返す。
 *
 * スタック・メタデータ・レジスタをそれぞれマージし、残りは state の値を引き継ぐ。
 * 直接ミュートしないことでステップの前後移動を O(1) で実現する。
 *
 * @param state - 適用元となる現在の MachineState
 * @param update - インタープリタが生成した差分情報
 * @returns 新しい MachineState スナップショット（state は変更しない）
 */
export function applyUpdate(state: MachineState, update: StateUpdate): MachineState {
  const newStack = { ...state.stack }
  const newMeta = { ...state.stackMeta }

  if (update.stackSet) {
    for (const [addrStr, val] of Object.entries(update.stackSet)) {
      newStack[Number(addrStr)] = val
    }
  }
  if (update.stackRemove) {
    for (const addr of update.stackRemove) {
      delete newStack[addr]
    }
  }
  if (update.metaSet) {
    for (const [addrStr, meta] of Object.entries(update.metaSet)) {
      newMeta[Number(addrStr)] = meta
    }
  }
  if (update.metaRemove) {
    for (const addr of update.metaRemove) {
      delete newMeta[addr]
    }
  }

  const mergedRegs: Record<string, number> = { ...state.regs }
  if (update.regs) {
    for (const [k, v] of Object.entries(update.regs)) {
      if (v !== undefined) mergedRegs[k] = v
    }
  }

  return {
    regs: mergedRegs,
    sp: update.sp ?? state.sp,
    fp: update.fp ?? state.fp,
    lr: update.lr ?? state.lr,
    pc: update.pc ?? state.pc,
    stack: newStack,
    stackMeta: newMeta,
    flags: update.flags ? { ...state.flags, ...update.flags } : { ...state.flags },
    mode: update.mode ?? state.mode,
    frames: update.frames ? [...update.frames] : [...state.frames],
  }
}

/**
 * プリセットの全ステップを順に適用して MachineState の配列を返す。
 *
 * PC が明示されていないステップは前の PC+4 を使う。
 * ARM/x86 どちらも仮想命令サイズを 4byte に統一している。
 *
 * @param preset - 初期状態とステップ配列を持つプリセット定義
 * @returns 各ステップ実行後の MachineState スナップショットの配列（先頭は initialState）
 */
export function buildStates(preset: { initialState: MachineState; steps: { update: StateUpdate }[] }): MachineState[] {
  const states: MachineState[] = [preset.initialState]
  let prevPc = preset.initialState.pc
  for (const step of preset.steps) {
    const last = states[states.length - 1]
    if (!last) break
    // PC は明示 (call/BL/ret/BX LR) がなければ +4 進める
    const nextPc = step.update.pc ?? prevPc + 4
    states.push(applyUpdate(last, { ...step.update, pc: nextPc }))
    prevPc = nextPc
  }
  return states
}

/**
 * 32bit 値を "0x00000000" 形式の文字列に変換する。
 *
 * アドレスやスタック値の表示を統一するために使う。
 *
 * @param v - 変換する数値（32bit 符号なし整数として扱う）
 * @returns "0x" プレフィックス付きの8桁16進数文字列
 * @example
 * hexU32(255)       // → "0x000000ff"
 * hexU32(0x7fff00)  // → "0x007fff00"
 */
export function hexU32(v: number): string {
  return `0x${v.toString(16).padStart(8, '0')}`
}

/**
 * レジスタ値がスタック領域付近のアドレスかどうかを判定する。
 *
 * RegisterPanel のレジスタ色分け（紫ハイライト）に使う。
 * 実際の仮想スタック領域に近い範囲のみを対象にすることで誤検知を減らしている。
 *
 * @param val - 判定するレジスタの値
 * @param arch - アーキテクチャ種別（'x86' | 'arm'）
 * @returns スタック領域付近のアドレスと見なせる場合は true
 */
export function isAddressLike(val: number, arch: 'x86' | 'arm'): boolean {
  if (arch === 'x86') return val >= 0x7ff000 && val <= 0x800000
  return val >= 0x20007000 && val <= 0x20009000
}
