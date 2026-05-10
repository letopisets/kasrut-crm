import { usersRepo } from '../db/users.repo'
import { serializeUser, serializeUsers } from '../serializers/user.serializer'
import { validate } from '../lib/validate'
import { createUserSchema, updateUserSchema } from '../schemas'
import type { Role } from '../models/types'
import { asyncHandler } from '../lib/asyncHandler'

export const userController = {
  list: asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>
    res.json(serializeUsers(await usersRepo.findAll({ role: q.role as Role | undefined })))
  }),

  getOne: asyncHandler(async (req, res) => {
    const u = await usersRepo.findById(req.params.id)
    if (!u) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeUser(u))
  }),

  create: asyncHandler(async (req, res) => {
    const body = validate(createUserSchema, req.body)
    const u = await usersRepo.create(body)
    res.status(201).json(serializeUser(u))
  }),

  update: asyncHandler(async (req, res) => {
    const body = validate(updateUserSchema, req.body)
    const u = await usersRepo.update(req.params.id, body)
    if (!u) { res.status(404).json({ error: 'Not found' }); return }
    res.json(serializeUser(u))
  }),

  remove: asyncHandler(async (req, res) => {
    const ok = await usersRepo.remove(req.params.id)
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  }),
}
