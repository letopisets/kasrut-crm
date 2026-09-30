import type { Request } from 'express'
import { z } from 'zod'
import {
  mapCommunityRepo,
  type ReviewCursor,
  type ReviewModerationScope,
} from '../db/mapCommunity.repo'
import {
  serializeMapReview,
  serializeMapReviewsPayload,
  serializeModeratedReview,
} from '../serializers/mapCommunity.serializer'
import { asyncHandler } from '../lib/asyncHandler'
import { ForbiddenScopeError, resolveScopeRabbanutId } from '../lib/rabbanutScope'
import { ENTITY_ID_RE, isEntityId } from '../lib/entityId'

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional().nullable(),
})

const REVIEWS_DEFAULT_LIMIT = 20
const REVIEWS_MAX_LIMIT = 50

// Plain decimal digits only: `z.coerce.number()` would also take '1e1',
// ' 5' or '0x10', and an array (?limit=1&limit=2) must not slip through.
const listQuerySchema = z.object({
  limit: z.string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(REVIEWS_MAX_LIMIT))
    .optional(),
  cursor: z.string().min(1).max(256).optional(),
})

// Checking the id shape keeps a NUL byte or an array
// (?restaurantId=a&restaurantId=b) from reaching Postgres as a 500.
const moderationListQuerySchema = listQuerySchema.extend({
  restaurantId: z.string().regex(ENTITY_ID_RE).optional(),
})

// The public review routes take the restaurant id from the path. One that
// cannot exist 404s like the map's own by-id reads, before any query.
function publicRestaurantId(req: Request): string | null {
  return isEntityId(req.params.restaurantId) ? req.params.restaurantId : null
}

function listQueryError(issues: z.ZodIssue[]): string {
  const bad = (field: string) => issues.some(issue => issue.path[0] === field)
  if (bad('limit')) return `limit must be an integer between 1 and ${REVIEWS_MAX_LIMIT}`
  if (bad('restaurantId')) return 'Invalid restaurantId'
  return 'Invalid cursor'
}

// requireRole already admits only owner / rabbanut; this repeats it so the
// handler can never run unscoped, and resolveScopeRabbanutId fails closed for
// a rabbanut account without a tenant.
function moderationScope(req: Request): ReviewModerationScope {
  const reviewerRole = req.user?.role
  if (reviewerRole !== 'owner' && reviewerRole !== 'rabbanut') throw new ForbiddenScopeError()
  return { reviewerRole, reviewerRabbanutId: resolveScopeRabbanutId(req) }
}

// Only what encodeReviewCursor emits: toISOString() output and a cuid-charset
// id. Anything looser can pass here yet be refused by Postgres (a year-0000
// timestamp, a NUL byte in the id) and surface as a 500 instead of a 400.
const cursorPayloadSchema = z.object({
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  id: z.string().regex(ENTITY_ID_RE),
}).strict()

// The cursor is opaque to clients: base64url(JSON {createdAt, id}) of the last
// review on the previous page.
export function encodeReviewCursor(cursor: ReviewCursor): string {
  return Buffer
    .from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8')
    .toString('base64url')
}

export function decodeReviewCursor(raw: string): ReviewCursor | null {
  // Buffer.from(…, 'base64url') silently skips invalid characters, so the
  // alphabet is checked up front — a mangled cursor must 400, not half-decode.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const parsed = cursorPayloadSchema.safeParse(decoded)
  if (!parsed.success) return null
  const createdAt = new Date(parsed.data.createdAt)
  // The round-trip rejects impossible dates (2026-02-30); Postgres has no
  // year 0, so anything before 1970 is refused too — no review is that old.
  if (Number.isNaN(createdAt.getTime())) return null
  if (createdAt.toISOString() !== parsed.data.createdAt) return null
  if (createdAt.getUTCFullYear() < 1970) return null
  return { createdAt, id: parsed.data.id }
}

export const mapReviewController = {
  listReviews: asyncHandler(async (req, res) => {
    const restaurantId = publicRestaurantId(req)
    if (!restaurantId) { res.status(404).json({ error: 'Restaurant not found' }); return }

    const query = listQuerySchema.safeParse({ limit: req.query.limit, cursor: req.query.cursor })
    if (!query.success) { res.status(400).json({ error: listQueryError(query.error.issues) }); return }
    const cursor = query.data.cursor ? decodeReviewCursor(query.data.cursor) : null
    if (query.data.cursor && !cursor) { res.status(400).json({ error: 'Invalid cursor' }); return }

    const exists = await mapCommunityRepo.restaurantExists(restaurantId)
    if (!exists) { res.status(404).json({ error: 'Restaurant not found' }); return }
    const payload = await mapCommunityRepo.listReviews(restaurantId, {
      limit: query.data.limit ?? REVIEWS_DEFAULT_LIMIT,
      cursor,
    })
    res.json(serializeMapReviewsPayload(
      payload,
      payload.nextCursor ? encodeReviewCursor(payload.nextCursor) : null,
    ))
  }),

  // The signed-in user's own review, wherever it falls in the paginated list,
  // so the form can prefill it. Kept off the public list endpoint so that one
  // stays anonymous.
  getOwnReview: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const restaurantId = publicRestaurantId(req)
    if (!restaurantId) { res.status(404).json({ error: 'Restaurant not found' }); return }
    const exists = await mapCommunityRepo.restaurantExists(restaurantId)
    if (!exists) { res.status(404).json({ error: 'Restaurant not found' }); return }
    const review = await mapCommunityRepo.findOwnReview(req.mapUser.sub, restaurantId)
    res.json({ review: review ? serializeMapReview(review) : null })
  }),

  upsertReview: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const restaurantId = publicRestaurantId(req)
    if (!restaurantId) { res.status(404).json({ error: 'Restaurant not found' }); return }

    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'rating must be between 1 and 5' }); return }

    const review = await mapCommunityRepo.upsertReview(req.mapUser.sub, restaurantId, parsed.data)
    if (!review) { res.status(404).json({ error: 'Restaurant not found' }); return }
    res.json(serializeMapReview(review))
  }),

  // ── CRM moderation (owner / rabbanut) ─────────────────────────────────────

  listReviewsForModeration: asyncHandler(async (req, res) => {
    const scope = moderationScope(req)

    const query = moderationListQuerySchema.safeParse({
      limit: req.query.limit,
      cursor: req.query.cursor,
      restaurantId: req.query.restaurantId,
    })
    if (!query.success) { res.status(400).json({ error: listQueryError(query.error.issues) }); return }
    const cursor = query.data.cursor ? decodeReviewCursor(query.data.cursor) : null
    if (query.data.cursor && !cursor) { res.status(400).json({ error: 'Invalid cursor' }); return }

    const page = await mapCommunityRepo.listReviewsForModeration(scope, {
      limit: query.data.limit ?? REVIEWS_DEFAULT_LIMIT,
      cursor,
      restaurantId: query.data.restaurantId,
    })
    res.json({
      reviews: page.reviews.map(serializeModeratedReview),
      nextCursor: page.nextCursor ? encodeReviewCursor(page.nextCursor) : null,
    })
  }),

  deleteReview: asyncHandler(async (req, res) => {
    const scope = moderationScope(req)

    const id = req.params.id
    // Out of scope, already gone and malformed all read the same, so a
    // rabbanut cannot probe which review ids exist in other tenants.
    const deleted = isEntityId(id)
      ? await mapCommunityRepo.deleteReviewForModeration(id, scope)
      : null
    if (!deleted) { res.status(404).json({ error: 'Review not found' }); return }

    res.locals.serviceLogMessage =
      `Deleted map review ${deleted.id} (restaurant ${deleted.restaurantId}, ` +
      `author ${deleted.mapUserId}, rating ${deleted.rating})`
    // Nothing server-side to invalidate: the public review list and its rating
    // summary are read from the database on every request (no Redis key, no
    // Cache-Control, no nginx cache), and no cached map payload (map:* /
    // restaurants:* keys, prerender, sitemap) carries a rating. Flushing the
    // map namespace here would only cost every map visitor a cold cache.
    res.status(204).end()
  }),
}
