import type { Request, Response } from 'express'
import { kashrutLevelsRepo } from '../db/kashrutLevels.repo'
import { createKashrutLevelSchema, updateKashrutLevelSchema } from '../schemas'

export const kashrutLevelController = {
  async list(_req: Request, res: Response) {
    const levels = await kashrutLevelsRepo.findAll()
    res.json(levels)
  },

  async getOne(req: Request, res: Response) {
    const level = await kashrutLevelsRepo.findById(req.params.id)
    if (!level) return res.status(404).json({ error: 'Not found' })
    res.json(level)
  },

  async create(req: Request, res: Response) {
    const parsed = createKashrutLevelSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const level = await kashrutLevelsRepo.create(parsed.data)
    res.status(201).json(level)
  },

  async update(req: Request, res: Response) {
    const parsed = updateKashrutLevelSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const level = await kashrutLevelsRepo.update(req.params.id, parsed.data)
    if (!level) return res.status(404).json({ error: 'Not found' })
    res.json(level)
  },

  async remove(req: Request, res: Response) {
    const result = await kashrutLevelsRepo.remove(req.params.id)
    if (result === 'not_found') return res.status(404).json({ error: 'Not found' })
    if (result === 'conflict')  return res.status(409).json({ error: 'Level is in use by restaurants' })
    res.status(204).end()
  },
}
