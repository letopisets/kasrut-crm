import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { usersRepo } from '../db/users.repo'
import { serializeUser } from '../serializers/user.serializer'

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as { email?: string; password?: string }
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' }); return
      }
      const user = await usersRepo.findByEmail(email)
      if (!user || !usersRepo.verifyPassword(user, password)) {
        res.status(401).json({ error: 'Invalid credentials' }); return
      }

      // If 2FA is enabled — issue short-lived temp token, ask for TOTP code
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: '5m' })
        res.json({ requiresTwoFactor: true, tempToken })
        return
      }

      const payload = {
        sub:   user.id,  role: user.role,
        name:  user.name, email: user.email,
        ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
      }
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as object)
      res.json({ user: serializeUser(user), token })
    } catch (e) { next(e) }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const user = await usersRepo.findById(req.user.sub)
      if (!user) { res.status(404).json({ error: 'User not found' }); return }
      res.json(serializeUser(user))
    } catch (e) { next(e) }
  },

  logout(_req: Request, res: Response): void {
    res.status(204).send()
  },
}
