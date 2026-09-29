import type { Response } from 'express'
import bcrypt from 'bcryptjs'
import { usersRepo } from '../db/users.repo'
import type { User } from '../models/types'
import { serializeUser } from '../serializers/user.serializer'
import { validate } from '../lib/validate'
import { loginSchema } from '../schemas'
import { blacklistToken } from '../lib/tokenBlacklist'
import { asyncHandler } from '../lib/asyncHandler'
import { signCrmAccessToken, signTwoFactorPendingToken } from '../lib/jwt'
import { recordSuccess, reserveAttempt, sendLoginLocked } from '../lib/loginThrottle'

// Cost-12 hash (the cost usersRepo.create uses) of a random value nobody
// knows. An unknown email is compared against it so that it costs the same
// bcrypt time as a wrong password; the result is always ignored.
const DUMMY_PASSWORD_HASH = '$2a$12$YgiuxHIzZat8XL5IWPGyu.ZK4AJI8gbZAmK5F/L0ugVYieTCeO8yq'

async function verifyLoginPassword(user: User | null, password: string): Promise<boolean> {
  if (user) return usersRepo.verifyPassword(user, password)
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
  return false
}

function signFullToken(user: User) {
  return signCrmAccessToken({
    sub:   user.id,   role:  user.role,
    name:  user.name, email: user.email,
    ver:   user.sessionVersion ?? 0,
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
    ...(user.mashgiachId ? { mashgiachId: user.mashgiachId } : {}),
  })
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
    // Reserved before the account is even looked up: a locked identifier gets
    // the same answer whether or not it exists, and no password is tried. The
    // attempt already counts as a failure, so parallel guesses cannot race it.
    const lock = await reserveAttempt('crm', email)
    if (lock.locked) {
      res.locals.serviceLogMessage = 'CRM login locked after repeated failures'
      sendLoginLocked(res, lock); return
    }

    const user = await usersRepo.findAuthByEmail(email)

    const passwordOk = await verifyLoginPassword(user, password)
    if (!user || !passwordOk) {
      res.locals.serviceLogMessage = 'CRM login failed'
      res.status(401).json({ error: 'Invalid credentials' }); return
    }

    await recordSuccess('crm', email)
    setServiceLogActor(res, user)

    if (user.twoFactorEnabled) {
      const tempToken = signTwoFactorPendingToken({ sub: user.id })
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
    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json(serializeUser(user))
  }),

  logout: asyncHandler(async (req, res) => {
    if (!req.user || !await usersRepo.revokeSessions(req.user.sub)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (req.user?.jti) {
      const remainingTtl = Math.floor((req.user.exp - Date.now() / 1000))
      await blacklistToken(req.user.jti, remainingTtl)
    }
    res.locals.serviceLogMessage = 'CRM logout succeeded'
    res.status(204).send()
  }),
}

export { signFullToken }
