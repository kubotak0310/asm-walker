// ARM mnemonic lookup tables: full names and syntax formats

export const FULL_NAMES: Record<string, string> = {
  MOV: 'MOVE', MVN: 'MOVE NOT',
  ADD: 'ADD', ADC: 'ADD WITH CARRY',
  SUB: 'SUBTRACT', SBC: 'SUBTRACT WITH CARRY', RSB: 'REVERSE SUBTRACT',
  MUL: 'MULTIPLY', MLA: 'MULTIPLY ACCUMULATE', MLS: 'MULTIPLY SUBTRACT',
  SDIV: 'SIGNED DIVIDE', UDIV: 'UNSIGNED DIVIDE',
  AND: 'AND', ORR: 'OR', EOR: 'EXCLUSIVE OR', BIC: 'BIT CLEAR',
  LSL: 'LOGICAL SHIFT LEFT', LSR: 'LOGICAL SHIFT RIGHT',
  ASR: 'ARITHMETIC SHIFT RIGHT', ROR: 'ROTATE RIGHT',
  CMP: 'COMPARE', CMN: 'COMPARE NEGATIVE', TST: 'TEST', TEQ: 'TEST EQUIVALENCE',
  LDR: 'LOAD REGISTER', LDRB: 'LOAD REGISTER BYTE', LDRH: 'LOAD REGISTER HALFWORD',
  STR: 'STORE REGISTER', STRB: 'STORE REGISTER BYTE', STRH: 'STORE REGISTER HALFWORD',
  PUSH: 'PUSH MULTIPLE REGISTERS', POP: 'POP MULTIPLE REGISTERS',
  B: 'BRANCH', BL: 'BRANCH WITH LINK', BX: 'BRANCH EXCHANGE', BLX: 'BRANCH WITH LINK AND EXCHANGE',
  BEQ: 'BRANCH IF EQUAL', BNE: 'BRANCH IF NOT EQUAL',
  BLT: 'BRANCH IF LESS THAN', BGT: 'BRANCH IF GREATER THAN',
  BLE: 'BRANCH IF LESS OR EQUAL', BGE: 'BRANCH IF GREATER OR EQUAL',
  BCS: 'BRANCH IF CARRY SET', BHS: 'BRANCH IF HIGHER OR SAME',
  BCC: 'BRANCH IF CARRY CLEAR', BLO: 'BRANCH IF LOWER',
  BMI: 'BRANCH IF MINUS', BPL: 'BRANCH IF PLUS',
  BVS: 'BRANCH IF OVERFLOW', BVC: 'BRANCH IF NO OVERFLOW',
  BHI: 'BRANCH IF HIGHER', BLS: 'BRANCH IF LOWER OR SAME',
  CBZ: 'COMPARE AND BRANCH IF ZERO', CBNZ: 'COMPARE AND BRANCH IF NOT ZERO',
  NOP: 'NO OPERATION',
}

export const SYNTAX: Record<string, string> = {
  MOV: 'MOV{S} Rd, Rn / #imm', MVN: 'MVN{S} Rd, Rn / #imm',
  ADD: 'ADD{S} Rd, Rn, Rm / #imm', ADC: 'ADC{S} Rd, Rn, Rm',
  SUB: 'SUB{S} Rd, Rn, Rm / #imm', SBC: 'SBC{S} Rd, Rn, Rm', RSB: 'RSB{S} Rd, Rn, #imm',
  MUL: 'MUL{S} Rd, Rn, Rm', MLA: 'MLA{S} Rd, Rn, Rm, Ra', MLS: 'MLS Rd, Rn, Rm, Ra',
  SDIV: 'SDIV Rd, Rn, Rm', UDIV: 'UDIV Rd, Rn, Rm',
  AND: 'AND{S} Rd, Rn, Rm / #imm', ORR: 'ORR{S} Rd, Rn, Rm / #imm',
  EOR: 'EOR{S} Rd, Rn, Rm / #imm', BIC: 'BIC{S} Rd, Rn, Rm / #imm',
  LSL: 'LSL{S} Rd, Rn, Rm / #imm', LSR: 'LSR{S} Rd, Rn, Rm / #imm',
  ASR: 'ASR{S} Rd, Rn, Rm / #imm', ROR: 'ROR{S} Rd, Rn, Rm / #imm',
  CMP: 'CMP Rn, Rm / #imm', CMN: 'CMN Rn, Rm / #imm',
  TST: 'TST Rn, Rm / #imm', TEQ: 'TEQ Rn, Rm',
  LDR: 'LDR Rt, [Rn{, #offset}]', LDRB: 'LDRB Rt, [Rn{, #offset}]', LDRH: 'LDRH Rt, [Rn{, #offset}]',
  STR: 'STR Rt, [Rn{, #offset}]', STRB: 'STRB Rt, [Rn{, #offset}]', STRH: 'STRH Rt, [Rn{, #offset}]',
  PUSH: 'PUSH {reglist}', POP: 'POP {reglist}',
  B: 'B label', BL: 'BL label', BX: 'BX Rm', BLX: 'BLX Rm',
  BEQ: 'BEQ label', BNE: 'BNE label',
  BLT: 'BLT label', BGT: 'BGT label', BLE: 'BLE label', BGE: 'BGE label',
  BCS: 'BCS label', BCC: 'BCC label', BHS: 'BHS label', BLO: 'BLO label',
  BMI: 'BMI label', BPL: 'BPL label', BVS: 'BVS label', BVC: 'BVC label',
  BHI: 'BHI label', BLS: 'BLS label',
  CBZ: 'CBZ Rn, label', CBNZ: 'CBNZ Rn, label',
  NOP: 'NOP',
}

export function getSyntax(instr: string): string {
  const mnemonic = instr.trim().split(/\s/)[0]?.toUpperCase() ?? ''
  if (SYNTAX[mnemonic]) return SYNTAX[mnemonic]
  if (mnemonic.endsWith('S')) {
    const base = mnemonic.slice(0, -1)
    const baseSyntax = SYNTAX[base]
    if (baseSyntax) return (mnemonic + baseSyntax.slice(base.length)).replace('{S}', '')
  }
  return ''
}

export function getFullName(instr: string): string {
  const mnemonic = instr.trim().split(/\s/)[0]?.toUpperCase() ?? ''
  if (FULL_NAMES[mnemonic]) return FULL_NAMES[mnemonic]
  if (mnemonic.endsWith('S')) {
    const base = mnemonic.slice(0, -1)
    const baseName = FULL_NAMES[base]
    if (baseName) return `${baseName} (FLAGS UPDATE)`
  }
  return ''
}
