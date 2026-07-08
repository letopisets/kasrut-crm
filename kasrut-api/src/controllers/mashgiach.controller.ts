import { mashgichimRepo } from '../db/mashgichim.repo'
import { restaurantsRepo } from '../db/restaurants.repo'
import { serializeMashgiach, serializeMashgichim } from '../serializers/mashgiach.serializer'
import { validate } from '../lib/validate'
import { createMashgiachSchema, updateMashgiachSchema, assignMashgiachSchema, paginationSchema } from '../schemas'
import { applyWriteScope, assertOwnsRabbanut, resolveScopeRabbanutId } from '../lib/rabbanutScope'
import { asyncHandler } from '../lib/asyncHandler'

export const mashgiachController = {
  list: asyncHandler(async (req, res) => {
    const q          = req.query as Record<string, string>
    const rabbanutId = resolveScopeRabbanutId(req, q.rabbanutId)
    const active     = q.active !== undefined ? q.active === 'true' : undefined
    const pageInput  = validate(paginationSchema, { limit: q.limit, cursor: q.cursor })

    if (pageInput.limit) {
      const page = await mashgichimRepo.findPage({ rabbanutId, active, limit: pageInput.limit, cursor: pageInput.cursor })
      res.json({ items: serializeMashgichim(page.items), nextCursor: page.nextCursor })
      return
    }
    res.json(serializeMashgichim(await mashgichimRepo.findAll({ rabbanutId, active })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const m = await mashgichimRepo.findById(req.params.id)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, m)
    res.json(serializeMashgiach(m))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createMashgiachSchema, req.body)
    const payload = applyWriteScope(req, body)
    if (!await mashgichimRepo.hechsherimBelongTo(payload.rabbanutId, payload.hechsherimIds)) {
      res.status(400).json({ error: 'Hechsherim must belong to the selected rabbanut' }); return
    }
    const m = await mashgichimRepo.create(payload)
    res.status(201).json(serializeMashgiach(m))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateMashgiachSchema, req.body)
    const existing = await mashgichimRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, existing)
    const payload = applyWriteScope(req, body)
    if (payload.hechsherimIds) {
      const rabbanutId = payload.rabbanutId ?? existing.rabbanutId
      if (!await mashgichimRepo.hechsherimBelongTo(rabbanutId, payload.hechsherimIds)) {
        res.status(400).json({ error: 'Hechsherim must belong to the selected rabbanut' }); return
      }
    }
    const m = await mashgichimRepo.update(req.params.id, payload)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  toggle: asyncHandler(async (req, res) => {
    const existing = await mashgichimRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, existing)
    const m = await mashgichimRepo.toggle(req.params.id)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  assign: asyncHandler(async (req, res) => {
    const { restaurantId } = validate(assignMashgiachSchema, req.body)
    const mashgiach = await mashgichimRepo.findById(req.params.id)
    if (!mashgiach) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, mashgiach)

    const restaurant = await restaurantsRepo.findById(restaurantId)
    if (!restaurant) { res.status(404).json({ error: 'Restaurant not found' }); return }
    assertOwnsRabbanut(req, restaurant)

    // A restaurant may only be handled by a mashgiach of its own rabbanut —
    // otherwise restaurant.mashgiachId would point across tenants and bypass
    // restaurantsRepo.validateOwnership. Enforced for every role, owner included.
    if (restaurant.rabbanutId !== mashgiach.rabbanutId) {
      res.status(400).json({ error: 'Restaurant and mashgiach must belong to the same rabbanut' }); return
    }

    const m = await mashgichimRepo.assignRestaurant(req.params.id, restaurantId)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  remove: asyncHandler(async (req, res) => {
    const existing = await mashgichimRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, existing)
    const result = await mashgichimRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete: mashgiach has restaurants assigned. Reassign them first.' }); return }
    res.status(204).send()
  }),
}
