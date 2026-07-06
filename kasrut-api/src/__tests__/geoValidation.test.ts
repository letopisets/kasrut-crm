import {
  assertPlausibleCoordinates,
  isInMediterraneanSea,
  isWithinIsrael,
  CoordinateValidationError,
} from '../lib/geoValidation'

describe('geoValidation', () => {
  describe('isWithinIsrael', () => {
    it('accepts points across Israel incl. Eilat', () => {
      expect(isWithinIsrael({ lat: 31.7767, lng: 35.2345 })).toBe(true) // Jerusalem
      expect(isWithinIsrael({ lat: 29.55, lng: 34.95 })).toBe(true)     // Eilat
      expect(isWithinIsrael({ lat: 32.79, lng: 34.99 })).toBe(true)     // Haifa
    })
    it('rejects points outside the bounding box', () => {
      expect(isWithinIsrael({ lat: 40.0, lng: 34.8 })).toBe(false)
      expect(isWithinIsrael({ lat: 32.0, lng: 30.0 })).toBe(false)
    })
  })

  describe('isInMediterraneanSea', () => {
    it('flags the offshore coordinates that caused the bug', () => {
      // Bat Yam "Derech Ben Gurion 97" — real inland address, sea coordinates.
      expect(isInMediterraneanSea({ lat: 32.02439, lng: 34.72887 })).toBe(true)
      // Netanya "Weizmann 17" — inland address, sea coordinates.
      expect(isInMediterraneanSea({ lat: 32.33874, lng: 34.84041 })).toBe(true)
    })
    it('accepts the corrected on-land coordinates', () => {
      expect(isInMediterraneanSea({ lat: 32.026137, lng: 34.741016 })).toBe(false) // Bat Yam corrected
      expect(isInMediterraneanSea({ lat: 32.330366, lng: 34.858513 })).toBe(false) // Netanya corrected
    })
    it('does not flag inland cities or the Red Sea', () => {
      expect(isInMediterraneanSea({ lat: 31.7767, lng: 35.2345 })).toBe(false) // Jerusalem
      expect(isInMediterraneanSea({ lat: 32.0853, lng: 34.8300 })).toBe(false) // Bnei Brak
      expect(isInMediterraneanSea({ lat: 29.55, lng: 34.90 })).toBe(false)     // Eilat / Red Sea
    })
    it('tolerates beachfront points right at the waterline (margin)', () => {
      // Just west of the Tel Aviv coast but within the 250 m tolerance.
      expect(isInMediterraneanSea({ lat: 32.08, lng: 34.7515 })).toBe(false)
    })
  })

  describe('assertPlausibleCoordinates', () => {
    it('throws for sea coordinates', () => {
      expect(() => assertPlausibleCoordinates({ lat: 32.02439, lng: 34.72887 }))
        .toThrow(CoordinateValidationError)
    })
    it('throws for coordinates outside Israel', () => {
      expect(() => assertPlausibleCoordinates({ lat: 48.85, lng: 2.35 }))
        .toThrow(/outside Israel/)
    })
    it('throws for non-finite input', () => {
      expect(() => assertPlausibleCoordinates({ lat: NaN, lng: 34.8 })).toThrow()
    })
    it('accepts a valid on-land point', () => {
      expect(() => assertPlausibleCoordinates({ lat: 32.0171, lng: 34.7500 })).not.toThrow()
    })
  })
})
