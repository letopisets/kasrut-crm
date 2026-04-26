import { Router } from 'express'
import { mapAuthController } from '../controllers/mapAuth.controller'
import { authenticateMapJWT } from '../middleware/mapAuth'
import { rateLimit } from '../middleware/rateLimit'

const router = Router()
const authLimiter = rateLimit({ keyPrefix: 'map-auth', windowMs: 15 * 60 * 1000, max: 60 })
const resetLimiter = rateLimit({ keyPrefix: 'map-password-reset', windowMs: 60 * 60 * 1000, max: 10 })

router.get('/config', mapAuthController.config)
router.post('/register', authLimiter, mapAuthController.register)
router.post('/login', authLimiter, mapAuthController.login)
router.post('/oauth', authLimiter, mapAuthController.oauth)
router.post('/password-reset/request', resetLimiter, mapAuthController.requestPasswordReset)
router.post('/password-reset/confirm', resetLimiter, mapAuthController.confirmPasswordReset)
router.get('/me', authenticateMapJWT, mapAuthController.me)

export default router
