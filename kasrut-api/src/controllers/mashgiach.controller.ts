import { mashgichimRepo } from '../db/mashgichim.repo'
import { serializeMashgiach, serializeMashgichim } from '../serializers/mashgiach.serializer'
import { validate } from '../lib/validate'
import { createMashgiachSchema, updateMashgiachSchema, assignMashgiachSchema } from '../schemas'
import { resolveScopeRabbanutId } from '../lib/rabbanutScope'
import { asyncHandler } from '../lib/asyncHandler'

export const mashgiachController = {
  list: asyncHandler(async (req, res) => {
    const q          = req.query as Record<string, string>
    const rabbanutId = resolveScopeRabbanutId(req, q.rabbanutId)
    const active     = q.active !== undefined ? q.active === 'true' : undefined
    res.json(serializeMashgichim(await mashgichimRepo.findAll({ rabbanutId, active })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const m = await mashgichimRepo.findById(req.params.id)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createMashgiachSchema, req.body)
    const m = await mashgichimRepo.create(body)
    res.status(201).json(serializeMashgiach(m))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateMashgiachSchema, req.body)
    const m = await mashgichimRepo.update(req.params.id, body)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  toggle: asyncHandler(async (req, res) => {
    const m = await mashgichimRepo.toggle(req.params.id)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  assign: asyncHandler(async (req, res) => {
    const { restaurantId } = validate(assignMashgiachSchema, req.body)
    const m = await mashgichimRepo.assignRestaurant(req.params.id, restaurantId)
    if (!m) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeMashgiach(m))
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await mashgichimRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete: mashgiach has restaurants assigned. Reassign them first.' }); return }
    res.status(204).send()
  }),
}
