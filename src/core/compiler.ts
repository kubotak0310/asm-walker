// Godbolt Compiler Explorer API response adapter

export interface GodboltAsmItem {
  text: string
  source: { file: null | string; line: number } | null
  labels?: Array<{ name: string; range: { startCol: number; endCol: number } }>
}

export interface GodboltResponse {
  code: number
  asm: GodboltAsmItem[]
  stderr?: Array<{ text: string }>
}

export interface CompilerOutput {
  asmText: string                 // joined text for parseARM()
  cLineMap: Map<number, number>   // 0-based asmLine index → 0-based C source line
  rawAsm: GodboltAsmItem[]
  error?: string
}

export function adaptGodboltResponse(response: GodboltResponse): CompilerOutput {
  if (response.code !== 0 || !response.asm) {
    const msg =
      response.stderr?.map(e => e.text).join('\n').trim() ||
      `コンパイルエラー (code ${response.code})`
    return { asmText: '', cLineMap: new Map(), rawAsm: [], error: msg }
  }

  const lines: string[] = []
  const cLineMap = new Map<number, number>()

  for (let i = 0; i < response.asm.length; i++) {
    const item = response.asm[i]
    if (!item) continue
    lines.push(item.text)
    if (item.source?.line != null) {
      cLineMap.set(i, item.source.line - 1)  // Godbolt is 1-based
    }
  }

  return { asmText: lines.join('\n'), cLineMap, rawAsm: response.asm }
}
