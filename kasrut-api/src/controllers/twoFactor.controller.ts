import type { Request, Response, NextFunction } from 'express'
import qrcode from 'qrcode'
import jwt from 'jsonwebtoken'
import { usersRepo } from '../db/users.repo'
import { env } from '../config/env'
import { serializeUser } from '../serializers/user.serializer'

// otplib v13 API — synchronous helpers
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
    const result = verifySync({ token: code, secret })
    return result.valid === true
  } catch { return false }
}

export const twoFactorController = {
  // Step 1 — generate secret + QR code (requires auth)
  async setup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const secret   = generateSecret()
      const otpauth  = generateURI({ strategy: 'totp', issuer: APP_NAME, label: req.user.email, secret })
      const qrDataUrl = await qrcode.toDataURL(otpauth)

      await usersRepo.setTwoFactorSecret(req.user.sub, secret)

      res.json({ secret, qrDataUrl })
    } catch (e) { next(e) }
  },

  // Step 2 — verify first TOTP code and activate 2FA
  async enable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const { code } = req.body as { code?: string }
      if (!code) { res.status(400).json({ error: 'Code required' }); return }

      const user = await usersRepo.findById(req.user.sub)
      if (!user?.twoFactorSecret) {
        res.status(400).json({ error: 'Call /2fa/setup first' }); return
      }
      if (!verifyCode(code, user.twoFactorSecret)) {
        res.status(400).json({ error: 'Invalid code' }); return
      }

      const updated = await usersRepo.enableTwoFactor(req.user.sub)
      res.json({ user: serializeUser(updated!) })
    } catch (e) { next(e) }
  },

  // Disable 2FA
  async disable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const { code } = req.body as { code?: string }
      if (!code) { res.status(400).json({ error: 'Code required' }); return }

      const user = await usersRepo.findById(req.user.sub)
      if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
        res.status(400).json({ error: '2FA is not enabled' }); return
      }
      if (!verifyCode(code, user.twoFactorSecret)) {
        res.status(400).json({ error: 'Invalid code' }); return
      }

      const updated = await usersRepo.disableTwoFactor(req.user.sub)
      res.json({ user: serializeUser(updated!) })
    } catch (e) { next(e) }
  },

  // Called after password login when 2FA is enabled — verifies TOTP and issues full JWT
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tempToken, code } = req.body as { tempToken?: string; code?: string }
      if (!tempToken || !code) {
        res.status(400).json({ error: 'tempToken and code required' }); return
      }

      let payload: { sub: string }
      try {
        payload = jwt.verify(tempToken, env.JWT_SECRET) as { sub: string }
      } catch {
        res.status(401).json({ error: 'Invalid or expired token' }); return
      }

      const user = await usersRepo.findById(payload.sub)
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        res.status(401).json({ error: 'Unauthorized' }); return
      }
      if (!verifyCode(code, user.twoFactorSecret)) {
        res.status(400).json({ error: 'Invalid code' }); return
      }

      const fullPayload = {
        sub:  user.id,   role:  user.role,
        name: user.name, email: user.email,
        ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
      }
      const token = jwt.sign(fullPayload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as object)
      res.json({ user: serializeUser(user), token })
    } catch (e) { next(e) }
  },
}
