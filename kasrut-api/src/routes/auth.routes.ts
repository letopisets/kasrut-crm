import { Router } from 'express'
import { authController }      from '../controllers/auth.controller'
import { twoFactorController } from '../controllers/twoFactor.controller'
import { authenticateJWT }     from '../middleware/auth'
import { rateLimit }           from '../middleware/rateLimit'
import { bearerOrRefreshRequest, requireRefreshRequest, requireSessionStartRequest } from '../lib/refreshTokens'

const router = Router()
const authLimiter = rateLimit({ keyPrefix: 'crm-auth', windowMs: 15 * 60 * 1000, max: 60 })
const twoFactorLimiter = rateLimit({ keyPrefix: 'crm-2fa', windowMs: 15 * 60 * 1000, max: 30 })
// Every CRM page load refreshes once, plus once per access-token lifetime.
const refreshLimiter = rateLimit({ keyPrefix: 'crm-refresh', windowMs: 15 * 60 * 1000, max: 120 })

// The calls that set the refresh cookie without an access token refuse
// cross-origin and form requests (requireSessionStartRequest,
// requireRefreshRequest). 2FA enable/disable also set it, but need the bearer
// token, which no other site can send.

// Standard auth
router.post('/login',   authLimiter, requireSessionStartRequest, authController.login)
router.post('/refresh', refreshLimiter, requireRefreshRequest, authController.refresh)   // refresh cookie → new access token
router.get('/me',       authenticateJWT, authController.me)
router.post('/logout',  bearerOrRefreshRequest(authenticateJWT), authController.logout) // access token, or the refresh cookie alone

// Two-factor authentication
router.post('/2fa/setup',   twoFactorLimiter, authenticateJWT, twoFactorController.setup)   // re-auth + QR
router.post('/2fa/enable',  twoFactorLimiter, authenticateJWT, twoFactorController.enable)  // verify first code → activate
router.post('/2fa/disable', twoFactorLimiter, authenticateJWT, twoFactorController.disable) // verify code → deactivate
router.post('/2fa/verify',         twoFactorLimiter, requireSessionStartRequest, twoFactorController.verify)        // verify TOTP at login (public)
router.post('/2fa/verify-backup',  twoFactorLimiter, requireSessionStartRequest, twoFactorController.verifyBackup)  // backup code at login (public)

export default router
