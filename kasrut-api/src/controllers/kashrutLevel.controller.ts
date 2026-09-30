import { kashrutLevelsRepo } from '../db/kashrutLevels.repo'
import { createKashrutLevelSchema, updateKashrutLevelSchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'

export const kashrutLevelController = {
  list: asyncHandler(async (_req, res) => {
    const levels = await kashrutLevelsRepo.findAll()
    res.json(levels)
  }),

  getOne: asyncHandler(async (req, res) => {
    const level = await kashrutLevelsRepo.findById(req.params.id)
    if (!level) { res.status(404).json({ error: 'Not found' }); return }
    res.json(level)
  }),

  create: asyncHandler(async (req, res) => {
    const parsed = createKashrutLevelSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
    // A duplicate name rejects with P2002, which errorHandler maps to 409.
    const level = await kashrutLevelsRepo.create(parsed.data)
    res.status(201).json(level)
  }),

  update: asyncHandler(async (req, res) => {
    const parsed = updateKashrutLevelSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
    const level = await kashrutLevelsRepo.update(req.params.id, parsed.data)
    if (!level) { res.status(404).json({ error: 'Not found' }); return }
    res.json(level)
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await kashrutLevelsRepo.remove(req.params.id)
    if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
    if (result === 'conflict')  { res.status(409).json({ error: 'Level is in use by restaurants' }); return }
    res.status(204).end()
  }),
}
