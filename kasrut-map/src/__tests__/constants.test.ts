import { describe, it, expect } from 'vitest'
import {
  PRIMARY, FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI, KASHRUT_COLOR,
  RADIUS_VALUES, DEFAULT_CENTER, DEFAULT_ZOOM,
} from '@/lib/constants'

const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s)

describe('map constants', () => {
  it('PRIMARY is a hex colour', () => {
    expect(isHex(PRIMARY)).toBe(true)
  })

  it('FOOD_TYPE_COLOR has all four food types as hex', () => {
    for (const c of Object.values(FOOD_TYPE_COLOR)) expect(isHex(c)).toBe(true)
    expect(Object.keys(FOOD_TYPE_COLOR).sort()).toEqual(['dairy', 'meat', 'pareve', 'takeaway'])
  })

  it('FOOD_TYPE_EMOJI matches FOOD_TYPE_COLOR keys', () => {
    expect(Object.keys(FOOD_TYPE_EMOJI).sort()).toEqual(Object.keys(FOOD_TYPE_COLOR).sort())
  })

  it('KASHRUT_COLOR has mehadrin, badatz, regular', () => {
    expect(Object.keys(KASHRUT_COLOR).sort()).toEqual(['badatz', 'mehadrin', 'regular'])
  })

  it('RADIUS_VALUES contains null as the open-ended option', () => {
    expect(RADIUS_VALUES).toContain(null)
    expect(RADIUS_VALUES.filter(v => typeof v === 'number')).toHaveLength(7)
  })

  it('DEFAULT_CENTER points to Jerusalem area', () => {
    const [lat, lng] = DEFAULT_CENTER
    expect(lat).toBeGreaterThan(31)
    expect(lat).toBeLessThan(33)
    expect(lng).toBeGreaterThan(34)
    expect(lng).toBeLessThan(36)
  })

  it('DEFAULT_ZOOM is reasonable for city-level view', () => {
    expect(DEFAULT_ZOOM).toBeGreaterThanOrEqual(10)
    expect(DEFAULT_ZOOM).toBeLessThanOrEqual(18)
  })
})
