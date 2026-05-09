<template>
  <div class="bg-gray-800 rounded-lg border border-gray-700">
    <div class="px-3 py-2 bg-gray-700 text-gray-300 text-xs font-bold flex items-center">
      <span>{{ $t('cSourcePanel.header') }}</span>
      <div v-if="preset?.cCode?.length" class="relative flex items-center ml-auto">
        <Transition name="fade">
          <span v-if="copied" class="absolute bottom-7 left-1/2 -translate-x-1/2 text-xs text-green-400 whitespace-nowrap pointer-events-none bg-gray-900 px-1.5 py-0.5 rounded border border-gray-600">Copied!</span>
        </Transition>
        <button
          @click="copySrc"
          :title="$t('cSourcePanel.copyTitle')"
          class="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-600 transition-colors"
        >
          <span class="material-icons text-base text-gray-400">content_copy</span>
        </button>
      </div>
    </div>
    <div class="p-2 font-mono text-sm overflow-auto max-h-96" ref="cCodeEl">
      <div
        v-for="(line, i) in preset?.cCode ?? []"
        :key="i"
        :class="[
          'px-2 py-0.5 rounded transition-colors leading-relaxed',
          activeCLine === i
            ? isHW ? 'bg-orange-900/60 text-orange-200' : 'bg-green-900/60 text-green-200'
            : 'text-gray-300'
        ]"
      >
        <span class="text-gray-600 select-none mr-3 text-xs inline-block w-7 text-right">{{ i + 1 }}</span><span class="whitespace-pre-wrap">{{ line || ' ' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { useSimulator } from '@/composables/useSimulator'

const { preset, currentStepData } = useSimulator()

const cCodeEl = ref<HTMLElement | null>(null)
const activeCLine = computed(() => currentStepData.value?.cLine ?? -1)
const isHW = computed(() => currentStepData.value?.type === 'hw')
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

watch(activeCLine, async (line) => {
  if (line < 0 || !cCodeEl.value) return
  await nextTick()
  ;(cCodeEl.value.children[line] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

function copySrc() {
  const text = (preset.value?.cCode ?? []).join('\n')
  navigator.clipboard.writeText(text)
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 800)
}

onUnmounted(() => { if (copyTimer) clearTimeout(copyTimer) })
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
