<template>
  <div class="flex items-center gap-3">
    <h1 class="text-white font-bold text-lg shrink-0">AsmWalker</h1>
    <span class="text-gray-500 text-xs">{{ $t('app.subtitle') }}</span>
    <div class="ml-auto flex items-center gap-3 text-sm">
      <!-- Language toggle -->
      <div class="flex items-center rounded-md border border-gray-600 overflow-hidden text-xs font-mono">
        <button
          @click="locale !== 'en' && toggleLocale()"
          :class="locale === 'en'
            ? 'bg-gray-200 text-gray-900 font-bold'
            : 'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700'"
          class="px-2.5 py-1 transition-colors"
        >EN</button>
        <button
          @click="locale !== 'ja' && toggleLocale()"
          :class="locale === 'ja'
            ? 'bg-gray-200 text-gray-900 font-bold'
            : 'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700'"
          class="px-2.5 py-1 transition-colors border-l border-gray-600"
        >JA</button>
      </div>
      <!-- Guide dropdown -->
      <div class="relative group">
        <button class="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800">
          <span class="material-icons text-base leading-none">menu_book</span>
          <span>{{ $t('app.guide') }}</span>
          <span class="material-icons text-sm leading-none">expand_more</span>
        </button>
        <div class="absolute right-0 top-full pt-1 z-50 hidden group-hover:block">
          <div class="w-52 bg-gray-800 border border-gray-700 rounded shadow-lg">
            <a href="/guide/machine-code.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.machineCode') }}
            </a>
            <a href="/guide/asm-reading.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.asmReading') }}
            </a>
            <a href="/guide/stack.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.stack') }}
            </a>
            <a href="/guide/function-call.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.functionCall') }}
            </a>
            <a href="/guide/branch.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.branch') }}
            </a>
            <a href="/guide/pointer.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">article</span>{{ $t('app.guideItems.pointer') }}
            </a>
            <div class="border-t border-gray-700 my-1"></div>
            <a href="/about.html" target="_blank" rel="noopener"
               class="flex items-center gap-2 px-4 py-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
              <span class="material-icons text-sm text-gray-500">info</span>{{ $t('app.guideItems.about') }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

function toggleLocale() {
  const next = locale.value === 'ja' ? 'en' : 'ja'
  locale.value = next
  localStorage.setItem('asm-walker-locale', next)
}
</script>
