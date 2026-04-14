import { Router } from 'express'
import { userController } from '../controllers/user.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',     authenticateJWT, requireRole('owner'), userController.list)
router.get('/:id',  authenticateJWT, requireRole('owner'), userController.getOne)
router.post('/',    authenticateJWT, requireRole('owner'), userController.create)
router.patch('/:id',authenticateJWT, requireRole('owner'), userController.update)
router.delete('/:id',authenticateJWT, requireRole('owner'), userController.remove)
export default router
