import { describe, it, expect } from 'vitest'
import { computeOpenStatus } from '@/lib/openNow'

// 2026-07-08 is a Wednesday (getDay() === 3) and not Shabbat/Yom Tov, so these
// exercise the weekly-hours branch without the Shabbat override.
const wed = (h: number, m = 0) => new Date(2026, 6, 8, h, m)

describe('computeOpenStatus (weekly hours)', () => {
  it('returns unknown when no structured hours are on file', () => {
    expect(computeOpenStatus(null, wed(12))).toBe('unknown')
    expect(computeOpenStatus(undefined, wed(12))).toBe('unknown')
  })

  it('is open inside the interval and closed outside it', () => {
    const h = { '3': { open: '09:00', close: '22:00' } }
    expect(computeOpenStatus(h, wed(12))).toBe('open')
    expect(computeOpenStatus(h, wed(8))).toBe('closed')
    expect(computeOpenStatus(h, wed(23))).toBe('closed')
  })

  it('is closed on a day with no entry', () => {
    expect(computeOpenStatus({ '2': { open: '09:00', close: '22:00' } }, wed(12))).toBe('closed')
  })

  it('handles intervals that run past midnight', () => {
    const h = { '3': { open: '20:00', close: '02:00' } }
    expect(computeOpenStatus(h, wed(23))).toBe('open')
    expect(computeOpenStatus(h, wed(10))).toBe('closed')
  })
})
