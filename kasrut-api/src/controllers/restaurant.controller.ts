import { restaurantsRepo } from '../db/restaurants.repo'
import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'
import { withCache } from '../lib/cache'
import { invalidateMapCache } from '../lib/mapCache'
import { validate } from '../lib/validate'
import { createRestaurantSchema, updateRestaurantSchema, listRestaurantQuerySchema } from '../schemas'
import {
  applyWriteScope,
  assertOwnsRabbanut,
  resolveScopeRabbanutId,
} from '../lib/rabbanutScope'
import { asyncHandler } from '../lib/asyncHandler'

const RESTAURANTS_CACHE_TTL = 300

const restaurantsCacheKey = (filter: Record<string, unknown>) =>
  `restaurants:list:${JSON.stringify(filter)}`

export const restaurantController = {
  list: asyncHandler(async (req, res) => {
    const q           = validate(listRestaurantQuerySchema, req.query)
    const rabbanutId  = resolveScopeRabbanutId(req, q.rabbanutId)
    const mashgiachId = req.user?.role === 'mashgiach' ? req.user.sub : undefined

    if (mashgiachId) {
      const data = await withCache(
        restaurantsCacheKey({ mashgiachId }),
        RESTAURANTS_CACHE_TTL,
        async () => serializeRestaurants(await restaurantsRepo.findByMashgiach(mashgiachId)),
      )
      res.json(data)
      return
    }

    if (q.limit) {
      const { limit, cursor } = q
      const data = await withCache(
        restaurantsCacheKey({ rabbanutId: rabbanutId ?? null, status: q.status ?? null, limit, cursor: cursor ?? null }),
        RESTAURANTS_CACHE_TTL,
        async () => {
          const page = await restaurantsRepo.findPage({ rabbanutId, status: q.status, limit, cursor })
          return { items: serializeRestaurants(page.items), nextCursor: page.nextCursor }
        },
      )
      res.json(data)
      return
    }

    const data = await withCache(
      restaurantsCacheKey({ rabbanutId: rabbanutId ?? null, status: q.status ?? null, limit: null, cursor: null }),
      RESTAURANTS_CACHE_TTL,
      async () => serializeRestaurants(await restaurantsRepo.findAll({ rabbanutId, status: q.status })),
    )
    res.json(data)
  }),

  getOne: asyncHandler(async (req, res) => {
    const r = await restaurantsRepo.findById(req.params.id)
    if (!r) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, r)
    res.json(serializeRestaurant(r))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createRestaurantSchema, req.body)
    const payload = applyWriteScope(req, body)
    if (!await restaurantsRepo.validateOwnership(payload)) {
      res.status(400).json({ error: 'Hechsher and mashgiach must belong to the selected rabbanut' }); return
    }
    const r = await restaurantsRepo.create({ ...payload, kitniyot: payload.kitniyot ?? false })
    await invalidateMapCache()
    res.status(201).json(serializeRestaurant(r))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateRestaurantSchema, req.body)
    const existing = await restaurantsRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, existing)
    const payload = applyWriteScope(req, body)
    const merged = {
      rabbanutId:  payload.rabbanutId  ?? existing.rabbanutId,
      hechsherId:  payload.hechsherId  ?? existing.hechsherId,
      mashgiachId: payload.mashgiachId ?? existing.mashgiachId,
    }
    if (!await restaurantsRepo.validateOwnership(merged)) {
      res.status(400).json({ error: 'Hechsher and mashgiach must belong to the selected rabbanut' }); return
    }
    const r = await restaurantsRepo.update(req.params.id, payload)
    if (!r) { res.status(404).json({ error: 'Not found' }); return }
    await invalidateMapCache()
    res.json(serializeRestaurant(r))
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await restaurantsRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    await invalidateMapCache()
    res.status(204).send()
  }),
}
