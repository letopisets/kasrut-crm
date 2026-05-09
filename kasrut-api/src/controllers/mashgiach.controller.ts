import type { Request, Response, NextFunction } from 'express'
import { mashgichimRepo } from '../db/mashgichim.repo'
import { serializeMashgiach, serializeMashgichim } from '../serializers/mashgiach.serializer'
import { validate } from '../lib/validate'
import { createMashgiachSchema, updateMashgiachSchema, assignMashgiachSchema } from '../schemas'
import { resolveScopeRabbanutId } from '../lib/rabbanutScope'

export const mashgiachController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q          = req.query as Record<string, string>
      const rabbanutId = resolveScopeRabbanutId(req, q.rabbanutId)
      const active     = q.active !== undefined ? q.active === 'true' : undefined
      const mashgichim = await mashgichimRepo.findAll({ rabbanutId, active })
      res.json(serializeMashgichim(mashgichim))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const m = await mashgichimRepo.findById(req.params.id)
      if (!m) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeMashgiach(m))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createMashgiachSchema, req.body)
      const m = await mashgichimRepo.create(body)
      res.status(201).json(serializeMashgiach(m))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateMashgiachSchema, req.body)
      const m = await mashgichimRepo.update(req.params.id, body)
      if (!m) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeMashgiach(m))
    } catch (e) { next(e) }
  },

  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const m = await mashgichimRepo.toggle(req.params.id)
      if (!m) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeMashgiach(m))
    } catch (e) { next(e) }
  },

  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { restaurantId } = validate(assignMashgiachSchema, req.body)
      const m = await mashgichimRepo.assignRestaurant(req.params.id, restaurantId)
      if (!m) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeMashgiach(m))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await mashgichimRepo.remove(req.params.id)
      if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
      if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete: mashgiach has restaurants assigned. Reassign them first.' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
