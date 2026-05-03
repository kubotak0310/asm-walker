<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold">特殊レジスタ</div>
    <div class="p-2 space-y-1 font-mono text-xs">
      <RegRow label="SP" :value="state.sp" :prev="prev?.sp" :changed="state.sp !== prev?.sp" kind="orange" />
      <RegRow label="FP" :value="state.fp" :prev="prev?.fp" :changed="state.fp !== prev?.fp" kind="normal" />
      <RegRow v-if="arch === 'arm'" label="LR" :value="state.lr" :prev="prev?.lr" :changed="state.lr !== prev?.lr" :kind="isExcReturn ? 'exc' : 'normal'" />
      <RegRow label="PC" :value="displayPc" :changed="displayPcChanged" kind="normal" />

      <!-- Flags -->
      <div class="pt-1 border-t border-gray-700 mt-1">
        <div class="text-gray-500 mb-1">フラグ</div>
        <div class="flex gap-2 flex-wrap">
          <FlagBit v-for="f in flags" :key="f.name" :name="f.name" :value="f.value" :changed="f.changed" />
        </div>
      </div>

      <!-- Mode (ARM only) -->
      <div v-if="arch === 'arm'" class="pt-1 border-t border-gray-700 mt-1">
        <div class="flex items-center gap-2">
          <span class="text-gray-500">Mode:</span>
          <span :class="state.mode === 'handler' ? 'text-orange-300 font-bold' : 'text-green-300'">
            {{ state.mode === 'handler' ? 'Handler Mode (IRQ中)' : 'Thread Mode' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { arch, currentState: state, prevState: prev, displayPc, displayPcChanged } = useSimulator()

const EXC_RETURN = 0xfffffff9

const isExcReturn = computed(() => state.value.lr === EXC_RETURN)

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
    value: Number,
    prev: Number,
    changed: Boolean,
    kind: String,
  },
  setup(props) {
    return () => {
      const val = props.value ?? 0
      const hex = `0x${val.toString(16).padStart(8, '0')}`
      const isOrange = props.kind === 'orange'
      const isExc = props.kind === 'exc'
      const changed = props.changed

      const valClass = isExc
        ? 'text-orange-300 font-bold'
        : isOrange && changed
          ? 'text-orange-300 font-bold'
          : changed
            ? 'text-green-300 font-bold'
            : 'text-gray-300'

      const rowClass = [
        'flex justify-between px-2 py-1 rounded',
        isOrange && changed ? 'bg-orange-900/40' : changed ? 'bg-green-900/40' : '',
      ]

      return h('div', { class: rowClass }, [
        h('span', { class: changed ? 'text-white font-bold' : 'text-gray-400' }, props.label),
        h('div', { class: 'flex items-center gap-1' }, [
          isExc ? h('span', { class: 'text-orange-500 text-xs' }, 'EXC_RETURN') : null,
          h('span', { class: valClass }, hex),
        ]),
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
        props.changed ? 'bg-yellow-800 text-yellow-200' : props.value ? 'bg-gray-600 text-gray-200' : 'bg-gray-800 text-gray-600',
      ],
    }, `${props.name}=${props.value ? '1' : '0'}`)
  },
})
</script>
