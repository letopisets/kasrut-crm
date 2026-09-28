import {
  assertPlausibleCoordinates,
  isInMediterraneanSea,
  isWithinIsrael,
  looksLikeIsraeliAddress,
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
    it('keeps Haifa, the Carmel coast and Haifa Bay on land', () => {
      const land: Array<[number, number]> = [
        [32.8019, 34.9849],   // Haifa downtown (ביכורים 2)
        [32.8110, 34.9978],   // Hadar (הרצל 20)
        [32.8185, 34.9885],   // German Colony
        [32.8300, 34.9820],   // Bat Galim
        [32.8059, 34.9554],   // Hof HaCarmel beach
        [32.7934, 34.9557],   // Dado beach
        [32.7600, 34.9720],   // Tirat Carmel
        [32.6878, 34.9403],   // Atlit
        [32.6204, 34.9177],   // Dor beach
        [32.8347, 35.0529],   // Kiryat Haim beach
        [32.8491, 35.0620],   // Kiryat Yam, Zevulun beach
        [32.9205, 35.0675],   // Akko old city
      ]
      for (const [lat, lng] of land) expect(isInMediterraneanSea({ lat, lng })).toBe(false)
    })
    it('still flags points off the Carmel coast', () => {
      expect(isInMediterraneanSea({ lat: 32.80, lng: 34.93 })).toBe(true)    // 2 km off Haifa
      expect(isInMediterraneanSea({ lat: 32.70, lng: 34.90 })).toBe(true)    // off Atlit
      expect(isInMediterraneanSea({ lat: 32.62, lng: 34.89 })).toBe(true)    // off Dor
      expect(isInMediterraneanSea({ lat: 32.88, lng: 35.00 })).toBe(true)    // mouth of Haifa Bay
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

  describe('looksLikeIsraeliAddress', () => {
    it('detects Hebrew addresses', () => {
      expect(looksLikeIsraeliAddress("רח' יפו 42", 'ירושלים')).toBe(true)
    })
    it('detects well-known Israeli city names in Latin script', () => {
      expect(looksLikeIsraeliAddress('Jaffa 42', 'Jerusalem')).toBe(true)
      expect(looksLikeIsraeliAddress('Herzl 55', 'Haifa')).toBe(true)
    })
    it('treats foreign addresses as non-Israeli', () => {
      expect(looksLikeIsraeliAddress('Rue des Rosiers 7', 'Paris')).toBe(false)
      expect(looksLikeIsraeliAddress('5th Avenue 350', 'New York')).toBe(false)
    })
  })
