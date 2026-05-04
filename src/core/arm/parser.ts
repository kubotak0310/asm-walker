// ARM assembly text parser — two-pass label resolution

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
  labels: Map<string, number>  // label name (uppercase) → instruction index
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

const REG_ALIASES: Record<string, string> = {
  SP: 'sp', R13: 'sp',
  LR: 'lr', R14: 'lr',
  PC: 'pc', R15: 'pc',
  FP: 'r11', R11: 'r11',
  SL: 'r10', R10: 'r10',
  IP: 'r12', R12: 'r12',
}

export function normalizeReg(raw: string): string {
  const upper = raw.trim().toUpperCase()
  return REG_ALIASES[upper] ?? upper.toLowerCase()
}

function isRegStr(s: string): boolean {
  const upper = s.trim().toUpperCase()
  return upper in REG_ALIASES || /^R\d{1,2}$/.test(upper)
}

function parseImmediate(s: string): number {
  const t = s.trim().replace(/^#/, '')
  if (/^-?0[xX]/.test(t)) return parseInt(t, 16)
  const n = parseInt(t, 10)
  return isNaN(n) ? 0 : n
}

function parseMnemonic(word: string): { base: string; cond: string; sFlag: boolean } {
  const upper = word.toUpperCase()

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

// Split operand string by commas, respecting [] {} () nesting
function splitByComma(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of s) {
    if (ch === '[' || ch === '{' || ch === '(') depth++
    else if (ch === ']' || ch === '}' || ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

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

export function parseARM(text: string): ParseResult {
  const sourceLines = text.split('\n')
  const errors: ParseError[] = []

  type LineItem =
    | { kind: 'label'; name: string }
    | { kind: 'instr'; lineIndex: number; text: string }

  const items: LineItem[] = []

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

    // Skip GAS assembler directives (start with '.', unless it's a local label like '.L0:')
    if (cleaned.startsWith('.') && !cleaned.match(/^\.[A-Za-z0-9_]+:/)) continue

    // Label definition — also handles Compiler Explorer format: 'square(int):' '.L0:' 'loop:'
    // Match: starts with identifier/dot, then optional content (including parens), then ':'
    const labelMatch = cleaned.match(/^([A-Za-z_.][^:]*?):\s*(.*)$/)
    if (labelMatch) {
      const rawName = (labelMatch[1] ?? '').trim()
      // Normalize: strip Compiler Explorer parameter types 'square(int)' → 'SQUARE'
      const baseName = rawName.replace(/\(.*$/, '').trim()
      items.push({ kind: 'label', name: baseName.toUpperCase() })
      const rest = (labelMatch[2] ?? '').trim()
      if (rest) {
        items.push({ kind: 'instr', lineIndex: i, text: rest })
      }
    } else {
      items.push({ kind: 'instr', lineIndex: i, text: cleaned })
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

  return { instructions, labels, sourceLines, errors }
}
