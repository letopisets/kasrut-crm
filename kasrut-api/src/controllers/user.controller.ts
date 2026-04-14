import type { Request, Response, NextFunction } from 'express'
import { usersRepo } from '../db/users.repo'
import { serializeUser, serializeUsers } from '../serializers/user.serializer'
import type { Role } from '../models/types'

export const userController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>
      res.json(serializeUsers(await usersRepo.findAll({ role: q.role as Role | undefined })))
    } catch (e) { next(e) }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const u = await usersRepo.findById(req.params.id)
      if (!u) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeUser(u))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const u = await usersRepo.create(req.body)
      res.status(201).json(serializeUser(u))
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const u = await usersRepo.update(req.params.id, req.body)
      if (!u) { res.status(404).json({ error: 'Not found' }); return }
      res.json(serializeUser(u))
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await usersRepo.remove(req.params.id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      res.status(204).send()
    } catch (e) { next(e) }
  },
}
