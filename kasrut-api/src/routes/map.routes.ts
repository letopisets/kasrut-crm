import { Router } from 'express'
import { mapController } from '../controllers/map.controller'
import { authenticateMapJWT } from '../middleware/mapAuth'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'

const router = Router()

// Public — no auth required
// GET /api/map/restaurants?city=ירושלים&hechsher=בד"ץ העדה החרדית&foodType=meat,dairy
router.get('/hechsherim', mapController.listHechsherim)
router.get('/options', mapController.listOptions)
router.get('/route', mapController.getRoute)
router.get('/restaurants', mapController.listRestaurants)
router.get('/restaurants/:restaurantId/reviews', mapController.listReviews)

// Community actions — public users authenticated via Google/Apple
router.post('/suggestions', authenticateMapJWT, mapController.createSuggestion)
router.post('/restaurants/:restaurantId/reviews', authenticateMapJWT, mapController.upsertReview)

// Moderation — CRM users (owner / rabbanut) only
router.get('/suggestions',           authenticateJWT, requireRole('owner', 'rabbanut'), mapController.listSuggestions)
router.post('/suggestions/:id/review', authenticateJWT, requireRole('owner', 'rabbanut'), mapController.reviewSuggestion)

export default router
