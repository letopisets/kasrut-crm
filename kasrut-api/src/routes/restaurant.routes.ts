import { Router } from 'express'
import { restaurantController } from '../controllers/restaurant.controller'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()
router.get('/',     authenticateJWT, restaurantController.list)
router.get('/:id',  authenticateJWT, restaurantController.getOne)
router.post('/',    authenticateJWT, requireRole('owner', 'rabbanut'), restaurantController.create)
router.patch('/:id',authenticateJWT, requireRole('owner', 'rabbanut'), restaurantController.update)
router.delete('/:id',authenticateJWT, requireRole('owner'),            restaurantController.remove)
export default router
