import type { Request, Response, NextFunction } from 'express'
import { mapRepo }                  from '../db/map.repo'
import { serializeMapRestaurants }  from '../serializers/map.serializer'
import { withCache }                from '../lib/cache'
import type { KashrutLevel, MapFilter } from '../db/map.repo'

const CACHE_TTL = 300 // 5 minutes

function parseCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined
  const parts = value.split(',').map(s => s.trim()).filter(Boolean) as T[]
  return parts.length ? parts : undefined
}

export const mapController = {
  async listRestaurants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>

      const filter: MapFilter = {
        city:         q.city     || undefined,
        kashrutLevel: parseCsv<KashrutLevel>(q.kashrutLevel),
        foodType:     parseCsv(q.foodType),
      }

      // Build a stable cache key from the filter
      const cacheKey = `map:restaurants:${JSON.stringify(filter)}`

      const data = await withCache(cacheKey, CACHE_TTL, () =>
        mapRepo.findForMap(filter)
      )

      res.json(serializeMapRestaurants(data))
    } catch (e) { next(e) }
  },
}
