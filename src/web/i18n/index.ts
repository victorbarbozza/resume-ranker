import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { auth } from './locales/auth'
import { candidates } from './locales/candidates'
import { common, vocabulary } from './locales/common'
import { errors } from './locales/errors'
import { jobs } from './locales/jobs'
import { ranking } from './locales/ranking'

/** The languages of the screen; English is the fallback */
export const LANGUAGES = ['en-US', 'pt-BR'] as const

/** One of LANGUAGES */
export type Language = (typeof LANGUAGES)[number]

/** Each language as it calls itself, so a person finds their own without reading another */
export const LANGUAGE_NAMES: Record<Language, string> = {
  'en-US': 'English',
  'pt-BR': 'Português',
}

/** Every text of the screen in English; the other languages must have the same keys */
const enUS = {
  common: common['en-US'],
  ...vocabulary['en-US'],
  errors: errors['en-US'],
  auth: auth['en-US'],
  jobs: jobs['en-US'],
  ranking: ranking['en-US'],
  candidates: candidates['en-US'],
}

/** Every text in Brazilian Portuguese; a missing or extra key fails the typecheck */
const ptBR: typeof enUS = {
  common: common['pt-BR'],
  ...vocabulary['pt-BR'],
  errors: errors['pt-BR'],
  auth: auth['pt-BR'],
  jobs: jobs['pt-BR'],
  ranking: ranking['pt-BR'],
  candidates: candidates['pt-BR'],
}

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof enUS }
  }
}

/** Where the chosen language is kept between visits */
const STORAGE_KEY = 'language'

/** The language saved on an earlier visit; storage can be blocked, which reads as none */
const savedLanguage = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The language the person chose before, else the first of the browser's that the screen has, else English */
const detectLanguage = (): Language => {
  const saved = savedLanguage()
  const chosen = LANGUAGES.find((language) => language === saved)
  if (chosen) return chosen
  for (const tag of navigator.languages) {
    if (tag.toLowerCase().startsWith('pt')) return 'pt-BR'
    if (tag.toLowerCase().startsWith('en')) return 'en-US'
  }
  return 'en-US'
}

void i18n.use(initReactI18next).init({
  resources: {
    'en-US': { translation: enUS },
    'pt-BR': { translation: ptBR },
  },
  lng: detectLanguage(),
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})
document.documentElement.lang = i18n.language
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

/** Switches the screen's language and remembers it for the next visit; without storage it lasts until the tab closes */
export const setLanguage = (language: Language) => {
  void i18n.changeLanguage(language)
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    return
  }
}

export { i18n }
