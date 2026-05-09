import { createI18n } from 'vue-i18n'
import ja from './locales/ja'
import en from './locales/en'

const saved = localStorage.getItem('asm-walker-locale')
const browser = navigator.language.startsWith('ja') ? 'ja' : 'en'
const locale = (saved === 'ja' || saved === 'en') ? saved : browser

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'en',
  messages: { ja, en },
})

export type Locale = 'ja' | 'en'
