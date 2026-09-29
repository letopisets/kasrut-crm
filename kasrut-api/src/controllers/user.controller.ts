import { usersRepo, UserChangedError } from '../db/users.repo'
import { serializeUser, serializeUsers } from '../serializers/user.serializer'
import { validate } from '../lib/validate'
import {
  createUserSchema,
  updateUserSchema,
  paginationSchema,
  userTenantAssignmentSchema,
} from '../schemas'
import type { Role } from '../models/types'
import { asyncHandler } from '../lib/asyncHandler'

export const userController = {
  list: asyncHandler(async (req, res) => {
    const q         = req.query as Record<string, string>
    const pageInput = validate(paginationSchema, { limit: q.limit, cursor: q.cursor })

    if (pageInput.limit) {
      const page = await usersRepo.findPage({ role: q.role as Role | undefined, limit: pageInput.limit, cursor: pageInput.cursor })
      res.json({ items: serializeUsers(page.items), nextCursor: page.nextCursor })
      return
    }
    res.json(serializeUsers(await usersRepo.findAll({ role: q.role as Role | undefined })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const u = await usersRepo.findById(req.params.id)
    if (!u) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeUser(u))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createUserSchema, req.body)
    if (!await usersRepo.validateTenantAssignment(body)) {
      res.status(400).json({ error: 'Role must reference an active profile in the same active rabbanut' })
      return
    }
    const u = await usersRepo.create(body)
    res.status(201).json(serializeUser(u))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateUserSchema, req.body)
    const existing = await usersRepo.findById(req.params.id)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }

    // PATCH validation must use the resulting role/tenant pair. Validating the
    // partial body alone would allow an owner account without a rabbanutId to
    // be converted into a tenant role and then read every tenant fail-open.
    // An explicit `null` in the body clears the stored link, so it must not
    // fall back to the existing value (`??` would resurrect it).
    const rabbanutId  = body.rabbanutId  !== undefined ? body.rabbanutId  : existing.rabbanutId
    const mashgiachId = body.mashgiachId !== undefined ? body.mashgiachId : existing.mashgiachId
    const assignment = validate(userTenantAssignmentSchema, {
      role: body.role ?? existing.role,
      rabbanutId: rabbanutId ?? undefined,
      mashgiachId: mashgiachId ?? undefined,
    })
    if (!await usersRepo.validateTenantAssignment(assignment)) {
      res.status(400).json({ error: 'Role must reference an active profile in the same active rabbanut' })
      return
    }

    // Pin the state validated above: a concurrent PATCH makes this one fail
    // instead of combining with it into an unvalidated role/tenant pair.
    let u
    try {
      u = await usersRepo.update(req.params.id, body, {
        role:        existing.role,
        rabbanutId:  existing.rabbanutId ?? null,
        mashgiachId: existing.mashgiachId ?? null,
      })
    } catch (e) {
      if (e instanceof UserChangedError) {
        res.status(409).json({ error: 'Conflict: the user was changed concurrently; reload and retry' })
        return
      }
      throw e
    }
    if (!u) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeUser(u))
  }),

  remove: asyncHandler(async (req, res) => {
    const ok = await usersRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
