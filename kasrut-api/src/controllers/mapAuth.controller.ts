import type { Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { mapCommunityRepo, type MapUserRow } from '../db/mapCommunity.repo'
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
import { asyncHandler } from '../lib/asyncHandler'
import { blacklistToken } from '../lib/tokenBlacklist'
import { recordSuccess, reserveAttempt, sendLoginLocked } from '../lib/loginThrottle'
import { signMapAccessToken } from '../lib/jwt'
import {
  clearRefreshCookies,
  endPresentedRefreshSession,
  refreshFailureLogMessage,
  revokePresentedRefreshFamily,
  rotateRefreshToken,
  setRefreshCookie,
  startRefreshSession,
} from '../lib/refreshTokens'
import { sendMapPasswordResetToken } from '../lib/mailer'
import { logger } from '../lib/logger'
import {
  deliverEmailVerification,
  hashEmailVerificationToken,
  isEmailVerificationRequired,
  isVerificationMailEnabled,
  newEmailVerificationToken,
  reserveVerificationMail,
} from '../services/mapEmailVerification.service'

const oauthSchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20),
})

// New map passwords (registration, reset): 12+ characters, as for CRM
// accounts. Sign-in accepts any length, so older 8-character passwords keep
// working until they are reset.
const passwordSchema = z.string()
  .min(12)
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
}).refine(
  // The email channel takes an address, as registration and login do; the
  // identifier is also what the audit log records for the attempt.
  body => body.channel !== 'email' || z.string().email().safeParse(body.identifier).success,
  { path: ['identifier'], message: 'identifier must be an email address for the email channel' },
)

const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(160),
  password: passwordSchema,
})

const verifyEmailSchema = z.object({
  token: z.string().min(20).max(160),
})

function signMapToken(user: { id: string; name: string; email: string; sessionVersion: number }): string {
  return signMapAccessToken({
    sub: user.id,
    name: user.name,
    email: user.email,
    ver: user.sessionVersion,
  })
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
    ...(env.NODE_ENV === 'development' && env.EXPOSE_DEV_RESET_TOKEN && devResetToken
      ? { devResetToken }
      : {}),
  }
}

export const mapAuthController = {
  config: asyncHandler(async (_req, res) => {
    res.json({
      providers: getEnabledMapAuthProviders(),
      // Lets the map say "check your email" only when that is needed.
      emailVerification: isEmailVerificationRequired() ? 'required' : 'off',
    })
  }),

  register: asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration payload. Password must be at least 12 characters with letters and digits.' })
      return
    }

    const email = normalizeEmail(parsed.data.email)
    const phone = normalizePhone(parsed.data.phone)
    const passwordHash = await hashPassword(parsed.data.password)
    res.locals.serviceLogActor = { userEmail: email, userRole: 'auth_attempt', actorType: 'auth_attempt' }
    const verification = isVerificationMailEnabled() ? newEmailVerificationToken() : null

    let user: MapUserRow
    try {
      user = await mapCommunityRepo.createPasswordUser({
        firstName: parsed.data.firstName.trim(),
        lastName: parsed.data.lastName.trim(),
        email,
        phone,
        passwordHash,
        emailVerification: verification && { tokenHash: verification.tokenHash, expiresAt: verification.expiresAt },
      })
    } catch {
      res.locals.serviceLogMessage = 'Map registration failed: duplicate email or phone'
      res.status(409).json({ error: 'User with this email or phone already exists' })
      return
    }
    setMapServiceLogActor(res, user)
    if (verification) {
      // Past the mail budget the account is still created with its (unsent)
      // link, and the answer is the same; the user can ask for a new one.
      if ((await reserveVerificationMail(req, email)).allowed) {
        deliverEmailVerification(user, verification.token)
      } else {
        logger.warn({ mapUserId: user.id }, 'Map email verification not sent: mail budget used up')
      }
    }
    await startRefreshSession(req, res, 'map', user)
    res.locals.serviceLogMessage = 'Map user registered'
    res.status(201).json({ user: serializeMapUser(user), token: signMapToken(user) })
  }),

  login: asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const email = normalizeEmail(parsed.data.email)
    res.locals.serviceLogActor = { userEmail: email, userRole: 'auth_attempt', actorType: 'auth_attempt' }
    // Reserved before the lookup: same answer for existing and unknown
    // accounts, a locked identifier never gets a password check, and the
    // attempt already counts as a failure so parallel guesses cannot race it.
    const lock = await reserveAttempt('map', email)
    if (lock.locked) {
      res.locals.serviceLogMessage = 'Map login locked after repeated failures'
      sendLoginLocked(res, lock); return
    }

    const user = await mapCommunityRepo.findAuthUserByEmail(email)
    // Unknown and password-less (OAuth-only) accounts still pay one bcrypt compare.
    const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash)
    if (!user || !passwordOk) {
      res.locals.serviceLogMessage = 'Map login failed'
      res.status(401).json({ error: 'Invalid email or password' }); return
    }

    await recordSuccess('map', email)
    setMapServiceLogActor(res, user)
    await startRefreshSession(req, res, 'map', user)
    res.locals.serviceLogMessage = 'Map login succeeded'
    res.json({ user: serializeMapUser(user), token: signMapToken(user) })
  }),

  oauth: asyncHandler(async (req, res) => {
    const parsed = oauthSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'provider and idToken are required' }); return
    }

    try {
      const profile = await verifyOAuthIdToken(parsed.data.provider, parsed.data.idToken)
      const user = await mapCommunityRepo.upsertUserFromIdentity(profile)
      setMapServiceLogActor(res, user)
      await startRefreshSession(req, res, 'map', user)
      res.locals.serviceLogMessage = 'Map OAuth login succeeded'
      res.json({ user: serializeMapUser(user), token: signMapToken(user) })
    } catch (e) {
      if (e instanceof OAuthConfigError) {
        res.locals.serviceLogMessage = 'Map OAuth configuration error'
        res.status(400).json({ error: e.message }); return
      }
      if (e instanceof OAuthTokenError) {
        res.locals.serviceLogMessage = 'Map OAuth token rejected'
        res.status(401).json({ error: 'Invalid OAuth token' }); return
      }
      throw e
    }
  }),

  // Cookie-authenticated (requireRefreshRequest guards the route): trades the
  // refresh cookie for a new access token and a rotated cookie.
  refresh: asyncHandler(async (req, res) => {
    const outcome = await rotateRefreshToken(req, 'map', id => mapCommunityRepo.findUserById(id))
    if (!outcome.ok) {
      clearRefreshCookies(req, res, 'map')
      const message = refreshFailureLogMessage(outcome)
      if (message) {
        if (outcome.ownerId) res.locals.serviceLogActor = { userId: outcome.ownerId, userRole: 'map_user', actorType: 'map_user' }
        res.locals.serviceLogMessage = `Map ${message}`
      }
      res.status(401).json({ error: 'Session expired; sign in again' }); return
    }

    const user = outcome.account
    setRefreshCookie(res, 'map', outcome.token, outcome.expiresAt.getTime() - Date.now())
    res.json({ user: serializeMapUser(user), token: signMapToken(user) })
  }),

  me: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }
    const user = await mapCommunityRepo.findUserById(req.mapUser.sub)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json(serializeMapUser(user))
  }),

  requestPasswordReset: asyncHandler(async (req, res) => {
    const parsed = passwordResetRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      // Both fields present, but the email channel got something that is not
      // an address: say that rather than that a field is missing.
      const notAnAddress = parsed.error.issues.find(issue => issue.code === 'custom' && issue.path[0] === 'identifier')
      res.status(400).json({ error: notAnAddress?.message ?? 'channel and identifier are required' }); return
    }

    const channel    = parsed.data.channel
    const identifier = channel === 'email'
      ? normalizeEmail(parsed.data.identifier)
      : normalizePhone(parsed.data.identifier)
    if (channel === 'email') {
      res.locals.serviceLogActor = { userEmail: identifier, userRole: 'auth_attempt', actorType: 'auth_attempt' }
    }
    const user = await mapCommunityRepo.findUserByResetIdentifier(channel, identifier)

    if (!user) {
      res.locals.serviceLogMessage = 'Map password reset requested'
      res.json(genericResetResponse()); return
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
    // Do not await SMTP: response timing stays close to the nonexistent-user
    // path, reducing account enumeration. Delivery failures are logged without
    // ever logging the reset token itself.
    void sendMapPasswordResetToken({
      recipientEmail: user.email,
      recipientName: user.name,
      token,
    }).catch(err => {
      logger.error({ err, mapUserId: user.id }, 'Map password reset email delivery failed')
    })
    res.json(genericResetResponse(token))
  }),

  confirmPasswordReset: asyncHandler(async (req, res) => {
    const parsed = passwordResetConfirmSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid token and new password are required' }); return
    }

    const tokenHash = hashPasswordResetToken(parsed.data.token)
    if (!await mapCommunityRepo.hasValidPasswordResetToken(tokenHash)) {
      res.locals.serviceLogMessage = 'Map password reset failed'
      res.status(400).json({ error: 'Invalid or expired reset token' }); return
    }

    const passwordHash = await hashPassword(parsed.data.password)
    const user = await mapCommunityRepo.consumePasswordResetToken({
      tokenHash,
      passwordHash,
    })
    if (!user) {
      res.locals.serviceLogMessage = 'Map password reset failed'
      res.status(400).json({ error: 'Invalid or expired reset token' }); return
    }

    // The reset proves control of the account: lift any login lock on it.
    await recordSuccess('map', user.email)
    setMapServiceLogActor(res, user)
    // The reset bumped sessionVersion, which ended every earlier refresh family.
    await startRefreshSession(req, res, 'map', user)
    res.locals.serviceLogMessage = 'Map password reset completed'
    res.json({ user: serializeMapUser(user), token: signMapToken(user) })
  }),

  // Public: the link in the email is the credential.
  verifyEmail: asyncHandler(async (req, res) => {
    const parsed = verifyEmailSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'A valid verification token is required' }); return
    }

    const outcome = await mapCommunityRepo.consumeEmailVerificationToken(hashEmailVerificationToken(parsed.data.token))
    if (outcome.status === 'invalid') {
      // The service log records only requests with an actor: the link's
      // account, when the link exists (expired or replaced).
      if (outcome.user) {
        res.locals.serviceLogActor = {
          userId: outcome.user.id,
          userEmail: outcome.user.email,
          userRole: 'auth_attempt',
          actorType: 'auth_attempt',
        }
      }
      res.locals.serviceLogMessage = 'Map email verification failed'
      res.status(400).json({ error: 'Invalid or expired verification link' }); return
    }

    setMapServiceLogActor(res, outcome.user)
    if (outcome.status === 'already_verified') {
      res.locals.serviceLogMessage = 'Map email verification link opened again; already verified'
      res.json({ ok: true, alreadyVerified: true }); return
    }
    res.locals.serviceLogMessage = 'Map email verified'
    res.json({ ok: true })
  }),

  // 204 also when there is nothing to send: the account is verified, or no
  // mail can go out. The route caps requests per account and per address;
  // the mail budget (shared with registration) caps the emails.
  resendEmailVerification: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }
    const user = { id: req.mapUser.sub, email: req.mapUser.email }
    setMapServiceLogActor(res, user)
    if (req.mapUser.emailVerified || !isVerificationMailEnabled()) {
      res.status(204).send(); return
    }

    const budget = await reserveVerificationMail(req, user.email)
    if (!budget.allowed) {
      res.locals.serviceLogMessage = 'Map email verification not resent: mail budget used up'
      res.setHeader('Retry-After', String(budget.retryAfter))
      res.status(429).json({ error: 'Too many requests. Please try again later.' }); return
    }

    const verification = newEmailVerificationToken()
    await mapCommunityRepo.createEmailVerificationToken({
      mapUserId: user.id,
      tokenHash: verification.tokenHash,
      expiresAt: verification.expiresAt,
    })
    deliverEmailVerification(user, verification.token)
    res.locals.serviceLogMessage = 'Map email verification resent'
    res.status(204).send()
  }),

  logout: asyncHandler(async (req, res) => {
    if (!req.mapUser) {
      // No access token: the route let the request through on the refresh
      // guards, and the refresh cookie alone ends this browser's session.
      const ended = await endPresentedRefreshSession(req, 'map')
      clearRefreshCookies(req, res, 'map')
      if (ended.failure === 'duplicate') {
        res.locals.serviceLogMessage = `Map logout (refresh cookie): ${refreshFailureLogMessage({ reason: 'duplicate' })}`
      } else if (ended.ownerId) {
        const message = ended.failure && refreshFailureLogMessage({ reason: ended.failure, sessionsEnded: ended.sessionsEnded })
        res.locals.serviceLogActor = { userId: ended.ownerId, userRole: 'map_user', actorType: 'map_user' }
        res.locals.serviceLogMessage = message
          ? `Map logout (refresh cookie): ${message}`
          : 'Map logout succeeded (refresh cookie)'
      }
      res.status(204).send(); return
    }
    if (!await mapCommunityRepo.revokeUserSessions(req.mapUser.sub)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (req.mapUser?.jti) {
      const remainingTtl = Math.floor(req.mapUser.exp - Date.now() / 1000)
      await blacklistToken(req.mapUser.jti, remainingTtl)
    }
    // The version bump above already ends every refresh session of the
    // account; revoking the family also makes a stolen copy of this cookie
    // count as reuse.
    await revokePresentedRefreshFamily(req, 'map', req.mapUser.sub)
    clearRefreshCookies(req, res, 'map')
    res.locals.serviceLogMessage = 'Map logout succeeded'
    res.status(204).send()
  }),
}
