import type { Request } from 'express'
import { createHash } from 'crypto'
import { mapRepo } from '../db/map.repo'
import { serializeMapRestaurant, serializeMapRestaurantsPage } from '../serializers/map.serializer'
import { withCache } from '../lib/cache'
import { asyncHandler } from '../lib/asyncHandler'
import type { KashrutLevel, MapBounds, MapFilter, MapPoint, MapRestaurantRow } from '../db/map.repo'

const HECHSHERIM_CACHE_TTL = 600
const MAP_OPTIONS_CACHE_TTL = 600
const SITEMAP_CACHE_TTL = 3600
const CACHE_TTL = 300

// Public site the crawlable URLs live on (the map SPA, not the API host).
const MAP_SITE_URL = (process.env.PUBLIC_MAP_URL ?? 'https://mykoshermap.com').replace(/\/$/, '')

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;')
}

const KASHRUT_LEVEL_LABEL: Record<string, string> = {
  mehadrin: 'Мехадрин', badatz: 'Бадац', regular: 'Рабанут',
}

// Minimal crawler-facing HTML for /r/:id. nginx routes bot user-agents here so
// search engines and social scrapers get real per-place title/description/OG and
// FoodEstablishment structured data; humans keep getting the SPA. See ADR-0004.
function buildRestaurantPrerenderHtml(r: MapRestaurantRow): string {
  const url   = `${MAP_SITE_URL}/r/${r.id}`
  const level = KASHRUT_LEVEL_LABEL[r.kashrutLevel] ?? r.kashrutLevel
  const title = `${r.name} — ${r.city} | KashrutMap`
  const desc  = `${r.name}, ${r.address}, ${r.city}. Кошерность: ${r.hechsher} (${level}).`
  const image = `${MAP_SITE_URL}/og-image.svg`

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: r.name,
    address: { '@type': 'PostalAddress', streetAddress: r.address, addressLocality: r.city, addressCountry: 'IL' },
    servesCuisine: 'Kosher',
    url,
    additionalProperty: [{ '@type': 'PropertyValue', name: 'Kashrut certification', value: r.hechsher }],
  }
  // Only advertise coordinates we actually trust — approximate (city-centre)
  // points would put a wrong pin in Google's local results.
  if (r.geoAccuracy === 'exact') {
    ld.geo = { '@type': 'GeoCoordinates', latitude: r.lat, longitude: r.lng }
  }
  const ldJson = JSON.stringify(ld).replace(/<\//g, '<\\/')

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="restaurant.restaurant">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ldJson}</script>
</head>
<body>
<h1>${escapeHtml(r.name)}</h1>
<p>${escapeHtml(`${r.address}, ${r.city}`)}</p>
<p>Кошерность: ${escapeHtml(r.hechsher)} (${escapeHtml(level)})</p>
<p><a href="${url}">Открыть на карте KashrutMap</a></p>
</body>
</html>
`
}

function buildSitemapXml(entries: { id: string; updatedAt: Date }[]): string {
  const url = (loc: string, lastmod: string, priority: string) =>
    `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`
  const today = new Date().toISOString().slice(0, 10)
  const rows = [
    url(`${MAP_SITE_URL}/`, today, '1.0'),
    ...entries.map(e => url(`${MAP_SITE_URL}/r/${e.id}`, e.updatedAt.toISOString().slice(0, 10), '0.7')),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}

const DEFAULT_RESTAURANT_LIMIT = 750
const MAX_RESTAURANT_LIMIT = 1500

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function roundCoord(value: number): number {
  return Math.round(value * 100_000) / 100_000
}

function roundCacheCoord(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function restaurantsCacheKey(filter: MapFilter): string {
  const normalized: Record<string, unknown> = {
    city:         filter.city ?? null,
    kashrutLevel: filter.kashrutLevel ? [...filter.kashrutLevel].sort() : null,
    hechsher:     filter.hechsher ? [...filter.hechsher].sort() : null,
    foodType:     filter.foodType ? [...filter.foodType].sort() : null,
    category:     filter.category ? [...filter.category].sort() : null,
    q:            filter.q ?? null,
    bounds:       filter.bounds
      ? {
          north: roundCacheCoord(filter.bounds.north),
          south: roundCacheCoord(filter.bounds.south),
          east:  roundCacheCoord(filter.bounds.east),
          west:  roundCacheCoord(filter.bounds.west),
        }
      : null,
    center: filter.center
      ? { lat: roundCacheCoord(filter.center.lat), lng: roundCacheCoord(filter.center.lng) }
      : null,
    radius: filter.radius ?? null,
    limit:  filter.limit,
  }
  const ordered = Object.keys(normalized).sort().map(k => [k, normalized[k]] as const)
  const hash = createHash('sha1').update(JSON.stringify(ordered)).digest('hex').slice(0, 16)
  return `map:restaurants:${hash}`
}

function parseNumber(value: unknown, min: number, max: number): number | undefined {
  const raw = queryString(value)
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined
  return parsed
}

function parseLimit(value: unknown): number {
  const parsed = parseNumber(value, 1, MAX_RESTAURANT_LIMIT)
  return parsed ? Math.floor(parsed) : DEFAULT_RESTAURANT_LIMIT
}

function parseBounds(query: Record<string, unknown>): MapBounds | undefined {
  const north = parseNumber(query.north, -90, 90)
  const south = parseNumber(query.south, -90, 90)
  const east  = parseNumber(query.east, -180, 180)
  const west  = parseNumber(query.west, -180, 180)
  if ([north, south, east, west].every(v => v === undefined)) return undefined
  if (north === undefined || south === undefined || east === undefined || west === undefined || south > north) {
    throw new Error('Invalid map bounds')
  }
  return {
    north: roundCoord(north), south: roundCoord(south),
    east:  roundCoord(east),  west:  roundCoord(west),
  }
}

function parseCenter(query: Record<string, unknown>): MapPoint | undefined {
  const lat = parseNumber(query.lat, -90, 90)
  const lng = parseNumber(query.lng, -180, 180)
  if (lat === undefined && lng === undefined) return undefined
  if (lat === undefined || lng === undefined) throw new Error('Invalid map center')
  return { lat: roundCoord(lat), lng: roundCoord(lng) }
}

function parseCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined
  const parts = value.split(',').map(s => s.trim()).filter(Boolean) as T[]
  return parts.length ? [...new Set(parts)].sort() : undefined
}

const MAX_SEARCH_LENGTH = 100
function parseSearch(value: unknown): string | undefined {
  const raw = queryString(value)?.trim()
  if (!raw) return undefined
  return raw.slice(0, MAX_SEARCH_LENGTH)
}

function geoFromHeaders(req: Request): { lat: number; lng: number } | null {
  const tryPair = (latKey: string, lngKey: string) => {
    const lat = Number(req.header(latKey))
    const lng = Number(req.header(lngKey))
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng }
    }
    return null
  }
  return tryPair('cf-iplatitude', 'cf-iplongitude')
    ?? tryPair('x-vercel-ip-latitude', 'x-vercel-ip-longitude')
    ?? tryPair('x-appengine-citylatlong-lat', 'x-appengine-citylatlong-lng')
}

export const mapController = {
  getGeo: asyncHandler(async (req, res) => {
    const geo = geoFromHeaders(req)
    if (!geo) { res.status(204).end(); return }
    res.set('cache-control', 'public, max-age=600')
    res.json(geo)
  }),

  listHechsherim: asyncHandler(async (_req, res) => {
    const data = await withCache('map:hechsherim', HECHSHERIM_CACHE_TTL, () => mapRepo.findHechsherim())
    res.json(data)
  }),

  listOptions: asyncHandler(async (_req, res) => {
    const data = await withCache('map:options', MAP_OPTIONS_CACHE_TTL, () => mapRepo.findMapOptions())
    res.json(data)
  }),

  getSitemap: asyncHandler(async (_req, res) => {
    const xml = await withCache('map:sitemap', SITEMAP_CACHE_TTL, async () =>
      buildSitemapXml(await mapRepo.findSitemapEntries()))
    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  }),

  getRestaurant: asyncHandler(async (req, res) => {
    const id = req.params.restaurantId
    const data = await withCache(`map:restaurant:${id}`, CACHE_TTL, () => mapRepo.findById(id))
    if (!data) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMapRestaurant(data))
  }),

  // Crawler-facing prerender for /r/:id (nginx routes bots here). Reuses the
  // cached single-restaurant lookup so it costs no extra DB hit on a warm cache.
  getRestaurantPrerender: asyncHandler(async (req, res) => {
    const id = req.params.restaurantId
    const data = await withCache(`map:restaurant:${id}`, CACHE_TTL, () => mapRepo.findById(id))
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=3600')
    if (!data) {
      res.status(404).send('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Не найдено | KashrutMap</title><meta name="robots" content="noindex"></head><body><p>Заведение не найдено.</p><p><a href="' + MAP_SITE_URL + '/">KashrutMap</a></p></body></html>')
      return
    }
    res.send(buildRestaurantPrerenderHtml(data))
  }),

  listRestaurants: asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>
    try {
      const filter: MapFilter = {
        city:         queryString(q.city) || undefined,
        kashrutLevel: parseCsv<KashrutLevel>(queryString(q.kashrutLevel)),
        hechsher:     parseCsv(queryString(q.hechsher)),
        foodType:     parseCsv(queryString(q.foodType)),
        category:     parseCsv(queryString(q.category)),
        q:            parseSearch(q.q),
        bounds:       parseBounds(q),
        center:       parseCenter(q),
        radius:       parseNumber(q.radius, 1, 100_000),
        limit:        parseLimit(q.limit),
      }
      const data = await withCache(restaurantsCacheKey(filter), CACHE_TTL, () => mapRepo.findForMap(filter))
      res.json(serializeMapRestaurantsPage(data))
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Invalid map')) {
        res.status(400).json({ error: e.message }); return
      }
      throw e
    }
  }),
}
