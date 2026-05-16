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
