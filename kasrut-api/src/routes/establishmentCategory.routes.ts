import { Router } from 'express'
import { authenticateJWT } from '../middleware/auth'
import { establishmentCategoryController as ctrl } from '../controllers/establishmentCategory.controller'

const router = Router()

router.get('/', authenticateJWT, ctrl.list)

export default router
