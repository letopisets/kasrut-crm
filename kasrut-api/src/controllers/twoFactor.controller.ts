import qrcode from 'qrcode'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { usersRepo } from '../db/users.repo'
import { serializeUser } from '../serializers/user.serializer'
import { signFullToken } from './auth.controller'
import { asyncHandler } from '../lib/asyncHandler'
import { claimTotpTimeStep, consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { recordSuccess, reserveAttempt, sendLoginLocked } from '../lib/loginThrottle'
import { verifyTwoFactorPendingToken, type TwoFactorPendingPayload } from '../lib/jwt'
import { isTwoFactorRequiredForRole } from '../lib/twoFactorPolicy'
import { startRefreshSession } from '../lib/refreshTokens'

const BACKUP_CODE_COUNT = 8
const BACKUP_CODE_BYTES = 5

function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase(),
  )
}

function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(c => bcrypt.hash(c, 10)))
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSecret, verifySync, generateURI } =
  require('otplib') as {
    generateSecret: () => string
    verifySync:     (opts: { token: string; secret: string }) => { valid: boolean; timeStep?: number }
    generateURI:    (opts: { strategy: string; issuer: string; label: string; secret: string }) => string
  }

const APP_NAME = 'KashrutCRM'
const TOTP_PERIOD_SEC = 30
// Longest factor a client may send; anything longer is not a code at all.
const MAX_FACTOR_LENGTH = 64

function isFactor(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FACTOR_LENGTH
}

function isPendingToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * The TOTP time step `code` matches for `secret`, or null when it does not
 * match. otplib reports the step; with its default tolerance (the current
 * period only) that is the step at call time, used should a result lack it.
 */
function verifiedTimeStep(code: string, secret: string): number | null {
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC)
  try {
    const result = verifySync({ token: code, secret })
    if (result.valid !== true) return null
    return typeof result.timeStep === 'number' ? result.timeStep : currentStep
  } catch { return null }
}

/**
 * A code counts only once per account: true when `code` matches `secret` and
 * its time step is later than any this account has used before.
 */
async function acceptTotp(userId: string, code: string, secret: string): Promise<boolean> {
  const step = verifiedTimeStep(code, secret)
  return step !== null && claimTotpTimeStep(userId, step)
}

// Nothing revokes a pending token: each one is single use through
// consumeTwoFactorChallenge (Postgres), and guesses are bounded per account by
// the crm-2fa throttle, so neither step needs Redis.
function verifyPendingToken(token: string): TwoFactorPendingPayload | null {
  try {
    return verifyTwoFactorPendingToken(token)
  } catch {
    return null
  }
}

function challengeTtlSeconds(payload: TwoFactorPendingPayload): number {
  return Math.max(1, Math.ceil(payload.exp - Date.now() / 1000))
}

async function findBackupCodeIndex(code: string, hashes: string[]): Promise<number> {
  for (let i = 0; i < hashes.length; i += 1) {
    if (await bcrypt.compare(code, hashes[i])) return i
  }
  return -1
}

export const twoFactorController = {
  setup: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { password } = req.body as { password?: string }
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
      res.status(400).json({ error: 'Current password is required' }); return
    }

    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user) { res.status(401).json({ error: 'Unauthorized' }); return }
    // Same per-account budget as POST /auth/login: a stolen session must not
    // become an unthrottled oracle for the account password.
    const lock = await reserveAttempt('crm', user.email)
    if (lock.locked) { sendLoginLocked(res, lock); return }
    // 400, not 401: the session itself is fine, and clients treat a 401 from
    // an authenticated call as "signed out".
    if (!await usersRepo.verifyPassword(user, password)) {
      res.status(400).json({ error: 'Invalid credentials', code: 'INVALID_PASSWORD' }); return
    }
    await recordSuccess('crm', user.email)
    if (user.twoFactorEnabled) {
      res.status(409).json({ error: 'Disable current 2FA before setting up a new authenticator' })
      return
    }

    const secret    = generateSecret()
    const otpauth   = generateURI({ strategy: 'totp', issuer: APP_NAME, label: req.user.email, secret })
    const qrDataUrl = await qrcode.toDataURL(otpauth)

    const updated = await usersRepo.setTwoFactorSecret(req.user.sub, secret)
    if (!updated) {
      res.status(409).json({ error: '2FA state changed; try again' })
      return
    }
    res.json({ secret, qrDataUrl })
  }),

  enable: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { code } = req.body as { code?: unknown }
    if (!isFactor(code)) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user?.twoFactorSecret) { res.status(400).json({ error: 'Call /2fa/setup first' }); return }
    // Same per-account budget as the login 2FA step: under REQUIRE_OWNER_2FA
    // this is the only way from a setup-only session to a full one, so a
    // stolen session must not brute-force the code of a pending secret.
    const lock = await reserveAttempt('crm-2fa', user.id)
    if (lock.locked) { sendLoginLocked(res, lock); return }
    if (!await acceptTotp(user.id, code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }
    await recordSuccess('crm-2fa', user.id)

    const plainCodes  = generateBackupCodes()
    const hashedCodes = await hashBackupCodes(plainCodes)
    const updated = await usersRepo.enableTwoFactor(
      req.user.sub,
      user.twoFactorSecret,
      hashedCodes,
    )
    if (!updated) {
      res.status(409).json({ error: '2FA state changed; start setup again' }); return
    }
    // Enabling bumped sessionVersion, which ended the old refresh family.
    await startRefreshSession(req, res, 'crm', updated)
    res.locals.serviceLogMessage = '2FA enabled'
    res.json({ user: serializeUser(updated), token: signFullToken(updated), backupCodes: plainCodes })
  }),

  disable: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    // Refused before any code is checked, so it costs no throttle attempt.
    if (isTwoFactorRequiredForRole(req.user.role)) {
      res.status(403).json({
        error: 'Two-factor authentication is required for this role',
        code:  'TWO_FACTOR_REQUIRED_FOR_ROLE',
      })
      return
    }

    const { code } = req.body as { code?: unknown }
    if (!isFactor(code)) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA is not enabled' }); return
    }
    // Same per-account budget as the login 2FA step, so a stolen session
    // cannot brute-force the code to switch 2FA off.
    const lock = await reserveAttempt('crm-2fa', user.id)
    if (lock.locked) { sendLoginLocked(res, lock); return }
    if (!await acceptTotp(user.id, code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }
    await recordSuccess('crm-2fa', user.id)

    const updated = await usersRepo.disableTwoFactor(req.user.sub)
    if (!updated) { res.status(409).json({ error: '2FA state changed' }); return }
    // Disabling bumped sessionVersion, which ended the old refresh family.
    await startRefreshSession(req, res, 'crm', updated)
    res.locals.serviceLogMessage = '2FA disabled'
    res.json({ user: serializeUser(updated), token: signFullToken(updated) })
  }),

  verifyBackup: asyncHandler(async (req, res) => {
    const { tempToken, backupCode } = req.body as { tempToken?: unknown; backupCode?: unknown }
    if (!isPendingToken(tempToken) || !isFactor(backupCode)) {
      res.status(400).json({ error: 'tempToken and backupCode required' }); return
    }

    const payload = verifyPendingToken(tempToken)
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    // Per-account guard: a fresh pending token per password login must not
    // reset the guessing budget. Reserved up front (counts as a failure until
    // success clears it); locked means no backup code is compared.
    const lock = await reserveAttempt('crm-2fa', payload.sub)
    if (lock.locked) {
      res.locals.serviceLogMessage = 'CRM 2FA locked after repeated failures'
      sendLoginLocked(res, lock); return
    }

    const ttlSeconds = challengeTtlSeconds(payload)
    const user = await usersRepo.findAuthById(payload.sub)
    if (!user || !user.twoFactorEnabled) { res.status(401).json({ error: 'Unauthorized' }); return }

    const normalised = backupCode.trim().toUpperCase()
    const matchIndex = await findBackupCodeIndex(normalised, user.twoFactorBackupCodes)
    if (matchIndex === -1) { res.status(400).json({ error: 'Invalid backup code' }); return }

    const challengeResult = await consumeTwoFactorChallenge(payload.jti, ttlSeconds)
    if (challengeResult === 'unavailable') {
      // The backup code was right; only the store failed. Release the attempt
      // reserved above, so retrying through an outage cannot lock the owner.
      await recordSuccess('crm-2fa', user.id)
      res.status(503).json({ error: 'Authentication service temporarily unavailable' }); return
    }
    if (challengeResult === 'already_used') {
      res.status(401).json({ error: 'Token has already been used' }); return
    }

    const remaining = user.twoFactorBackupCodes.filter((_, i) => i !== matchIndex)
    const codeConsumed = await usersRepo.consumeBackupCode(
      user.id,
      user.twoFactorBackupCodes,
      remaining,
    )
    if (!codeConsumed) {
      res.status(409).json({ error: 'Backup code state changed; sign in again' }); return
    }
    await recordSuccess('crm-2fa', user.id)

    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = `CRM backup-code login succeeded; remaining=${remaining.length}`
    const token = signFullToken(user)
    await startRefreshSession(req, res, 'crm', user)
    res.json({ user: serializeUser(user), token, backupCodesRemaining: remaining.length })
  }),

  verify: asyncHandler(async (req, res) => {
    const { tempToken, code } = req.body as { tempToken?: unknown; code?: unknown }
    if (!isPendingToken(tempToken) || !isFactor(code)) {
      res.status(400).json({ error: 'tempToken and code required' }); return
    }

    const payload = verifyPendingToken(tempToken)
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    // Per-account guard across pending tokens, reserved up front (counts as a
    // failure until success clears it); locked means no code is checked.
    const lock = await reserveAttempt('crm-2fa', payload.sub)
    if (lock.locked) {
      res.locals.serviceLogMessage = 'CRM 2FA locked after repeated failures'
      sendLoginLocked(res, lock); return
    }

    const ttlSeconds = challengeTtlSeconds(payload)
    const user = await usersRepo.findAuthById(payload.sub)
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(401).json({ error: 'Unauthorized' }); return
    }
    // A replayed code (already used by this account in its window) is refused
    // like a wrong one.
    if (!await acceptTotp(user.id, code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    const challengeResult = await consumeTwoFactorChallenge(payload.jti, ttlSeconds)
    if (challengeResult === 'unavailable') {
      // The code was right; only the store failed. Release the attempt
      // reserved above, so retrying through an outage cannot lock the owner.
      await recordSuccess('crm-2fa', user.id)
      res.status(503).json({ error: 'Authentication service temporarily unavailable' }); return
    }
    if (challengeResult === 'already_used') {
      res.status(401).json({ error: 'Token has already been used' }); return
    }

    await recordSuccess('crm-2fa', user.id)
    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = 'CRM 2FA login succeeded'
    const token = signFullToken(user)
    await startRefreshSession(req, res, 'crm', user)
    res.json({ user: serializeUser(user), token })
  }),
}
