import { rabbanutRepo } from '../db/rabbanuts.repo'
import { serializeRabbanut, serializeRabbanuts } from '../serializers/rabbanut.serializer'
import { validate } from '../lib/validate'
import { createRabbanutSchema, updateRabbanutSchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'

export const rabbanutController = {
  list: asyncHandler(async (req, res) => {
    const q      = req.query as Record<string, string>
    const active = q.active !== undefined ? q.active === 'true' : undefined
    res.json(serializeRabbanuts(await rabbanutRepo.findAll({ active })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const r = await rabbanutRepo.findById(req.params.id)
    if (!r) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeRabbanut(r))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createRabbanutSchema, req.body)
    const r = await rabbanutRepo.create(body)
    res.status(201).json(serializeRabbanut(r))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateRabbanutSchema, req.body)
    const r = await rabbanutRepo.update(req.params.id, body)
    if (!r) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeRabbanut(r))
  }),

  toggle: asyncHandler(async (req, res) => {
    const r = await rabbanutRepo.toggle(req.params.id)
    if (!r) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeRabbanut(r))
  }),

  remove: asyncHandler(async (req, res) => {
    const ok = await rabbanutRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
