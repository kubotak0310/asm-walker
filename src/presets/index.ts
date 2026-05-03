import { x86FuncCall } from './x86/funcCall'
import { x86Arithmetic } from './x86/arithmetic'
import { x86Branch } from './x86/branch'
import { x86Pointer } from './x86/pointer'
import { x86Array } from './x86/array'
import { armFuncCall } from './arm/funcCall'
import { armArithmetic } from './arm/arithmetic'
import { armBranch } from './arm/branch'
import { armPointer } from './arm/pointer'
import { armArray } from './arm/array'
import { armInterrupt } from './arm/interrupt'
import type { PresetData, Arch } from '@/core/types'

export const allPresets: PresetData[] = [
  x86FuncCall, x86Arithmetic, x86Branch, x86Pointer, x86Array,
  armFuncCall, armArithmetic, armBranch, armPointer, armArray, armInterrupt,
]

export function getPresets(arch: Arch): PresetData[] {
  return allPresets.filter(p => p.arch === arch)
}

export function getPreset(arch: Arch, id: string): PresetData | undefined {
  return allPresets.find(p => p.arch === arch && p.id === id)
}

export type { PresetData }
