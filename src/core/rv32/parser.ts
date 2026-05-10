// RISC-V RV32GC アセンブラのパーサー。
// Godbolt (GCC -march=rv32gc -mabi=ilp32) の出力形式を前提とする。
// Compressed 拡張（c. プレフィックス）命令はシミュレーター非対応のためスキップする。

export interface RV32Instruction {
  lineIndex: number
  raw: string
  mnemonic: string   // 小文字正規化済み: 'addi', 'sw', 'beq', 'jal' など
  operands: RV32Operand[]
}

export type RV32Operand =
  | { type: 'reg';   name: string }               // 'a0', 'sp', 'zero' など ABI 名
  | { type: 'imm';   value: number }              // 即値
  | { type: 'mem';   base: string; offset: number } // 28(sp), -20(s0) 形式
  | { type: 'label'; name: string }               // ジャンプ先ラベル

export interface ParseError {
  lineIndex: number
  message: string
}

export interface RV32ParseResult {
  instructions: RV32Instruction[]
  labels: Map<string, number>   // ラベル名 → 命令インデックス
  sourceLines: string[]
  errors: ParseError[]
}

// ABI 名レジスタセット（パーサーが認識するもの）
const ABI_REGS = new Set([
  'zero', 'ra', 'sp', 'gp', 'tp',
  't0', 't1', 't2',
  's0', 's1',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  't3', 't4', 't5', 't6',
  // x0〜x31 形式も受け付ける
  ...Array.from({ length: 32 }, (_, i) => `x${i}`),
])

// x0〜x31 → ABI 名マッピング
const X_TO_ABI: Record<string, string> = {
  x0: 'zero', x1: 'ra', x2: 'sp', x3: 'gp', x4: 'tp',
  x5: 't0', x6: 't1', x7: 't2',
  x8: 's0', x9: 's1',
  x10: 'a0', x11: 'a1', x12: 'a2', x13: 'a3',
  x14: 'a4', x15: 'a5', x16: 'a6', x17: 'a7',
  x18: 's2', x19: 's3', x20: 's4', x21: 's5',
  x22: 's6', x23: 's7', x24: 's8', x25: 's9',
  x26: 's10', x27: 's11',
  x28: 't3', x29: 't4', x30: 't5', x31: 't6',
}

/** x0〜x31 形式を ABI 名に正規化する。既に ABI 名なら変更なし。 */
function normalizeReg(name: string): string {
  return X_TO_ABI[name] ?? name
}

/** 即値文字列を数値に変換する。10進・0x付き16進・負数に対応。
 *  NOTE: parseInt(s, 16) は "add" を 0xadd=2781 と解釈してしまうため使わない。
 *  Number() は "0xff" など 0x プレフィックス付き16進も正しく扱う。
 */
function parseImm(s: string): number | null {
  const n = Number(s)
  if (!isNaN(n)) return n
  return null
}

/**
 * オペランドトークンを RV32Operand に変換する。
 *
 * - `28(sp)` → mem
 * - レジスタ名 → reg
 * - 数値 / ラベル → imm / label
 */
function parseOperand(token: string, labels: Map<string, number>): RV32Operand {
  // メモリ形式: offset(base)
  const memMatch = token.match(/^(-?\d+)\((\w+)\)$/)
  if (memMatch) {
    const offset = parseInt(memMatch[1]!, 10)
    const base = normalizeReg(memMatch[2]!)
    return { type: 'mem', base, offset }
  }

  // レジスタ
  if (ABI_REGS.has(token)) {
    return { type: 'reg', name: normalizeReg(token) }
  }

  // 即値（数値リテラル）
  const imm = parseImm(token)
  if (imm !== null) return { type: 'imm', value: imm }

  // ラベル（ジャンプ先またはシンボル参照）
  return { type: 'label', name: token }
}

/**
 * ラベル行を検出する。括弧の外にある最初の ':' をラベル区切りとして扱う。
 * - "main:" → { name: "main", rest: "" }
 * - "add(int, int):" → { name: "add(int, int)", rest: "" }（スペース入り）
 * - ".L2:" → { name: ".L2", rest: "" }（ローカルラベル）
 * - "loop: addi ..." → { name: "loop", rest: "addi ..." }（同行命令あり）
 */
function extractLabel(trimmed: string): { name: string; rest: string } | null {
  let depth = 0
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (ch === ':' && depth === 0 && i > 0) {
      const name = trimmed.slice(0, i).trim()
      const rest = trimmed.slice(i + 1).trim()
      // 先頭が文字・ドット・アンダースコアであればラベルとみなす
      if (/^[.A-Za-z_]/.test(name)) {
        return { name, rest }
      }
    }
  }
  return null
}

// スキップすべきディレクティブのプレフィックス
const SKIP_PREFIXES = [
  '.text', '.globl', '.global', '.cfi_', '.size', '.type',
  '.file', '.section', '.align', '.p2align', '.set', '.equ',
  '.word', '.byte', '.half', '.string', '.asciz',
]

function shouldSkip(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return true
  return SKIP_PREFIXES.some(p => trimmed.startsWith(p))
}

/**
 * RISC-V アセンブリテキストをパースして命令リスト・ラベルマップを返す。
 *
 * @param text - Godbolt から得たアセンブリテキスト
 * @returns パース結果（instructions, labels, sourceLines, errors）
 */
export function parseRV32(text: string): RV32ParseResult {
  const rawLines = text.split('\n')
  const sourceLines: string[] = []
  const instructions: RV32Instruction[] = []
  const labels = new Map<string, number>()
  const errors: ParseError[] = []

  // 第1パス: ラベルを収集し、命令行を抽出
  const instrLines: { lineIndex: number; raw: string }[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? ''
    // # コメント除去
    const commentIdx = raw.indexOf('#')
    const line = (commentIdx >= 0 ? raw.slice(0, commentIdx) : raw).trimEnd()
    sourceLines.push(raw)

    if (shouldSkip(line)) continue

    const trimmed = line.trim()

    // ラベル行: "funcName:" / "add(int, int):" / ".L2:" などを検出
    // ラベルの後に命令が続く場合もある（例: "loop: addi a0, a0, 1"）
    const labelInfo = extractLabel(trimmed)
    if (labelInfo) {
      const { name: labelName, rest } = labelInfo
      labels.set(labelName, instrLines.length) // この時点の命令インデックス
      if (rest && !rest.startsWith('#')) {
        instrLines.push({ lineIndex: i, raw: rest })
      }
      continue
    }

    if (trimmed) {
      // Compressed 拡張命令（c. プレフィックス）はシミュレーター非対応のためスキップ
      // GCC -march=rv32gc は -O0 では c. 命令を出力しないが、高最適化レベルへの安全策として除去する
      const mnemonic = trimmed.split(/\s/)[0]?.toLowerCase() ?? ''
      if (!mnemonic.startsWith('c.')) {
        instrLines.push({ lineIndex: i, raw: trimmed })
      }
    }
  }

  // 第2パス: 命令をパース
  for (let idx = 0; idx < instrLines.length; idx++) {
    const entry = instrLines[idx]!
    const { lineIndex, raw } = entry

    // スペースで分割してニーモニックとオペランド文字列を取得
    const spaceIdx = raw.search(/\s/)
    const mnemonic = (spaceIdx >= 0 ? raw.slice(0, spaceIdx) : raw).toLowerCase()
    const operandStr = spaceIdx >= 0 ? raw.slice(spaceIdx + 1).trim() : ''

    // オペランドをカンマで分割（括弧内は分割しない）
    const operandTokens = splitOperands(operandStr)
    const operands: RV32Operand[] = operandTokens
      .filter(t => t.length > 0)
      .map(t => parseOperand(t, labels))

    instructions.push({ lineIndex, raw, mnemonic, operands })
  }

  return { instructions, labels, sourceLines, errors }
}

/** オペランド文字列を括弧内を考慮してカンマ分割する */
function splitOperands(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
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
