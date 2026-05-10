import type { Request } from 'express'
import { createHash } from 'crypto'
import { mapRepo } from '../db/map.repo'
import { serializeMapRestaurantsPage } from '../serializers/map.serializer'
import { withCache } from '../lib/cache'
import { asyncHandler } from '../lib/asyncHandler'
import type { KashrutLevel, MapBounds, MapFilter, MapPoint } from '../db/map.repo'

const HECHSHERIM_CACHE_TTL = 600
const MAP_OPTIONS_CACHE_TTL = 600
const CACHE_TTL = 300

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

  listRestaurants: asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>
    try {
      const filter: MapFilter = {
        city:         queryString(q.city) || undefined,
        kashrutLevel: parseCsv<KashrutLevel>(queryString(q.kashrutLevel)),
        hechsher:     parseCsv(queryString(q.hechsher)),
        foodType:     parseCsv(queryString(q.foodType)),
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
