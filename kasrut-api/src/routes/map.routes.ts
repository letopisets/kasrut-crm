import { Router } from 'express'
import { mapController } from '../controllers/map.controller'

const router = Router()

// Public — no auth required
// GET /api/map/restaurants?city=Jerusalem&kashrutLevel=mehadrin,badatz&foodType=meat,dairy
router.get('/restaurants', mapController.listRestaurants)

export default router
