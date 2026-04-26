import { Router } from 'express'
import { authController }      from '../controllers/auth.controller'
import { twoFactorController } from '../controllers/twoFactor.controller'
import { authenticateJWT }     from '../middleware/auth'
import { rateLimit }           from '../middleware/rateLimit'

const router = Router()
const authLimiter = rateLimit({ keyPrefix: 'crm-auth', windowMs: 15 * 60 * 1000, max: 60 })
const twoFactorLimiter = rateLimit({ keyPrefix: 'crm-2fa', windowMs: 15 * 60 * 1000, max: 30 })

// Standard auth
router.post('/login',  authLimiter, authController.login)
router.get('/me',      authenticateJWT, authController.me)
router.post('/logout', authenticateJWT, authController.logout)

// Two-factor authentication
router.post('/2fa/setup',   authenticateJWT, twoFactorController.setup)   // generate secret + QR
router.post('/2fa/enable',  authenticateJWT, twoFactorController.enable)  // verify first code → activate
router.post('/2fa/disable', authenticateJWT, twoFactorController.disable) // verify code → deactivate
router.post('/2fa/verify',  twoFactorLimiter, twoFactorController.verify)  // verify at login (public)

export default router
