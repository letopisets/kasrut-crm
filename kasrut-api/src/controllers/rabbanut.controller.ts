import type { Request, Response, NextFunction } from 'express'
import { rabbanutRepo } from '../db/rabbanuts.repo'
import { serializeRabbanut, serializeRabbanuts } from '../serializers/rabbanut.serializer'
import { validate } from '../lib/validate'
import { createRabbanutSchema, updateRabbanutSchema } from '../schemas'

export const rabbanutController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q      = req.query as Record<string, string>
      const active = q.active !== undefined ? q.active === 'true' : undefined
      res.json(serializeRabbanuts(await rabbanutRepo.findAll({ active })))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await rabbanutRepo.findById(req.params.id)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeRabbanut(r))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createRabbanutSchema, req.body)
      const r = await rabbanutRepo.create(body)
      res.status(201).json(serializeRabbanut(r))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateRabbanutSchema, req.body)
      const r = await rabbanutRepo.update(req.params.id, body)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeRabbanut(r))
    } catch (e) { next(e) }
  },

  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await rabbanutRepo.toggle(req.params.id)
      if (!r) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeRabbanut(r))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await rabbanutRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
