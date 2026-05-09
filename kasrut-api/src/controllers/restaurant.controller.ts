import type { Request, Response, NextFunction } from 'express'
import { restaurantsRepo } from '../db/restaurants.repo'
import { prisma } from '../lib/prisma'
import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'
import { withCache } from '../lib/cache'
import { invalidateMapCache } from '../lib/mapCache'
import { validate } from '../lib/validate'
import { createRestaurantSchema, updateRestaurantSchema, paginationSchema } from '../schemas'
import {
  applyWriteScope,
  assertOwnsRabbanut,
  resolveScopeRabbanutId,
} from '../lib/rabbanutScope'

const RESTAURANTS_CACHE_TTL = 300

const restaurantsCacheKey = (filter: Record<string, unknown>) =>
  `restaurants:list:${JSON.stringify(filter)}`

/**
 * Verifies that the chosen hechsher (and optional mashgiach) both belong to
 * `rabbanutId`. Collapses what used to be 1-2 separate `findById` calls into
 * a single Prisma `count` so we save a round-trip on every restaurant write.
 */
async function validateRestaurantOwnership(input: {
  rabbanutId: string
  hechsherId: string
  mashgiachId?: string
}): Promise<boolean> {
  const ok = await prisma.hechsher.count({
    where: {
      id: input.hechsherId,
      rabbanutId: input.rabbanutId,
    },
  })
  if (ok !== 1) return false

  if (input.mashgiachId) {
    const okM = await prisma.mashgiach.count({
      where: { id: input.mashgiachId, rabbanutId: input.rabbanutId },
    })
    if (okM !== 1) return false
  }

  return true
}

export const restaurantController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>
      const rabbanutId  = resolveScopeRabbanutId(req, q.rabbanutId)
      const mashgiachId = req.user?.role === 'mashgiach' ? req.user.sub : undefined

      const pageInput = validate(paginationSchema, { limit: q.limit, cursor: q.cursor })

      // Mashgiach filtering is non-paginated (small set by definition)
      if (mashgiachId) {
        const data = await withCache(
          restaurantsCacheKey({ mashgiachId }),
          RESTAURANTS_CACHE_TTL,
          async () => serializeRestaurants(await restaurantsRepo.findByMashgiach(mashgiachId)),
        )
        res.json(data)
        return
      }

      // Paginated path — only when limit explicitly provided
      if (pageInput.limit) {
        const limit = pageInput.limit
        const cursor = pageInput.cursor
        const data = await withCache(
          restaurantsCacheKey({
            rabbanutId: rabbanutId ?? null,
            status: q.status ?? null,
            limit,
            cursor: cursor ?? null,
          }),
          RESTAURANTS_CACHE_TTL,
          async () => {
            const page = await restaurantsRepo.findPage({
              rabbanutId,
              status: q.status,
              limit,
              cursor,
            })
            return {
              items:      serializeRestaurants(page.items),
              nextCursor: page.nextCursor,
            }
          },
        )
        res.json(data)
        return
      }

      // Backwards-compatible — return full array
      const data = await withCache(
        restaurantsCacheKey({
          rabbanutId: rabbanutId ?? null,
          status: q.status ?? null,
          limit: null,
          cursor: null,
        }),
        RESTAURANTS_CACHE_TTL,
        async () => serializeRestaurants(await restaurantsRepo.findAll({ rabbanutId, status: q.status })),
      )
      res.json(data)
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await restaurantsRepo.findById(req.params.id)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      assertOwnsRabbanut(req, r)
      res.json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createRestaurantSchema, req.body)
      const payload = applyWriteScope(req, body)
      if (!await validateRestaurantOwnership(payload)) {
        res.status(400).json({ error: 'Hechsher and mashgiach must belong to the selected rabbanut' }); return
      }
      const r = await restaurantsRepo.create(payload)
      await invalidateMapCache()
      res.status(201).json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateRestaurantSchema, req.body)

      const existing = await restaurantsRepo.findById(req.params.id)
      if (!existing) { res.status(404).json({ error: 'Not found' }); return }

      assertOwnsRabbanut(req, existing)

      const payload = applyWriteScope(req, body)
      const merged = {
        rabbanutId: payload.rabbanutId ?? existing.rabbanutId,
        hechsherId: payload.hechsherId ?? existing.hechsherId,
        mashgiachId: payload.mashgiachId ?? existing.mashgiachId,
      }
      if (!await validateRestaurantOwnership(merged)) {
        res.status(400).json({ error: 'Hechsher and mashgiach must belong to the selected rabbanut' }); return
      }

      const r = await restaurantsRepo.update(req.params.id, payload)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      await invalidateMapCache()
      res.json(serializeRestaurant(r))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await restaurantsRepo.remove(req.params.id)
      if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
      if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete restaurant' }); return }
      await invalidateMapCache()
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
