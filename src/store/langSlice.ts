import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Lang = 'en' | 'ru' | 'he'

interface LangState { lang: Lang }

function loadLang(): Lang {
  try {
    const raw = localStorage.getItem('lang-storage')
    if (!raw) return 'ru'
    const parsed = JSON.parse(raw) as { lang?: Lang }
    return parsed.lang ?? 'ru'
  } catch { return 'ru' }
}

const langSlice = createSlice({
  name: 'lang',
  initialState: { lang: loadLang() } as LangState,
  reducers: {
    setLang(state, action: PayloadAction<Lang>) {
      state.lang = action.payload
      try { localStorage.setItem('lang-storage', JSON.stringify({ lang: action.payload })) } catch { /* ignore */ }
    },
  },
})

export const { setLang } = langSlice.actions
export default langSlice.reducer
