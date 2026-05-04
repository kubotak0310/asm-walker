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
  error?: string                  // set when compilation failed (code !== 0)
  gccOutput: string               // raw gcc stderr — always populated (errors + warnings)
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

export function adaptGodboltResponse(response: GodboltResponse): CompilerOutput {
  const gccOutput = response.stderr?.map(e => stripAnsi(e.text)).join('\n').trim() ?? ''

  if (response.code !== 0 || !response.asm) {
    return {
      asmText: '', cLineMap: new Map(), rawAsm: [],
      error: gccOutput || `コンパイルエラー (exit code ${response.code})`,
      gccOutput,
    }
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

  return { asmText: lines.join('\n'), cLineMap, rawAsm: response.asm, gccOutput }
}
