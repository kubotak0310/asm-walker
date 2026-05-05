// x86-64 Intel syntax assembly parser (GCC output with -masm=intel)

import { splitByComma } from '../utils'

export interface X86Instruction {
  lineIndex: number   // index into sourceLines[]
  raw: string
  mnemonic: string    // uppercase: 'MOV', 'ADD', 'JE', etc.
  operands: X86Operand[]
}

export type X86Operand =
  | { type: 'reg'; name: string }
  | { type: 'imm'; value: number }
  | { type: 'mem'; size: 1 | 2 | 4 | 8; base?: string; index?: string; scale?: number; disp?: number }
  | { type: 'label'; name: string }

export interface ParseError {
  line: number
  message: string
}

export interface X86ParseResult {
  instructions: X86Instruction[]
  labels: Map<string, number>   // uppercase label name → instruction index
  sourceLines: string[]
  errors: ParseError[]
}

// Subregister normalization: all aliases map to 64-bit canonical name
const SUBREG: Record<string, string> = {
  // rax family
  rax: 'rax', eax: 'rax', ax: 'rax', ah: 'rax', al: 'rax',
  // rbx family
  rbx: 'rbx', ebx: 'rbx', bx: 'rbx', bh: 'rbx', bl: 'rbx',
  // rcx family
  rcx: 'rcx', ecx: 'rcx', cx: 'rcx', ch: 'rcx', cl: 'rcx',
  // rdx family
  rdx: 'rdx', edx: 'rdx', dx: 'rdx', dh: 'rdx', dl: 'rdx',
  // rsi family
  rsi: 'rsi', esi: 'rsi', si: 'rsi', sil: 'rsi',
  // rdi family
  rdi: 'rdi', edi: 'rdi', di: 'rdi', dil: 'rdi',
  // rsp family
  rsp: 'rsp', esp: 'rsp', sp: 'rsp', spl: 'rsp',
  // rbp family
  rbp: 'rbp', ebp: 'rbp', bp: 'rbp', bpl: 'rbp',
  // r8–r15 families
  r8: 'r8', r8d: 'r8', r8w: 'r8', r8b: 'r8',
  r9: 'r9', r9d: 'r9', r9w: 'r9', r9b: 'r9',
  r10: 'r10', r10d: 'r10', r10w: 'r10', r10b: 'r10',
  r11: 'r11', r11d: 'r11', r11w: 'r11', r11b: 'r11',
  r12: 'r12', r12d: 'r12', r12w: 'r12', r12b: 'r12',
  r13: 'r13', r13d: 'r13', r13w: 'r13', r13b: 'r13',
  r14: 'r14', r14d: 'r14', r14w: 'r14', r14b: 'r14',
  r15: 'r15', r15d: 'r15', r15w: 'r15', r15b: 'r15',
  // instruction pointer
  rip: 'rip',
}

/**
 * サブレジスタ名を 64bit 正規名に統一する。
 *
 * x86-64 では同一物理レジスタに複数の幅別エイリアスが存在する（eax/ax/ah/al はすべて rax の一部）。
 * シミュレーター内部では常に 64bit 名で保持することで幅別の分岐を排除する。
 *
 * @param s - 正規化対象のレジスタ名（大文字・小文字どちらでも可）
 * @returns 64bit 正規名（例: "eax" → "rax"、"al" → "rax"）。未知の名前はそのまま小文字で返す
 */
function normalizeReg(s: string): string {
  return SUBREG[s.toLowerCase()] ?? s.toLowerCase()
}

/**
 * 文字列が有効な x86-64 レジスタ名（サブレジスタ含む）かどうかを返す。
 *
 * SUBREG テーブルに含まれるすべてのエイリアス（eax/ax/ah/al 等）を有効と判定する。
 * オペランド解析でレジスタと即値・ラベルを区別するために使う。
 *
 * @param s - 判定対象の文字列
 * @returns レジスタ名として認識できる場合は true
 */
function isReg(s: string): boolean {
  return s.toLowerCase() in SUBREG
}

const SIZE_QUALIFIERS: Record<string, 1 | 2 | 4 | 8> = {
  'BYTE PTR': 1,
  'WORD PTR': 2,
  'DWORD PTR': 4,
  'QWORD PTR': 8,
}

/**
 * GAS アセンブラディレクティブ行かどうかを判定する。
 *
 * `.cfi_*` / `.section` / `.globl` 等はリンカやデバッガ向けのメタ情報であり、
 * 命令シミュレーションには不要なためパース対象から除外する。
 * 空行・コメント行（`;` / `#`）も同様に不要としてスキップする。
 *
 * @param line - ソース行の生文字列
 * @returns シミュレーション不要な行であれば true
 */
function isDirective(line: string): boolean {
  const t = line.trim()
  if (t === '') return true
  if (t.startsWith('.cfi_')) return true
  if (t.startsWith('.section')) return true
  if (t.startsWith('.file')) return true
  if (t.startsWith('.p2align')) return true
  if (t.startsWith('.align')) return true
  if (t.startsWith('.globl')) return true
  if (t.startsWith('.global')) return true
  if (t.startsWith('.text')) return true
  if (t.startsWith('.data')) return true
  if (t.startsWith('.bss')) return true
  if (t.startsWith('.size')) return true
  if (t.startsWith('.type')) return true
  if (t.startsWith('.ident')) return true
  if (t.startsWith('.intel_syntax')) return true
  if (t.startsWith('.att_syntax')) return true
  if (t.startsWith(';') || t.startsWith('#')) return true
  return false
}

/**
 * Intel 構文のメモリオペランド文字列を解析して `X86Operand` を返す。
 *
 * GCC が `-masm=intel` で出力するアドレッシングモード全般を扱う。
 * サイズ修飾子（`BYTE/WORD/DWORD/QWORD PTR`）を先頭で剥がし、
 * 続く `[...]` 内を `+`/`-` でトークン分割して base・index・scale・disp を抽出する。
 *
 * @param s - メモリオペランド文字列（例: `"DWORD PTR [rbp-4]"`、`"[rax+rcx*4+8]"`）
 * @returns 解析成功時は `{ type: 'mem', ... }`、`[...]` を含まない場合は `null`
 *
 * @example
 * parseMem('DWORD PTR [rbp-4]')
 * // → { type: 'mem', size: 4, base: 'rbp', disp: -4 }
 *
 * parseMem('[rax+rcx*4+8]')
 * // → { type: 'mem', size: 8, base: 'rax', index: 'rcx', scale: 4, disp: 8 }
 */
function parseMem(s: string): X86Operand | null {
  let size: 1 | 2 | 4 | 8 = 8
  let rest = s.trim()

  // Check for size qualifier
  for (const [qual, sz] of Object.entries(SIZE_QUALIFIERS)) {
    if (rest.toUpperCase().startsWith(qual)) {
      size = sz
      rest = rest.slice(qual.length).trim()
      break
    }
  }

  // Must be wrapped in [...]
  if (!rest.startsWith('[') || !rest.endsWith(']')) return null
  const inner = rest.slice(1, -1).trim()

  let base: string | undefined
  let index: string | undefined
  let scale: number | undefined
  let disp: number | undefined

  // Split by +/- keeping the sign, but handle negative displacements
  // Parse tokens: register, register*scale, number
  // Strategy: tokenize on + and -, then parse each token
  const tokens: string[] = []
  let cur = ''
  let i = 0
  while (i < inner.length) {
    const ch = inner[i]!
    if ((ch === '+' || ch === '-') && i > 0) {
      tokens.push(cur.trim())
      cur = ch
    } else {
      cur += ch
    }
    i++
  }
  if (cur.trim()) tokens.push(cur.trim())

  for (const tok of tokens) {
    const t = tok.trim()
    if (!t) continue

    // Check for negative sign
    const negative = t.startsWith('-')
    const val = negative ? t.slice(1).trim() : t

    // token with *scale: "rcx*4"
    if (val.includes('*')) {
      const [regPart, scalePart] = val.split('*').map(s => s.trim())
      if (regPart && scalePart && isReg(regPart)) {
        index = normalizeReg(regPart)
        scale = parseInt(scalePart, 10)
        continue
      }
    }

    // register reference
    if (isReg(val)) {
      if (!base) {
        base = normalizeReg(val)
      } else if (!index) {
        index = normalizeReg(val)
        scale = 1
      }
      continue
    }

    // immediate / displacement
    const num = parseImm(val)
    if (num !== null) {
      disp = (disp ?? 0) + (negative ? -num : num)
    }
  }

  return { type: 'mem', size, base, index, scale, disp }
}

/**
 * 即値文字列を JavaScript の `number` に変換する。
 *
 * 16進数プレフィックス（`0x` / `0X`）があれば基数16、なければ基数10で解析する。
 * 負符号（`-`）は呼び出し側が付与済みの場合と未付与の場合の両方を考慮し、
 * 変換できない文字列は `null` で返して呼び出し側に判断を委ねる。
 *
 * @param s - 即値文字列（例: `"42"`、`"0xff"`）
 * @returns 変換後の数値。非数値の場合は `null`
 */
function parseImm(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  // hex
  if (t.startsWith('0x') || t.startsWith('0X')) {
    const v = parseInt(t, 16)
    return isNaN(v) ? null : v
  }
  // decimal (may be negative via leading -)
  const v = parseInt(t, 10)
  return isNaN(v) ? null : v
}

/**
 * 単一オペランド文字列を `X86Operand` 型に変換する。
 *
 * メモリ参照 → レジスタ → 即値 → ラベルの順に判定する。
 * この優先順位は Intel 構文の曖昧性を解消するために重要で、
 * 例えば `DWORD PTR [rbp-4]` はサイズ修飾子があるため先頭で mem 判定できる。
 *
 * @param s - オペランド文字列（例: `"DWORD PTR [rbp-4]"`、`"rax"`、`"42"`、`"LABEL"`）
 * @returns 解析成功時は `X86Operand`。空文字や認識不能な場合は `null`
 */
function parseOperand(s: string): X86Operand | null {
  const t = s.trim()
  if (!t) return null

  // Memory reference: contains [ or starts with a size qualifier
  if (
    t.includes('[') ||
    t.toUpperCase().startsWith('BYTE') ||
    t.toUpperCase().startsWith('WORD') ||
    t.toUpperCase().startsWith('DWORD') ||
    t.toUpperCase().startsWith('QWORD')
  ) {
    return parseMem(t)
  }

  // Register
  if (isReg(t)) {
    return { type: 'reg', name: normalizeReg(t) }
  }

  // Immediate (numeric)
  const num = parseImm(t)
  if (num !== null) {
    return { type: 'imm', value: num }
  }

  // Negative immediate  (e.g. "-1")
  if (t.startsWith('-')) {
    const n = parseImm(t.slice(1))
    if (n !== null) return { type: 'imm', value: -n }
  }

  // Label / symbol reference (jump targets, call targets)
  // Accept identifiers that may include parens like "add(int, int)" — but by
  // this point the comma-splitting has already been done, so we just take the token.
  if (/^[A-Za-z_.@][\w.@()]*$/.test(t)) {
    return { type: 'label', name: t.toUpperCase() }
  }

  return null
}


/**
 * ソース行からラベル名を抽出して大文字正規化した文字列を返す。
 *
 * 行末が `:` で終わる行をラベルと判定する。
 * Compiler Explorer が出力する C++ 関数シグネチャ形式（例: `"add(int, int):"`）にも対応するため、
 * 識別子として `. @ ( )` を含む文字列を許容している。
 * ジャンプ先マップのキーとして大文字に正規化して返す。
 *
 * @param line - ソース行の生文字列
 * @returns ラベル名（大文字）。ラベルでない行は `null`
 */
function extractLabel(line: string): string | null {
  const t = line.trim()
  // Remove inline comment
  const noComment = t.replace(/;.*$/, '').replace(/#.*$/, '').trim()
  if (noComment.endsWith(':')) {
    // Everything before the last ':' is the label
    const labelRaw = noComment.slice(0, -1).trim()
    // Accept identifiers including dots, parens (function signatures)
    if (labelRaw && /^[A-Za-z_.@]/.test(labelRaw)) {
      // Normalize: strip C++ parameter types for function labels used as jump targets
      // e.g. "add(int, int)" → "ADD"
      // Keep the full form for display but normalize for lookup
      return labelRaw.toUpperCase()
    }
  }
  return null
}

/**
 * x86-64 Intel 構文アセンブラテキストをパースして `X86ParseResult` を返す。
 *
 * ラベルは命令インデックスを指す必要があるが、命令インデックスはディレクティブを除いた
 * 行を数えないと確定できない。そのため3パス構成を採る:
 * - パス1（仮収集）: ラベル位置を命令インデックスで仮記録しながら命令行を列挙
 * - パス2（再解決）: 命令行インデックス配列が確定した状態でラベルを正確なインデックスに再マップ
 * - パス3（構築）: 各命令行をニーモニック＋オペランドに分解して `X86Instruction` を生成
 *
 * @param asmText - GCC `-masm=intel` 出力などの x86-64 Intel 構文アセンブラテキスト
 * @returns パース結果（命令配列・ラベルマップ・ソース行・エラー一覧）
 */
export function parseX86(asmText: string): X86ParseResult {
  const sourceLines = asmText.split('\n')
  const instructions: X86Instruction[] = []
  const labels = new Map<string, number>()
  const errors: ParseError[] = []

  // First pass: collect labels and instruction line indices
  const instrLineIndices: number[] = []

  for (let li = 0; li < sourceLines.length; li++) {
    const raw = sourceLines[li] ?? ''

    if (isDirective(raw)) continue

    const label = extractLabel(raw)
    if (label !== null) {
      // A label line — might also have an instruction after the colon (rare for GCC output)
      labels.set(label, instructions.length + instrLineIndices.length) // will be resolved in pass 2
      // Check if there's an instruction after the colon
      const afterColon = raw.trim().replace(/^[^:]*:\s*/, '').replace(/;.*$/, '').trim()
      if (afterColon) {
        instrLineIndices.push(li)
      }
      continue
    }

    // Skip if line is only whitespace after directive check
    const t = raw.trim()
    if (!t) continue

    instrLineIndices.push(li)
  }

  // Second pass: re-scan with correct label → instr index mapping
  // Reset and redo properly
  labels.clear()
  const instrLines: number[] = []

  for (let li = 0; li < sourceLines.length; li++) {
    const raw = sourceLines[li] ?? ''
    if (isDirective(raw)) continue

    const label = extractLabel(raw)
    if (label !== null) {
      labels.set(label, instrLines.length)
      // Check for trailing instruction on same line (after colon)
      const afterColon = raw.trim().replace(/^[^:]*:\s*/, '').replace(/;.*$/, '').replace(/#.*$/, '').trim()
      if (afterColon && !isDirective('  ' + afterColon)) {
        instrLines.push(li)
      }
      continue
    }

    const t = raw.trim()
    if (t) instrLines.push(li)
  }

  // Third pass: parse each instruction line
  for (const li of instrLines) {
    const raw = sourceLines[li] ?? ''
    // Strip inline comment
    const noComment = raw.replace(/;.*$/, '').replace(/#.*$/, '').trim()
    // If this line was a label+instruction, take the part after ':'
    const instrPart = noComment.includes(':')
      ? noComment.replace(/^[^:]*:\s*/, '')
      : noComment

    const trimmed = instrPart.trim()
    if (!trimmed) continue

    // Split into mnemonic and operand string
    const spaceIdx = trimmed.search(/\s/)
    const mnemonic = (spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed).toUpperCase()
    const opStr = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1).trim() : ''

    const operandParts = opStr ? splitByComma(opStr) : []
    const operands: X86Operand[] = []

    for (const part of operandParts) {
      const op = parseOperand(part)
      if (op) {
        operands.push(op)
      } else if (part.trim()) {
        // Unknown operand — try as label for forward-ref
        operands.push({ type: 'label', name: part.trim().toUpperCase() })
      }
    }

    instructions.push({ lineIndex: li, raw: sourceLines[li] ?? '', mnemonic, operands })
  }

  return { instructions, labels, sourceLines, errors }
}
