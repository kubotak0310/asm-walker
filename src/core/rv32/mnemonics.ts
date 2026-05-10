// RISC-V RV32IM 命令のフル名と構文フォーマット。
// ExplainPanel の「命令詳細」表示に使う。

const FULL_NAMES: Record<string, string> = {
  // R型算術
  add:    'ADD',
  sub:    'SUBtract',
  and:    'AND',
  or:     'OR',
  xor:    'eXclusive OR',
  sll:    'Shift Left Logical',
  srl:    'Shift Right Logical',
  sra:    'Shift Right Arithmetic',
  slt:    'Set Less Than',
  sltu:   'Set Less Than Unsigned',

  // I型算術
  addi:   'ADD Immediate',
  andi:   'AND Immediate',
  ori:    'OR Immediate',
  xori:   'eXclusive OR Immediate',
  slli:   'Shift Left Logical Immediate',
  srli:   'Shift Right Logical Immediate',
  srai:   'Shift Right Arithmetic Immediate',
  slti:   'Set Less Than Immediate',
  sltiu:  'Set Less Than Immediate Unsigned',

  // U型
  lui:    'Load Upper Immediate',
  auipc:  'Add Upper Immediate to PC',

  // ロード
  lw:     'Load Word',
  lh:     'Load Halfword',
  lb:     'Load Byte',
  lhu:    'Load Halfword Unsigned',
  lbu:    'Load Byte Unsigned',

  // ストア
  sw:     'Store Word',
  sh:     'Store Halfword',
  sb:     'Store Byte',

  // 分岐
  beq:    'Branch if EQual',
  bne:    'Branch if Not Equal',
  blt:    'Branch if Less Than',
  bge:    'Branch if Greater or Equal',
  bltu:   'Branch if Less Than Unsigned',
  bgeu:   'Branch if Greater or Equal Unsigned',

  // ジャンプ
  jal:    'Jump And Link',
  jalr:   'Jump And Link Register',

  // M拡張
  mul:    'MULtiply',
  mulh:   'MULtiply High',
  mulhu:  'MULtiply High Unsigned',
  mulhsu: 'MULtiply High Signed Unsigned',
  div:    'DIVide',
  divu:   'DIVide Unsigned',
  rem:    'REMainder',
  remu:   'REMainder Unsigned',

  // 疑似命令
  mv:     'MoVe (pseudo)',
  li:     'Load Immediate (pseudo)',
  ret:    'RETurn (pseudo: jalr zero, ra, 0)',
  nop:    'No OPeration (pseudo: addi zero, zero, 0)',
  j:      'Jump (pseudo: jal zero, label)',
  call:   'CALL (pseudo: auipc + jalr)',
  jr:     'Jump Register (pseudo: jalr zero, rs, 0)',
  la:     'Load Address (pseudo)',
  not:    'NOT (pseudo: xori rd, rs, -1)',
  neg:    'NEGate (pseudo: sub rd, zero, rs)',
  seqz:   'Set if EQual to Zero (pseudo)',
  snez:   'Set if Not Equal to Zero (pseudo)',
  sltz:   'Set if Less Than Zero (pseudo)',
  sgtz:   'Set if Greater Than Zero (pseudo)',
  beqz:   'Branch if EQual to Zero (pseudo)',
  bnez:   'Branch if Not Equal to Zero (pseudo)',
  blez:   'Branch if Less or Equal to Zero (pseudo)',
  bgez:   'Branch if Greater or Equal to Zero (pseudo)',
  bltz:   'Branch if Less Than Zero (pseudo)',
  bgtz:   'Branch if Greater Than Zero (pseudo)',
}

const SYNTAX: Record<string, string> = {
  // R型
  add:    'add rd, rs1, rs2',
  sub:    'sub rd, rs1, rs2',
  and:    'and rd, rs1, rs2',
  or:     'or rd, rs1, rs2',
  xor:    'xor rd, rs1, rs2',
  sll:    'sll rd, rs1, rs2',
  srl:    'srl rd, rs1, rs2',
  sra:    'sra rd, rs1, rs2',
  slt:    'slt rd, rs1, rs2',
  sltu:   'sltu rd, rs1, rs2',

  // I型
  addi:   'addi rd, rs1, imm',
  andi:   'andi rd, rs1, imm',
  ori:    'ori rd, rs1, imm',
  xori:   'xori rd, rs1, imm',
  slli:   'slli rd, rs1, shamt',
  srli:   'srli rd, rs1, shamt',
  srai:   'srai rd, rs1, shamt',
  slti:   'slti rd, rs1, imm',
  sltiu:  'sltiu rd, rs1, imm',

  // U型
  lui:    'lui rd, imm',
  auipc:  'auipc rd, imm',

  // ロード
  lw:     'lw rd, offset(rs1)',
  lh:     'lh rd, offset(rs1)',
  lb:     'lb rd, offset(rs1)',
  lhu:    'lhu rd, offset(rs1)',
  lbu:    'lbu rd, offset(rs1)',

  // ストア
  sw:     'sw rs2, offset(rs1)',
  sh:     'sh rs2, offset(rs1)',
  sb:     'sb rs2, offset(rs1)',

  // 分岐
  beq:    'beq rs1, rs2, label',
  bne:    'bne rs1, rs2, label',
  blt:    'blt rs1, rs2, label',
  bge:    'bge rs1, rs2, label',
  bltu:   'bltu rs1, rs2, label',
  bgeu:   'bgeu rs1, rs2, label',

  // ジャンプ
  jal:    'jal rd, label',
  jalr:   'jalr rd, rs1, imm',

  // M拡張
  mul:    'mul rd, rs1, rs2',
  mulh:   'mulh rd, rs1, rs2',
  mulhu:  'mulhu rd, rs1, rs2',
  mulhsu: 'mulhsu rd, rs1, rs2',
  div:    'div rd, rs1, rs2',
  divu:   'divu rd, rs1, rs2',
  rem:    'rem rd, rs1, rs2',
  remu:   'remu rd, rs1, rs2',

  // 疑似
  mv:     'mv rd, rs',
  li:     'li rd, imm',
  ret:    'ret',
  nop:    'nop',
  j:      'j label',
  call:   'call label',
  jr:     'jr rs',
  la:     'la rd, symbol',
  not:    'not rd, rs',
  neg:    'neg rd, rs',
  beqz:   'beqz rs, label',
  bnez:   'bnez rs, label',
  blez:   'blez rs, label',
  bgez:   'bgez rs, label',
  bltz:   'bltz rs, label',
  bgtz:   'bgtz rs, label',
}

/**
 * 命令ニーモニックのフル名を返す。
 *
 * @param instr - 小文字正規化済みのニーモニック
 * @returns フル名文字列。未知の命令は undefined。
 */
export function getFullName(instr: string): string | undefined {
  const base = instr.toLowerCase().split(/\s/)[0] ?? ''
  return FULL_NAMES[base]
}

/**
 * 命令ニーモニックの構文フォーマットを返す。
 *
 * @param instr - 小文字正規化済みのニーモニック
 * @returns 構文文字列。未知の命令は undefined。
 */
export function getSyntax(instr: string): string | undefined {
  const base = instr.toLowerCase().split(/\s/)[0] ?? ''
  return SYNTAX[base]
}
