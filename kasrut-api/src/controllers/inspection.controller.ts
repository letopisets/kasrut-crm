import type { Request, Response, NextFunction } from 'express'
import { inspectionsRepo } from '../db/inspections.repo'
import { serializeInspection, serializeInspections } from '../serializers/inspection.serializer'
import { validate } from '../lib/validate'
import { createInspectionSchema, updateInspectionSchema, paginationSchema } from '../schemas'

export const inspectionController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>
      const mashgiachId = req.user?.role === 'mashgiach' ? req.user.sub : q.mashgiachId
      const pageInput   = validate(paginationSchema, { limit: q.limit, cursor: q.cursor })

      if (pageInput.limit) {
        const page = await inspectionsRepo.findPage({
          restaurantId: q.restaurantId,
          mashgiachId,
          result:       q.result,
          type:         q.type,
          limit:        pageInput.limit,
          cursor:       pageInput.cursor,
        })
        res.json({
          items:      serializeInspections(page.items),
          nextCursor: page.nextCursor,
        })
        return
      }

      const inspections = await inspectionsRepo.findAll({
        restaurantId: q.restaurantId,
        result:       q.result,
        type:         q.type,
        mashgiachId,
      })
      res.json(serializeInspections(inspections))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const i = await inspectionsRepo.findById(req.params.id)
      if (!i) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeInspection(i))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createInspectionSchema, req.body)
      const i = await inspectionsRepo.create(body)
      res.status(201).json(serializeInspection(i))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(updateInspectionSchema, req.body)
      const i = body.result !== undefined
        ? await inspectionsRepo.setResult(req.params.id, body.result)
        : await inspectionsRepo.update(req.params.id, body)
      if (!i) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeInspection(i))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await inspectionsRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
