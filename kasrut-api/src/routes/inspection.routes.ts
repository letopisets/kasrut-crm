import { Router } from 'express'
import { inspectionController } from '../controllers/inspection.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',     authenticateJWT, inspectionController.list)
router.get('/:id',  authenticateJWT, inspectionController.getOne)
router.post('/',    authenticateJWT, requireRole('owner', 'rabbanut'), inspectionController.create)
router.patch('/:id',authenticateJWT, requireRole('owner', 'rabbanut', 'mashgiach'), inspectionController.update)
router.delete('/:id',authenticateJWT, requireRole('owner', 'rabbanut'), inspectionController.remove)
export default router
