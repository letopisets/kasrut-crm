import type { Request, Response, NextFunction } from 'express'
import { documentsRepo } from '../db/documents.repo'
import { serializeDocument, serializeDocuments } from '../serializers/document.serializer'
import { validate } from '../lib/validate'
import { createDocumentSchema } from '../schemas'

export const documentController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>
      res.json(serializeDocuments(await documentsRepo.findAll({ category: q.category })))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const d = await documentsRepo.findById(req.params.id)
      if (!d) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeDocument(d))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = validate(createDocumentSchema, req.body)
      const d = await documentsRepo.create(body)
      res.status(201).json(serializeDocument(d))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await documentsRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
