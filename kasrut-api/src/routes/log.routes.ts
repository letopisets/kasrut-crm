import { Router } from 'express'
import { logController } from '../controllers/log.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()

router.get('/', authenticateJWT, requireRole('owner'), logController.list)

export default router
