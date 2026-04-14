import type { Request, Response, NextFunction } from 'express'
import { hechsherimRepo } from '../db/hechsherim.repo'
import { serializeHechsher, serializeHechsherim } from '../serializers/hechsher.serializer'

export const hechsherController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q          = req.query as Record<string, string>
      const rabbanutId = req.user?.role === 'rabbanut' ? req.user.rabbanutId : q.rabbanutId
      res.json(serializeHechsherim(await hechsherimRepo.findAll({ rabbanutId })))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const h = await hechsherimRepo.findById(req.params.id)
      if (!h) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const h = await hechsherimRepo.create(req.body)
      res.status(201).json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const h = await hechsherimRepo.update(req.params.id, req.body)
      if (!h) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await hechsherimRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
