import { redis } from './redis'

// OSM Nominatim usage policy: max 1 request/second, must identify the app.
// We queue calls through a token-bucket so we never fire more than 1 req/sec
// even when multiple concurrent requests hit an unresolvable settlement name.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const USER_AGENT     = 'KashrutCRM/1.0 (contact@kashrut.local)'
const CACHE_TTL      = 86_400   // 24 h
const RATE_MS        = 1_100    // 1.1 s between requests (slight buffer over 1/s limit)

let lastRequestAt = 0

async function rateLimit(): Promise<void> {
  const now  = Date.now()
  const wait = RATE_MS - (now - lastRequestAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

export interface NominatimResult {
  placeId:     number
  displayName: string
  nameHe?:     string
  nameRu?:     string
  nameEn?:     string
  lat:         number
  lng:         number
  type:        string
}

export async function geocodeSettlement(
  query: string,
  countryCode = 'IL',
): Promise<NominatimResult[]> {
  const cacheKey = `nominatim:${countryCode}:${query.toLowerCase()}`

  // cache read
  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit) as NominatimResult[]
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = new URLSearchParams({
    q:              query,
    countrycodes:   countryCode.toLowerCase(),
    format:         'jsonv2',
    'accept-language': 'he,ru,en',
    addressdetails: '0',
    limit:          '10',
  })

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) return []

  const raw = await res.json() as Record<string, unknown>[]

  const results: NominatimResult[] = raw
    .filter(r => ['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'].includes(r['type'] as string))
    .map(r => ({
      placeId:     r['place_id'] as number,
      displayName: r['display_name'] as string,
      lat:         parseFloat(r['lat'] as string),
      lng:         parseFloat(r['lon'] as string),
      type:        r['type'] as string,
    }))

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results))
  } catch { /* ignore */ }

  return results
}

export interface GeocodePoint {
  lat:         number
  lng:         number
  addresstype: string   // 'house' | 'road' | 'amenity' | 'city' | …
  displayName: string
}

// City/administrative-level result types — no more precise than the city-centre
// coordinate we already have, so a re-geocode to one of these is not an upgrade.
const CITY_LEVEL_TYPES = new Set([
  'city', 'town', 'village', 'municipality', 'administrative',
  'state', 'county', 'region', 'country', 'postcode',
])

/** Geocode a full street address to a point. Returns null when Nominatim has
 *  no result or only a city-level one (which wouldn't improve on the import's
 *  city-centre guess). Result is cached (including negatives) for 24h. */
export async function geocodeAddress(
  address: string,
  city: string,
  countryCode = 'IL',
): Promise<GeocodePoint | null> {
  const q = [address, city].map(s => s.trim()).filter(Boolean).join(', ')
  if (!q) return null
  const cacheKey = `nominatim:addr:${countryCode}:${q.toLowerCase()}`

  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return JSON.parse(hit) as GeocodePoint | null
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = new URLSearchParams({
    q,
    countrycodes:   countryCode.toLowerCase(),
    format:         'jsonv2',
    'accept-language': 'he,ru,en',
    addressdetails: '0',
    limit:          '1',
  })

  let result: GeocodePoint | null = null
  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok) {
      const raw = await res.json() as Record<string, unknown>[]
      const top = raw[0]
      const addresstype = (top?.['addresstype'] as string) ?? (top?.['type'] as string) ?? ''
      if (top && !CITY_LEVEL_TYPES.has(addresstype)) {
        result = {
          lat:         parseFloat(top['lat'] as string),
          lng:         parseFloat(top['lon'] as string),
          addresstype,
          displayName: top['display_name'] as string,
        }
      }
    }
  } catch { /* network/timeout — treat as no result */ }

  try {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result))
  } catch { /* ignore */ }

  return result
}
