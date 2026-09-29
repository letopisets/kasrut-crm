import qrcode from 'qrcode'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { usersRepo } from '../db/users.repo'
import { env } from '../config/env'
import { serializeUser } from '../serializers/user.serializer'
import { signFullToken } from './auth.controller'
import { asyncHandler } from '../lib/asyncHandler'
import { checkTotpAttempt } from '../lib/twoFactorAttempts'
import { consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'

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
    verifySync:     (opts: { token: string; secret: string }) => { valid: boolean }
    generateURI:    (opts: { strategy: string; issuer: string; label: string; secret: string }) => string
  }

const APP_NAME = 'KashrutCRM'

function verifyCode(code: string, secret: string): boolean {
  try {
    return verifySync({ token: code, secret }).valid === true
  } catch { return false }
}

interface PendingTwoFactorPayload {
  sub: string
  typ: '2fa_pending'
  jti: string
  exp: number
}

async function verifyPendingToken(token: string): Promise<PendingTwoFactorPayload | null> {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    if (typeof payload === 'string') return null
    if (
      payload.typ !== '2fa_pending' ||
      typeof payload.sub !== 'string' || !payload.sub ||
      typeof payload.jti !== 'string' || !payload.jti ||
      typeof payload.exp !== 'number'
    ) return null
    if (await isTokenBlacklisted(payload.jti)) return null
    return {
      sub: payload.sub,
      typ: '2fa_pending',
      jti: payload.jti,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}

function challengeTtlSeconds(payload: PendingTwoFactorPayload): number {
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
    if (!await usersRepo.verifyPassword(user, password)) {
      res.status(401).json({ error: 'Invalid credentials' }); return
    }
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

    const { code } = req.body as { code?: string }
    if (!code) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user?.twoFactorSecret) { res.status(400).json({ error: 'Call /2fa/setup first' }); return }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

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
    res.locals.serviceLogMessage = '2FA enabled'
    res.json({ user: serializeUser(updated), token: signFullToken(updated), backupCodes: plainCodes })
  }),

  disable: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { code } = req.body as { code?: string }
    if (!code) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findAuthById(req.user.sub)
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA is not enabled' }); return
    }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    const updated = await usersRepo.disableTwoFactor(req.user.sub)
    if (!updated) { res.status(409).json({ error: '2FA state changed' }); return }
    res.locals.serviceLogMessage = '2FA disabled'
    res.json({ user: serializeUser(updated), token: signFullToken(updated) })
  }),

  verifyBackup: asyncHandler(async (req, res) => {
    const { tempToken, backupCode } = req.body as { tempToken?: string; backupCode?: string }
    if (!tempToken || !backupCode) {
      res.status(400).json({ error: 'tempToken and backupCode required' }); return
    }

    const payload = await verifyPendingToken(tempToken)
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    const ttlSeconds = challengeTtlSeconds(payload)
    const allowed = await checkTotpAttempt(payload.jti, ttlSeconds)
    if (!allowed) {
      res.status(429).json({ error: 'Too many attempts' }); return
    }

    const user = await usersRepo.findAuthById(payload.sub)
    if (!user || !user.twoFactorEnabled) { res.status(401).json({ error: 'Unauthorized' }); return }

    const normalised = backupCode.trim().toUpperCase()
    const matchIndex = await findBackupCodeIndex(normalised, user.twoFactorBackupCodes)
    if (matchIndex === -1) { res.status(400).json({ error: 'Invalid backup code' }); return }

    const challengeResult = await consumeTwoFactorChallenge(payload.jti, ttlSeconds)
    if (challengeResult === 'unavailable') {
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

    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = `CRM backup-code login succeeded; remaining=${remaining.length}`
    const token = signFullToken(user)
    res.json({ user: serializeUser(user), token, backupCodesRemaining: remaining.length })
  }),

  verify: asyncHandler(async (req, res) => {
    const { tempToken, code } = req.body as { tempToken?: string; code?: string }
    if (!tempToken || !code) { res.status(400).json({ error: 'tempToken and code required' }); return }

    const payload = await verifyPendingToken(tempToken)
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    // Per-token brute-force guard: max 5 attempts per tempToken JTI.
    // TTL matches the token's remaining lifetime so the counter self-expires.
    const ttlSeconds = challengeTtlSeconds(payload)
    const allowed = await checkTotpAttempt(payload.jti, ttlSeconds)
    if (!allowed) {
      res.status(429).json({ error: 'Too many attempts' }); return
    }

    const user = await usersRepo.findAuthById(payload.sub)
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(401).json({ error: 'Unauthorized' }); return
    }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    const challengeResult = await consumeTwoFactorChallenge(payload.jti, ttlSeconds)
    if (challengeResult === 'unavailable') {
      res.status(503).json({ error: 'Authentication service temporarily unavailable' }); return
    }
    if (challengeResult === 'already_used') {
      res.status(401).json({ error: 'Token has already been used' }); return
    }

    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = 'CRM 2FA login succeeded'
    const token = signFullToken(user)
    res.json({ user: serializeUser(user), token })
  }),
}
