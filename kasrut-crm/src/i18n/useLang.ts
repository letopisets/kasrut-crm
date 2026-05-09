import { useAppSelector } from '@/store'
import type { Translations } from './types'
import en from './en'
import ru from './ru'
import he from './he'

const translations: Record<string, Translations> = { en, ru, he }

export const useLang = (): Translations => {
  const lang = useAppSelector(s => s.lang.lang)
  return translations[lang]
}
