// ARM・x86 パーサー・インタープリタ共通のユーティリティ関数

import type { MachineState, StackFrame } from './types'

/**
 * トップフレームの lo（スタック下限）を新しい SP 値で更新して返す。
 *
 * PUSH/SUB SP など SP が変化する命令で呼び出し、フレームサイズ表示を最新に保つ。
 * フレームが存在しない場合は空配列をそのまま返す。
 *
 * @param newSp - 更新後の SP 値
 * @param state - 現在のマシン状態
 * @returns lo が更新されたフレーム配列のコピー
 */
export function updateTopFrame(newSp: number, state: MachineState): StackFrame[] {
  if (state.frames.length === 0) return []
  const frames = [...state.frames]
  const last = frames[frames.length - 1]
  if (!last) return frames
  frames[frames.length - 1] = { ...last, lo: newSp }
  return frames
}

/**
 * オペランド文字列を括弧ネストを考慮してカンマで分割する。
 *
 * `[]`・`{}`・`()` 内のカンマでは分割しないため、
 * `[r0, #4]` や `{r0, r1}` が誤って分割されるのを防げる。
 * ARM・x86 どちらのオペランド構文にも対応できる。
 *
 * @param s - 分割するオペランド文字列
 * @returns 分割されたトークンの配列（各要素は trim 済み）
 */
export function splitByComma(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of s) {
    if (ch === '[' || ch === '{' || ch === '(') depth++
    else if (ch === ']' || ch === '}' || ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}
