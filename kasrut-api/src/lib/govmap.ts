import proj4 from 'proj4'
import { redis } from './redis'
import { logger } from './logger'
import { isWithinIsrael, isInMediterraneanSea } from './geoValidation'
import type { GeocodePoint } from './nominatim'

// GovMap (Survey of Israel) — the authoritative geocoder for Israeli addresses.
// We POST to the same search endpoint the official JS SDK's govmap.search()
// uses, but server-side: the token never ships to browsers and no CSP/iframe
// change is needed. Verified against the live service (2026-09):
//   - the token is domain-bound and checked against the Origin header only, so
//     we send Origin = GOVMAP_ORIGIN (the approved map domain);
//   - CloudFront 403s non-browser User-Agents; anything "Mozilla/5.0 …" passes;
//   - 10 concurrent per IP, and a request-rate limit: responses advertise
//     "x-ratelimit-limit: 600", yet ~100 calls in 1–6 s drew a 429 with
//     "x-ratelimit-limit: 100" + Retry-After, while ~8.7 req/s sustained never
//     did — so calls are paced to ≤ 8/s app-wide;
//   - the fuzzy search (isAccurate:false) answers some texts with HTTP 500
//     every time ("תחנת דלק מנטה גבעת זאב"), so one 5xx is not an outage.
// Result order does not follow score, and even isAccurate:true returns wrong
// houses ("רוטשילד 200" → 100) and wrong cities (a street named after the input
// city), so every hit is validated against the input before we trust it.

const GOVMAP_SEARCH_URL     = 'https://www.govmap.gov.il/api/search-service/api-search'
const USER_AGENT            = 'Mozilla/5.0 (compatible; KashrutMap/1.0; +https://mykoshermap.com)'
const DEFAULT_ORIGIN        = 'https://mykoshermap.com'
const TIMEOUT_MS            = 2_500    // per call; observed latency is 70–700 ms
const ADDRESS_BUDGET_MS     = 5_000    // all GovMap calls for one address (the fallbacks after it have their own timeouts)
const MIN_CALL_MS           = 300      // don't start a call with less time than this left
const OUTAGE_COOLDOWN_MS    = 30_000   // after a timeout / network error / repeated 5xx
const SERVER_ERROR_WINDOW_MS = 30_000  // 5xx cool GovMap down only when they repeat …
const SERVER_ERRORS_TO_COOL = 3        // … this many times within the window
const AUTH_COOLDOWN_MS      = 600_000  // after 401/403 — every request would get the same answer
const MAX_CONCURRENT        = 8        // GovMap allows 10 in flight per IP; the whole server shares it
const RATE_INTERVAL_MS      = 125      // ≤ 8 calls/s app-wide (see the rate limit above) …
const RATE_BURST            = 8        // … with a burst of this many
const AMBIGUOUS_M           = 300      // equally good hits this far apart: GovMap can't tell
const CACHE_TTL             = 86_400   // 24 h
const EMPTY_PLACES_TTL      = 3_600    // an empty place list: search-as-you-type junk, keep it short
const MAX_CALLS_PER_ADDRESS = 6
const PLACES_MAX_RESULTS    = 5
const MAX_ADDRESS_LENGTH    = 300
const MAX_CITY_LENGTH       = 100

// Read lazily so env loaded after this module (dotenv order in dev) is honoured.
// Compose passes GOVMAP_ORIGIN="" when unset, so blank means the default too.
const govmapKey    = () => (process.env.GOVMAP_API_KEY ?? '').trim()
const govmapOrigin = () => (process.env.GOVMAP_ORIGIN ?? '').trim().replace(/\/+$/, '') || DEFAULT_ORIGIN

export const govmapConfigured = (): boolean => govmapKey() !== ''

// ── Transport ────────────────────────────────────────────────────────────────

export interface GovmapResult {
  id:            string
  text:          string
  type:          string
  score?:        number
  originalText?: string
  subTypeText?:  string
  centroid?:     string
}

export type GovmapLanguage = 'he' | 'en'

export interface GovmapSearchOptions {
  isAccurate: boolean
  maxResults: number
  language:   GovmapLanguage
  timeoutMs?: number   // cap below TIMEOUT_MS (what is left of a caller's budget)
}

// A 401 means the token was revoked or the Origin domain is not approved — the
// same for every request, so say it once instead of once per address.
const warned = new Set<string>()
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  logger.warn(message)
}

// Circuit breaker: after a 429 (Retry-After), a timeout / network error or 3
// accurate-search 5xx within 30 s (30 s), or a 401/403 (10 min) every call
// returns null at once, so a GovMap outage costs one timeout per window
// instead of one per address. Fuzzy-search 5xx never trip it: that endpoint
// 500s on some texts every time (in a bulk run three such addresses came
// within 21 s), and they must not switch GovMap off for everyone. Every
// address is searched accurately first, so a real outage still trips it.
let cooldownUntil = 0
function coolDown(ms: number): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + ms)
}

// Until when GovMap is off because it refused the token/Origin (401) or the
// CDN blocked us (403): a configuration error, not an outage.
let authRejectedUntil = 0

/** True while GovMap is switched off after a 401/403 — every lookup fails the
 *  same way until GOVMAP_API_KEY / GOVMAP_ORIGIN (or the block) is fixed, so a
 *  batch job should stop instead of deferring row after row. */
export const govmapAuthRejected = (): boolean => Date.now() < authRejectedUntil

let serverErrorsAt: number[] = []
function noteServerError(): void {
  const now = Date.now()
  serverErrorsAt = serverErrorsAt.filter(t => now - t < SERVER_ERROR_WINDOW_MS)
  serverErrorsAt.push(now)
  if (serverErrorsAt.length >= SERVER_ERRORS_TO_COOL) coolDown(OUTAGE_COOLDOWN_MS)
}

// Rate pacing (token bucket): each call reserves a token; past the burst,
// callers are spaced RATE_INTERVAL_MS apart. Returns the wait in ms, or null
// (nothing reserved) when that wait is more than maxWaitMs.
let tokens   = RATE_BURST
let tokensAt = 0
function reserveRate(maxWaitMs: number): number | null {
  const now = Date.now()
  tokens   = Math.min(RATE_BURST, tokens + (now - tokensAt) / RATE_INTERVAL_MS)
  tokensAt = now
  const wait = tokens >= 1 ? 0 : Math.ceil((1 - tokens) * RATE_INTERVAL_MS)
  if (wait > maxWaitMs) return null
  tokens -= 1
  return wait
}

// Concurrency cap: going over GovMap's 10-in-flight limit earns a 429 and a
// cooldown for everyone, so extra callers wait for a slot (or give up).
let active = 0
const waiting: Array<() => void> = []

function acquireSlot(maxWaitMs: number): Promise<boolean> {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(true) }
  return new Promise(resolve => {
    const grant = () => { clearTimeout(timer); active++; resolve(true) }
    const timer = setTimeout(() => {
      const i = waiting.indexOf(grant)
      if (i !== -1) waiting.splice(i, 1)
      resolve(false)
    }, maxWaitMs)
    timer.unref?.()
    waiting.push(grant)
  })
}

function releaseSlot(): void {
  active = Math.max(0, active - 1)
  waiting.shift()?.()
}

/** Test hook: forget the once-per-process warnings, any back-off and slots. */
export function resetGovmapState(): void {
  warned.clear()
  cooldownUntil = 0
  authRejectedUntil = 0
  serverErrorsAt = []
  tokens = RATE_BURST
  tokensAt = 0
  active = 0
  waiting.length = 0
}

function isGovmapResult(r: unknown): r is GovmapResult {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.text === 'string' && typeof o.type === 'string'
}

/** A search answer: `results` of a definitive 200, or null for a failure —
 *  then `server` is true for an HTTP 5xx (which may be about this text only). */
interface SearchOutcome { results: GovmapResult[] | null; server: boolean }

const FAILED: SearchOutcome = { results: null, server: false }

/** One GovMap search call. Returns the results array (possibly empty) for a
 *  definitive 200, or null for anything transient or misconfigured (non-200,
 *  401/403/429/5xx, network error, timeout, cooldown, rate budget) — callers
 *  must not cache null. */
export async function searchGovmap(
  searchText: string,
  opts: GovmapSearchOptions,
): Promise<GovmapResult[] | null> {
  return (await searchGovmapOutcome(searchText, opts)).results
}

async function searchGovmapOutcome(searchText: string, opts: GovmapSearchOptions): Promise<SearchOutcome> {
  const apiKey = govmapKey()
  if (!apiKey) return FAILED
  if (Date.now() < cooldownUntil) return FAILED
  const started = Date.now()
  const budget = Math.min(TIMEOUT_MS, opts.timeoutMs ?? TIMEOUT_MS)
  if (budget < MIN_CALL_MS) return FAILED
  const rateWait = reserveRate(budget - MIN_CALL_MS)
  if (rateWait === null) return FAILED
  if (rateWait > 0) await new Promise(r => setTimeout(r, rateWait))
  if (!(await acquireSlot(budget - (Date.now() - started)))) return FAILED

  try {
    const left = budget - (Date.now() - started)
    if (left < MIN_CALL_MS || Date.now() < cooldownUntil) return FAILED
    let res: Response
    try {
      res = await fetch(GOVMAP_SEARCH_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept:         'application/json',
          Origin:         govmapOrigin(),
          'User-Agent':   USER_AGENT,
        },
        // The token goes in the body (never the URL, which ends up in access logs).
        body: JSON.stringify({
          apiKey,
          searchText,
          language:   opts.language,
          maxResults: opts.maxResults,
          isAccurate: opts.isAccurate,
        }),
        // A redirect would re-POST the body — token included — to another host.
        redirect: 'error',
        signal:   AbortSignal.timeout(left),
      })
    } catch {
      coolDown(OUTAGE_COOLDOWN_MS)   // timeout / network error / refused redirect
      return FAILED
    }
    if (res.status === 401) {
      warnOnce('401', 'GovMap geocoder: token rejected or domain not approved (HTTP 401) — check GOVMAP_API_KEY / GOVMAP_ORIGIN; falling back to other geocoders')
      coolDown(AUTH_COOLDOWN_MS)
      authRejectedUntil = Date.now() + AUTH_COOLDOWN_MS
      return FAILED
    }
    if (res.status === 403) {
      warnOnce('403', 'GovMap geocoder: request blocked by the GovMap CDN (HTTP 403); falling back to other geocoders')
      coolDown(AUTH_COOLDOWN_MS)
      authRejectedUntil = Date.now() + AUTH_COOLDOWN_MS
      return FAILED
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'))
      coolDown((Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) : 10) * 1000)
      return FAILED
    }
    if (res.status >= 500) {
      if (opts.isAccurate) noteServerError()
      return { results: null, server: true }
    }
    if (!res.ok) return FAILED   // other 4xx: about this request only (e.g. oversize text)
    const body = await res.json().catch(() => null) as { results?: unknown } | null
    return Array.isArray(body?.results) ? { results: body.results.filter(isGovmapResult), server: false } : FAILED
  } finally {
    releaseSlot()
  }
}

// ── Coordinates ──────────────────────────────────────────────────────────────

// EPSG:2039 — Israel 1993 / Israeli TM Grid, the CRS of GovMap centroids.
// Checked against Nominatim: ~5 m apart on Jerusalem addresses.
const ITM_DEF =
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 ' +
  '+x_0=219529.584 +y_0=626907.39 +ellps=GRS80 ' +
  '+towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4262 +units=m +no_defs'
const itmToWgs = proj4(ITM_DEF, 'WGS84')

/** "POINT (x y)" or "POINT(x y)" → ITM x/y. */
export function parseCentroid(centroid: unknown): { x: number; y: number } | null {
  if (typeof centroid !== 'string') return null
  const m = /^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i.exec(centroid)
  if (!m) return null
  const x = Number(m[1])
  const y = Number(m[2])
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

export function itmToWgs84(x: number, y: number): { lat: number; lng: number } | null {
  const [lng, lat] = itmToWgs.forward([x, y])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

export function centroidToLatLng(centroid: unknown): { lat: number; lng: number } | null {
  const p = parseCentroid(centroid)
  return p ? itmToWgs84(p.x, p.y) : null
}

// ── Text normalisation ───────────────────────────────────────────────────────

const HEBREW          = /[֐-׿]/
const HEBREW_LETTER   = /^[א-ת]$/
// A house number in the INPUT: "42", "12א", "12-14" (range → first number).
const INPUT_HOUSE_RE  = /^(\d{1,4})(?:[-/]\d{1,4})?([א-ת]|[a-zA-Z])?$/
// A house number in a GovMap result: "42", "1א".
const RESULT_HOUSE_RE = /^(\d{1,4})([א-ת]|[a-zA-Z])?$/
// Bare street-type abbreviations as their own token ("'שד'" trailing after an
// RTL/LTR mix-up, "רח'") — they carry no information for matching.
const DESIGNATOR_RE   = /^['"׳״]?(?:רחוב|רח|שד)['"׳״.]?$/
// Leading street-type words that GovMap's own name may lack ("דרך מצדה" is
// "מצדה", "שדרות משה דיין" is "משה-דיין", "מרכז טאגור" is on "טאגור") — so a
// second query variant drops them. Verified live, 2026-09.
const DROPPABLE_PREFIX = new Set(['דרך', 'שדרות', 'מרכז', 'כיכר', 'מתחם'])
// Words that never identify a street on their own: type words, mall/branch
// noise and honorifics ("ר' עקיבא" = "רבי עקיבא"). "ככר" is כיכר without the
// yod ("ככר העצמאות" = GovMap "כיכר העצמאות"); "מרכזי" is an adjective that
// once matched "בנין אישפוז מרכזי …" (a hospital) to a mall 5.6 km away.
const GENERIC_WORDS = new Set([
  'רחוב', 'רח', 'דרך', 'שדרות', 'שד', 'כיכר', 'ככר', 'מרכז', 'מרכזי', 'קניון',
  'מתחם', 'מסחרי', 'סניף', 'שכונת', 'פינת', 'רבי', 'הרב', 'רב', 'דר', 'פרופ', 'פרופסור',
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'boulevard', 'blvd', 'lane', 'ln',
  'sderot', 'derech', 'rehov', 'rechov', 'the', 'of',
])
// First words of a place name rather than a given name: "קרית חיים" is a
// neighbourhood, so GovMap's street "חיים" (= משה חיים שפירא) is not it.
const PLACE_PREFIX = new Set([
  'קרית', 'נוה', 'גבעת', 'רמת', 'כפר', 'הר', 'בית', 'גן', 'גני', 'נאות', 'עין', 'נחל',
  'מעלה', 'שער', 'תל', 'מצפה',
])
// Trailing titles GovMap's street name may lack: "ירמיהו הנביא" = "ירמיהו".
const HONORIFICS = new Set(['הנביא', 'הנשיא', 'המלך'])
// Rabbinic titles (normalised: "ר'" is "ר"), dropped from matching as generic
// words; the one name after one is often a given name ("רבי מאיר").
const RABBI_TITLES = new Set(['רבי', 'הרב', 'רב', 'ר'])
// Words saying the input names a venue, not a street: with one of them a
// matching place (POI/building) beats a street of the same name — "קניון מלכת
// שבא" is the mall, not the midpoint of רחוב מלכת שבא 2.5 km away.
const PLACE_WORDS = new Set(['קניון', 'מרכז', 'מתחם', 'תחנת', 'תחנה', 'חניון', 'צומת'])
// Alley/path words make another street: "סמטת הרצל" ≠ "הרצל", and GovMap's
// "דרך בית לחם הישנה סמטה 9 3" is house 3 in alley 9 off the road, not the
// road itself. They are kept as tokens ("סמטה", "סמטה9"), never dropped.
const LANE_WORDS: Record<string, string> = {
  'סמטה': 'סמטה', 'סמטת': 'סמטה', 'סימטה': 'סמטה', 'סימטת': 'סמטה',
  'מבוא': 'מבוא', 'שביל': 'שביל', 'משעול': 'משעול',
}
const LANE_TOKENS = new Set(Object.values(LANE_WORDS))
// Modifiers that name a different street: "בית לחם הישנה" is not "בית לחם".
const MODIFIER_WORDS = new Set([
  'הישנה', 'הישן', 'ישנה', 'ישן', 'החדשה', 'החדש', 'חדשה', 'חדש',
  'העליונה', 'העליון', 'עליונה', 'עליון', 'התחתונה', 'התחתון', 'תחתונה', 'תחתון',
])

// Jerusalem neighbourhoods that people use as the "city". GovMap only knows
// them as neighbourhoods: "משה דיין 164 פסגת זאב" → nothing, while
// "… ירושלים" hits the house (and "גולדה מאיר 5 רמות" even matches a street in
// מודיעין-מכבים-רעות). Plus common city abbreviations.
const CITY_ALIASES: Record<string, string> = {
  'פסגת זאב': 'ירושלים', 'רמות': 'ירושלים', 'גילה': 'ירושלים', 'הר נוף': 'ירושלים',
  'נוה יעקב': 'ירושלים', 'רמת שלמה': 'ירושלים', 'ארמון הנציב': 'ירושלים',
  'תלפיות': 'ירושלים', 'קטמון': 'ירושלים', 'בית וגן': 'ירושלים', 'גבעת שאול': 'ירושלים',
  'רמות אלון': 'ירושלים', 'קרית יובל': 'ירושלים',
  'תא': 'תל אביב', 'בב': 'בני ברק', 'פת': 'פתח תקוה', 'ראשלצ': 'ראשון לציון',
  // City spellings in our data that OSM and GovMap only know by another name
  // (verified 2026-09 on the live rows): short forms, a neighbourhood used as
  // the city, a former name, an industrial zone of the town.
  'ראשון': 'ראשון לציון', 'מבשרת': 'מבשרת ציון', 'חצור': 'חצור הגלילית',
  'רמת בית שמש': 'בית שמש', 'קרית שמואל': 'חיפה', 'ספסופה': 'כפר חושן',
  'מודיעין עלית קרית ספר': 'מודיעין עילית', 'קרית ספר': 'מודיעין עילית',
  'מישור אדומים': 'מעלה אדומים',
}

// The CITY_ALIASES that GovMap itself uses as a record's city (abbreviations,
// a former name, an industrial zone), resolved on the RESULT side. Seen in the
// recorded responses, 2026-09: "פת", "ב\"ב" / "בב" / "ב-ב", "ת'א", "ראשון",
// "מבשרת", "חצור", "קריית ספר", "מישור-אדומים". The Jerusalem neighbourhood
// aliases stay input-only: a GovMap record whose city is "רמות" is the Golan
// moshav, not Jerusalem.
const GOVMAP_CITY_NAMES: Record<string, string> = {
  'פת': 'פתח תקוה', 'בב': 'בני ברק', 'תא': 'תל אביב', 'ראשון': 'ראשון לציון', 'ראשלצ': 'ראשון לציון',
  'מבשרת': 'מבשרת ציון', 'חצור': 'חצור הגלילית', 'קרית ספר': 'מודיעין עילית', 'קספר': 'מודיעין עילית',
  'מודיעין עלית קרית ספר': 'מודיעין עילית', 'מישור אדומים': 'מעלה אדומים', 'ספסופה': 'כפר חושן',
}

// First words of a multi-word locality name. A place text ending "… גן יבנה",
// "… טירת כרמל", "… בני ברק" or "… Kiryat Gat" is in that town, not in יבנה /
// כרמל / ברק / Gat, so a city matched at the end of a text must not follow one
// of these (normalised) words — unless the input's own street ends with it
// ("יגאל אלון" + "תל אביב", see wordsBeforeCity). Not "רמות": "קניון - רמות
// ירושלים" is the Ramot mall in Jerusalem.
const LOCALITY_PREFIX = new Set([
  ...PLACE_PREFIX, 'חצור', 'טירת', 'בני', 'אחוזת', 'אבני', 'טל', 'באר', 'מבוא', 'שדמות', 'ניר', 'שדה',
  'צור', 'אבן', 'מגדל', 'ראש', 'משמר', 'נחלת', 'גבעות', 'כרמי', 'אלון', 'כוכב', 'נצר', 'שבי', 'יד', 'אור',
  'גבע', 'אל', 'נוף',   // גבע כרמל, דאלית אל-כרמל, נוף איילון
  'en', 'geva', 'al', 'el', 'nof', 'newe', 'ganne',
  'gan', 'ganei', 'kiryat', 'kiriat', 'qiryat', 'kfar', 'kefar', 'givat', 'givaat', 'ramat', 'beit', 'bet',
  'neve', 'nave', 'maale', 'maaleh', 'tel', 'ein', 'har', 'mitzpe', 'mizpe', 'hatzor', 'hazor',
  'tirat', 'bnei', 'bene', 'beer', 'rosh', 'migdal', 'sde', 'sede', 'nir', 'yad', 'tzur', 'zur', 'even',
  'mishmar', 'alon', 'kochav', 'kokhav', 'avnei', 'avne', 'ahuzat', 'nahalat', 'givot', 'karmei', 'or',
  'mevo', 'shdemot', 'tal',
])

// English names of the Israeli cities geoValidation's IL_CITY_HINTS recognises,
// keyed by words(name).join(' '). GovMap's Hebrew index needs a Hebrew city and
// the fallback reads OSM's address fields in Hebrew, so a Hebrew address with a
// Latin city ("יפו 42" + "Jerusalem") is searched and checked with the Hebrew
// name (hebrewCityForAddress). Two English spellings of one city are the same
// city on the English path too (latinCityEq): what people write ("Rishon",
// "Petah Tikva", "Bnei Brak") and the official CBS forms GovMap's English
// index may answer with ("Rishon LeZiyyon", "Petah Tiqwa", "Bene Beraq").
const LATIN_CITY_NAMES: Record<string, string> = {
  'jerusalem': 'ירושלים', 'yerushalayim': 'ירושלים',
  'tel aviv': 'תל אביב', 'tel aviv yafo': 'תל אביב', 'tel aviv jaffa': 'תל אביב', 'telaviv': 'תל אביב',
  'haifa': 'חיפה', 'hefa': 'חיפה',
  'ashdod': 'אשדוד',
  'ashkelon': 'אשקלון', 'ashqelon': 'אשקלון',
  'netanya': 'נתניה',
  'beer sheva': 'באר שבע', 'beersheva': 'באר שבע', 'beer sheba': 'באר שבע', 'beersheba': 'באר שבע',
  'bnei brak': 'בני ברק', 'bnei braq': 'בני ברק', 'bene beraq': 'בני ברק', 'bene brak': 'בני ברק',
  'petah tikva': 'פתח תקווה', 'petah tikvah': 'פתח תקווה', 'petach tikva': 'פתח תקווה',
  'petach tikvah': 'פתח תקווה', 'petah tiqwa': 'פתח תקווה', 'petah tiqva': 'פתח תקווה',
  'rishon lezion': 'ראשון לציון', 'rishon letzion': 'ראשון לציון', 'rishon le zion': 'ראשון לציון',
  'rishon leziyyon': 'ראשון לציון', 'rishon leziyon': 'ראשון לציון', 'rishon': 'ראשון לציון',
  'holon': 'חולון',
  'ramat gan': 'רמת גן',
  'herzliya': 'הרצליה', 'herzliyya': 'הרצליה', 'herzlia': 'הרצליה',
  'tiberias': 'טבריה', 'teverya': 'טבריה',
  'eilat': 'אילת', 'elat': 'אילת',
  'nazareth': 'נצרת',
  'modiin': 'מודיעין', 'modiin illit': 'מודיעין עילית',
  'rehovot': 'רחובות',
  'tzfat': 'צפת', 'safed': 'צפת', 'zefat': 'צפת', 'tsfat': 'צפת',
  'beit shemesh': 'בית שמש', 'bet shemesh': 'בית שמש',
}

// Official long forms GovMap uses that people shorten: "תל אביב-יפו",
// "מודיעין-מכבים-רעות", "יהוד-מונוסון" (in English also the CBS spelling
// "Modi'in-Makkabbim-Re'ut").
const CITY_SUFFIXES: ReadonlyArray<readonly [string[], string[]]> = [
  [['תל', 'אביב'], ['יפו']],
  [['מודיעין'], ['מכבים', 'רעות']],
  [['יהוד'], ['מונוסון']],
  [['tel', 'aviv'], ['yafo']],
  [['modiin'], ['maccabim', 'reut']],
  [['modiin'], ['makkabbim', 'reut']],
]

/** Lower-case, drop quotes/geresh/gershayim, and fold the ו/י spelling
 *  variants (קריית≈קרית, תקווה≈תקוה, וייצמן≈ויצמן). */
function normWord(w: string): string {
  return w.toLowerCase()
    .replace(/['"׳״`’]/g, '')
    .replace(/וו/g, 'ו')
    .replace(/יי/g, 'י')
}

const WORD_BREAK = /[\s,.;:\-–—־/\\()]+/

/** Split into normalised words on whitespace, hyphens (incl. maqaf), commas,
 *  slashes, parens. */
function words(s: string): string[] {
  return s.split(WORD_BREAK).map(normWord).filter(Boolean)
}

// A geresh after ג/ז/צ/ח writes another consonant — ג'ת (Jatt) is not גת
// (kibbutz Gat) — so place names keep it, as "^"; street words drop it with the
// other quotes ("ז'בוטינסקי" = "זבוטינסקי"). Abbreviations ("ת'א", "ק'ספר")
// still lose theirs.
const CITY_GERESH = /([גזצח])['׳`’]/g

/** words() for place names: the same split and the same words, except that a
 *  geresh after ג/ז/צ/ח is kept (so the two arrays always line up). */
function placeWords(s: string): string[] {
  return s.split(WORD_BREAK).map(w => normWord(w.replace(CITY_GERESH, '$1^'))).filter(Boolean)
}

/** Word equality that tolerates the definite article (הביכורים ≈ ביכורים). */
function wordEq(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length > 3 && a[0] === 'ה' && a.slice(1) === b) return true
  if (b.length > 3 && b[0] === 'ה' && b.slice(1) === a) return true
  return false
}

/** The word without its definite article ("המרכז" → "מרכז"), for list lookups
 *  that must treat both sides alike. */
const unArticle     = (w: string) => (w.length > 3 && w[0] === 'ה' ? w.slice(1) : w)
const isGenericWord = (w: string) => GENERIC_WORDS.has(w) || GENERIC_WORDS.has(unArticle(w))
// Own keys only: user text like "constructor" must not hit Object.prototype.
const own = <T>(rec: Record<string, T>, k: string): T | undefined =>
  (Object.prototype.hasOwnProperty.call(rec, k) ? rec[k] : undefined)
const laneOf        = (w: string): string | undefined => own(LANE_WORDS, w) ?? own(LANE_WORDS, unArticle(w))

// ── City comparison ──────────────────────────────────────────────────────────
// Looser than street matching, because a city match never stands alone (GovMap
// still needs the street and house, the fallback a hit for "address, city"):
// final letters, quotes, spaces and hyphens don't matter ("בת -ים" = "בת ים",
// "ב אר יעקב" = "באר יעקב"), doubled וו/יי are single (normWord: "קריית" =
// "קרית", "תקווה" = "תקוה", "נהרייה" = "נהריה"), an article on a later word is
// optional ("טירת הכרמל" = "טירת כרמל"), and a few known spelling variants are
// listed word by word. A lone ו/י is NOT optional in general: that would make
// צפת = צופית, אופקים = אפיקים, נהריה = נהורה, עומר = עמיר and אילת = אילות.

const FINAL_LETTERS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

// City-name words our data and GovMap/OSM spell differently by one mater
// lectionis (after normWord), mapped to one form. Replaced inside a word too,
// for GovMap's merged forms ("זיכרוןיעקב"). Add pairs as they show up.
const CITY_SPELLINGS: Record<string, string> = {
  'עילית': 'עלית',     // ביתר עילית, מודיעין עילית, נצרת עילית
  'זיכרון': 'זכרון',   // זכרון יעקב (GovMap: "זיכרון יעקב", "זיכרוןיעקב")
  'יוקנעם': 'יקנעם',   // יקנעם עילית
}
const plainFinals = (s: string) => s.replace(/[ךםןףץ]/g, c => FINAL_LETTERS[c])
const CITY_SPELLING_FOLDS = Object.entries(CITY_SPELLINGS)
  .map(([from, to]) => [new RegExp(plainFinals(from), 'g'), plainFinals(to)] as const)

/** A normalised city word with plain final letters and known variants folded. */
function foldCityWord(w: string): string {
  return CITY_SPELLING_FOLDS.reduce((s, [re, to]) => s.replace(re, to), plainFinals(w))
}

/** City word equality; `inner` (not the name's first word) also tolerates the
 *  article ("הכרמל" = "כרמל"). */
function cityWordEq(a: string, b: string, inner: boolean): boolean {
  const fa = foldCityWord(a)
  const fb = foldCityWord(b)
  return fa === fb || (inner && (unArticle(fa) === fb || fa === unArticle(fb)))
}

const foldedCity = (ws: string[]) => ws.map(foldCityWord).join('')

// Alias lookup by the folded form, so spelling variants of a key hit it too.
const aliasIndex = (rec: Record<string, string>) =>
  new Map(Object.entries(rec).map(([k, v]) => [foldedCity(placeWords(k)), v]))
const CITY_ALIAS_INDEX   = aliasIndex(CITY_ALIASES)
const GOVMAP_CITY_INDEX  = aliasIndex(GOVMAP_CITY_NAMES)
const cityAlias = (ws: string[]): string | undefined => CITY_ALIAS_INDEX.get(foldedCity(ws))

/** Same city words: word by word, or letter by letter across word breaks
 *  ("בית שמש" = "ביתשמש", "ב אר יעקב" = "באר יעקב"). */
function cityEq(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  if (a.length === b.length && a.every((w, i) => cityWordEq(w, b[i], i > 0))) return true
  return foldedCity(a) === foldedCity(b)
}

/** If `ws` (placeWords) ends with `city` — and not as the tail of a longer
 *  locality name ("גן יבנה", "טירת כרמל", "Kiryat Gat": the word before is a
 *  LOCALITY_PREFIX) — the words before it; otherwise null. `isOwnName(n)`
 *  exempts a name of n words that is exactly the input's own street or place
 *  (see nameBeforeCity). */
function wordsBeforeCity(ws: string[], city: string[], isOwnName?: (n: number) => boolean): string[] | null {
  if (city.length === 0 || ws.length < city.length) return null
  const at = ws.length - city.length
  if (!city.every((w, j) => cityWordEq(ws[at + j], w, j > 0))) return null
  if (at > 0 && LOCALITY_PREFIX.has(ws[at - 1]) && !isOwnName?.(at)) return null
  return ws.slice(0, at)
}

/** A token that turns a name into another street when only one side has it:
 *  a modifier, an alley/path word, or a number. */
function isDistinguishing(t: string): boolean {
  return MODIFIER_WORDS.has(t) || t.startsWith('#') || LANE_TOKENS.has(t.replace(/\d+$/, ''))
}

/** At least one token that names something (not just "#2" or "סמטה"). */
const hasName = (sig: string[]) => sig.some(t => !isDistinguishing(t))

/** Normalised words → the tokens that identify a street: type words and noise
 *  dropped, alley words kept ("סמטה 9" → "סמטה9"), numbers kept as "#n". */
function significant(ws: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]
    const lane = laneOf(w)
    if (lane) {
      if (/^\d+$/.test(ws[i + 1] ?? '')) out.push(`${lane}${Number(ws[++i])}`)
      else out.push(lane)
    } else if (/^\d+$/.test(w)) {
      out.push(`#${Number(w)}`)
    } else if (w.length >= 2 && !isGenericWord(w)) {
      out.push(w)
    }
  }
  return out
}

function stripCitySuffix(ws: string[]): string[] {
  for (const [base, suffix] of CITY_SUFFIXES) {
    const full = [...base, ...suffix]
    if (ws.length === full.length && full.every((w, i) => cityWordEq(ws[i], w, i > 0))) return base
  }
  return ws
}

/** City → canonical words (alias + official-suffix folding). */
function canonicalCity(city: string): string[] {
  const ws = placeWords(city)
  const alias = cityAlias(ws)
  return stripCitySuffix(alias ? placeWords(alias) : ws)
}

/** A GovMap record's city → canonical words: only GovMap's own alternate
 *  names are resolved (GOVMAP_CITY_NAMES), never the input aliases. */
function govmapCity(city: string): string[] {
  const ws = placeWords(city)
  const alias = GOVMAP_CITY_INDEX.get(foldedCity(ws))
  return stripCitySuffix(alias ? placeWords(alias) : ws)
}

function cityMatches(inputCity: string[], candidateCity: string): boolean {
  // Only the part before "\" "/" "|" "(": GovMap tags addresses all over Haifa
  // (Carmel, Hadar) with "חיפה\קריית חיים", so a secondary part says nothing
  // about where the house is — "אבא חושי 52" is not in Kiryat Haim.
  return cityEq(inputCity, govmapCity(candidateCity.split(/[\\/|(]/)[0]))
}

/** The city of a municipal address layer, "מערך כתובות באר שבע" → "באר שבע"
 *  (an optional "עיריית" dropped): the whole rest, so "מערך כתובות גן יבנה" is
 *  not יבנה. */
function layerCityMatches(inputCity: string[], layer: string): boolean {
  const ws = placeWords(layer)
  const at = ws.indexOf('כתובות')
  if (at === -1) return false
  const rest = ws.slice(at + 1)
  if (rest[0] === 'עירית' || rest[0] === 'עיריה') rest.shift()
  return cityEq(inputCity, govmapCity(rest.join(' ')))
}

/** A Latin city name → the Hebrew name it stands for (LATIN_CITY_NAMES). */
const latinCityHebrew = (ws: string[]): string | undefined => own(LATIN_CITY_NAMES, ws.join(' '))

/** English city names equal as written, or two spellings of one known city
 *  ("Rishon" = "Rishon LeZiyyon", "Bnei Brak" = "Bene Beraq"). */
function latinCityEq(a: string[], b: string[]): boolean {
  if (cityEq(a, b)) return true
  const ha = latinCityHebrew(a)
  const hb = latinCityHebrew(b)
  return ha !== undefined && hb !== undefined && cityEq(placeWords(ha), placeWords(hb))
}

/** Every Latin form of the input city: as written, plus the other known
 *  spellings of the same city ("rishon" → "rishon leziyyon", …). */
function latinCityForms(city: string[]): string[][] {
  const he = latinCityHebrew(city)
  if (he === undefined) return [city]
  const others = Object.keys(LATIN_CITY_NAMES)
    .filter(k => k !== city.join(' ') && cityEq(placeWords(LATIN_CITY_NAMES[k]), placeWords(he)))
    .map(k => k.split(' '))
  return [city, ...others]
}

/** An English result's city part ("Yerushalayim (Jerusalem)", "Tel Aviv-Yafo")
 *  names the input city as a whole — before a trailing parenthetical, or the
 *  parenthetical itself: "Modi'in Illit" is not Modiin. */
function latinCityMatches(inputCity: string[], cityPart: string): boolean {
  const p = splitParenthetical(cityPart)
  return (p ? [p.main, p.alt] : [cityPart]).some(n => latinCityEq(inputCity, stripCitySuffix(placeWords(n))))
}

/** "Yerushalayim (Jerusalem)" → main "Yerushalayim", alt "Jerusalem"; null
 *  without a trailing parenthetical. */
function splitParenthetical(s: string): { main: string; alt: string } | null {
  const t = s.trimEnd()
  const open = t.lastIndexOf('(')
  if (!t.endsWith(')') || open === -1 || t.indexOf(')') < open) return null
  return { main: t.slice(0, open).trim(), alt: t.slice(open + 1, -1).trim() }
}

/** Is `place` — a locality name a geocoder returned — the input `city`?
 *  Spelling and official long forms fold on both sides ("תל אביב" =
 *  "תל־אביב–יפו", "קריית אתא" = "קרית אתא", "ביתר עלית" = "ביתר עילית"), but
 *  CITY_ALIASES apply to the input only: "פסגת זאב" / "ראשון" / "קריית שמואל"
 *  as the input are in ירושלים / ראשון לציון / חיפה, while a place NAMED "רמות"
 *  (Beersheba has one too) is not ירושלים. With `settlement` (the place is a
 *  row's city/town/village), an aliased input matches only its target: "רמות"
 *  as the input is the Jerusalem neighbourhood, not the Golan moshav רמות. */
export function placeIsCity(city: string, place: string, settlement = false): boolean {
  const p = stripCitySuffix(placeWords(place))
  if (cityEq(canonicalCity(city), p)) return true
  if (settlement && cityAlias(placeWords(city)) !== undefined) return false
  return cityEq(stripCitySuffix(placeWords(city)), p)
}

/** `city`, as written or in canonical form, named by `text` — a Nominatim
 *  city_district "רובע קריית חיים - קריית שמואל" names both neighbourhoods:
 *  the city must END one of its " - " / ","-separated parts, and not as the
 *  tail of a longer name ("רובע חצור אשדוד" is not חצור, "רובע גן יבנה" not
 *  יבנה, "רובע טירת כרמל" not כרמל, "רובע מודיעין עילית" not מודיעין). Short
 *  names (< 4 letters) never count. */
export function cityNamedIn(city: string, text: string): boolean {
  const parts = text.split(/\s[-–—־]\s|[,;|/\\]/).map(placeWords).filter(p => p.length)
  return [placeWords(city), canonicalCity(city)].some(c =>
    foldedCity(c).length >= 4 && parts.some(p => wordsBeforeCity(p, c) !== null))
}

/** The city to search and validate a Hebrew address with: the Hebrew name of a
 *  known Israeli city given in Latin script ("יפו 42" + "Jerusalem" →
 *  "ירושלים"), otherwise `city` as given. */
export function hebrewCityForAddress(address: string, city: string): string {
  if (!HEBREW.test(address) || HEBREW.test(city)) return city
  return own(LATIN_CITY_NAMES, words(city).join(' ')) ?? city
}

/** If `text` ends with the city (not as the tail of a longer locality name:
 *  "הרצל גן יבנה" is not in יבנה), the words before it; otherwise null.
 *  With `ownSig` (the input's significant street words) a name that IS the
 *  input's street, word for word, may end with a LOCALITY_PREFIX word:
 *  "יגאל אלון תל אביב" is the street יגאל אלון, "שביל הר חיפה" the path שביל
 *  הר — while "הרצל חצור אשדוד" stays הרצל in חצור-אשדוד for "חצור". */
function nameBeforeCity(text: string, city: string[], ownSig?: string[]): string[] | null {
  const ws = words(text)
  const pw = placeWords(text)   // the same words, a geresh kept for the city
  const isOwnName = ownSig && ((n: number) => {
    const sig = significant(ws.slice(0, n))
    return sig.length === ownSig.length && sig.every((w, i) => wordEq(w, ownSig[i]))
  })
  for (const variant of [pw, trimCitySuffixAtEnd(pw)]) {
    if (variant.length <= city.length) continue
    const name = wordsBeforeCity(variant, city, isOwnName)
    if (name) return ws.slice(0, name.length)
  }
  return null
}

/** nameBeforeCity for an English text, whose city may come with its other
 *  name in parentheses ("… Yerushalayim (Jerusalem)"): then the words before
 *  the parenthetical (the other city name included, as it always was). Any
 *  known spelling of the city counts ("… Rishon LeZiyyon" for "Rishon"). */
function latinNameBeforeCity(text: string, city: string[], ownSig?: string[]): string[] | null {
  const p = splitParenthetical(text)
  const main = p ? p.main : text
  for (const form of latinCityForms(city)) {
    const name = nameBeforeCity(main, form, ownSig)
    if (name) return name
  }
  if (!p) return null
  return latinCityEq(city, stripCitySuffix(placeWords(p.alt))) && words(p.main).length ? words(p.main) : null
}

function trimCitySuffixAtEnd(ws: string[]): string[] {
  for (const [base, suffix] of CITY_SUFFIXES) {
    const full = [...base, ...suffix]
    if (ws.length < full.length) continue
    const tail = ws.slice(ws.length - full.length)
    if (full.every((w, i) => cityWordEq(tail[i], w, i > 0))) return ws.slice(0, ws.length - suffix.length)
  }
  return ws
}

// ── Input parsing ────────────────────────────────────────────────────────────

export interface GovmapAddressInput {
  latin:      boolean
  street:     string     // cleaned street (or place name when there is no number)
  streetSig:  string[]   // significant normalised street words
  streetWords: string[]  // all normalised street words (type/venue words too)
  house?:     { num: string; letter?: string }
  city:       string     // city for the query (aliases resolved)
  cityWords:  string[]   // canonical city words for validation
  queries:    string[]   // query variants, most specific first
  key:        string     // cache key
}

function parseHouse(tok: string): { num: string; letter?: string } | null {
  const m = INPUT_HOUSE_RE.exec(tok)
  if (!m) return null
  return { num: String(Number(m[1])), letter: m[2] ? normWord(m[2]) : undefined }
}

/** `segment` without a trailing city (any of `cityForms`, optionally followed
 *  by "יפו"); unchanged when it doesn't end with one. Word-by-word from the
 *  end — linear, no regex built from user input. */
function stripTrailingCity(segment: string, cityForms: string[][]): string {
  const toks = segment.split(/\s+/).filter(Boolean)
  const tokWords = toks.map(placeWords)
  for (const base of cityForms) {
    for (const form of [base, [...base, 'יפו']]) {
      let wi = form.length
      let ti = toks.length
      while (wi > 0 && ti > 0) {
        const tw = tokWords[ti - 1]
        if (tw.length === 0) { ti--; continue }   // a lone comma/dash
        const at = wi - tw.length
        if (tw.length > wi || !tw.every((w, j) => cityWordEq(w, form[at + j], at + j > 0))) break
        wi -= tw.length
        ti--
      }
      if (wi === 0 && ti > 0) return toks.slice(0, ti).join(' ').replace(/[\s,]+$/, '')
    }
  }
  return segment
}

const isLaneWord = (tok: string) => laneOf(normWord(tok)) !== undefined

/** Normalise a raw (address, city) pair into a validated-query plan, or null
 *  when there is nothing street-like to search for. */
export function parseGovmapAddress(address: string, city: string): GovmapAddressInput | null {
  // Real addresses are short; anything longer is junk, not worth a query.
  if (address.length > MAX_ADDRESS_LENGTH || city.length > MAX_CITY_LENGTH) return null
  const rawCity = hebrewCityForAddress(address, city.trim())
  const cityWords = canonicalCity(rawCity)
  if (!cityWords.length) return null
  const latin = !HEBREW.test(`${address} ${rawCity}`)
  const aliasCity = cityAlias(placeWords(rawCity))
  const queryCity = aliasCity ?? rawCity

  // Same designator semantics as nominatim.normalizeHebrewAddress: drop רחוב/רח',
  // expand a leading שד' (a trailing/quoted one is dropped below as a token).
  const cleaned = address
    .replace(/(^|[\s,])(?:רחוב\s+|רח['׳.]\s*)/g, '$1')   // not the "רחוב" in "רחובות"
    .replace(/(^|[\s,])שד['׳.]\s*(?=[^\s'"׳״])/g, '$1שדרות ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // "קניון עזריאלי, בגין 132" — prefer the comma segment carrying the number.
  const segments = cleaned.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  const hasHouse = (s: string) => s.split(/\s+/).some(t => parseHouse(t) !== null)
  let segment = segments.find(hasHouse) ?? segments.find(s => !cityEq(canonicalCity(s), cityWords)) ?? ''

  // A repeated trailing city ("מרכז טאגור 31 תל אביב", "2 דרך ירושלים רחובות"),
  // unless it is the street itself ("2 דרך ירושלים" in ירושלים).
  const stripped = stripTrailingCity(segment, [...new Set([rawCity, queryCity])].map(placeWords).filter(w => w.length))
  if (stripped !== segment && hasName(significant(words(stripped)))) segment = stripped

  const toks = segment.split(/\s+/)
    .map(t => t.replace(/^[,.:;()]+|[,.:;()]+$/g, ''))
    .filter(t => t && !DESIGNATOR_RE.test(t))

  let streetToks: string[]
  let house: { num: string; letter?: string } | undefined
  const idx = toks.findIndex(t => parseHouse(t) !== null)
  if (idx === 0) {
    // "164 משה דיין" → "משה דיין 164"; stop at a second number.
    house = parseHouse(toks[0]) ?? undefined
    const rest = toks.slice(1)
    const stop = rest.findIndex(t => parseHouse(t) !== null)
    streetToks = stop === -1 ? rest : rest.slice(0, stop)
  } else if (idx > 0) {
    // Everything after the number is noise here: floor/apt, a mall name
    // ("… 1 קניון עזריאלי רמלה"), or the city again. Except "… סמטה 9 3":
    // the alley number belongs to the street, the next number is the house.
    const h = isLaneWord(toks[idx - 1]) && toks[idx + 1] && parseHouse(toks[idx + 1]) ? idx + 1 : idx
    house = parseHouse(toks[h]) ?? undefined
    if (house && !house.letter && toks[h + 1] && HEBREW_LETTER.test(toks[h + 1])) house.letter = toks[h + 1]
    streetToks = toks.slice(0, h)
  } else {
    streetToks = toks
  }

  const street = streetToks.join(' ').trim()
  const streetSig = significant(words(street))
  if (!street || !hasName(streetSig)) return null

  const houseStr = house ? `${house.num}${house.letter ?? ''}` : ''
  const build = (s: string, h: string) => [s, h, queryCity].filter(Boolean).join(' ')
  const queries = [build(street, houseStr)]
  if (!latin && streetToks.length >= 2 && DROPPABLE_PREFIX.has(streetToks[0])) {
    queries.push(build(streetToks.slice(1).join(' '), houseStr))
  }
  if (house?.letter) {
    for (const q of [...queries]) queries.push(q.replace(` ${houseStr} `, ` ${house.num} `))
  }

  return {
    latin,
    street,
    streetSig,
    streetWords: words(street),
    house,
    city:      queryCity,
    cityWords,
    queries:   [...new Set(queries)],
    key:       `${latin ? 'en' : 'he'}:${queries[0].toLowerCase()}`,
  }
}

// ── Candidate validation ─────────────────────────────────────────────────────

// Coarser than a street — never an upgrade over a city-centre guess.
const AREA_TYPES  = new Set(['settlement', 'neighborhood', 'statistic', 'block', 'parcel', 'junction', 'ways'])
const PLACE_TYPES = new Set(['poi', 'institutes', 'parks'])

type Kind = 'address' | 'entity' | 'street' | 'place'

function kindOf(type: string): { kind: Kind; layer?: string } | null {
  if (type === 'address') return { kind: 'address' }
  if (type === 'street') return { kind: 'street' }
  if (PLACE_TYPES.has(type)) return { kind: 'place' }
  // User/entity layers: "215337|מערך כתובות באר שבע|entity". Only municipal
  // address layers ("מערך כתובות …") are trusted as address data.
  const parts = type.split('|')
  if (parts.length >= 3 && parts[parts.length - 1] === 'entity' && parts[1].includes('כתובות')) {
    return { kind: 'entity', layer: parts[1] }
  }
  return null
}

interface View { street: string; house?: string; city?: string }

function viewFromText(text: string): View {
  const ws = text.replace(/,/g, ' ').trim().split(/\s+/)
  for (let i = ws.length - 1; i >= 0; i--) {
    if (!RESULT_HOUSE_RE.test(ws[i])) continue
    let house = ws[i]
    let j = i + 1
    if (ws[j] && HEBREW_LETTER.test(ws[j])) { house += ws[j]; j++ }
    return { street: ws.slice(0, i).join(' '), house, city: ws.slice(j).join(' ') }
  }
  return { street: text }
}

function houseMatches(want: { num: string; letter?: string }, got: string | undefined): boolean {
  if (!got) return false
  const m = RESULT_HOUSE_RE.exec(got)
  if (!m || String(Number(m[1])) !== want.num) return false
  const letter = m[2] ? normWord(m[2]) : undefined
  return !(want.letter && letter && want.letter !== letter)
}

/** `run` as a contiguous, in-order sequence of `seq` (article-tolerant). */
function containsRun(seq: string[], run: string[]): boolean {
  for (let i = 0; i + run.length <= seq.length; i++) {
    if (run.every((w, j) => wordEq(seq[i + j], w))) return true
  }
  return false
}

type MatchMode = 'house' | 'place'

// Street spellings our data and GovMap disagree on by matres lectionis only:
// "ניסנבאום" = "ניסנבוים", "נורדואו" = "נורדאו", "אבוחצירה" = "אבוחצירא",
// "סרוצקין" = "סורוצקין", "האומראים" = "האמוראים" (live misses, 2026-09).
// Tolerated only with a house number, for words of ≥ 6 letters without the
// article (short ones collide: "רימון" ≠ "רמון", "הכרמים" ≠ "הכורמים"), with
// every word accounted for, never as an exact match (a later response showing
// the input's own spelling wins), and not when the response also holds a
// street one letter away from it ("הרתום 9": GovMap has both הרותם and הרטום).
const SPELLING_MIN_LETTERS   = 6
// Below this many letters a ו/י right after the first letter is not a spelling
// variant but the קוטלים pattern — another word ("הרימונים" ≠ "הרמונים").
const SPELLING_LOOSE_LETTERS = 7
const SPELLING_PENALTY       = 0.99

/** A street word without final-letter forms, a final ה/א, or ו/י/א after its
 *  first letter (after its second one with `keepSecond`). */
function foldStreetWord(w: string, keepSecond = false): string {
  const s = unArticle(w).replace(/[ךםןףץ]/g, c => FINAL_LETTERS[c])
  const from = keepSecond ? 2 : 1
  const inner = s.length > from ? s.slice(0, from) + s.slice(from).replace(/[ויא]/g, '') : s
  return inner.length > 2 ? inner.replace(/[הא]$/, '') : inner
}

/** The same street word up to matres lectionis (see above). */
function spellingEq(a: string, b: string): boolean {
  const letters = Math.min(unArticle(a).length, unArticle(b).length)
  if (letters < SPELLING_MIN_LETTERS) return false
  const keepSecond = letters < SPELLING_LOOSE_LETTERS
  return foldStreetWord(a, keepSecond) === foldStreetWord(b, keepSecond)
}

// Loosest fold: spellingAmbiguous looks for any near neighbour.
const spellingKey = (sig: string[]) => sig.map(w => foldStreetWord(w)).join(' ')

/** Equal, or one insertion / deletion / substitution apart. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** How well a candidate street matches the input street, 0 = reject, 1 = the
 *  same name. The candidate's words must all appear in the input ("נתן שטראוס"
 *  → "שטראוס"), or the input's ≥2 words all appear in a candidate with at most
 *  one extra word ("בן יהודה" → "אליעזר בן יהודה"). A single shared word is not
 *  enough: "הרצל" ≠ "ד"ר רוזנבלום הרצל", "יצחק רבין" ≠ "רבי שלמה בן יצחק". A
 *  modifier, alley or number on one side only is always another street ("בית
 *  לחם" ≠ "בית לחם הישנה" ≠ "… סמטה 9").
 *
 *  With a house number ('house'), a one-word candidate inside a longer input
 *  must be the input's last word — the surname ("נתן שטראוס" → "שטראוס",
 *  "ירמיהו הנביא" → "ירמיהו") — and the input must not be a place name
 *  ("קרית חיים 25" is not "חיים 25", which GovMap uses for משה חיים שפירא).
 *
 *  Without one ('place': a venue or street name), input ⊆ candidate is also
 *  accepted, but the shorter side must sit in the longer one in order and
 *  unbroken ("קניון רמות שדרות גולדה מאיר" is not the building "מאיר רמות"),
 *  and the two must share ≥ 2 words (venue words like קניון count) or at least
 *  half of the input's significant words ("בנין אישפוז מרכזי מתחם המסעדות" is
 *  not "מרכזי מסחרי"). */
function streetScore(input: GovmapAddressInput, candidate: string[], mode: MatchMode): number {
  const inputSig = input.streetSig
  const cand = significant(candidate)
  if (!cand.length || !inputSig.length) return 0
  const eq = (a: string, b: string) => wordEq(a, b) || (mode === 'house' && spellingEq(a, b))
  const candExtra = cand.filter(b => !inputSig.some(a => eq(a, b)))
  const inExtra   = inputSig.filter(a => !cand.some(b => eq(a, b)))
  if (candExtra.some(isDistinguishing) || inExtra.some(isDistinguishing)) return 0
  const inCore = inputSig.filter(t => !isDistinguishing(t))
  if (!inCore.some(a => cand.some(b => eq(a, b)))) return 0
  const candCore = cand.filter(t => !isDistinguishing(t))
  const exact      = !candExtra.length && !inExtra.length   // any length: "הרב שך" = "שך"
  const candSubset = !candExtra.length && (candCore.length > 1 || (candCore[0]?.length ?? 0) >= 3)
  const inSubset   = !inExtra.length
  const ok = exact
    || candSubset
    || (inSubset && inCore.length >= 2 && candExtra.length <= 1)
    || (mode === 'place' && inSubset)
  if (!ok) return 0
  // Some word paired up only through spelling folding.
  const spelledOnly = (x: string, ys: string[]) => !ys.some(y => wordEq(x, y)) && ys.some(y => spellingEq(x, y))
  const spelled = mode === 'house' && (inputSig.some(a => spelledOnly(a, cand)) || cand.some(b => spelledOnly(b, inputSig)))
  if (spelled && !exact) return 0

  if (!exact && mode === 'house' && candSubset && candCore.length === 1) {
    let last = inCore.length - 1
    while (last > 0 && HONORIFICS.has(inCore[last])) last--
    if (!wordEq(candCore[0], inCore[last]) || PLACE_PREFIX.has(inCore[0])) return 0
    // After a rabbinic title the one word is a given name, not a surname:
    // "רבי מאיר" is not "גולדה מאיר" — unless the input has a title too
    // ("הרב אברהם יצחק קוק" → "הרב קוק").
    if (candidate.some(w => RABBI_TITLES.has(w)) && !input.streetWords.some(w => RABBI_TITLES.has(w))) return 0
  }

  if (mode === 'place') {
    if (!exact) {
      const [longer, shorter] = candExtra.length ? [candCore, inCore] : [inCore, candCore]
      if (!containsRun(longer, shorter)) return 0
    }
    const sharedSig = inputSig.length - inExtra.length
    const named = candidate.filter(w => w.length >= 2)
    const sharedAll = input.streetWords.filter(a => a.length >= 2 && named.some(b => wordEq(a, b))).length
    if (sharedSig * 2 < inputSig.length && sharedAll < 2) return 0
  }

  const score = (inputSig.length - inExtra.length + cand.length - candExtra.length) / (inputSig.length + cand.length)
  return spelled ? score * SPELLING_PENALTY : score
}

export interface ValidatedCandidate {
  point: GeocodePoint
  score: number
  exact: boolean        // the street name matched word for word (score 1)
  spelled: boolean      // matched only up to matres lectionis (score SPELLING_PENALTY)
  placeMatch: boolean   // a venue input ("קניון …") matched a POI/building of that kind
}

interface HouseView { street: string[]; house?: string; cityOk: boolean }

/** The (street, house, city-ok) readings of a house-level result: from its id
 *  ("address|ADDR|obj|street|house|city"), its texts ("<street> <house> <city>")
 *  or, for a municipal address layer, the layer's city. */
function houseViews(input: GovmapAddressInput, r: GovmapResult, k: { kind: Kind; layer?: string }): HouseView[] {
  const texts = [r.text, r.originalText].filter((t): t is string => typeof t === 'string' && t.trim() !== '')
  const views: HouseView[] = []
  if (input.latin) {
    // English results ("Yafo 42 Yerushalayim (Jerusalem)"): the text after the
    // house number must be the city.
    for (const t of texts) {
      const v = viewFromText(t)
      views.push({ street: words(v.street), house: v.house, cityOk: latinCityMatches(input.cityWords, v.city ?? '') })
    }
  } else if (k.kind === 'entity') {
    const cityOk = layerCityMatches(input.cityWords, k.layer ?? '')
    for (const t of texts) {
      const v = viewFromText(k.layer && t.startsWith(k.layer) ? t.slice(k.layer.length) : t)
      views.push({ street: words(v.street), house: v.house, cityOk })
    }
  } else {
    const hebrewCity = (city?: string) => city !== undefined && HEBREW.test(city) && cityMatches(input.cityWords, city)
    const parts = r.id.split('|')
    if (parts[0] === 'address' && parts.length >= 6) {
      const city = parts.slice(5).join('|')
      views.push({ street: words(parts[3]), house: parts[4], cityOk: hebrewCity(city) })
    }
    for (const t of texts) {
      const v = viewFromText(t)
      views.push({ street: words(v.street), house: v.house, cityOk: hebrewCity(v.city) })
    }
  }
  return views
}

/** Point + kind of a result that could be a hit at all: in Israel, on land, not
 *  area-level, and house-level iff the input has a house number. */
function usable(input: GovmapAddressInput, r: GovmapResult): { ll: { lat: number; lng: number }; k: { kind: Kind; layer?: string } } | null {
  const ll = centroidToLatLng(r.centroid)
  if (!ll || !isWithinIsrael(ll) || isInMediterraneanSea(ll)) return null
  if (AREA_TYPES.has(r.type)) return null
  const k = kindOf(r.type)
  if (!k) return null
  // With a house number only house-level records count; without one, a street
  // or a named place is the best there is (an arbitrary house is not).
  if (input.house ? !(k.kind === 'address' || k.kind === 'entity') : !(k.kind === 'street' || k.kind === 'place')) {
    return null
  }
  return { ll, k }
}

/** Accept a GovMap result only if it is provably the input address: a point in
 *  Israel on land, not an area-level type, the exact house number (6 ≠ 16/60),
 *  the same city (the text AFTER the house number, not a street named after the
 *  city: "רחובות הבוכרים 2 ירושלים" is not in רחובות) and a matching street. */
export function validateGovmapCandidate(input: GovmapAddressInput, r: GovmapResult): ValidatedCandidate | null {
  const u = usable(input, r)
  if (!u) return null
  const { ll, k } = u
  let best = 0

  // Names (without the city) the candidate goes by, for the no-number path.
  const names: string[][] = []
  if (input.house) {
    for (const v of houseViews(input, r, k)) {
      if (!v.cityOk || !houseMatches(input.house, v.house)) continue
      best = Math.max(best, streetScore(input, v.street, 'house'))
    }
  } else {
    // No house number: the (original) text must END with the city. A street
    // whose id names a Hebrew city ("street|…|<name>|<city>") must be in the
    // input city: the id city, or — as the id city is often a search alias
    // ("הזכרוןיעקב", "הבירהבירתישראל", "ק'ביאליק") — the originalText, GovMap's
    // canonical "<street> <city>", must name it.
    // The own-name exemption (a street called "חצור" in אשדוד is not the kibbutz
    // חצור-אשדוד) is for street records only: a POI named just "מרכז מסחרי"
    // has no significant words, so "מרכז מסחרי חצור אשדוד" would pass it.
    const ownSig = k.kind === 'street' ? input.streetSig : undefined
    const nameIn = (t: string) => (input.latin
      ? latinNameBeforeCity(t, input.cityWords, ownSig)
      : nameBeforeCity(t, input.cityWords, ownSig))
    const parts = r.id.split('|')
    const idCity = !input.latin && k.kind === 'street' && parts.length >= 5 && HEBREW.test(parts[4]) ? parts[4] : null
    const idCityOk = idCity === null || cityMatches(input.cityWords, idCity)
      || (typeof r.originalText === 'string' && nameIn(r.originalText) !== null)
    if (idCityOk) {
      for (const t of [r.text, r.originalText]) {
        if (typeof t !== 'string' || t.trim() === '') continue
        const name = nameIn(t)
        if (name) names.push(name)
      }
      if (idCity !== null) names.push(words(parts[3]))
    }
  }
  let placeMatch = false
  for (const name of names) {
    const score = streetScore(input, name, 'place')
    if (score <= 0) continue
    best = Math.max(best, score)
    // "קניון מלכת שבא": the mall POI beats רחוב מלכת שבא of the same score.
    if (k.kind === 'place' && name.some(w => PLACE_WORDS.has(unArticle(w)) && input.streetWords.some(a => wordEq(a, w)))) {
      placeMatch = true
    }
  }

  if (best <= 0) return null
  const addresstype = k.kind === 'street' ? 'road' : k.kind === 'place' ? 'amenity' : 'house'
  return {
    score: best,
    exact: best === 1,
    // A spelling-tolerant match is always a full match, so it scores exactly
    // this; any other partial score is n / (words on both sides) < 0.99.
    spelled: best === SPELLING_PENALTY,
    placeMatch,
    point: {
      lat:         ll.lat,
      lng:         ll.lng,
      addresstype,
      displayName: r.originalText?.trim() || r.text,
      provider:    'govmap',
    },
  }
}

/** True when `r` shows that the input's street, word for word, exists in the
 *  input city (any house number). Then a partial name match is a DIFFERENT
 *  street: "קרן היסוד 14 תל אביב" exists, so "היסוד 3" is not "קרן היסוד 3". */
function provesInputStreet(input: GovmapAddressInput, r: GovmapResult): boolean {
  if (!input.house) return false
  const u = usable(input, r)
  return !!u && houseViews(input, r, u.k).some(v => v.cityOk && streetScore(input, v.street, 'house') === 1)
}

/** What the responses for one address have shown so far, across calls. */
interface StreetEvidence {
  /** Some response showed the input's street, word for word, in the city. */
  inputStreetSeen: boolean
  /** Some response held the address twice, far apart, at this rank: a later
   *  response listing only one of the two must not settle the tie. */
  ambiguousAt?: ValidatedCandidate
}

/** Does the response hold, in the input city, a street one letter away from
 *  the input's (folded) name but not equal to it? Then a spelling-tolerant
 *  match is a guess between two streets ("הרתום": הרותם or הרטום). */
function spellingAmbiguous(input: GovmapAddressInput, results: GovmapResult[]): boolean {
  const key = spellingKey(input.streetSig)
  return results.some(r => {
    const u = usable(input, r)
    return !!u && houseViews(input, r, u.k).some(v => {
      if (!v.cityOk) return false
      const other = spellingKey(significant(v.street))
      return other !== key && withinOneEdit(other, key)
    })
  })
}

/** Venue matches first, then the higher street score. */
const outranks = (a: ValidatedCandidate, b: ValidatedCandidate) =>
  a.placeMatch !== b.placeMatch ? a.placeMatch : a.score > b.score

function metersApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

/** Best validated candidate of one response (a venue match for a venue input,
 *  else the highest street score). A partial street match is dropped once any
 *  response (tracked in `evidence`) has shown the exact input street. Equally
 *  good candidates > AMBIGUOUS_M apart mean GovMap holds the address twice
 *  (live: "פינסקר 16 ראשון לציון" at two points 1.5 km apart, the returned
 *  order flipping between calls), so there is no answer rather than a guess —
 *  and, remembered in `evidence`, none from a later response at that rank
 *  either (it may list just one of the two). */
function bestCandidate(
  input: GovmapAddressInput,
  results: GovmapResult[],
  evidence: StreetEvidence,
): ValidatedCandidate | null {
  if (!evidence.inputStreetSeen) evidence.inputStreetSeen = results.some(r => provesInputStreet(input, r))
  let best: ValidatedCandidate | null = null
  const valid: ValidatedCandidate[] = []
  let ambiguous: boolean | undefined
  for (const r of results) {
    const v = validateGovmapCandidate(input, r)
    if (!v || (!v.exact && evidence.inputStreetSeen)) continue
    if (v.spelled) {
      ambiguous ??= spellingAmbiguous(input, results)
      if (ambiguous) continue
    }
    if (!best || outranks(v, best)) best = v
    valid.push(v)
  }
  const top = best
  if (!top) return null
  if (valid.some(v => !outranks(top, v) && metersApart(v.point, top.point) > AMBIGUOUS_M)) {
    if (!evidence.ambiguousAt || outranks(top, evidence.ambiguousAt)) evidence.ambiguousAt = top
    return null
  }
  return clearOfAmbiguity(top, evidence) ? top : null
}

/** `c` beats any tie seen so far (see StreetEvidence.ambiguousAt). */
const clearOfAmbiguity = (c: ValidatedCandidate, evidence: StreetEvidence) =>
  !evidence.ambiguousAt || outranks(c, evidence.ambiguousAt)

// ── Address geocoding ────────────────────────────────────────────────────────

export interface GovmapGeocodeResult {
  point:     GeocodePoint | null
  /** GovMap could not give a definitive answer (outage, timeout, 429, auth,
   *  cooldown, budget): a null point then means "unknown", not "no match". */
  transient: boolean
}

/** Geocode an Israeli address via GovMap: a validated point or null (not
 *  configured, no validated hit, or a transient failure — then `transient`).
 *  Tries each query variant with isAccurate:true then :false — at most 6 calls
 *  within a 5 s budget — and stops at the first exact-street (or venue) hit or
 *  the first failed call (the fallbacks take over). Only GovMap's calls are
 *  bounded by that budget; LocationIQ/Nominatim after it have their own
 *  timeouts and queue, so the whole chain can outlast the map's 15 s abort. */
export async function geocodeGovmapAddressDetailed(address: string, city: string): Promise<GovmapGeocodeResult> {
  if (!govmapConfigured()) return { point: null, transient: false }
  const input = parseGovmapAddress(address, city)
  if (!input) return { point: null, transient: false }

  // v3: validation rules changed (2026-09) — v2 entries may hold rejected picks.
  const cacheKey = `govmap:addr:v3:${input.key}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return { point: JSON.parse(hit) as GeocodePoint | null, transient: false }
  } catch { /* Redis unavailable */ }

  // Accurate first for every variant, then fuzzy: fuzzy returns more wrong
  // neighbours, but also finds "מצדה 6" for "דרך מצדה 6".
  const language: GovmapLanguage = input.latin ? 'en' : 'he'
  const attempts = [true, false]
    .flatMap(isAccurate => input.queries.map(q => ({ q, isAccurate })))
    .slice(0, MAX_CALLS_PER_ADDRESS)
  const deadline = Date.now() + ADDRESS_BUDGET_MS
  const evidence: StreetEvidence = { inputStreetSeen: false }
  const answeredAccurate = new Set<string>()
  let transient = false
  let result: GeocodePoint | null = null
  let partial: ValidatedCandidate | null = null

  for (const { q, isAccurate } of attempts) {
    const o = await searchGovmapOutcome(q, { isAccurate, maxResults: 5, language, timeoutMs: deadline - Date.now() })
    if (o.results === null) {
      // A 5xx from the fuzzy search for a text the accurate search already
      // answered is GovMap choking on that text (it does so every time), not
      // an outage: skip that variant and keep the answer definitive.
      if (o.server && !isAccurate && answeredAccurate.has(q)) continue
      // Timeout, outage, cooldown or budget spent: stop here, don't pile retries.
      transient = true
      break
    }
    if (isAccurate) answeredAccurate.add(q)
    const best = bestCandidate(input, o.results, evidence)
    if (best && (best.exact || best.placeMatch)) { result = best.point; break }
    // A partial name match ("נתן שטראוס" → "שטראוס") is kept only if no later
    // response shows the exact input street elsewhere in the city.
    if (best && !partial) partial = best
  }
  if (!result && partial && !evidence.inputStreetSeen && clearOfAmbiguity(partial, evidence)) {
    // …and only once every call answered: after a failed one the response that
    // would have shown the exact street is missing, so the answer is "unknown"
    // (the caller falls back, a batch job retries) — never a partial point
    // reported as settled.
    if (transient) return { point: null, transient: true }
    result = partial.point
  }

  // Cache definitive answers only. After a transient failure (even with a
  // partial hit) the next request retries.
  if (!transient) {
    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)) } catch { /* ignore */ }
  }
  return { point: result, transient }
}

// ── Place search (map "correct my location") ─────────────────────────────────

export interface PlaceSuggestion {
  id:      string
  label:   string
  detail?: string
  lat:     number
  lng:     number
}

export type PlacesLang = 'he' | 'en' | 'ru'

// Cadastral / statistical records are noise in a place picker.
const PLACES_SKIP_TYPES = new Set(['block', 'parcel', 'statistic'])

const TYPE_LABELS: Record<string, Record<PlacesLang, string>> = {
  settlement:   { he: 'יישוב',  en: 'Locality',      ru: 'Населённый пункт' },
  neighborhood: { he: 'שכונה',  en: 'Neighbourhood', ru: 'Район' },
  street:       { he: 'רחוב',   en: 'Street',        ru: 'Улица' },
  address:      { he: 'כתובת',  en: 'Address',       ru: 'Адрес' },
  junction:     { he: 'צומת',   en: 'Junction',      ru: 'Перекрёсток' },
  poi:          { he: 'מקום',   en: 'Place',         ru: 'Место' },
  institutes:   { he: 'מוסד',   en: 'Institution',   ru: 'Учреждение' },
  parks:        { he: 'פארק',   en: 'Park',          ru: 'Парк' },
  ways:         { he: 'דרך',    en: 'Road',          ru: 'Дорога' },
}

function typeLabel(type: string, lang: PlacesLang): string | undefined {
  const known = TYPE_LABELS[type]?.[lang]
  if (known) return known
  const parts = type.split('|')
  return parts.length >= 3 && parts[parts.length - 1] === 'entity' ? parts[1] : undefined
}

/** Search-as-you-type place lookup via GovMap (all types incl. settlements).
 *  Returns [] for a definitive "nothing", null for a transient failure / not
 *  configured (the caller then falls back to Nominatim). */
export async function searchGovmapPlaces(q: string, lang: PlacesLang): Promise<PlaceSuggestion[] | null> {
  if (!govmapConfigured()) return null
  const text = q.trim().replace(/\s+/g, ' ')
  if (!text) return []

  const cacheKey = `govmap:places:${lang}:${text.toLowerCase()}`
  try {
    const hit = await redis.get(cacheKey)
    if (hit !== null) return JSON.parse(hit) as PlaceSuggestion[]
  } catch { /* Redis unavailable */ }

  const language: GovmapLanguage = HEBREW.test(text) ? 'he' : 'en'
  const results = await searchGovmap(text, { isAccurate: false, maxResults: PLACES_MAX_RESULTS, language })
  if (results === null) return null

  const places: PlaceSuggestion[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (PLACES_SKIP_TYPES.has(r.type)) continue
    const ll = centroidToLatLng(r.centroid)
    if (!ll) continue
    const label = r.originalText?.trim() || r.text
    // The same place often comes back twice (as "institutes" and as "poi").
    const dedupe = `${label}|${ll.lat.toFixed(4)}|${ll.lng.toFixed(4)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const detail = r.subTypeText?.trim() || typeLabel(r.type, lang)
    places.push({
      id:    r.id,
      label,
      ...(detail ? { detail } : {}),
      lat:   Number(ll.lat.toFixed(6)),
      lng:   Number(ll.lng.toFixed(6)),
    })
    if (places.length >= PLACES_MAX_RESULTS) break
  }

  // Keystroke queries are unbounded across clients: keep empty answers briefly.
  try { await redis.setex(cacheKey, places.length ? CACHE_TTL : EMPTY_PLACES_TTL, JSON.stringify(places)) } catch { /* ignore */ }
  return places
}
