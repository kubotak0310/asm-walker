<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">{{ $t('specialRegPanel.header') }}</div>
    <div class="p-2 space-y-1 font-mono text-xs">
      <RegRow :label="arch === 'x86' ? 'RSP' : 'SP'" :sub-label="arch === 'x86' ? 'Stack Pointer' : undefined" :value="state.sp" :prev="prev?.sp" :changed="state.sp !== prev?.sp" kind="orange" />
      <RegRow :label="arch === 'x86' ? 'RBP' : 'FP'" :sub-label="arch === 'x86' ? 'Base Pointer' : undefined" :value="fpValue" :prev="prevFpValue" :changed="fpValue !== prevFpValue" kind="normal" />
      <RegRow v-if="arch === 'arm'" label="LR" :value="state.lr" :prev="prev?.lr" :changed="state.lr !== prev?.lr" kind="normal" />
      <RegRow :label="arch === 'x86' ? 'RIP' : 'PC'" :sub-label="arch === 'x86' ? 'Instruction Pointer' : undefined" :value="displayPc" :changed="displayPcChanged" kind="normal" />

      <!-- Flags -->
      <div class="pt-1 border-t border-gray-700 mt-1">
        <div class="text-gray-400 mb-1">{{ $t('specialRegPanel.flags') }}</div>
        <div class="flex gap-2 flex-wrap">
          <FlagBit v-for="f in flags" :key="f.name" :name="f.name" :value="f.value" :changed="f.changed" />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { useSimulator } from '@/composables/useSimulator'
import { hexU32 } from '@/core/simulator'

const { arch, currentState: state, prevState: prev, displayPc, displayPcChanged } = useSimulator()

const fpValue = computed(() =>
  arch.value === 'arm' ? (state.value.regs['r11'] ?? 0) : state.value.fp,
)
const prevFpValue = computed(() =>
  arch.value === 'arm' ? (prev.value?.regs['r11'] ?? 0) : (prev.value?.fp ?? 0),
)

const flags = computed(() => {
  const cur = state.value.flags
  const p = prev.value?.flags
  return [
    { name: 'Z', value: cur.zero, changed: p ? cur.zero !== p.zero : false },
    { name: 'N', value: cur.negative, changed: p ? cur.negative !== p.negative : false },
    { name: 'C', value: cur.carry, changed: p ? cur.carry !== p.carry : false },
    { name: 'V', value: cur.overflow, changed: p ? cur.overflow !== p.overflow : false },
  ]
})

const RegRow = defineComponent({
  props: {
    label: String,
    subLabel: String,
    value: Number,
    prev: Number,
    changed: Boolean,
    kind: String,
  },
  setup(props) {
    return () => {
      const val = props.value ?? 0
      const hex = hexU32(val)
      const isOrange = props.kind === 'orange'
      const changed = props.changed

      const valClass = isOrange && changed
        ? 'text-orange-300 font-bold'
        : changed
          ? 'text-green-300 font-bold'
          : 'text-gray-300'

      const rowClass = [
        'flex justify-between items-center px-2 py-1 rounded',
        isOrange && changed ? 'bg-orange-900/40' : changed ? 'bg-green-900/40' : '',
      ]

      const labelEl = props.subLabel
        ? h('div', { class: 'flex flex-col' }, [
            h('span', { class: changed ? 'text-white font-bold' : 'text-gray-400' }, props.label),
            h('span', { class: 'text-gray-400 text-[10px] leading-tight' }, `(${props.subLabel})`),
          ])
        : h('span', { class: changed ? 'text-white font-bold' : 'text-gray-400' }, props.label)

      return h('div', { class: rowClass }, [
        labelEl,
        h('span', { class: valClass }, hex),
      ])
    }
  },
})

const FlagBit = defineComponent({
  props: { name: String, value: Boolean, changed: Boolean },
  setup(props) {
    return () => h('div', {
      class: [
        'px-1.5 py-0.5 rounded text-xs font-mono',
        props.changed ? 'bg-yellow-800 text-yellow-200' : props.value ? 'bg-gray-600 text-gray-200' : 'bg-gray-800 text-gray-400',
      ],
    }, `${props.name}=${props.value ? '1' : '0'}`)
  },
})
</script>
