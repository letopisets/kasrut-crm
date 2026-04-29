import { useAppSelector } from '@/store/hooks'
import type { MapTranslations } from './types'
import en from './en'
import ru from './ru'
import he from './he'

const translations: Record<string, MapTranslations> = { en, ru, he }

export function useMapLang(): MapTranslations {
  const lang = useAppSelector(s => s.mapLang.lang)
  return translations[lang]
}
