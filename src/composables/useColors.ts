import type { Phase } from '@/core/types'

/**
 * phase → CodePanel のラベル色 Tailwind クラスを返す。
 */
export function phaseClass(phase?: Phase): string {
  const map: Record<string, string> = {
    main:   'text-purple-400',
    caller: 'text-purple-400',
    callee: 'text-green-400',
    hw:     'text-orange-400',
    isr:    'text-green-400',
    ret:    'text-red-400',
  }
  return `${map[phase ?? ''] ?? 'text-gray-400'} text-xs`
}

/**
 * StackPanel の kind ごとの value / label 色クラスを返す。
 */
export function kindClass(kind: string): { value: string; label: string } {
  if (kind === 'arr') return { value: 'text-green-300 font-bold', label: 'text-green-400 text-xs ml-2' }
  if (kind === 'hw')  return { value: 'text-orange-300 font-bold', label: 'text-orange-400 text-xs ml-2' }
  return { value: '', label: 'text-gray-400 text-xs ml-2' }
}
