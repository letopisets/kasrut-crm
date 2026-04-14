import { Router } from 'express'
import { hechsherController } from '../controllers/hechsher.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',     authenticateJWT, hechsherController.list)
router.get('/:id',  authenticateJWT, hechsherController.getOne)
router.post('/',    authenticateJWT, requireRole('owner', 'rabbanut'), hechsherController.create)
router.patch('/:id',authenticateJWT, requireRole('owner', 'rabbanut'), hechsherController.update)
router.delete('/:id',authenticateJWT, requireRole('owner'),            hechsherController.remove)
export default router
