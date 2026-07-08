
import { Router } from 'express'
import { mapController } from '../controllers/map.controller'
import { mapRouteController } from '../controllers/mapRoute.controller'
import { mapSuggestionController } from '../controllers/mapSuggestion.controller'
import { mapReviewController } from '../controllers/mapReview.controller'
import { authenticateMapJWT } from '../middleware/mapAuth'
import { authenticateJWT } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { rateLimit } from '../middleware/rateLimit'

const router = Router()

// /route proxies to an external OSRM instance — every request costs us a
// pending fetch + a Redis cache write. Cap it per IP so a runaway client
// (or a scraper) can't drain the upstream budget or pile up sockets.
const routeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'map:route',
})

// Public — no auth required
// GET /api/map/restaurants?city=ירושלים&hechsher=בד"ץ העדה החרדית&foodType=meat,dairy
router.get('/hechsherim', mapController.listHechsherim)
router.get('/options', mapController.listOptions)
router.get('/geo', mapController.getGeo)
router.get('/route', routeRateLimit, mapRouteController.getRoute)
router.get('/restaurants', mapController.listRestaurants)
router.get('/restaurants/:restaurantId', mapController.getRestaurant)
router.get('/restaurants/:restaurantId/reviews', mapReviewController.listReviews)

// Community actions — public users authenticated via Google/Apple
router.post('/suggestions', authenticateMapJWT, mapSuggestionController.createSuggestion)
router.post('/restaurants/:restaurantId/reviews', authenticateMapJWT, mapReviewController.upsertReview)

// Moderation — CRM users (owner / rabbanut) only
router.get('/suggestions',           authenticateJWT, requireRole('owner', 'rabbanut'), mapSuggestionController.listSuggestions)
router.post('/suggestions/:id/review', authenticateJWT, requireRole('owner', 'rabbanut'), mapSuggestionController.reviewSuggestion)

export default router
