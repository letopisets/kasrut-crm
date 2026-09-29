// Guards against implausible restaurant coordinates entering the DB — the
// class of bug where an address is real but its lat/lng land in the sea (or
// outside Israel). The offshore case is what put ~80 establishments in the
// Mediterranean; a settlement-distance check does not catch it because those
// points were only ~1–2 km from the city, so we test against the coastline.

export interface Coordinates {
  lat: number
  lng: number
}

// Generous bounding box for Israel + immediate surroundings (incl. Eilat).
const ISRAEL_BOUNDS = { minLat: 29.3, maxLat: 33.4, minLng: 34.2, maxLng: 35.95 }

// Calibrated Mediterranean waterline: latitude → coast longitude. Land is
// EAST of this value; anything meaningfully WEST of it is in the sea. Only
// applied inside the coastal latitude band so inland cities (Jerusalem,
// Bnei Brak, Beit Shemesh) and the Red Sea (Eilat) are never flagged.
// North of 32.55 the coast follows the Carmel shore (Dor, Atlit, Tirat Carmel,
// Haifa's beaches ≈ 34.955) up to the Bat Galim cape, then jumps to the Haifa
// Bay shore (Kiryat Haim/Yam ≈ 35.06): a single straight line from Dor to Akko
// used to put central Haifa, Atlit and Tirat Carmel "in the sea". Bay water
// east of the cape is not flagged (one longitude per latitude can't model it).
// Calibrated on GovMap beach POIs, 2026-09.
const MED_COAST: ReadonlyArray<readonly [number, number]> = [
  [32.92, 35.05], [32.85, 35.05], [32.845, 34.95], [32.78, 34.95],
  [32.73, 34.943], [32.70, 34.928], [32.64, 34.92], [32.61, 34.912],
  [32.55, 34.905], [32.42, 34.878], [32.35, 34.858],
  [32.32, 34.850], [32.28, 34.838], [32.20, 34.808], [32.16, 34.793],
  [32.11, 34.770], [32.08, 34.752], [32.05, 34.748], [32.02, 34.739],
  [31.99, 34.735], [31.96, 34.729], [31.90, 34.700], [31.83, 34.655],
  [31.80, 34.630], [31.66, 34.552], [31.55, 34.480],
]
const MED_LAT_MIN = MED_COAST[MED_COAST.length - 1][0]
const MED_LAT_MAX = MED_COAST[0][0]
// Only flag points clearly out to sea, so beachfront/promenade venues that
// sit right on the waterline are never rejected (~250 m ≈ 0.00225°).
const SEA_MARGIN_DEG = 0.00225

/** Interpolated coastline longitude at a given latitude (land is east of it). */
function coastLngAt(lat: number): number {
  if (lat >= MED_COAST[0][0]) return MED_COAST[0][1]
  if (lat <= MED_COAST[MED_COAST.length - 1][0]) return MED_COAST[MED_COAST.length - 1][1]
  for (let i = 0; i < MED_COAST.length - 1; i += 1) {
    const [la1, ln1] = MED_COAST[i]
    const [la2, ln2] = MED_COAST[i + 1]
    if (lat <= la1 && lat >= la2) {
      const t = (lat - la1) / (la2 - la1)
      return ln1 + t * (ln2 - ln1)
    }
  }
  return MED_COAST[MED_COAST.length - 1][1]
}

export function isWithinIsrael({ lat, lng }: Coordinates): boolean {
  return lat >= ISRAEL_BOUNDS.minLat && lat <= ISRAEL_BOUNDS.maxLat
    && lng >= ISRAEL_BOUNDS.minLng && lng <= ISRAEL_BOUNDS.maxLng
}

// Server-side twin of the map SPA's region router: Hebrew text or a well-known
// Israeli city name means the address should be geocoded IL-restricted.
const HEBREW_BLOCK = /[֐-׿]/
const IL_CITY_HINTS = /\b(israel|jerusalem|tel[ -]?aviv|haifa|ashdod|ashkelon|netanya|beer[ -]?sheva|bnei[ -]?brak|petah|rishon|holon|ramat[ -]?gan|herzliya|tiberias|eilat|nazareth|modiin|rehovot|tzfat|safed|beit[ -]?shemesh|kiryat)\b/i

export function looksLikeIsraeliAddress(address: string, city: string): boolean {
  const s = `${address} ${city}`
  return HEBREW_BLOCK.test(s) || IL_CITY_HINTS.test(s)
}

/** True if the point lies in the Mediterranean, west of the coastline. */
export function isInMediterraneanSea({ lat, lng }: Coordinates): boolean {
  if (lat < MED_LAT_MIN || lat > MED_LAT_MAX) return false
  return lng < coastLngAt(lat) - SEA_MARGIN_DEG
}

export class CoordinateValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CoordinateValidationError'
  }
}

/**
 * Throws CoordinateValidationError when coordinates are not plausible for a
 * real establishment. The map is worldwide, so any finite point on the globe
 * is allowed; the Mediterranean waterline check still applies to points that
 * land inside the Israel bounding box (the class of bug that put ~80 places
 * in the sea).
 */
export function assertPlausibleCoordinates(coords: Coordinates): void {
  const { lat, lng } = coords
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new CoordinateValidationError('Coordinates must be finite numbers')
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new CoordinateValidationError(`Coordinates ${lat}, ${lng} are out of range`)
  }
  if (isWithinIsrael(coords) && isInMediterraneanSea(coords)) {
    throw new CoordinateValidationError(
      `Coordinates ${lat}, ${lng} fall in the sea — pick a point on land`,
    )
  }
}
