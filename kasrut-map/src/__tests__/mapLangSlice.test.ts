import { describe, it, expect, beforeEach } from 'vitest'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'

beforeEach(() => {
  localStorage.clear()
})

describe('mapLangSlice', () => {
  it('setMapLang updates lang in state', () => {
    const next = mapLangReducer({ lang: 'en' }, setMapLang('ru'))
    expect(next.lang).toBe('ru')
  })

  it('setMapLang persists to localStorage', () => {
    mapLangReducer({ lang: 'en' }, setMapLang('he'))
    expect(localStorage.getItem('kasrut-map-lang')).toBe('he')
  })

  it('accepts en, ru and he', () => {
    expect(mapLangReducer({ lang: 'en' }, setMapLang('en')).lang).toBe('en')
    expect(mapLangReducer({ lang: 'en' }, setMapLang('ru')).lang).toBe('ru')
    expect(mapLangReducer({ lang: 'en' }, setMapLang('he')).lang).toBe('he')
  })
})
