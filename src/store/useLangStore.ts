import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'en' | 'ru' | 'he'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'ru' as Lang,
      setLang: (lang: Lang) => set({ lang }),
    }),
    { name: 'lang-storage' }
  )
)
