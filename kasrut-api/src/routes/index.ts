import { Router } from 'express'
import authRoutes       from './auth.routes'
import restaurantRoutes from './restaurant.routes'
import inspectionRoutes from './inspection.routes'
import mashgiachRoutes  from './mashgiach.routes'
import hechsherRoutes   from './hechsher.routes'
import rabbanutRoutes   from './rabbanut.routes'
import documentRoutes   from './document.routes'
import userRoutes       from './user.routes'

const router = Router()
router.use('/auth',        authRoutes)
router.use('/restaurants', restaurantRoutes)
router.use('/inspections', inspectionRoutes)
router.use('/mashgichim',  mashgiachRoutes)
router.use('/hechsherim',  hechsherRoutes)
router.use('/rabbanuts',   rabbanutRoutes)
router.use('/documents',   documentRoutes)
router.use('/users',       userRoutes)
export default router
