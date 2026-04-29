import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { env } from '../config/env'
import { usersRepo } from '../db/users.repo'
import type { User } from '../models/types'
import { serializeUser } from '../serializers/user.serializer'
import { validate } from '../lib/validate'
import { loginSchema } from '../schemas'
import { blacklistToken } from '../lib/tokenBlacklist'

function signFullToken(user: User) {
  const payload = {
    sub:   user.id,   role:  user.role,
    name:  user.name, email: user.email,
    jti:   randomUUID(),
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
  }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as object)
}

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = validate(loginSchema, req.body)
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
      const user = await usersRepo.findByEmail(email)

      if (!user || !usersRepo.verifyPassword(user, password)) {
        console.info(`[audit] login_failed email=${email} ip=${ip}`)
        res.status(401).json({ error: 'Invalid credentials' }); return
      }

      // If 2FA is enabled — issue short-lived temp token, ask for TOTP code
      if (user.twoFactorEnabled) {
        const tempToken = jwt.sign({ sub: user.id, jti: randomUUID() }, env.JWT_SECRET, { expiresIn: '5m' })
        res.json({ requiresTwoFactor: true, tempToken })
        return
      }

      const token = signFullToken(user)
      console.info(`[audit] login_success userId=${user.id} ip=${ip}`)
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

  async logout(req: Request, res: Response): Promise<void> {
    if (req.user?.jti) {
      const remainingTtl = Math.floor((req.user.exp - Date.now() / 1000))
      await blacklistToken(req.user.jti, remainingTtl)
      console.info(`[audit] logout userId=${req.user.sub} jti=${req.user.jti}`)
    }
    res.status(204).send()
  },
}

export { signFullToken }
