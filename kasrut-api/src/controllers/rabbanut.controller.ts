import { rabbanutRepo } from '../db/rabbanuts.repo'
import { serializeRabbanut, serializeRabbanuts } from '../serializers/rabbanut.serializer'
import { validate } from '../lib/validate'
import { createRabbanutSchema, updateRabbanutSchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'
import { assertOwnsRabbanut, resolveScopeRabbanutId } from '../lib/rabbanutScope'

export const rabbanutController = {
  list: asyncHandler(async (req, res) => {
    const q      = req.query as Record<string, string>
    const active = q.active !== undefined ? q.active === 'true' : undefined
    // Owners list every tenant; rabbanut/mashgiach users get a one-element
    // list with their own rabbanut (or 403 when the account has none).
    const id     = resolveScopeRabbanutId(req, undefined)
    res.json(serializeRabbanuts(await rabbanutRepo.findAll({ id, active })))
  }),

  getOne: asyncHandler(async (req, res) => {
    // Checked before the lookup so a tenant cannot probe which rabbanut ids
    // exist elsewhere (403 for any foreign id, 404 only for their own).
    assertOwnsRabbanut(req, { rabbanutId: req.params.id })
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
    const result = await rabbanutRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
