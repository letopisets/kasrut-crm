import { hechsherimRepo } from '../db/hechsherim.repo'
import { serializeHechsher, serializeHechsherim } from '../serializers/hechsher.serializer'
import { validate } from '../lib/validate'
import { createHechsherSchema, updateHechsherSchema, paginationSchema } from '../schemas'
import { invalidatePattern, withCache } from '../lib/cache'
import { invalidateMapCache as invalidateMapNamespace } from '../lib/mapCache'
import {
  applyWriteScope,
  assertOwnsRabbanut,
  resolveScopeRabbanutId,
} from '../lib/rabbanutScope'
import { asyncHandler } from '../lib/asyncHandler'

const invalidateAll = () => Promise.all([
  invalidateMapNamespace(),
  invalidatePattern('hechsherim:*'),
])

export const hechsherController = {
  list: asyncHandler(async (req, res) => {
    const q          = req.query as Record<string, string>
    const rabbanutId = resolveScopeRabbanutId(req, q.rabbanutId)
    const active     = q.active === 'true' ? true : q.active === 'false' ? false : undefined
    const pageInput  = validate(paginationSchema, { limit: q.limit, cursor: q.cursor })

    if (pageInput.limit) {
      const page = await hechsherimRepo.findPage({ rabbanutId, active, limit: pageInput.limit, cursor: pageInput.cursor })
      res.json({ items: serializeHechsherim(page.items), nextCursor: page.nextCursor })
      return
    }

    const cacheKey = `hechsherim:list:${rabbanutId ?? 'all'}:${active ?? 'all'}`
    const data = await withCache(cacheKey, 300, () => hechsherimRepo.findAll({ rabbanutId, active }))
    res.json(serializeHechsherim(data))
  }),

  getOne: asyncHandler(async (req, res) => {
    const h = await hechsherimRepo.findById(req.params.id)
    if (!h) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, h)
    res.json(serializeHechsher(h))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createHechsherSchema, req.body)
    const payload = applyWriteScope(req, body)
    const h = await hechsherimRepo.create({ ...payload, active: payload.active ?? true })
    await invalidateAll()
    res.status(201).json(serializeHechsher(h))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateHechsherSchema, req.body)
    const existing = await hechsherimRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertOwnsRabbanut(req, existing)
    const payload = applyWriteScope(req, body)
    const h = await hechsherimRepo.update(req.params.id, payload)
    if (!h) { res.status(404).json({ error: 'Not found' }); return }
    await invalidateAll()
    res.json(serializeHechsher(h))
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await hechsherimRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete: hechsher has restaurants assigned. Reassign them first.' }); return }
    await invalidateAll()
    res.status(204).send()
  }),
}
