import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type MapLang = 'en' | 'ru' | 'he'

const STORAGE_KEY = 'kasrut-map-lang'

function detectLang(): MapLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ru' || saved === 'he') return saved
  } catch { /* ignore */ }

  const browser = navigator.language.toLowerCase()
  if (browser.startsWith('ru')) return 'ru'
  if (browser.startsWith('he') || browser.startsWith('iw')) return 'he'
  return 'en'
}

interface MapLangState { lang: MapLang }

const mapLangSlice = createSlice({
  name: 'mapLang',
  initialState: { lang: detectLang() } as MapLangState,
  reducers: {
    setMapLang(state, action: PayloadAction<MapLang>) {
      state.lang = action.payload
      try { localStorage.setItem(STORAGE_KEY, action.payload) } catch { /* ignore */ }
    },
  },
})

export const { setMapLang } = mapLangSlice.actions
export default mapLangSlice.reducer
