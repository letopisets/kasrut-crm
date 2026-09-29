import type { Request } from 'express'
import { documentsRepo } from '../db/documents.repo'
import { rabbanutRepo } from '../db/rabbanuts.repo'
import { serializeDocument, serializeDocuments } from '../serializers/document.serializer'
import { validate } from '../lib/validate'
import { createDocumentSchema, listDocumentQuerySchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'
import {
  applyWriteScope,
  assertOwnsRabbanut,
  ForbiddenScopeError,
  resolveScopeRabbanutId,
} from '../lib/rabbanutScope'
import type { KashrutDocument } from '../models/types'

/**
 * Documents are either global (rabbanutId null: the owner's regulations,
 * visible to every CRM role, managed by the owner only) or belong to one
 * rabbanut (visible to the owner and that rabbanut's users).
 */

/** Non-owners may read global documents and their own tenant's. A tenant
 *  account without a rabbanutId is refused even for global documents, the
 *  same fail-closed rule as the list. */
function assertCanRead(req: Request, doc: KashrutDocument): void {
  const scope = resolveScopeRabbanutId(req, undefined)
  if (scope !== undefined && doc.rabbanutId !== null && doc.rabbanutId !== scope) {
    throw new ForbiddenScopeError()
  }
}

/** Only the owner deletes global documents; a rabbanut only its own. */
function assertCanDelete(req: Request, doc: KashrutDocument): void {
  if (req.user?.role === 'owner') return
  if (doc.rabbanutId === null) throw new ForbiddenScopeError()
  assertOwnsRabbanut(req, { rabbanutId: doc.rabbanutId })
}

export const documentController = {
  list: asyncHandler(async (req, res) => {
    const { category } = validate(listDocumentQuerySchema, { category: req.query.category })
    // Owners see every document; everyone else global + own tenant (403 when
    // the account has no tenant).
    const rabbanutId = resolveScopeRabbanutId(req, undefined)
    res.json(serializeDocuments(await documentsRepo.findAll({ category, rabbanutId })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const d = await documentsRepo.findById(req.params.id)
    if (!d) { res.status(404).json({ error: 'Not found' }); return }
    assertCanRead(req, d)
    res.json(serializeDocument(d))
  }),

  create: asyncHandler(async (req, res) => {
    const { rabbanutId: requested, ...body } = validate(createDocumentSchema, req.body)

    let rabbanutId: string | null
    if (req.user?.role === 'owner') {
      // Owner: null / omitted publishes a global document, otherwise the
      // target must be an existing, active rabbanut.
      rabbanutId = requested ?? null
      if (rabbanutId !== null) {
        const target = await rabbanutRepo.findById(rabbanutId)
        if (!target?.active) { res.status(400).json({ error: 'Unknown or inactive rabbanut' }); return }
      }
    } else {
      // Rabbanut users cannot publish global documents; everything else is
      // pinned to their own tenant (403 for a foreign or missing rabbanutId).
      if (requested === null || req.user?.role !== 'rabbanut') throw new ForbiddenScopeError()
      rabbanutId = applyWriteScope(req, { rabbanutId: requested }).rabbanutId ?? null
      if (rabbanutId === null) throw new ForbiddenScopeError()
    }

    const d = await documentsRepo.create({ ...body, size: body.size ?? 0, rabbanutId })
    res.status(201).json(serializeDocument(d))
  }),

  remove: asyncHandler(async (req, res) => {
    const existing = await documentsRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }
    assertCanDelete(req, existing)
    const ok = await documentsRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
