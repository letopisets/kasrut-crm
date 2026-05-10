import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { env } from '../config/env'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { serializeMapUser } from '../serializers/mapCommunity.serializer'
import {
  getEnabledMapAuthProviders,
  OAuthConfigError,
  OAuthTokenError,
  verifyOAuthIdToken,
} from '../services/mapOAuth.service'
import {
  createPasswordResetToken,
  getPasswordResetExpiry,
  hashPassword,
  hashPasswordResetToken,
  normalizeEmail,
  normalizePhone,
  verifyPassword,
} from '../services/mapPassword.service'

const oauthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20),
})

const passwordSchema = z.string()
  .min(8)
  .max(128)
  .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain letters and digits',
  })

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().min(6).max(32),
  password: passwordSchema,
})

const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(1).max(128),
})

const passwordResetRequestSchema = z.object({
  channel: z.enum(['email', 'phone']),
  identifier: z.string().trim().min(3).max(180),
})

const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(160),
  password: passwordSchema,
})

function signMapToken(user: { id: string; name: string; email: string }): string {
  return jwt.sign(
    { sub: user.id, typ: 'map_user', name: user.name, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  )
}

function setMapServiceLogActor(res: Response, user: { id: string; email: string }): void {
  res.locals.serviceLogActor = {
    userId: user.id,
    userEmail: user.email,
    userRole: 'map_user',
    actorType: 'map_user',
  }
}

function genericResetResponse(devResetToken?: string) {
  return {
    ok: true,
    message: 'If an account exists, reset instructions were sent.',
    ...(process.env.NODE_ENV !== 'production' && devResetToken ? { devResetToken } : {}),
  }
}

export const mapAuthController = {
  config(_req: Request, res: Response): void {
    res.json({ providers: getEnabledMapAuthProviders() })
  },

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid registration payload. Password must be at least 8 chars with letters and digits.' })
        return
      }

      const email = normalizeEmail(parsed.data.email)
      const phone = normalizePhone(parsed.data.phone)
      const passwordHash = await hashPassword(parsed.data.password)
      res.locals.serviceLogActor = { userEmail: email, userRole: 'auth_attempt', actorType: 'auth_attempt' }

      try {
        const user = await mapCommunityRepo.createPasswordUser({
          firstName: parsed.data.firstName.trim(),
          lastName: parsed.data.lastName.trim(),
          email,
          phone,
          passwordHash,
        })
        setMapServiceLogActor(res, user)
        res.locals.serviceLogMessage = 'Map user registered'
        res.status(201).json({ user: serializeMapUser(user), token: signMapToken(user) })
      } catch {
        res.locals.serviceLogMessage = 'Map registration failed: duplicate email or phone'
        res.status(409).json({ error: 'User with this email or phone already exists' })
      }
    } catch (e) { next(e) }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Email and password are required' })
        return
      }

      const email = normalizeEmail(parsed.data.email)
      res.locals.serviceLogActor = { userEmail: email, userRole: 'auth_attempt', actorType: 'auth_attempt' }
      const user = await mapCommunityRepo.findAuthUserByEmail(email)
      if (!user?.passwordHash) {
        res.locals.serviceLogMessage = 'Map login failed'
        res.status(401).json({ error: 'Invalid email or password' })
        return
      }

      const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash)
      if (!passwordOk) {
        res.locals.serviceLogMessage = 'Map login failed'
        res.status(401).json({ error: 'Invalid email or password' })
        return
      }

      setMapServiceLogActor(res, user)
      res.locals.serviceLogMessage = 'Map login succeeded'
      res.json({ user: serializeMapUser(user), token: signMapToken(user) })
    } catch (e) { next(e) }
  },

  async oauth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = oauthSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'provider and idToken are required' })
        return
      }

      try {
        const profile = await verifyOAuthIdToken(parsed.data.provider, parsed.data.idToken)
        const user = await mapCommunityRepo.upsertUserFromIdentity(profile)
        setMapServiceLogActor(res, user)
        res.locals.serviceLogMessage = 'Map OAuth login succeeded'
        res.json({ user: serializeMapUser(user), token: signMapToken(user) })
      } catch (e) {
        if (e instanceof OAuthConfigError) {
          res.locals.serviceLogMessage = 'Map OAuth configuration error'
          res.status(400).json({ error: e.message })
          return
        }
        if (e instanceof OAuthTokenError) {
          res.locals.serviceLogMessage = 'Map OAuth token rejected'
          res.status(401).json({ error: 'Invalid OAuth token' })
          return
        }
        throw e
      }
    } catch (e) { next(e) }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.mapUser) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      const user = await mapCommunityRepo.findUserById(req.mapUser.sub)
      if (!user) {
        res.status(404).json({ error: 'User not found' })
        return
      }
      res.json(serializeMapUser(user))
    } catch (e) { next(e) }
  },

  async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = passwordResetRequestSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'channel and identifier are required' })
        return
      }

      const channel = parsed.data.channel
      const identifier = channel === 'email'
        ? normalizeEmail(parsed.data.identifier)
        : normalizePhone(parsed.data.identifier)
      if (channel === 'email') {
        res.locals.serviceLogActor = { userEmail: identifier, userRole: 'auth_attempt', actorType: 'auth_attempt' }
      }
      const user = await mapCommunityRepo.findUserByResetIdentifier(channel, identifier)

      if (!user) {
        res.locals.serviceLogMessage = 'Map password reset requested'
        res.json(genericResetResponse())
        return
      }

      const token = createPasswordResetToken()
      await mapCommunityRepo.createPasswordResetToken({
        mapUserId: user.id,
        channel,
        tokenHash: hashPasswordResetToken(token),
        expiresAt: getPasswordResetExpiry(),
      })

      setMapServiceLogActor(res, user)
      res.locals.serviceLogMessage = 'Map password reset requested'
      res.json(genericResetResponse(token))
    } catch (e) { next(e) }
  },

  async confirmPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = passwordResetConfirmSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Valid token and new password are required' })
        return
      }

      const reset = await mapCommunityRepo.findValidPasswordResetToken(hashPasswordResetToken(parsed.data.token))
      if (!reset) {
        res.locals.serviceLogMessage = 'Map password reset failed'
        res.status(400).json({ error: 'Invalid or expired reset token' })
        return
      }

      const passwordHash = await hashPassword(parsed.data.password)
      await mapCommunityRepo.setPassword(reset.mapUserId, passwordHash)
      await mapCommunityRepo.markPasswordResetTokenUsed(reset.id)

      setMapServiceLogActor(res, reset.mapUser)
      res.locals.serviceLogMessage = 'Map password reset completed'
      res.json({ user: serializeMapUser(reset.mapUser), token: signMapToken(reset.mapUser) })
    } catch (e) { next(e) }
  },
}
