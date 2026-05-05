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

/**
 * ANSI エスケープシーケンスを文字列から除去する。
 *
 * Godbolt の stderr にはターミナルカラーコードが含まれるため、
 * ユーザーに表示する前に取り除く必要がある。
 *
 * @param s - ANSI コードを含む可能性がある文字列
 * @returns エスケープシーケンスを除去したプレーンテキスト
 */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

/**
 * Godbolt API レスポンスをパーサーが扱える形式に変換する。
 *
 * アセンブラ行テキストを結合して asmText を作り、
 * 各行の C ソース行対応を cLineMap に格納する。
 * コンパイル失敗時（code !== 0）は error フィールドに GCC の stderr を入れて返す。
 *
 * @param response - Godbolt Compiler Explorer API のレスポンスオブジェクト
 * @returns パーサーに渡す CompilerOutput（失敗時は error フィールドが設定される）
 */
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
      // Godbolt のソース行は 1-based のため、0-based に変換して格納する
      cLineMap.set(i, item.source.line - 1)
    }
  }

  return { asmText: lines.join('\n'), cLineMap, rawAsm: response.asm, gccOutput }
}
