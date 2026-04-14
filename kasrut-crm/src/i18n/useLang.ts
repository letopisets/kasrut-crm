import { useLangStore } from '@/store/useLangStore'
import type { Translations } from './types'
import en from './en'
import ru from './ru'
import he from './he'

const translations: Record<string, Translations> = { en, ru, he }

export const useLang = (): Translations => {
  const lang = useLangStore(s => s.lang)
  return translations[lang]
}
