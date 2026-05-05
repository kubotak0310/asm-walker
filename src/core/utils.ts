// ARM・x86 パーサー共通のユーティリティ関数

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
