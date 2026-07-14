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

// LocationIQ (Nominatim-based, cleaner data + better hit rate, permissive to use
// with any map). Server-side, so no CSP change. When LOCATIONIQ_API_KEY is set it
// is the primary geocoder; Nominatim is the fallback. Free tier: ~5k/day, 2 req/s.
// Read lazily so env loaded after this module (dotenv order in dev) is honoured.
const locationIQKey  = () => (process.env.LOCATIONIQ_API_KEY ?? '').trim()
const locationIQBase = () => (process.env.LOCATIONIQ_ENDPOINT || 'https://us1.locationiq.com').replace(/\/$/, '')

// A LocationIQ/Nominatim result row → GeocodePoint, rejecting city-level hits
// (which are no more precise than a city-centre guess).
function toGeocodePoint(top: Record<string, unknown> | undefined): GeocodePoint | null {
  if (!top) return null
  const addresstype = (top['addresstype'] as string) ?? (top['type'] as string) ?? ''
  if (CITY_LEVEL_TYPES.has(addresstype)) return null
  const lat = parseFloat(top['lat'] as string)
  const lng = parseFloat(top['lon'] as string)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, addresstype, displayName: (top['display_name'] as string) ?? '' }
}

async function geocodeLocationIQ(q: string, countryCode?: string): Promise<GeocodePoint | null> {
  const key = locationIQKey()
  if (!key) return null
  const cacheKey = `locationiq:addr:${countryCode ?? '*'}:${q.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return JSON.parse(hit) as GeocodePoint | null
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = new URLSearchParams({
    key,
    q,
    format: 'json',
    'accept-language': 'he,ru,en',
    addressdetails: '0',
    normalizecity:  '1',
    limit:  '1',
  })
  if (countryCode) params.set('countrycodes', countryCode.toLowerCase())

  try {
    const res = await fetch(`${locationIQBase()}/v1/search?${params}`, { signal: AbortSignal.timeout(8_000) })
    // Only a real 200 is a definitive answer worth caching. 429/5xx are transient
    // (rate limit / outage) — return null WITHOUT caching so we retry + fall back.
    if (!res.ok) return null
    const raw = await res.json() as Record<string, unknown>[] | { error?: string }
    const result = Array.isArray(raw) ? toGeocodePoint(raw[0]) : null
    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)) } catch { /* ignore */ }
    return result
  } catch {
    return null   // network/timeout — transient, fall back to Nominatim
  }
}

async function geocodeNominatimAddress(q: string, countryCode?: string): Promise<GeocodePoint | null> {
  const cacheKey = `nominatim:addr:${countryCode ?? '*'}:${q.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return JSON.parse(hit) as GeocodePoint | null
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = new URLSearchParams({
    q,
    format:         'jsonv2',
    'accept-language': 'he,ru,en',
    addressdetails: '0',
    limit:          '1',
  })
  if (countryCode) params.set('countrycodes', countryCode.toLowerCase())

  let result: GeocodePoint | null = null
  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok) result = toGeocodePoint((await res.json() as Record<string, unknown>[])[0])
  } catch { /* network/timeout — treat as no result */ }

  try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)) } catch { /* ignore */ }
  return result
}

/** Geocode a full street address to a point via LocationIQ (if configured) then
 *  Nominatim. Returns null for no result or a city-level-only hit. `countryCode`
 *  (e.g. 'IL') restricts the search — pass it for Israeli addresses to avoid
 *  matching a same-named street abroad; omit it for worldwide addresses. */
export async function geocodeAddress(
  address: string,
  city: string,
  countryCode?: string,
): Promise<GeocodePoint | null> {
  const q = [address, city].map(s => s.trim()).filter(Boolean).join(', ')
  if (!q) return null

  if (locationIQKey()) {
    const viaLocationIQ = await geocodeLocationIQ(q, countryCode)
    if (viaLocationIQ) return viaLocationIQ
  }
  return geocodeNominatimAddress(q, countryCode)
}
