import { Router } from 'express'
import { mapAuthController } from '../controllers/mapAuth.controller'
import { authenticateMapJWT } from '../middleware/mapAuth'
import { rateLimit } from '../middleware/rateLimit'
import { requireRefreshRequest, requireSessionStartRequest } from '../lib/refreshTokens'

const router = Router()
const authLimiter = rateLimit({ keyPrefix: 'map-auth', windowMs: 15 * 60 * 1000, max: 60 })
const resetLimiter = rateLimit({ keyPrefix: 'map-password-reset', windowMs: 60 * 60 * 1000, max: 10 })
// Signed-in visitors refresh on every page load, plus once per access-token
// lifetime; many of them can share one mobile-carrier address.
const refreshLimiter = rateLimit({ keyPrefix: 'map-refresh', windowMs: 15 * 60 * 1000, max: 120 })

// The calls that set the refresh cookie without an access token refuse
// cross-origin and form requests (requireSessionStartRequest,
// requireRefreshRequest).
router.get('/config', mapAuthController.config)
router.post('/register', authLimiter, requireSessionStartRequest, mapAuthController.register)
router.post('/login', authLimiter, requireSessionStartRequest, mapAuthController.login)
router.post('/oauth', authLimiter, requireSessionStartRequest, mapAuthController.oauth)
router.post('/password-reset/request', resetLimiter, mapAuthController.requestPasswordReset)
router.post('/password-reset/confirm', resetLimiter, requireSessionStartRequest, mapAuthController.confirmPasswordReset)
router.post('/refresh', refreshLimiter, requireRefreshRequest, mapAuthController.refresh)   // refresh cookie → new access token
router.get('/me', authenticateMapJWT, mapAuthController.me)
router.post('/logout', authenticateMapJWT, mapAuthController.logout)

export default router
