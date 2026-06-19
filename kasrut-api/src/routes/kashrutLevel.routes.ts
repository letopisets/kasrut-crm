import { Router } from 'express'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { kashrutLevelController as ctrl } from '../controllers/kashrutLevel.controller'

const router = Router()

router.get(   '/',    authenticateJWT,              ctrl.list)
router.get(   '/:id', authenticateJWT,              ctrl.getOne)
router.post(  '/',    authenticateJWT, requireRole('owner'), ctrl.create)
router.patch( '/:id', authenticateJWT, requireRole('owner'), ctrl.update)
router.delete('/:id', authenticateJWT, requireRole('owner'), ctrl.remove)

export default router
