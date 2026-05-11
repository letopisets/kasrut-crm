import { inspectionsRepo } from '../db/inspections.repo'
import { serializeInspection, serializeInspections } from '../serializers/inspection.serializer'
import { validate } from '../lib/validate'
import { createInspectionSchema, updateInspectionSchema, paginationSchema } from '../schemas'
import { asyncHandler } from '../lib/asyncHandler'
import { ForbiddenScopeError } from '../lib/rabbanutScope'

// Resolve which rabbanutId an inspection write should be scoped to.
// Inspection rows have no rabbanutId column themselves; ownership flows through
// the restaurant. Rabbanut callers are pinned to their own; owners inherit
// the target restaurant's rabbanutId so cross-rabbanut moves still validate.
async function resolveInspectionScope(
  role: string | undefined,
  userRabbanutId: string | undefined,
  restaurantId: string,
): Promise<string> {
  if (role === 'rabbanut') {
    if (!userRabbanutId) throw new ForbiddenScopeError()
    return userRabbanutId
  }
  const ownerId = await inspectionsRepo.findRabbanutIdByRestaurant(restaurantId)
  if (!ownerId) throw new ForbiddenScopeError('Restaurant not found')
  return ownerId
}

export const inspectionController = {
  list: asyncHandler(async (req, res) => {
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
      res.json({ items: serializeInspections(page.items), nextCursor: page.nextCursor })
      return
    }

    const inspections = await inspectionsRepo.findAll({
      restaurantId: q.restaurantId,
      result:       q.result,
      type:         q.type,
      mashgiachId,
    })
    res.json(serializeInspections(inspections))
  }),

  getOne: asyncHandler(async (req, res) => {
    const i = await inspectionsRepo.findById(req.params.id)
    if (!i) { res.status(404).json({ error: 'Not found' }); return }

    // Mashgichim only see inspections they are assigned to.
    if (req.user?.role === 'mashgiach' && i.mashgiachId !== req.user.sub) {
      throw new ForbiddenScopeError()
    }
    // Rabbanut users are blocked from inspections that live in another rabbanut.
    if (req.user?.role === 'rabbanut') {
      const ownerId = await inspectionsRepo.findRabbanutIdByRestaurant(i.restaurantId)
      if (ownerId && ownerId !== req.user.rabbanutId) throw new ForbiddenScopeError()
    }
    res.json(serializeInspection(i))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createInspectionSchema, req.body)

    const scopeRabbanutId = await resolveInspectionScope(
      req.user?.role, req.user?.rabbanutId, body.restaurantId,
    )

    const ok = await inspectionsRepo.validateOwnership({
      rabbanutId:   scopeRabbanutId,
      restaurantId: body.restaurantId,
      mashgiachId:  body.mashgiachId,
    })
    if (!ok) {
      res.status(400).json({ error: 'Restaurant and mashgiach must belong to the same rabbanut' })
      return
    }

    const i = await inspectionsRepo.create(body)
    res.status(201).json(serializeInspection(i))
  }),

  update: asyncHandler(async (req, res) => {
    const body     = validate(updateInspectionSchema, req.body)
    const existing = await inspectionsRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }

    // Mashgichim may only flip their own inspection's result/notes — never
    // reassign restaurant, mashgiach, date, or type to bypass scope.
    if (req.user?.role === 'mashgiach') {
      if (existing.mashgiachId !== req.user.sub) throw new ForbiddenScopeError()
      const forbidden = ['restaurantId', 'mashgiachId', 'date', 'type'] as const
      if (forbidden.some(k => body[k] !== undefined)) throw new ForbiddenScopeError()
    }

    // Validate ownership against the resulting restaurant/mashgiach pair.
    const restaurantId = body.restaurantId ?? existing.restaurantId
    const mashgiachId  = body.mashgiachId  ?? existing.mashgiachId

    const scopeRabbanutId = await resolveInspectionScope(
      req.user?.role, req.user?.rabbanutId, restaurantId,
    )

    // Rabbanut callers must also own the *original* restaurant — otherwise a
    // guessed inspection id from a peer tenant could be reassigned into their
    // own scope and silently leaked. Owners may freely move inspections; the
    // mashgiach branch already blocked reassignment above.
    if (req.user?.role === 'rabbanut') {
      const existingOwner = await inspectionsRepo.findRabbanutIdByRestaurant(existing.restaurantId)
      if (existingOwner && existingOwner !== scopeRabbanutId) throw new ForbiddenScopeError()
    }

    const ok = await inspectionsRepo.validateOwnership({
      rabbanutId:   scopeRabbanutId,
      restaurantId,
      mashgiachId,
    })
    if (!ok) {
      res.status(400).json({ error: 'Restaurant and mashgiach must belong to the same rabbanut' })
      return
    }

    const i = body.result !== undefined && Object.keys(body).length === 1
      ? await inspectionsRepo.setResult(req.params.id, body.result)
      : await inspectionsRepo.update(req.params.id, body)
    if (!i) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeInspection(i))
  }),

  remove: asyncHandler(async (req, res) => {
    const existing = await inspectionsRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }

    if (req.user?.role === 'rabbanut') {
      const ownerId = await inspectionsRepo.findRabbanutIdByRestaurant(existing.restaurantId)
      if (ownerId && ownerId !== req.user.rabbanutId) throw new ForbiddenScopeError()
    }

    const ok = await inspectionsRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
