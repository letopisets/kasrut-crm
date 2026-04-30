import type { Request, Response, NextFunction } from 'express'
import { hechsherimRepo } from '../db/hechsherim.repo'
import { serializeHechsher, serializeHechsherim } from '../serializers/hechsher.serializer'
import { validate } from '../lib/validate'
import { createHechsherSchema, updateHechsherSchema } from '../schemas'
import { invalidatePattern } from '../lib/cache'

const invalidateMapCache = () => Promise.all([
  invalidatePattern('map:restaurants:*'),
  invalidatePattern('map:options'),
  invalidatePattern('map:hechsherim'),
])

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
      if (req.user?.role === 'rabbanut' && h.rabbanutId !== req.user.rabbanutId) {
        res.status(403).json({ error: 'Forbidden' }); return
      }
      res.json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createHechsherSchema, req.body)
      const payload = req.user?.role === 'rabbanut'
        ? { ...body, rabbanutId: req.user.rabbanutId! }
        : body
      const h = await hechsherimRepo.create(payload)
      void invalidateMapCache()
      res.status(201).json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateHechsherSchema, req.body)
      if (req.user?.role === 'rabbanut') {
        const existing = await hechsherimRepo.findById(req.params.id)
        if (!existing) { res.status(404).json({ error: 'Not found' }); return }
        if (existing.rabbanutId !== req.user.rabbanutId) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
        if (body.rabbanutId !== undefined && body.rabbanutId !== req.user.rabbanutId) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
      }
      const payload = req.user?.role === 'rabbanut'
        ? { ...body, rabbanutId: req.user.rabbanutId! }
        : body
      const h = await hechsherimRepo.update(req.params.id, payload)
      if (!h) { res.status(404).json({ error: 'Not found' }); return }
      void invalidateMapCache()
      res.json(serializeHechsher(h))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await hechsherimRepo.remove(req.params.id)
      if (result === 'not_found') { res.status(404).json({ error: 'Not found' }); return }
      if (result === 'conflict')  { res.status(409).json({ error: 'Cannot delete: hechsher has restaurants assigned. Reassign them first.' }); return }
      void invalidateMapCache()
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
