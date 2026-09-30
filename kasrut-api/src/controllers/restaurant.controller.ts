import { restaurantsRepo } from '../db/restaurants.repo'
import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'
import { withCache } from '../lib/cache'
import { invalidateMapCache } from '../lib/mapCache'
import { validate } from '../lib/validate'
import { createRestaurantSchema, updateRestaurantSchema, listRestaurantQuerySchema } from '../schemas'
import {
  applyWriteScope,
  assertOwnsRabbanut,
  ForbiddenScopeError,
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
    const mashgiachId = req.user?.role === 'mashgiach' ? req.user.mashgiachId : undefined

    if (req.user?.role === 'mashgiach') {
      if (!mashgiachId || !req.user.rabbanutId) throw new ForbiddenScopeError()
      const data = await withCache(
        restaurantsCacheKey({ mashgiachId, rabbanutId: req.user.rabbanutId }),
        RESTAURANTS_CACHE_TTL,
        async () => serializeRestaurants(await restaurantsRepo.findByMashgiach(mashgiachId, req.user!.rabbanutId!)),
      )
      res.json(data)
      return
    }

    if (q.limit) {
      const { limit, cursor } = q
      const loadPage = async () => {
        const page = await restaurantsRepo.findPage({ rabbanutId, status: q.status, limit, cursor })
        return { items: serializeRestaurants(page.items), nextCursor: page.nextCursor }
      }
      // Only the first page is cached. A cursor is any string a CRM user
      // sends, so keying on it would let one mint unbounded restaurants:*
      // entries, and invalidatePattern sweeps at most MAX_INVALIDATE_KEYS of
      // them: a flood could leave other tenants' lists stale after a change.
      const data = cursor
        ? await loadPage()
        : await withCache(
          restaurantsCacheKey({ rabbanutId: rabbanutId ?? null, status: q.status ?? null, limit, cursor: null }),
          RESTAURANTS_CACHE_TTL,
          loadPage,
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

    if (req.user?.role === 'mashgiach') {
      if (
        !req.user.mashgiachId ||
        !req.user.rabbanutId ||
        r.mashgiachId !== req.user.mashgiachId ||
        r.rabbanutId !== req.user.rabbanutId
      ) throw new ForbiddenScopeError()
    }
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
