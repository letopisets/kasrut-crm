import { Router } from 'express'
import { rabbanutController } from '../controllers/rabbanut.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',            authenticateJWT, rabbanutController.list)
router.get('/:id',         authenticateJWT, rabbanutController.getOne)
router.post('/',           authenticateJWT, requireRole('owner'), rabbanutController.create)
router.patch('/:id',       authenticateJWT, requireRole('owner'), rabbanutController.update)
router.delete('/:id',      authenticateJWT, requireRole('owner'), rabbanutController.remove)
router.post('/:id/toggle', authenticateJWT, requireRole('owner'), rabbanutController.toggle)
export default router
