import type { Response } from 'express'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { env } from '../config/env'
import { usersRepo } from '../db/users.repo'
import type { User } from '../models/types'
import { serializeUser } from '../serializers/user.serializer'
import { validate } from '../lib/validate'
import { loginSchema } from '../schemas'
import { blacklistToken } from '../lib/tokenBlacklist'
import { asyncHandler } from '../lib/asyncHandler'

function signFullToken(user: User) {
  const payload = {
    sub:   user.id,   role:  user.role,
    name:  user.name, email: user.email,
    typ:   'crm' as const,
    jti:   randomUUID(),
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
  }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN })
}

function setServiceLogActor(res: Response, user: Pick<User, 'id' | 'email' | 'role'>): void {
  res.locals.serviceLogActor = {
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    actorType: 'crm_user',
  }
}

export const authController = {
  login: asyncHandler(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body)
    res.locals.serviceLogActor = {
      userEmail: email.toLowerCase(),
      userRole: 'auth_attempt',
      actorType: 'auth_attempt',
    }
    const user = await usersRepo.findByEmail(email)

    if (!user || !usersRepo.verifyPassword(user, password)) {
      res.locals.serviceLogMessage = 'CRM login failed'
      res.status(401).json({ error: 'Invalid credentials' }); return
    }

    setServiceLogActor(res, user)

    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign({ sub: user.id, typ: '2fa_pending', jti: randomUUID() }, env.JWT_SECRET, { expiresIn: '5m' })
      res.locals.serviceLogMessage = 'CRM login requires 2FA'
      res.json({ requiresTwoFactor: true, tempToken })
      return
    }

    const token = signFullToken(user)
    res.locals.serviceLogMessage = 'CRM login succeeded'
    res.json({ user: serializeUser(user), token })
  }),

  me: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const user = await usersRepo.findById(req.user.sub)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json(serializeUser(user))
  }),

  logout: asyncHandler(async (req, res) => {
    if (req.user?.jti) {
      const remainingTtl = Math.floor((req.user.exp - Date.now() / 1000))
      await blacklistToken(req.user.jti, remainingTtl)
    }
    res.locals.serviceLogMessage = 'CRM logout succeeded'
    res.status(204).send()
  }),
}

export { signFullToken }
