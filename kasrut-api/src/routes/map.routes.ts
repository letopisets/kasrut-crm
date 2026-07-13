
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

// Geocoding proxies to Nominatim (rate-limited to 1 req/s app-wide); cap per IP
// so a scraper can't drain that budget.
const geocodeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'map:geocode',
})
const mapReadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: 'map:read',
})
const communityWriteRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  keyPrefix: 'map:community-write',
})

// Public — no auth required
// GET /api/map/restaurants?city=ירושלים&hechsher=בד"ץ העדה החרדית&foodType=meat,dairy
router.get('/sitemap.xml', mapController.getSitemap)
router.get('/hechsherim', mapController.listHechsherim)
router.get('/options', mapController.listOptions)
router.get('/geo', mapController.getGeo)
router.get('/geocode', geocodeRateLimit, mapController.getGeocode)
router.get('/route', routeRateLimit, mapRouteController.getRoute)
router.get('/restaurants', mapReadRateLimit, mapController.listRestaurants)
router.get('/restaurants/:restaurantId', mapReadRateLimit, mapController.getRestaurant)
router.get('/prerender/:restaurantId', mapReadRateLimit, mapController.getRestaurantPrerender)
router.get('/restaurants/:restaurantId/reviews', mapReadRateLimit, mapReviewController.listReviews)

// Community actions — public users authenticated via Google/Apple
router.post('/suggestions', communityWriteRateLimit, authenticateMapJWT, mapSuggestionController.createSuggestion)
router.post('/restaurants/:restaurantId/reviews', communityWriteRateLimit, authenticateMapJWT, mapReviewController.upsertReview)

// Moderation — CRM users (owner / rabbanut) only
router.get('/suggestions',           authenticateJWT, requireRole('owner', 'rabbanut'), mapSuggestionController.listSuggestions)
router.post('/suggestions/:id/review', authenticateJWT, requireRole('owner', 'rabbanut'), mapSuggestionController.reviewSuggestion)

export default router
