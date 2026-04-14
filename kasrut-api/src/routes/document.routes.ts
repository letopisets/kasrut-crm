import { Router } from 'express'
import { documentController } from '../controllers/document.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',     authenticateJWT, documentController.list)
router.get('/:id',  authenticateJWT, documentController.getOne)
router.post('/',    authenticateJWT, requireRole('owner', 'rabbanut'), documentController.create)
router.delete('/:id',authenticateJWT, requireRole('owner', 'rabbanut'), documentController.remove)
export default router
