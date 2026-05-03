import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { daysUntil } from '@/lib/daysUntil'

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns positive number for a future date', () => {
    expect(daysUntil('2026-05-13')).toBe(10)
  })

  it('returns 0 for today', () => {
    expect(daysUntil('2026-05-03')).toBe(0)
  })

  it('returns negative number for a past date', () => {
    expect(daysUntil('2026-04-23')).toBe(-10)
  })

  it('returns 1 for tomorrow', () => {
    expect(daysUntil('2026-05-04')).toBe(1)
  })
})
