import { documentsRepo } from '../db/documents.repo'
import { serializeDocument, serializeDocuments } from '../serializers/document.serializer'
import { validate } from '../lib/validate'
import { createDocumentSchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'

export const documentController = {
  list: asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>
    res.json(serializeDocuments(await documentsRepo.findAll({ category: q.category })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const d = await documentsRepo.findById(req.params.id)
    if (!d) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeDocument(d))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createDocumentSchema, req.body)
    const d = await documentsRepo.create({ ...body, size: body.size ?? 0 })
    res.status(201).json(serializeDocument(d))
  }),

  remove: asyncHandler(async (req, res) => {
    const ok = await documentsRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
