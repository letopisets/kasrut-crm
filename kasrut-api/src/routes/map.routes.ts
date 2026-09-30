
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

// Geocoding proxies to GovMap (up to 6 calls per address, a per-IP quota the
// whole server shares), LocationIQ (daily quota) and Nominatim (1 req/s
// app-wide); cap per IP so a scraper can't drain those budgets.
const geocodeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'map:geocode',
})
// Place search is search-as-you-type (one GovMap call per debounced keystroke),
// so it gets a looser cap of its own.
const placesRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyPrefix: 'map:places',
})
const mapReadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: 'map:read',
})
// Filter options, hechsher list and sitemap: one request per page load or
// crawl and normally a cache hit, but each one queries Postgres while Redis
// cannot be trusted with the map cache. A bucket of their own, so they never
// eat into mapReadRateLimit.
const mapMetaRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: 'map:meta',
})
const communityWriteRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  keyPrefix: 'map:community-write',
})

// Public — no auth required
// GET /api/map/restaurants?city=ירושלים&hechsher=בד"ץ העדה החרדית&foodType=meat,dairy
router.get('/sitemap.xml', mapMetaRateLimit, mapController.getSitemap)
router.get('/hechsherim', mapMetaRateLimit, mapController.listHechsherim)
router.get('/options', mapMetaRateLimit, mapController.listOptions)
router.get('/geo', mapController.getGeo)
router.get('/geocode', geocodeRateLimit, mapController.getGeocode)
router.get('/places', placesRateLimit, mapController.getPlaces)
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
