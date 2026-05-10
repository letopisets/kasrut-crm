import qrcode from 'qrcode'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { usersRepo } from '../db/users.repo'
import { env } from '../config/env'
import { serializeUser } from '../serializers/user.serializer'
import { signFullToken } from './auth.controller'
import { asyncHandler } from '../lib/asyncHandler'

const BACKUP_CODE_COUNT = 8
const BACKUP_CODE_BYTES = 5

function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase(),
  )
}

function hashBackupCodes(codes: string[]): string[] {
  return codes.map(c => bcrypt.hashSync(c, 10))
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

export const twoFactorController = {
  setup: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const secret    = generateSecret()
    const otpauth   = generateURI({ strategy: 'totp', issuer: APP_NAME, label: req.user.email, secret })
    const qrDataUrl = await qrcode.toDataURL(otpauth)

    await usersRepo.setTwoFactorSecret(req.user.sub, secret)
    res.json({ secret, qrDataUrl })
  }),

  enable: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { code } = req.body as { code?: string }
    if (!code) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findById(req.user.sub)
    if (!user?.twoFactorSecret) { res.status(400).json({ error: 'Call /2fa/setup first' }); return }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    const plainCodes  = generateBackupCodes()
    const hashedCodes = hashBackupCodes(plainCodes)
    await usersRepo.setBackupCodes(req.user.sub, hashedCodes)
    const updated = await usersRepo.enableTwoFactor(req.user.sub)
    res.locals.serviceLogMessage = '2FA enabled'
    res.json({ user: serializeUser(updated!), backupCodes: plainCodes })
  }),

  disable: asyncHandler(async (req, res) => {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

    const { code } = req.body as { code?: string }
    if (!code) { res.status(400).json({ error: 'Code required' }); return }

    const user = await usersRepo.findById(req.user.sub)
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA is not enabled' }); return
    }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    const updated = await usersRepo.disableTwoFactor(req.user.sub)
    res.locals.serviceLogMessage = '2FA disabled'
    res.json({ user: serializeUser(updated!) })
  }),

  verifyBackup: asyncHandler(async (req, res) => {
    const { tempToken, backupCode } = req.body as { tempToken?: string; backupCode?: string }
    if (!tempToken || !backupCode) {
      res.status(400).json({ error: 'tempToken and backupCode required' }); return
    }

    let payload: { sub: string }
    try {
      payload = jwt.verify(tempToken, env.JWT_SECRET) as { sub: string }
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    const user = await usersRepo.findById(payload.sub)
    if (!user || !user.twoFactorEnabled) { res.status(401).json({ error: 'Unauthorized' }); return }

    const normalised = backupCode.trim().toUpperCase()
    const matchIndex = user.twoFactorBackupCodes.findIndex(h => bcrypt.compareSync(normalised, h))
    if (matchIndex === -1) { res.status(400).json({ error: 'Invalid backup code' }); return }

    const remaining = user.twoFactorBackupCodes.filter((_, i) => i !== matchIndex)
    await usersRepo.consumeBackupCode(user.id, remaining)

    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = `CRM backup-code login succeeded; remaining=${remaining.length}`
    const token = signFullToken(user)
    res.json({ user: serializeUser(user), token, backupCodesRemaining: remaining.length })
  }),

  verify: asyncHandler(async (req, res) => {
    const { tempToken, code } = req.body as { tempToken?: string; code?: string }
    if (!tempToken || !code) { res.status(400).json({ error: 'tempToken and code required' }); return }

    let payload: { sub: string; jti?: string }
    try {
      payload = jwt.verify(tempToken, env.JWT_SECRET) as { sub: string; jti?: string }
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }

    const user = await usersRepo.findById(payload.sub)
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(401).json({ error: 'Unauthorized' }); return
    }
    if (!verifyCode(code, user.twoFactorSecret)) { res.status(400).json({ error: 'Invalid code' }); return }

    res.locals.serviceLogActor = { userId: user.id, userEmail: user.email, userRole: user.role, actorType: 'crm_user' }
    res.locals.serviceLogMessage = 'CRM 2FA login succeeded'
    const token = signFullToken(user)
    res.json({ user: serializeUser(user), token })
  }),
}
