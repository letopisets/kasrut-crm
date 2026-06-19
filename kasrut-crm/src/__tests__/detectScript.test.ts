import { describe, it, expect } from 'vitest'
import { detectScript, scriptToNameField } from '@/lib/detectScript'

describe('detectScript', () => {
  it('detects Hebrew', () => {
    expect(detectScript('ירושלים')).toBe('he')
    expect(detectScript('יר')).toBe('he')
    expect(detectScript('חיפה')).toBe('he')
  })

  it('detects Russian (Cyrillic)', () => {
    expect(detectScript('Иерусалим')).toBe('ru')
    expect(detectScript('Ир')).toBe('ru')
    expect(detectScript('Хайфа')).toBe('ru')
  })

  it('detects English (Latin)', () => {
    expect(detectScript('Jerusalem')).toBe('en')
    expect(detectScript('Je')).toBe('en')
    expect(detectScript('Haifa')).toBe('en')
  })

  it('returns unknown for empty or digit-only input', () => {
    expect(detectScript('')).toBe('unknown')
    expect(detectScript('123')).toBe('unknown')
    expect(detectScript('   ')).toBe('unknown')
  })

  it('ignores spaces and punctuation when detecting', () => {
    expect(detectScript('тель авив')).toBe('ru')
    expect(detectScript('tel aviv')).toBe('en')
    expect(detectScript('תל אביב')).toBe('he')
  })

  it('picks dominant script for mixed input', () => {
    // Mostly Cyrillic with one Latin char — still Russian
    expect(detectScript('ИерусалимJ')).toBe('ru')
  })
})

describe('scriptToNameField', () => {
  it('maps scripts to correct field names', () => {
    expect(scriptToNameField('he')).toBe('nameHe')
    expect(scriptToNameField('ru')).toBe('nameRu')
    expect(scriptToNameField('en')).toBe('nameEn')
    expect(scriptToNameField('unknown')).toBe('nameHe')  // fallback to Hebrew
  })
})
