// ARM assembly text parser — two-pass label resolution

import { splitByComma } from '../utils'

export interface ParsedInstruction {
  lineIndex: number  // index into sourceLines[]
  raw: string
  mnemonic: string   // uppercase base, e.g. 'MOV', 'B'
  cond: string       // 'AL' | 'EQ' | 'NE' | ...
  sFlag: boolean
  operands: Operand[]
}

export type Operand =
  | { type: 'reg'; name: string; shift?: { op: 'LSL' | 'LSR' | 'ASR' | 'ROR'; amount: number } }
  | { type: 'imm'; value: number }
  | { type: 'mem'; base: string; offset: number; writeBack?: boolean; postIndex?: number }
  | { type: 'reglist'; regs: string[] }
  | { type: 'label'; name: string }

export interface ParseError {
  line: number
  message: string
}

export interface ParseResult {
  instructions: ParsedInstruction[]
  labels: Map<string, number>       // label name (uppercase) → instruction index
  dataLabels: Map<string, number>   // literal-pool label (uppercase) → simulated ROM address
  romData: Map<number, number>      // ROM address → value (pre-populated from .word directives)
  sourceLines: string[]
  errors: ParseError[]
}

const COND_CODES = new Set([
  'EQ','NE','CS','HS','CC','LO','MI','PL','VS','VC','HI','LS','GE','LT','GT','LE',
])

// Mnemonics that start with 'B' but must NOT be split into B + condition
const B_EXCEPTIONS = new Set(['BL','BX','BLX','BIC','BICS','BKPT'])

// Mnemonics that accept an optional 'S' suffix to update flags
const S_SUFFIX_BASES = new Set([
  'MOV','MVN','ADD','SUB','ADC','SBC','RSB','AND','ORR','EOR','BIC',
  'LSL','LSR','ASR','ROR','MUL','MLA','MLS',
])

// FP/SL/IP は Compiler Explorer の GCC ARM 出力で頻出するエイリアス名。
// 正規名（r11/r10/r12）に統一しないとインタープリタのレジスタ参照が壊れる。
const REG_ALIASES: Record<string, string> = {
  SP: 'sp', R13: 'sp',
  LR: 'lr', R14: 'lr',
  PC: 'pc', R15: 'pc',
  FP: 'r11', R11: 'r11',
  SL: 'r10', R10: 'r10',
  IP: 'r12', R12: 'r12',
}

/**
 * レジスタ名を小文字の正規名に統一する。
 *
 * FP/SL/IP などのエイリアスを r11/r10/r12 に変換し、
 * インタープリタ側でレジスタ参照が壊れないようにする。
 *
 * @param raw - 正規化前のレジスタ名文字列（大文字・小文字どちらでも可）
 * @returns 小文字の正規レジスタ名（例: `"FP"` → `"r11"`、`"R0"` → `"r0"`）
 */
export function normalizeReg(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return REG_ALIASES[upper] ?? upper.toLowerCase()
}

/**
 * 文字列が有効な ARM レジスタ名かどうかを返す。
 *
 * r0〜r12 の番号付きレジスタと、SP/LR/PC/FP/SL/IP などのエイリアスを受け付ける。
 * オペランド判定で「レジスタかラベルか」を区別するために使う。
 *
 * @param s - 判定する文字列
 * @returns レジスタ名として有効なら `true`
 */
function isRegStr(s: string): boolean {
  const upper = s.trim().toUpperCase()
  return upper in REG_ALIASES || /^R\d{1,2}$/.test(upper)
}

/**
 * ARM の即値文字列を数値に変換する。
 *
 * ARM アセンブラでは `#4` のように `#` プレフィックスが付くが、
 * GCC 出力では付かない場合もあるため、どちらも受け付ける。
 * 16 進数（`0x` / `0X` プレフィックス）にも対応する。
 *
 * @param s - 即値文字列（例: `"#4"`、`"4"`、`"#0x20"`）
 * @returns 変換後の整数値。解析失敗時は `0`
 */
function parseImmediate(s: string): number {
  const t = s.trim().replace(/^#/, '')
  if (/^-?0[xX]/.test(t)) return parseInt(t, 16)
  const n = parseInt(t, 10)
  return isNaN(n) ? 0 : n
}

/**
 * ニーモニック文字列を基底命令・条件コード・S フラグに分解する。
 *
 * ARM 命令は `ADDS`（S フラグ付き）や `BEQ`（条件コード付き）のように
 * 基底ニーモニックにサフィックスが結合した形で書かれる。
 * この関数はそれを分解して正規化された 3 フィールドに変換する。
 *
 * @param word - ニーモニック文字列（大文字・小文字どちらでも可）
 * @returns 分解結果
 *
 * @example
 * parseMnemonic("ADDS")  // → { base: 'ADD', cond: 'AL', sFlag: true }
 * parseMnemonic("BEQ")   // → { base: 'B',   cond: 'EQ', sFlag: false }
 * parseMnemonic("MOV")   // → { base: 'MOV', cond: 'AL', sFlag: false }
 */
function parseMnemonic(word: string): { base: string; cond: string; sFlag: boolean } {
  // Thumb-2 幅指定サフィックス（.w = wide, .n = narrow）は意味に影響しないため除去する
  const upper = word.toUpperCase().replace(/\.(W|N)$/, '')

  if (upper === 'B') return { base: 'B', cond: 'AL', sFlag: false }

  // B<cond>: BEQ, BNE, BLT, BGT, BLE, BGE, BHI, BLS, ...
  if (upper.startsWith('B') && !B_EXCEPTIONS.has(upper)) {
    const suffix = upper.slice(1)
    if (COND_CODES.has(suffix)) return { base: 'B', cond: suffix, sFlag: false }
  }

  // ADDS, MOVS, SUBS, ... → strip S suffix
  if (upper.endsWith('S') && S_SUFFIX_BASES.has(upper.slice(0, -1))) {
    return { base: upper.slice(0, -1), cond: 'AL', sFlag: true }
  }

  return { base: upper, cond: 'AL', sFlag: false }
}

/**
 * レジスタリストの中身文字列をレジスタ名の配列に展開する。
 *
 * `{r0-r3, lr}` のような PUSH/POP オペランドの `{}` 内の文字列を受け取り、
 * `"r0-r3"` のような範囲指定も個別のレジスタ名に展開する。
 *
 * @param inner - `{}` を除いたレジスタリスト文字列（例: `"r0-r3, lr"`）
 * @returns 正規化されたレジスタ名の配列（例: `["r0","r1","r2","r3","lr"]`）
 */
function parseReglist(inner: string): string[] {
  const regs: string[] = []
  for (const part of inner.split(',').map(s => s.trim())) {
    if (part.includes('-')) {
      const [from = '', to = ''] = part.split('-').map(s => s.trim())
      const fromNum = parseInt(from.replace(/[Rr]/, ''), 10)
      const toNum = parseInt(to.replace(/[Rr]/, ''), 10)
      for (let i = fromNum; i <= toNum; i++) regs.push(`r${i}`)
    } else {
      regs.push(normalizeReg(part))
    }
  }
  return regs
}


/**
 * 単一オペランド文字列を Operand 型に変換する。
 *
 * レジスタ・即値・メモリ参照・レジスタリスト・ラベルの順に判定する。
 * メモリ参照は pre-indexed（`[r0, #4]!`）と post-indexed（`[r0], #4`）の両形式に対応する。
 * ラベルは Compiler Explorer 形式（`sum(int, int)` → `"SUM"`）も正規化する。
 *
 * @param s - 変換するオペランド文字列（例: `"r0"`、`"#4"`、`"[sp, #8]"`）
 * @returns 変換後の Operand オブジェクト。解析不能な場合は `null`
 */
function parseOperandStr(s: string): Operand | null {
  const t = s.trim()
  if (!t) return null

  if (t.startsWith('{')) {
    const close = t.indexOf('}')
    if (close < 0) return null
    return { type: 'reglist', regs: parseReglist(t.slice(1, close)) }
  }

  if (t.startsWith('[')) {
    const close = t.indexOf(']')
    if (close < 0) return null
    const inner = t.slice(1, close)
    const after = t.slice(close + 1).trim()
    const parts = inner.split(',').map(p => p.trim())
    const base = normalizeReg(parts[0] ?? '')
    const offset = parts[1] ? parseImmediate(parts[1]) : 0
    if (after === '!') return { type: 'mem', base, offset, writeBack: true }
    if (after.startsWith(',')) return { type: 'mem', base, offset: 0, postIndex: parseImmediate(after.slice(1)) }
    return { type: 'mem', base, offset }
  }

  if (t.startsWith('#') || /^-?\d/.test(t)) {
    return { type: 'imm', value: parseImmediate(t) }
  }

  // Shifted register: "r1,LSL #2" or "r1, lsl #2" (fused from splitByComma post-processing)
  const shiftFused = t.match(/^([A-Za-z][A-Za-z0-9]*)\s*,\s*(LSL|LSR|ASR|ROR)\s+#(\d+)$/i)
  if (shiftFused && isRegStr(shiftFused[1] ?? '')) {
    return {
      type: 'reg',
      name: normalizeReg(shiftFused[1] ?? ''),
      shift: { op: (shiftFused[2] ?? '').toUpperCase() as 'LSL' | 'LSR' | 'ASR' | 'ROR', amount: parseInt(shiftFused[3] ?? '0', 10) },
    }
  }

  if (isRegStr(t)) return { type: 'reg', name: normalizeReg(t) }

  // Label reference — also handles Compiler Explorer style 'sum(int, int)'
  if (/^[A-Za-z_.]/.test(t)) {
    // Strip parameter types: 'sum(int, int)' → 'SUM'
    const baseName = t.replace(/\(.*$/, '').trim()
    return { type: 'label', name: baseName.toUpperCase() }
  }

  return null
}

/**
 * ARM アセンブラテキスト全体を 2 パスでパースして ParseResult を返す。
 *
 * パス 1 でラベル名→命令インデックスのマップを構築し、
 * パス 2 で各命令行をパースして ParsedInstruction の配列を生成する。
 * GAS 形式（Compiler Explorer 出力: `square(int):` ラベル・`@` コメント）と
 * 手書きアセンブラ（`;` コメント）の両方に対応する。
 *
 * @param text - パース対象の ARM アセンブラソース全文
 * @returns パース結果（命令配列・ラベルマップ・ソース行・エラーリスト）
 */
export function parseARM(text: string): ParseResult {
  const sourceLines = text.split('\n')
  const errors: ParseError[] = []

  type LineItem =
    | { kind: 'label'; name: string }
    | { kind: 'instr'; lineIndex: number; text: string }

  const items: LineItem[] = []

  // Simulated ROM region for GCC literal pool data (.word directives).
  // GCC emits `ldr rN, .LX` + `.LX: .word val_or_addr` for large constants / array inits.
  // We assign each data label a fake ROM address so ldm/ldr can access them via state.stack.
  const BASE_ROM = 0x08010000
  const dataLabels = new Map<string, number>()
  const pendingWords: Array<{ addr: number; rawValue: string }> = []
  let romOffset = 0
  let lastDataLabel: string | null = null

  for (let i = 0; i < sourceLines.length; i++) {
    const raw = sourceLines[i] ?? ''

    // Strip comments: ';' (user style) and '@' (GAS/ARM Compiler Explorer style)
    const semiIdx = raw.indexOf(';')
    const atIdx = raw.indexOf('@')
    const firstComment = Math.min(
      semiIdx >= 0 ? semiIdx : Infinity,
      atIdx >= 0 ? atIdx : Infinity,
    )
    const cleaned = (firstComment < Infinity ? raw.slice(0, firstComment) : raw).trim()
    if (!cleaned) continue

    // .word directive: assign ROM address to the preceding label and queue for resolution.
    // Two cases: `.word 3` (immediate) and `.word .L6` (address of another label).
    const wordMatch = cleaned.match(/^\.word\s+(.+)/)
    if (wordMatch) {
      const addr = BASE_ROM + romOffset
      if (lastDataLabel !== null && !dataLabels.has(lastDataLabel)) {
        dataLabels.set(lastDataLabel, addr)
      }
      pendingWords.push({ addr, rawValue: (wordMatch[1] ?? '').trim() })
      romOffset += 4
      continue
    }

    // Skip GAS assembler directives (start with '.', unless it's a local label like '.L0:')
    if (cleaned.startsWith('.') && !cleaned.match(/^\.[A-Za-z0-9_]+:/)) continue

    // Label definition — also handles Compiler Explorer format: 'square(int):' '.L0:' 'loop:'
    // Match: starts with identifier/dot, then optional content (including parens), then ':'
    const labelMatch = cleaned.match(/^([A-Za-z_.][^:]*?):\s*(.*)$/)
    if (labelMatch) {
      const rawName = (labelMatch[1] ?? '').trim()
      // Normalize: strip Compiler Explorer parameter types 'square(int)' → 'SQUARE'
      const baseName = rawName.replace(/\(.*$/, '').trim()
      const upperName = baseName.toUpperCase()
      items.push({ kind: 'label', name: upperName })
      lastDataLabel = upperName  // may become a data label if followed by .word
      const rest = (labelMatch[2] ?? '').trim()
      if (rest) {
        items.push({ kind: 'instr', lineIndex: i, text: rest })
        lastDataLabel = null  // trailing instruction means this is a code label
      }
    } else {
      items.push({ kind: 'instr', lineIndex: i, text: cleaned })
      lastDataLabel = null  // instruction seen — last label was a code label
    }
  }

  // Resolve pendingWords: immediate values stored directly, label refs resolved to ROM address
  const romData = new Map<number, number>()
  for (const { addr, rawValue } of pendingWords) {
    if (/^[A-Za-z_.]/.test(rawValue)) {
      const refName = rawValue.replace(/\(.*$/, '').trim().toUpperCase()
      romData.set(addr, dataLabels.get(refName) ?? 0)
    } else {
      romData.set(addr, parseImmediate(rawValue))
    }
  }

  // Pass 1: map label name → instruction index
  const labels = new Map<string, number>()
  let instrCount = 0
  for (const item of items) {
    if (item.kind === 'label') labels.set(item.name, instrCount)
    else instrCount++
  }

  // Pass 2: parse each instruction
  const instructions: ParsedInstruction[] = []
  for (const item of items) {
    if (item.kind !== 'instr') continue
    const { lineIndex, text } = item

    const spIdx = text.search(/\s/)
    const mnStr = spIdx >= 0 ? text.slice(0, spIdx) : text
    const opStr = spIdx >= 0 ? text.slice(spIdx + 1).trim() : ''
    const { base, cond, sFlag } = parseMnemonic(mnStr)

    const operands: Operand[] = []
    if (opStr) {
      // If the entire operand string is a reglist, parse as one unit
      if (opStr.startsWith('{')) {
        const op = parseOperandStr(opStr)
        if (op) operands.push(op)
      } else {
        // Merge shift specifiers (LSL/LSR/ASR/ROR) into the preceding part
        const rawParts = splitByComma(opStr)
        const fusedParts: string[] = []
        for (const part of rawParts) {
          if (/^(LSL|LSR|ASR|ROR)\s/i.test(part.trim()) && fusedParts.length > 0) {
            fusedParts[fusedParts.length - 1] += ',' + part
          } else {
            fusedParts.push(part)
          }
        }
        for (const part of fusedParts) {
          const op = parseOperandStr(part)
          if (op) operands.push(op)
          else errors.push({ line: lineIndex, message: `不明なオペランド: ${part.trim()}` })
        }
      }
    }

    instructions.push({ lineIndex, raw: text, mnemonic: base, cond, sFlag, operands })
  }

  return { instructions, labels, dataLabels, romData, sourceLines, errors }
}
