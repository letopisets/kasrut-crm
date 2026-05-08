import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { mapRepo }                  from '../db/map.repo'
import { mapCommunityRepo }         from '../db/mapCommunity.repo'
import { serializeMapRestaurantsPage }  from '../serializers/map.serializer'
import {
  serializeMapReview,
  serializeMapReviewsPayload,
  serializeMapSuggestion,
  serializeMapSuggestionFull,
} from '../serializers/mapCommunity.serializer'
import { invalidatePattern, withCache } from '../lib/cache'
import type { KashrutLevel, MapBounds, MapFilter, MapPoint } from '../db/map.repo'

const HECHSHERIM_CACHE_TTL = 600 // 10 minutes
const MAP_OPTIONS_CACHE_TTL = 600 // 10 minutes

const CACHE_TTL = 300 // 5 minutes
const ROUTE_CACHE_TTL = 60 * 60 // 1 hour — pedestrian routes are stable
const DEFAULT_RESTAURANT_LIMIT = 750
const MAX_RESTAURANT_LIMIT = 1500
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org/route/v1').replace(/\/$/, '')
const ROUTE_TIMEOUT_MS = 8_000

// Single SCAN over the whole map namespace beats four separate scans — the
// cursor walks the keyspace once and any new map:* sub-namespace is covered
// without touching this list. `restaurants:*` is the legacy CRM cache, kept
// separate because it lives outside the map namespace.
const invalidateMapCache = () => Promise.all([
  invalidatePattern('restaurants:*'),
  invalidatePattern('map:*'),
])

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function roundCoord(value: number): number {
  return Math.round(value * 100_000) / 100_000
}

/** Coarse rounding used only for cache keys — collapses fine-grained map drag
 *  noise so adjacent viewports share a Redis entry. ~110m precision is well
 *  inside the radius/marker resolution we render. */
function roundCacheCoord(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

/** Build a deterministic, compact cache key for restaurant queries.
 *  - keys are sorted so JS object iteration order doesn't affect the hash
 *  - centre coords are rounded coarser than the response so ±100m drags share
 *    a cache entry (huge cache-hit improvement for typical pan gestures)
 *  - the final value is hashed so massive hechsher/city lists don't blow up
 *    Redis memory with multi-KB key strings */
function restaurantsCacheKey(filter: MapFilter): string {
  const normalized: Record<string, unknown> = {
    city:         filter.city ?? null,
    kashrutLevel: filter.kashrutLevel ? [...filter.kashrutLevel].sort() : null,
    hechsher:     filter.hechsher ? [...filter.hechsher].sort() : null,
    foodType:     filter.foodType ? [...filter.foodType].sort() : null,
    bounds:       filter.bounds
      ? {
          north: roundCacheCoord(filter.bounds.north),
          south: roundCacheCoord(filter.bounds.south),
          east:  roundCacheCoord(filter.bounds.east),
          west:  roundCacheCoord(filter.bounds.west),
        }
      : null,
    center:       filter.center
      ? { lat: roundCacheCoord(filter.center.lat), lng: roundCacheCoord(filter.center.lng) }
      : null,
    radius:       filter.radius ?? null,
    limit:        filter.limit,
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
  const east = parseNumber(query.east, -180, 180)
  const west = parseNumber(query.west, -180, 180)

  if ([north, south, east, west].every(v => v === undefined)) return undefined
  if (
    north === undefined ||
    south === undefined ||
    east === undefined ||
    west === undefined ||
    south > north
  ) {
    throw new Error('Invalid map bounds')
  }

  return {
    north: roundCoord(north),
    south: roundCoord(south),
    east: roundCoord(east),
    west: roundCoord(west),
  }
}

function parseCenter(query: Record<string, unknown>): MapPoint | undefined {
  const lat = parseNumber(query.lat, -90, 90)
  const lng = parseNumber(query.lng, -180, 180)

  if (lat === undefined && lng === undefined) return undefined
  if (lat === undefined || lng === undefined) throw new Error('Invalid map center')

  return {
    lat: roundCoord(lat),
    lng: roundCoord(lng),
  }
}

function parseCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined
  const parts = value.split(',').map(s => s.trim()).filter(Boolean) as T[]
  return parts.length ? [...new Set(parts)].sort() : undefined
}

// Capped well below the 2 MB body limit so any other request fields still fit.
const MAX_SUGGESTION_IMAGE_BYTES = 1_400_000
const SUGGESTION_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

const suggestionSchema = z.object({
  type: z.enum(['add', 'update']),
  restaurantId: z.string().optional().nullable(),
  proposedName: z.string().trim().min(1).max(160).optional().nullable(),
  proposedAddress: z.string().trim().min(1).max(220).optional().nullable(),
  proposedCity: z.string().trim().min(1).max(120).optional().nullable(),
  proposedHechsher: z.string().trim().min(1).max(180).optional().nullable(),
  proposedKashrutStatus: z.string().trim().min(1).max(120).optional().nullable(),
  proposedFoodType: z.enum(['meat', 'dairy', 'pareve', 'takeaway']).optional().nullable(),
  proposedImageUrl: z.string()
    .max(MAX_SUGGESTION_IMAGE_BYTES, 'Image is too large')
    .regex(SUGGESTION_IMAGE_PATTERN, 'Image must be a JPEG, PNG or WebP data URL')
    .optional()
    .nullable(),
  proposedLat: z.number().finite().optional().nullable(),
  proposedLng: z.number().finite().optional().nullable(),
  notes: z.string().trim().max(1200).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.type === 'add') {
    if (!value.proposedName || !value.proposedAddress || !value.proposedCity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name, address and city are required for a new restaurant' })
    }
    return
  }

  if (!value.restaurantId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'restaurantId is required for an update suggestion' })
  }

  const hasChange = Boolean(
    value.proposedName ||
    value.proposedAddress ||
    value.proposedCity ||
    value.proposedHechsher ||
    value.proposedKashrutStatus ||
    value.proposedFoodType ||
    value.proposedImageUrl ||
    value.notes,
  )
  if (!hasChange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one proposed change is required' })
  }
})

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional().nullable(),
})

const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat:   z.coerce.number().min(-90).max(90),
  toLng:   z.coerce.number().min(-180).max(180),
})

interface OsrmManeuver { type: string; modifier?: string }
interface OsrmStep {
  name: string
  distance: number
  duration: number
  maneuver: OsrmManeuver
}
interface OsrmLeg { steps: OsrmStep[] }
interface OsrmRoute {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][] }
  legs: OsrmLeg[]
}
interface OsrmResponse {
  code: string
  message?: string
  routes?: OsrmRoute[]
}

function buildInstruction({ maneuver: { type, modifier }, name }: OsrmStep): string {
  const street = name ? ` по ${name}` : ''
  if (type === 'depart') return `Начните движение${street}`
  if (type === 'arrive') return 'Вы прибыли к цели'
  if (type === 'turn') {
    const dir = modifier === 'left' ? 'налево' : modifier === 'right' ? 'направо' : 'прямо'
    return `Поверните ${dir}${street}`
  }
  if (type === 'roundabout' || type === 'rotary') return `Въедьте на круговое движение${street}`
  return `Продолжайте движение${street}`
}

// Common reverse-proxy headers carrying client geolocation hints. We trust
// these only as a coarse default for the initial map centre — never as user
// position. Cloudflare exposes `cf-iplatitude/cf-iplongitude`; some CDNs use
// `x-vercel-ip-latitude`/`x-vercel-ip-longitude`.
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
  /**
   * Coarse IP-based geolocation for the initial map centre. Returns CDN-
   * provided coordinates when available; never falls back to a third-party
   * service so the API stays self-contained. Returns 204 if nothing usable —
   * the client will keep its cached/default centre.
   */
  async getGeo(req: Request, res: Response): Promise<void> {
    const geo = geoFromHeaders(req)
    if (!geo) {
      res.status(204).end()
      return
    }
    res.set('cache-control', 'public, max-age=600')
    res.json(geo)
  },

  async getRoute(req: Request, res: Response): Promise<void> {
    const parsed = routeQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid route coordinates' })
      return
    }

    const { fromLat, fromLng, toLat, toLng } = parsed.data
    // Round to ~110m so a user retrying or two users walking the same path
    // share the same cached response — pedestrian routes don't differ at this
    // resolution and the upstream OSRM call dominates total latency.
    const r = (v: number) => Math.round(v * 1_000) / 1_000
    const cacheKey = `map:route:foot:${r(fromLat)},${r(fromLng)}=>${r(toLat)},${r(toLng)}`

    try {
      const data = await withCache(cacheKey, ROUTE_CACHE_TTL, async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)
        try {
          const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`
          const params = new URLSearchParams({
            steps: 'true',
            overview: 'full',
            geometries: 'geojson',
          })
          const url = `${OSRM_BASE_URL}/foot/${coordinates}?${params.toString()}`
          const upstream = await fetch(url, { signal: controller.signal })
          const json = await upstream.json() as OsrmResponse

          if (!upstream.ok) {
            throw Object.assign(new Error(json.message || 'Сервис маршрутов временно недоступен'), { httpStatus: 502 })
          }

          const route = json.routes?.[0]
          if (json.code !== 'Ok' || !route) {
            throw Object.assign(new Error(json.message || 'Маршрут не найден'), { httpStatus: 404 })
          }

          const steps = route.legs[0]?.steps.map(step => ({
            instruction: buildInstruction(step),
            distance: step.distance,
            duration: step.duration,
          })) ?? []
          const geometry = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])

          return {
            geometry,
            steps,
            totalDistance: route.distance,
            totalDuration: route.duration,
          }
        } finally {
          clearTimeout(timeout)
        }
      })

      res.json(data)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        res.status(504).json({ error: 'Сервис маршрутов не ответил вовремя' })
        return
      }
      const status = (e as { httpStatus?: number }).httpStatus
      if (status === 404) {
        res.status(404).json({ error: (e as Error).message })
        return
      }
      res.status(502).json({ error: 'Сервис маршрутов временно недоступен' })
    }
  },

  async listHechsherim(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await withCache('map:hechsherim', HECHSHERIM_CACHE_TTL, () =>
        mapRepo.findHechsherim()
      )
      res.json(data)
    } catch (e) { next(e) }
  },

  async listOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await withCache('map:options', MAP_OPTIONS_CACHE_TTL, () =>
        mapRepo.findMapOptions()
      )
      res.json(data)
    } catch (e) { next(e) }
  },

  async listRestaurants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, unknown>
      const radius = parseNumber(q.radius, 1, 100_000)

      const filter: MapFilter = {
        city:         queryString(q.city) || undefined,
        kashrutLevel: parseCsv<KashrutLevel>(queryString(q.kashrutLevel)),
        hechsher:     parseCsv(queryString(q.hechsher)),
        foodType:     parseCsv(queryString(q.foodType)),
        bounds:       parseBounds(q),
        center:       parseCenter(q),
        radius,
        limit:        parseLimit(q.limit),
      }

      const cacheKey = restaurantsCacheKey(filter)
      const data = await withCache(cacheKey, CACHE_TTL, () =>
        mapRepo.findForMap(filter)
      )

      res.json(serializeMapRestaurantsPage(data))
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Invalid map')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  },

  async createSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.mapUser) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const parsed = suggestionSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid suggestion payload' })
        return
      }

      if (parsed.data.restaurantId) {
        const exists = await mapCommunityRepo.restaurantExists(parsed.data.restaurantId)
        if (!exists) {
          res.status(404).json({ error: 'Restaurant not found' })
          return
        }
      }

      const suggestion = await mapCommunityRepo.createSuggestion(req.mapUser.sub, parsed.data)
      res.status(201).json(serializeMapSuggestion(suggestion))
    } catch (e) { next(e) }
  },

  async listSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string | undefined
      const allowed = ['pending', 'approved', 'rejected']
      const filter = allowed.includes(status ?? '') ? { status: status as 'pending' | 'approved' | 'rejected' } : {}
      const suggestions = await mapCommunityRepo.listSuggestions(filter)
      res.json(suggestions.map(serializeMapSuggestionFull))
    } catch (e) { next(e) }
  },

  async reviewSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id
      const { status, reviewerNote } = req.body as { status?: unknown; reviewerNote?: unknown }
      if (status !== 'approved' && status !== 'rejected') {
        res.status(400).json({ error: 'status must be "approved" or "rejected"' })
        return
      }
      const note = typeof reviewerNote === 'string' ? reviewerNote.trim() || null : null
      const result = await mapCommunityRepo.reviewSuggestion(id, {
        status,
        reviewerNote: note,
        reviewerRabbanutId: req.user?.rabbanutId,
      })
      if (!result) {
        res.status(404).json({ error: 'Suggestion not found or already reviewed' })
        return
      }
      if (status === 'approved') await invalidateMapCache()
      res.json(serializeMapSuggestionFull(result))
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Cannot approve suggestion')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  },

  async listReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.params.restaurantId
      const exists = await mapCommunityRepo.restaurantExists(restaurantId)
      if (!exists) {
        res.status(404).json({ error: 'Restaurant not found' })
        return
      }

      const payload = await mapCommunityRepo.listReviews(restaurantId)
      res.json(serializeMapReviewsPayload(payload))
    } catch (e) { next(e) }
  },

  async upsertReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.mapUser) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const parsed = reviewSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'rating must be between 1 and 5' })
        return
      }

      const review = await mapCommunityRepo.upsertReview(req.mapUser.sub, req.params.restaurantId, parsed.data)
      if (!review) {
        res.status(404).json({ error: 'Restaurant not found' })
        return
      }
      res.json(serializeMapReview(review))
    } catch (e) { next(e) }
  },
}
