import { Router } from 'express'
import { mashgiachController } from '../controllers/mashgiach.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',            authenticateJWT, mashgiachController.list)
router.get('/:id',         authenticateJWT, mashgiachController.getOne)
router.post('/',           authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.create)
router.patch('/:id',       authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.update)
router.delete('/:id',      authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.remove)
router.post('/:id/toggle', authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.toggle)
router.post('/:id/assign', authenticateJWT, requireRole('owner', 'rabbanut'), mashgiachController.assign)
export default router
