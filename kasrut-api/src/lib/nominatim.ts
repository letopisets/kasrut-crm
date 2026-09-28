import { redis } from './redis'
import { logger } from './logger'
import {
  geocodeGovmapAddressDetailed, govmapConfigured, placeIsCity, cityNamedIn, hebrewCityForAddress,
  type PlaceSuggestion,
} from './govmap'

// OSM Nominatim usage policy: max 1 request/second, must identify the app.
// Every call reserves the next free 1.1 s slot app-wide before it fires, so
// concurrent callers are spaced out instead of all waking at once.

const NOMINATIM_BASE     = 'https://nominatim.openstreetmap.org'
const USER_AGENT         = 'KashrutCRM/1.0 (contact@kashrut.local)'
const CACHE_TTL          = 86_400   // 24 h
const EMPTY_PLACES_TTL   = 3_600    // an empty place list: keep keystroke junk briefly
const RATE_MS            = 1_100    // 1.1 s between requests (slight buffer over 1/s limit)
// /map/places is search-as-you-type, which Nominatim's policy does not want:
// at most one call per 2 s app-wide, and never a long queue — a caller that
// would wait longer than PLACES_MAX_WAIT_MS gets no Nominatim answer instead.
const PLACES_INTERVAL_MS = 2_000
const PLACES_MAX_WAIT_MS = 2_500

/** A slot scheduler: each caller synchronously reserves the next free slot
 *  (≥ intervalMs after the previous one) and gets its wait in ms, or null when
 *  that slot is more than maxWaitMs away (the caller then gives up). */
function slotScheduler(intervalMs: number): (maxWaitMs?: number) => number | null {
  let nextAt = 0
  return (maxWaitMs = Infinity) => {
    const now = Date.now()
    const at  = Math.max(now, nextAt)
    if (at - now > maxWaitMs) return null
    nextAt = at + intervalMs
    return at - now
  }
}

const nominatimSlot = slotScheduler(RATE_MS)
const placesSlot    = slotScheduler(PLACES_INTERVAL_MS)
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Wait for the next Nominatim slot; false if it is more than maxWaitMs away. */
async function rateLimit(maxWaitMs?: number): Promise<boolean> {
  const wait = nominatimSlot(maxWaitMs)
  if (wait === null) return false
  if (wait > 0) await sleep(wait)
  return true
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

export type GeocodeProvider = 'govmap' | 'locationiq' | 'nominatim'

export interface GeocodePoint {
  lat:         number
  lng:         number
  addresstype: string   // 'house' | 'road' | 'amenity' | 'city' | …
  displayName: string
  provider?:   GeocodeProvider
}

// City/administrative-level result types — no more precise than the city-centre
// coordinate we already have, so a re-geocode to one of these is not an upgrade.
const CITY_LEVEL_TYPES = new Set([
  'city', 'town', 'village', 'municipality', 'administrative',
  'state', 'county', 'region', 'country', 'postcode',
])
// Street/area-level types: better than a city centre, but a street midpoint can
// be kilometres from the house, so it is not an 'exact' pin. 'area' is ours: a
// LocationIQ row that is neither a street nor a building/named place (see
// toGeocodePoint).
const COARSE_TYPES = new Set([
  'road', 'suburb', 'neighbourhood', 'quarter', 'city_block', 'city_district', 'district',
  'borough', 'hamlet', 'isolated_dwelling', 'farm', 'locality', 'residential', 'allotments',
  'area',
])

// Types that pin the establishment itself: a house or building (Nominatim files
// house-number nodes, place=house, under 'place'), or a named place — Nominatim
// uses the OSM class as the addresstype ('amenity', 'shop', …), and GovMap hits
// map to 'house' / 'amenity'. A positive list on purpose: Nominatim also reports
// 'highway' (bus/tram stops), 'industrial', 'retail', 'plot', 'square', … for
// non-address features, and none of those is an exact pin.
const ADDRESS_LEVEL_TYPES = new Set([
  'house', 'building', 'place', 'house_number', 'house_name',
  'amenity', 'shop', 'tourism', 'office', 'craft', 'leisure', 'healthcare',
])

/** True for a house/building/named-place point — one worth publishing as the
 *  establishment's exact location (not a street midpoint, an area, a stop or a
 *  point of unknown type). */
export function isAddressLevel(p: Pick<GeocodePoint, 'addresstype'>): boolean {
  return ADDRESS_LEVEL_TYPES.has(p.addresstype)
}

// Locality fields of a Nominatim/LocationIQ `address` object (addressdetails=1):
// the settlement itself, and the finer or looser parts of it.
const SETTLEMENT_FIELDS = ['city', 'town', 'village']
const OTHER_LOCALITY_FIELDS = [
  'municipality', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'city_district',
  'borough', 'isolated_dwelling', 'locality',
]

/** Does a result row lie in `city`? Nominatim happily answers "הרצל 20, חיפה"
 *  with Herzl 20 in Hadera, so an Israeli fallback hit must name the city. A
 *  row with a city/town/village must have THAT be the input city (placeIsCity:
 *  spelling folded, input aliases resolved — "ביתר עלית" = "ביתר עילית",
 *  "ראשון" → "ראשון לציון", "קריית שמואל" → "חיפה"); a suburb of another town
 *  never counts ("רמות" in באר שבע is not Jerusalem's רמות). Only a row with
 *  none of those is judged by its other locality fields, or a city_district
 *  containing the name ("רובע קריית חיים - קריית שמואל"). */
function rowInCity(row: Record<string, unknown>, city: string): boolean {
  const addr = row['address']
  if (!addr || typeof addr !== 'object') return false
  const a = addr as Record<string, unknown>
  const values = (fields: string[]) =>
    fields.map(f => a[f]).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  const settlements = values(SETTLEMENT_FIELDS)
  if (settlements.length) return settlements.some(v => placeIsCity(city, v, true))
  return values(OTHER_LOCALITY_FIELDS).some(v => placeIsCity(city, v))
    || (typeof a['city_district'] === 'string' && cityNamedIn(city, a['city_district']))
}

// With a city to check, fetch a few rows and keep the first one in that city
// that is finer than a city centroid (a house, building or named place, but
// also a street or an area: isAddressLevel decides later whether it counts as
// an exact pin); otherwise the old behaviour (top row only).
interface RowCheck { city: string; latin: boolean }

function searchParams(q: string, countryCode: string | undefined, check: RowCheck | undefined): URLSearchParams {
  const params = new URLSearchParams({
    q,
    // Address fields come back in the input's script so the city can be compared.
    'accept-language': check ? (check.latin ? 'en' : 'he') : 'he,ru,en',
    addressdetails:    check ? '1' : '0',
    limit:             check ? '3' : '1',
  })
  if (countryCode) params.set('countrycodes', countryCode.toLowerCase())
  return params
}

function pickRow(raw: unknown, check: RowCheck | undefined): GeocodePoint | null {
  if (!Array.isArray(raw)) return null
  if (!check) return toGeocodePoint(raw[0] as Record<string, unknown> | undefined)
  for (const row of raw as Record<string, unknown>[]) {
    const p = toGeocodePoint(row)
    if (p && rowInCity(row, check.city)) return p
  }
  return null
}

// LocationIQ (Nominatim-based, cleaner data + better hit rate, permissive to use
// with any map). Server-side, so no CSP change. When LOCATIONIQ_API_KEY is set it
// is the primary geocoder; Nominatim is the fallback. Free tier: ~5k/day, 2 req/s.
// Read lazily so env loaded after this module (dotenv order in dev) is honoured.
const locationIQKey  = () => (process.env.LOCATIONIQ_API_KEY ?? '').trim()
const locationIQBase = () => (process.env.LOCATIONIQ_ENDPOINT || 'https://us1.locationiq.com').replace(/\/$/, '')

// OSM classes whose objects Nominatim itself files under the class name as
// their addresstype ("amenity", "shop", "building", …): a house, building or
// named place, i.e. an exact pin.
const POINT_CLASSES = new Set(['building', 'amenity', 'shop', 'tourism', 'office', 'craft', 'leisure', 'healthcare'])

/** The addresstype of a row that has none (LocationIQ's /v1/search rows carry
 *  only OSM class + type). Positive list for an exact pin: a POINT_CLASSES
 *  object (as its class) or place=house; a highway is a street midpoint
 *  ('road'); a city-level type stays itself (rejected); anything else —
 *  landuse=industrial/commercial/retail (a zone or mall-area centroid), a
 *  boundary, place=plot, no class at all — is an 'area', never exact. */
function inferAddresstype(osmClass: unknown, osmType: unknown): string {
  const type = typeof osmType === 'string' ? osmType : ''
  if (CITY_LEVEL_TYPES.has(type)) return type
  if (osmClass === 'highway') return 'road'
  if (osmClass === 'place' && type === 'house') return 'house'
  if (typeof osmClass === 'string' && POINT_CLASSES.has(osmClass)) return osmClass
  return COARSE_TYPES.has(type) ? type : 'area'
}

// A LocationIQ/Nominatim result row → GeocodePoint, rejecting city-level hits
// (which are no more precise than a city-centre guess). A row without an
// addresstype (LocationIQ) gets one from its OSM class + type
// (inferAddresstype; Nominatim jsonv2 names the class `category`).
function toGeocodePoint(top: Record<string, unknown> | undefined): GeocodePoint | null {
  if (!top) return null
  const given = top['addresstype']
  const addresstype = typeof given === 'string' && given !== ''
    ? given
    : inferAddresstype(top['class'] ?? top['category'], top['type'])
  if (CITY_LEVEL_TYPES.has(addresstype)) return null
  const lat = parseFloat(top['lat'] as string)
  const lng = parseFloat(top['lon'] as string)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, addresstype, displayName: (top['display_name'] as string) ?? '' }
}

/** One fallback provider's answer: `transient` when it could not answer
 *  (rate limit, outage, timeout, network) — then a null point is not a verdict. */
interface ProviderAnswer { point: GeocodePoint | null; transient: boolean }

const NO_ANSWER: ProviderAnswer = { point: null, transient: true }

// A key rejected (401/403) or a blocked User-Agent stays that way until the
// config is fixed, so it is not "try this address again later": treating it as
// transient would have the re-geocode job defer the same rows night after
// night. Only a rate limit / timeout (408, 429) and a server error are
// transient; any other non-200 is no answer for this address (never cached),
// and a 401/403 is logged once per process so the misconfiguration shows.
const warnedStatus = new Set<string>()
function failedAnswer(provider: 'LocationIQ' | 'Nominatim', status: number): ProviderAnswer {
  if (status === 408 || status === 429 || status >= 500) return NO_ANSWER
  if ((status === 401 || status === 403) && !warnedStatus.has(`${provider}:${status}`)) {
    warnedStatus.add(`${provider}:${status}`)
    logger.warn(`${provider} geocoder: HTTP ${status} — ${provider === 'LocationIQ'
      ? 'LOCATIONIQ_API_KEY rejected'
      : 'requests blocked (User-Agent / IP)'}; its lookups count as "no match" until this is fixed`)
  }
  return { point: null, transient: false }
}

/** Test hook: forget the once-per-process provider warnings. */
export function resetFallbackWarnings(): void {
  warnedStatus.clear()
}

async function geocodeLocationIQ(q: string, countryCode?: string, check?: RowCheck): Promise<ProviderAnswer> {
  const key = locationIQKey()
  if (!key) return { point: null, transient: false }
  // v2: rows without an addresstype are typed by inferAddresstype (2026-09);
  // v1 entries may hold an area typed as exact ('commercial', 'plot').
  const cacheKey = `locationiq:addr:v2:${countryCode ?? '*'}${check ? ':city' : ''}:${q.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return { point: JSON.parse(hit) as GeocodePoint | null, transient: false }
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = searchParams(q, countryCode, check)
  params.set('key', key)
  params.set('format', 'json')
  params.set('normalizecity', '1')

  try {
    const res = await fetch(`${locationIQBase()}/v1/search?${params}`, { signal: AbortSignal.timeout(8_000) })
    // Only a real 200 is a definitive answer worth caching. 429/5xx are transient
    // (rate limit / outage) — return null WITHOUT caching so we retry + fall back.
    // A 404 is LocationIQ's "Unable to geocode": no match, not an outage; a
    // 401/403 is a bad key (failedAnswer).
    if (!res.ok) return failedAnswer('LocationIQ', res.status)
    const result = pickRow(await res.json(), check)
    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)) } catch { /* ignore */ }
    return { point: result, transient: false }
  } catch {
    return NO_ANSWER   // network/timeout — transient, fall back to Nominatim
  }
}

async function geocodeNominatimAddress(q: string, countryCode?: string, check?: RowCheck): Promise<ProviderAnswer> {
  const cacheKey = `nominatim:addr:${countryCode ?? '*'}${check ? ':city' : ''}:${q.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return { point: JSON.parse(hit) as GeocodePoint | null, transient: false }
  } catch { /* Redis unavailable */ }

  await rateLimit()

  const params = searchParams(q, countryCode, check)
  params.set('format', 'jsonv2')

  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
    // Cache a 200 only: a 429/5xx/timeout cached as "no result" would hide the
    // address for 24 h (and a batch job would stamp the row as un-geocodable).
    // A 403 (blocked) is not transient either — see failedAnswer.
    if (!res.ok) return failedAnswer('Nominatim', res.status)
    const result = pickRow(await res.json(), check)
    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)) } catch { /* ignore */ }
    return { point: result, transient: false }
  } catch {
    return NO_ANSWER   // network/timeout/malformed body
  }
}

// Nominatim does not index Hebrew street-type designators: "רח' יפו 42" and
// even the full "רחוב יפו 42" return nothing, while the bare "יפו 42" hits
// house-level. The boulevard abbreviation behaves differently: "שד' הרצל"
// misses but the full "שדרות הרצל" matches the right road. So strip רחוב/רח'
// and expand שד' before querying (verified against live Nominatim, 2026-09).
export function normalizeHebrewAddress(address: string): string {
  return address
    .replace(/(^|\s)(?:רחוב|רח['׳.]?)\s+/g, '$1')
    .replace(/(^|\s)שד['׳.]\s*/g, '$1שדרות ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Geocode a full street address to a point. Israeli addresses (countryCode
 *  'IL') go to GovMap first when GOVMAP_API_KEY is set — the Survey of Israel
 *  index resolves house numbers OSM lacks; its hits are validated in govmap.ts.
 *  Then LocationIQ (if configured), then Nominatim; for Israeli addresses with
 *  a city their hit must lie in that city. Returns null for no result or a
 *  city-level-only hit; `provider` says which service answered.
 *  `countryCode` restricts the search — pass it for Israeli addresses to avoid
 *  matching a same-named street abroad; omit it for worldwide addresses. */
export async function geocodeAddress(
  address: string,
  city: string,
  countryCode?: string,
): Promise<GeocodePoint | null> {
  return (await geocodeAddressDetailed(address, city, countryCode)).point
}

export interface GeocodeOutcome {
  point: GeocodePoint | null
  /** GovMap was asked and failed transiently (outage, 429, timeout, cooldown):
   *  a non-GovMap point is then only a fallback, and no point is not a verdict.
   *  Batch jobs should retry such rows later rather than settle for either. */
  govmapTransient: boolean
  /** No point, and a fallback provider (LocationIQ/Nominatim) that was asked
   *  failed transiently — "nothing found" is not a verdict either. */
  fallbackTransient: boolean
}

export interface GeocodeOptions {
  /** Batch jobs: when GovMap fails transiently, return at once (no point,
   *  govmapTransient) instead of asking LocationIQ/Nominatim — the job defers
   *  the row and would discard a fallback point anyway, so don't spend quota. */
  deferOnGovmapTransient?: boolean
  /** Batch jobs re-checking an 'exact' row: only GovMap's own answer may
   *  replace it, so never ask LocationIQ/Nominatim (no point without GovMap). */
  govmapOnly?: boolean
}

const DAY_MS = 86_400_000
const NIGHTLY_RETRY_DAYS = 30   // the re-geocode job's default retry window

/** Batch jobs: the geocodeAttemptedAt to store for a row DEFERRED by a
 *  transient failure (instead of leaving it unstamped, which queues it first
 *  on every run: rows stuck on a lasting failure would fill every batch and
 *  starve never-attempted ones). It makes the row due again 12 h later under
 *  the longer of the run's retry window and the nightly 30 days — so at once
 *  for a shorter-window re-run, and from the next nightly run after a full
 *  pass (retryDays 0). Deferred rows always queue after the never-attempted
 *  ones (unstamped, sorted first); with retryDays ≥ 30 the stamp is also newer
 *  than every row already due, so they queue last — with a shorter window they
 *  sort before rows attempted between now − 29.5 d and now − retryDays. */
export function deferredGeocodeStamp(now: Date, retryDays: number): Date {
  return new Date(now.getTime() - Math.max(retryDays, NIGHTLY_RETRY_DAYS) * DAY_MS + DAY_MS / 2)
}

// OSM tags Judea & Samaria settlements with country "ps": with "il" alone
// "הר"ן 7, ביתר עילית" finds nothing, with "il,ps" the building (live, 2026-09).
// The city check keeps the wider search from answering with the wrong town.
const ISRAEL_FALLBACK_COUNTRIES = 'il,ps'

/** geocodeAddress, plus whether GovMap's answer was transient (see GeocodeOutcome). */
export async function geocodeAddressDetailed(
  address: string,
  city: string,
  countryCode?: string,
  opts: GeocodeOptions = {},
): Promise<GeocodeOutcome> {
  const israeli = countryCode?.toUpperCase() === 'IL'
  // A Hebrew address with a Latin city ("יפו 42", "Jerusalem") is searched and
  // checked with the Hebrew name: GovMap's Hebrew index and OSM's Hebrew
  // address fields don't know "Jerusalem".
  const cityName = israeli ? hebrewCityForAddress(address, city) : city
  const q = [normalizeHebrewAddress(address), cityName].map(s => s.trim()).filter(Boolean).join(', ')
  if (!q) return { point: null, govmapTransient: false, fallbackTransient: false }

  let govmapTransient = false
  if (israeli && govmapConfigured()) {
    // Raw input on purpose: govmap.ts runs its own, stricter normalisation.
    const gov = await geocodeGovmapAddressDetailed(address, cityName).catch(() => ({ point: null, transient: true }))
    if (gov.point) return { point: { ...gov.point, provider: 'govmap' }, govmapTransient: false, fallbackTransient: false }
    govmapTransient = gov.transient
    if (govmapTransient && opts.deferOnGovmapTransient) return { point: null, govmapTransient, fallbackTransient: false }
  }
  if (opts.govmapOnly) return { point: null, govmapTransient, fallbackTransient: false }
  const check: RowCheck | undefined = israeli && cityName.trim()
    ? { city: cityName.trim(), latin: !/[֐-׿]/.test(`${address} ${cityName}`) }
    : undefined
  // The wider IL+PS search is only safe with the city check.
  const countries = israeli && check ? ISRAEL_FALLBACK_COUNTRIES : countryCode
  let fallbackTransient = false
  if (locationIQKey()) {
    const viaLocationIQ = await geocodeLocationIQ(q, countries, check)
    if (viaLocationIQ.point) {
      return { point: { ...viaLocationIQ.point, provider: 'locationiq' }, govmapTransient, fallbackTransient: false }
    }
    fallbackTransient = viaLocationIQ.transient
  }
  const viaNominatim = await geocodeNominatimAddress(q, countries, check)
  if (viaNominatim.point) {
    return { point: { ...viaNominatim.point, provider: 'nominatim' }, govmapTransient, fallbackTransient: false }
  }
  return { point: null, govmapTransient, fallbackTransient: fallbackTransient || viaNominatim.transient }
}

/** Worldwide place search for the map's location picker — the fallback when
 *  GovMap is unconfigured, down, or has nothing (e.g. a place abroad). Returns
 *  null on a transient failure or when the app-wide places budget is spent
 *  (not cached) so the caller can retry later. */
export async function searchNominatimPlaces(
  q: string,
  lang: string,
  limit = 5,
): Promise<PlaceSuggestion[] | null> {
  const text = q.trim().replace(/\s+/g, ' ')
  if (!text) return []
  const cacheKey = `nominatim:places:${lang}:${limit}:${text.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return JSON.parse(hit) as PlaceSuggestion[]
  } catch { /* Redis unavailable */ }

  // A keystroke burst must not become a Nominatim burst: take a places slot
  // (≤ 1 per 2 s app-wide) and then a Nominatim slot, or give up quickly.
  const placesWait = placesSlot(PLACES_MAX_WAIT_MS)
  if (placesWait === null) return null
  if (placesWait > 0) await sleep(placesWait)
  if (!(await rateLimit(PLACES_MAX_WAIT_MS))) return null

  const params = new URLSearchParams({
    q:                 text,
    format:            'jsonv2',
    'accept-language': lang === 'en' ? 'en' : `${lang},en`,
    addressdetails:    '0',
    limit:             String(limit),
  })

  let raw: Record<string, unknown>[]
  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    raw = await res.json() as Record<string, unknown>[]
    if (!Array.isArray(raw)) return null
  } catch {
    return null   // network/timeout — transient
  }

  const places: PlaceSuggestion[] = []
  for (const r of raw) {
    const lat = parseFloat(r['lat'] as string)
    const lng = parseFloat(r['lon'] as string)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    // display_name is "Name, street, city, …, country": the head is the label,
    // the rest (trimmed) is the context line.
    const parts = String(r['display_name'] ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const name  = typeof r['name'] === 'string' && r['name'] ? r['name'] : parts[0]
    if (!name) continue
    const rest  = parts[0] === name ? parts.slice(1) : parts
    places.push({
      id:     `osm:${r['osm_type'] ?? 'x'}:${r['osm_id'] ?? r['place_id']}`,
      label:  name,
      ...(rest.length ? { detail: rest.slice(0, 3).join(', ') } : {}),
      lat,
      lng,
    })
  }

  try { await redis.setex(cacheKey, places.length ? CACHE_TTL : EMPTY_PLACES_TTL, JSON.stringify(places)) } catch { /* ignore */ }
  return places
}
