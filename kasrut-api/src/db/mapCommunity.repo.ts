import { prisma } from '../lib/prisma'
import { assertPlausibleCoordinates, looksLikeIsraeliAddress } from '../lib/geoValidation'
import { geocodeAddressDetailed, isAddressLevel } from '../lib/nominatim'
import { ForbiddenScopeError } from '../lib/rabbanutScope'
import { publicRestaurantVisibilityWhere } from './map.repo'
import type { FoodType, MapPasswordResetChannel, MapSuggestionType, MapSuggestionStatus } from '../models/types'
import type {
  FoodType as PrismaFoodType,
  MapAuthProvider as PrismaMapAuthProvider,
  MapPasswordResetChannel as PrismaMapPasswordResetChannel,
  MapSuggestionType as PrismaMapSuggestionType,
  MapSuggestionStatus as PrismaMapSuggestionStatus,
  Prisma,
} from '../generated/prisma/client'
import type { OAuthProfile } from '../services/mapOAuth.service'

export interface MapUserRow {
  id: string
  email: string
  phone: string | null
  firstName: string | null
  lastName: string | null
  name: string
  avatarUrl: string | null
  sessionVersion: number
}

export interface MapAuthUserRow extends MapUserRow {
  passwordHash: string | null
}

export interface CreatePasswordUserInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  passwordHash: string
}

export interface CreateSuggestionInput {
  type: MapSuggestionType
  restaurantId?: string | null
  proposedName?: string | null
  proposedAddress?: string | null
  proposedCity?: string | null
  proposedHechsher?: string | null
  proposedKashrutStatus?: string | null
  proposedFoodType?: FoodType | null
  proposedCategory?: string | null   // EstablishmentCategory.slug
  proposedImageUrl?: string | null
  proposedLat?: number | null
  proposedLng?: number | null
  notes?: string | null
}

export interface CreateReviewInput {
  rating: number
  text?: string | null
}

// Keyset position of the last review on a page (see listReviews).
export interface ReviewCursor {
  createdAt: Date
  id: string
}

export interface ReviewPageInput {
  limit: number
  cursor?: ReviewCursor | null
}

const mapUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  name: true,
  avatarUrl: true,
  sessionVersion: true,
} as const

const mapAuthUserSelect = {
  ...mapUserSelect,
  passwordHash: true,
} as const

const COMMUNITY_HECHSHER_COLOR = '#E8A507'
const DEFAULT_ADD_FOOD_TYPE = 'pareve'

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function addDays(days: number): Date {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function makeShortName(name: string): string {
  return name.trim().slice(0, 20) || 'Community'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A server-geocoded point for a suggested address, and how far to trust it. */
interface SuggestedPoint {
  lat: number
  lng: number
  /** A house/building/named place (isAddressLevel) from a settled lookup —
   *  the same test scripts/regeocode.ts applies before it marks a row 'exact'
   *  (the prerender publishes 'exact' rows as schema.org geo). A street
   *  midpoint or an area moves the pin but stays 'approximate'. */
  exact: boolean
  /** False for a fallback point taken while GovMap was down: stored as
   *  'approximate' and unstamped, so the re-geocode job asks GovMap again. */
  settled: boolean
}

// Geocode a suggested address server-side, routing Israeli-looking addresses to
// an IL-restricted search (same region routing as the map SPA). Returns null on
// a miss or an implausible point — the caller then defers to the re-geocode job.
async function geocodeSuggestedAddress(address: string, city: string): Promise<SuggestedPoint | null> {
  if (!address.trim() && !city.trim()) return null
  const country = looksLikeIsraeliAddress(address, city) ? 'IL' : undefined
  const outcome = await geocodeAddressDetailed(address, city, country).catch(() => null)
  const point = outcome?.point
  if (!point) return null
  try {
    assertPlausibleCoordinates(point)
  } catch {
    return null
  }
  const settled = !(outcome.govmapTransient && point.provider !== 'govmap')
  return {
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
    exact: settled && isAddressLevel(point),
    settled,
  }
}

/** Restaurant coordinate fields for a server-geocoded point. */
function geocodedFields(p: SuggestedPoint) {
  return {
    lat: p.lat,
    lng: p.lng,
    geoAccuracy: p.exact ? 'exact' as const : 'approximate' as const,
    geocodeAttemptedAt: p.settled ? new Date() : null,
  }
}

// A client-proposed point (proposedLat/Lng) carries no accuracy: the map's
// "suggest a place" sends whatever /map/geocode answered — a house, a street
// midpoint or a fallback guess, it can't tell — and any API client can send a
// hand-placed pin. So at approval the address, which a new place always has,
// is re-geocoded server-side (usually a cache hit: the map asked for the same
// address) and that point wins, 'exact' only when isAddressLevel says so. Only
// when the server finds nothing is the proposed point kept, as 'approximate'
// and unstamped, so the prerender never publishes it and the re-geocode job
// retries the address.
const SAME_PIN_DEG = 0.00001   // ~1 m: the edit form echoes the stored pin back

function isSamePin(a: { lat: number | null; lng: number | null } | null, lat: number, lng: number): boolean {
  return !!a && isFiniteNumber(a.lat) && isFiniteNumber(a.lng)
    && Math.abs(a.lat - lat) < SAME_PIN_DEG && Math.abs(a.lng - lng) < SAME_PIN_DEG
}

function toCertStatus(value: string | null): 'ok' | 'warning' | 'critical' {
  const text = normalizeText(value ?? '')
  if (
    text.includes('no longer') ||
    text.includes('больше не') ||
    text.includes('כבר אינו')
  ) {
    return 'critical'
  }
  if (
    text.includes('review') ||
    text.includes('провер') ||
    text.includes('מצריכה')
  ) {
    return 'warning'
  }
  return 'ok'
}

function expiresForStatus(status: 'ok' | 'warning' | 'critical'): Date {
  if (status === 'critical') return addDays(-1)
  if (status === 'warning') return addDays(30)
  return addDays(365)
}

function hechsherTypeFromText(value: string | null): 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private' {
  const text = normalizeText(value ?? '')
  if (text.includes('badatz') || text.includes('בד')) return 'Badatz'
  if (text.includes('mehadrin') || text.includes('מהדרין')) return 'Mehadrin'
  if (text.includes('rabbanut') || text.includes('רבנות')) return 'Rabbanut'
  return 'Private'
}

async function resolveRabbanutId(
  tx: Prisma.TransactionClient,
  city: string,
  reviewerRabbanutId?: string | null,
): Promise<string> {
  if (reviewerRabbanutId) {
    const reviewerRabbanut = await tx.rabbanut.findUnique({
      where: { id: reviewerRabbanutId },
      select: { id: true },
    })
    if (reviewerRabbanut) return reviewerRabbanut.id
  }

  const cityRabbanut = await tx.rabbanut.findFirst({
    where: {
      active: true,
      city: { equals: city, mode: 'insensitive' },
    },
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  if (cityRabbanut) return cityRabbanut.id

  const activeRabbanut = await tx.rabbanut.findFirst({
    where: { active: true },
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  if (activeRabbanut) return activeRabbanut.id

  const anyRabbanut = await tx.rabbanut.findFirst({
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  if (anyRabbanut) return anyRabbanut.id

  throw new Error('Cannot approve suggestion: no rabbanut exists for the new restaurant')
}

async function resolveHechsher(
  tx: Prisma.TransactionClient,
  input: {
    name: string | null
    city: string
    kashrutStatus: string | null
    reviewerRabbanutId?: string | null
  },
): Promise<{ id: string; rabbanutId: string; type: string }> {
  const requestedName = input.name?.trim()
  if (requestedName) {
    const existing = await tx.hechsher.findFirst({
      where: {
        // Tenant reviewers must never resolve a same-named hechsher from a
        // peer rabbanut and thereby move a restaurant across tenants.
        ...(input.reviewerRabbanutId ? { rabbanutId: input.reviewerRabbanutId } : {}),
        OR: [
          { name: { equals: requestedName, mode: 'insensitive' } },
          { shortName: { equals: requestedName, mode: 'insensitive' } },
        ],
      },
      select: { id: true, rabbanutId: true, type: true },
      orderBy: { name: 'asc' },
    })
    if (existing) return existing
  }

  const rabbanutId = await resolveRabbanutId(tx, input.city, input.reviewerRabbanutId)
  const fallbackName = requestedName || `Community review ${input.city}`.trim()
  const existingFallback = await tx.hechsher.findFirst({
    where: {
      rabbanutId,
      name: { equals: fallbackName, mode: 'insensitive' },
    },
    select: { id: true, rabbanutId: true, type: true },
    orderBy: { name: 'asc' },
  })
  if (existingFallback) return existingFallback

  return tx.hechsher.create({
    data: {
      name: fallbackName,
      shortName: makeShortName(fallbackName),
      city: input.city,
      contact: '',
      phone: '',
      email: '',
      type: hechsherTypeFromText(requestedName || input.kashrutStatus),
      color: COMMUNITY_HECHSHER_COLOR,
      rabbanutId,
    },
    select: { id: true, rabbanutId: true, type: true },
  })
}

// Map hechsher type → canonical KashrutLevel.name. Decoupled from primary-key
// values so renaming or re-seeding kashrut_levels rows does not break this
// resolver.
const LEVEL_NAME_FOR_HECHSHER = {
  Badatz:   'Mehadrin',
  Mehadrin: 'Mehadrin',
  Rabbanut: 'Regular',
  Private:  'Regular',
} as const

const FALLBACK_LEVEL_NAME = 'Regular'

async function resolveCategoryId(tx: Prisma.TransactionClient, slug: string | null): Promise<string | null> {
  const trimmed = slug?.trim()
  if (!trimmed) return null
  const row = await tx.establishmentCategory.findUnique({ where: { slug: trimmed }, select: { id: true } })
  return row?.id ?? null
}

async function levelIdFromHechsher(tx: Prisma.TransactionClient, type: string): Promise<string> {
  const name =
    type in LEVEL_NAME_FOR_HECHSHER
      ? LEVEL_NAME_FOR_HECHSHER[type as keyof typeof LEVEL_NAME_FOR_HECHSHER]
      : FALLBACK_LEVEL_NAME
  const row = await tx.kashrutLevel.findUnique({ where: { name }, select: { id: true } })
  if (row) return row.id
  // Fallback: first level by sortOrder. Guarantees a working FK even if the
  // expected named row has been removed.
  const fallback = await tx.kashrutLevel.findFirst({ orderBy: { sortOrder: 'asc' }, select: { id: true } })
  if (!fallback) throw new Error('No KashrutLevel rows exist; cannot resolve levelId')
  return fallback.id
}

function communityNotes(notes: string | null): string {
  const suffix = notes?.trim()
  return suffix ? `Community suggestion: ${suffix}` : 'Community suggestion'
}

export const mapCommunityRepo = {
  async findUserById(id: string): Promise<MapUserRow | null> {
    return prisma.mapUser.findUnique({
      where: { id },
      select: mapUserSelect,
    })
  },

  async findAuthUserByEmail(email: string): Promise<MapAuthUserRow | null> {
    return prisma.mapUser.findUnique({
      where: { email },
      select: mapAuthUserSelect,
    })
  },

  async revokeUserSessions(id: string): Promise<boolean> {
    const result = await prisma.mapUser.updateMany({
      where: { id },
      data: { sessionVersion: { increment: 1 } },
    })
    return result.count === 1
  },

  async findUserByResetIdentifier(channel: MapPasswordResetChannel, identifier: string): Promise<MapUserRow | null> {
    return prisma.mapUser.findFirst({
      where: channel === 'email' ? { email: identifier } : { phone: identifier },
      select: mapUserSelect,
    })
  },

  async createPasswordUser(input: CreatePasswordUserInput): Promise<MapUserRow> {
    const name = `${input.firstName} ${input.lastName}`.trim()
    return prisma.mapUser.create({
      data: {
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        name,
        passwordHash: input.passwordHash,
      },
      select: mapUserSelect,
    })
  },

  async upsertUserFromIdentity(profile: OAuthProfile): Promise<MapUserRow> {
    return prisma.$transaction(async tx => {
      const provider = profile.provider as PrismaMapAuthProvider
      const existingIdentity = await tx.mapOAuthIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: profile.providerUserId,
          },
        },
        include: { mapUser: true },
      })

      if (existingIdentity) {
        return tx.mapUser.update({
          where: { id: existingIdentity.mapUserId },
          data: {
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? existingIdentity.mapUser.avatarUrl,
          },
          select: mapUserSelect,
        })
      }

      const userByEmail = await tx.mapUser.findUnique({ where: { email: profile.email } })
      if (userByEmail) {
        // The provider has cryptographically verified this email. Claim an
        // existing password-only row, but remove every pre-existing recovery
        // credential and revoke its sessions. This prevents both account
        // pre-hijacking (attacker keeps the password) and account-squatting DoS
        // (victim can never use OAuth because their email was pre-registered).
        await tx.mapPasswordResetToken.updateMany({
          where: { mapUserId: userByEmail.id, usedAt: null },
          data: { usedAt: new Date() },
        })
        return tx.mapUser.update({
          where: { id: userByEmail.id },
          data: {
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? userByEmail.avatarUrl,
            passwordHash: null,
            phone: null,
            sessionVersion: { increment: 1 },
            identities: {
              create: {
                provider,
                providerUserId: profile.providerUserId,
              },
            },
          },
          select: mapUserSelect,
        })
      }

      return tx.mapUser.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          identities: {
            create: {
              provider,
              providerUserId: profile.providerUserId,
            },
          },
        },
        select: mapUserSelect,
      })
    })
  },

  async createPasswordResetToken(input: {
    mapUserId: string
    channel: MapPasswordResetChannel
    tokenHash: string
    expiresAt: Date
  }) {
    return prisma.$transaction(async tx => {
      await tx.mapPasswordResetToken.updateMany({
        where: { mapUserId: input.mapUserId, usedAt: null },
        data: { usedAt: new Date() },
      })

      return tx.mapPasswordResetToken.create({
        data: {
          mapUserId: input.mapUserId,
          channel: input.channel as PrismaMapPasswordResetChannel,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      })
    }, { isolationLevel: 'Serializable' })
  },

  async hasValidPasswordResetToken(tokenHash: string): Promise<boolean> {
    const token = await prisma.mapPasswordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    return Boolean(token)
  },

  async consumePasswordResetToken(input: {
    tokenHash: string
    passwordHash: string
  }): Promise<MapUserRow | null> {
    return prisma.$transaction(async tx => {
      const now = new Date()
      const reset = await tx.mapPasswordResetToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: { id: true, mapUserId: true, usedAt: true, expiresAt: true },
      })
      if (!reset || reset.usedAt !== null || reset.expiresAt <= now) return null

      // Conditional claim closes the concurrent-use window: exactly one
      // transaction can move an unused, unexpired token to used.
      const claimed = await tx.mapPasswordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (claimed.count !== 1) return null

      return tx.mapUser.update({
        where: { id: reset.mapUserId },
        data: {
          passwordHash: input.passwordHash,
          sessionVersion: { increment: 1 },
        },
        select: mapUserSelect,
      })
    }, { isolationLevel: 'Serializable' })
  },

  async createSuggestionWithinQuota(
    mapUserId: string,
    input: CreateSuggestionInput,
    maxPending: number,
  ) {
    return prisma.$transaction(async tx => {
      // Serialize quota checks per map user. A plain COUNT followed by CREATE
      // lets parallel requests all observe the same count and exceed the cap.
      // The transaction-scoped advisory lock is released automatically.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`map-suggestion:${mapUserId}`}, 0))`

      const pending = await tx.mapRestaurantSuggestion.count({
        where: { mapUserId, status: 'pending' },
      })
      if (pending >= maxPending) return null

      return tx.mapRestaurantSuggestion.create({
        data: {
          mapUserId,
          type: input.type as PrismaMapSuggestionType,
          restaurantId: input.restaurantId || undefined,
          proposedName: input.proposedName || undefined,
          proposedAddress: input.proposedAddress || undefined,
          proposedCity: input.proposedCity || undefined,
          proposedHechsher: input.proposedHechsher || undefined,
          proposedKashrutStatus: input.proposedKashrutStatus || undefined,
          proposedFoodType: input.proposedFoodType ? input.proposedFoodType as PrismaFoodType : undefined,
          proposedCategory: input.proposedCategory || undefined,
          proposedImageUrl: input.proposedImageUrl || undefined,
          proposedLat: input.proposedLat ?? undefined,
          proposedLng: input.proposedLng ?? undefined,
          notes: input.notes || undefined,
        },
      })
    })
  },

  async listSuggestions(filter: {
    status?: MapSuggestionStatus
    reviewerRole: 'owner' | 'rabbanut'
    reviewerRabbanutId?: string
  }) {
    if (filter.reviewerRole === 'rabbanut' && !filter.reviewerRabbanutId) {
      throw new ForbiddenScopeError()
    }

    const where: Prisma.MapRestaurantSuggestionWhereInput = {
      ...(filter.status ? { status: filter.status as PrismaMapSuggestionStatus } : {}),
      ...(filter.reviewerRole === 'rabbanut'
        ? {
            // Add suggestions are deliberately owner-only. A rabbanut can
            // moderate only updates whose current target belongs to it.
            type: 'update' as PrismaMapSuggestionType,
            restaurant: { is: { rabbanutId: filter.reviewerRabbanutId! } },
          }
        : {}),
    }

    return prisma.mapRestaurantSuggestion.findMany({
      where,
      include: {
        mapUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async reviewSuggestion(id: string, data: {
    status: 'approved' | 'rejected'
    reviewerNote?: string | null
    reviewerRole: 'owner' | 'rabbanut'
    reviewerRabbanutId?: string | null
  }) {
    // Geocoding is a network call (GovMap ≤5 s, then LocationIQ / Nominatim up
    // to 8 s each) and must not hold the transaction open, so resolve
    // coordinates BEFORE the transaction. The
    // transaction re-reads the suggestion and re-checks status, so a racing
    // review at worst wastes this lookup.
    let resolvedPoint: SuggestedPoint | null = null
    let addressChanged = false
    let pinMoved = false
    let currentExact = false
    if (data.status === 'approved') {
      const peek = await prisma.mapRestaurantSuggestion.findUnique({
        where: { id },
        select: {
          status: true, type: true, restaurantId: true,
          proposedAddress: true, proposedCity: true, proposedLat: true, proposedLng: true,
        },
      })
      const hasPin = isFiniteNumber(peek?.proposedLat) && isFiniteNumber(peek?.proposedLng)
      if (peek?.status === 'pending') {
        if (peek.type === 'add') {
          // Always, even with a proposed point (see the rule above).
          resolvedPoint = await geocodeSuggestedAddress(peek.proposedAddress ?? '', peek.proposedCity ?? '')
        } else if (peek.type === 'update' && peek.restaurantId && (peek.proposedAddress || peek.proposedCity || hasPin)) {
          const current = await prisma.restaurant.findUnique({
            where: { id: peek.restaurantId },
            select: { address: true, city: true, lat: true, lng: true, geoAccuracy: true },
          })
          currentExact = current?.geoAccuracy === 'exact'
          const nextAddress = peek.proposedAddress ?? current?.address ?? ''
          const nextCity    = peek.proposedCity ?? current?.city ?? ''
          addressChanged = Boolean(current) && (nextAddress !== current!.address || nextCity !== current!.city)
          // The edit form sends the stored pin back; anything else is a moved pin.
          pinMoved = !addressChanged && Boolean(current) && hasPin
            && !isSamePin(current, peek.proposedLat as number, peek.proposedLng as number)
          if (addressChanged || pinMoved) resolvedPoint = await geocodeSuggestedAddress(nextAddress, nextCity)
        }
      }
    }

    return prisma.$transaction(async tx => {
      const suggestion = await tx.mapRestaurantSuggestion.findUnique({ where: { id } })
      if (!suggestion || suggestion.status !== 'pending') return null

      const reviewerRabbanutId = data.reviewerRole === 'rabbanut'
        ? data.reviewerRabbanutId
        : undefined

      if (data.reviewerRole === 'rabbanut') {
        if (!reviewerRabbanutId || suggestion.type !== 'update' || !suggestion.restaurantId) {
          throw new ForbiddenScopeError()
        }

        // This check intentionally lives inside the same transaction as the
        // mutation. The final UPDATE below repeats the predicate so a tenant
        // move racing this review also fails closed at write time.
        const target = await tx.restaurant.findUnique({
          where: { id: suggestion.restaurantId },
          select: { rabbanutId: true },
        })
        if (!target || target.rabbanutId !== reviewerRabbanutId) {
          throw new ForbiddenScopeError()
        }
      }

      let linkedRestaurantId: string | undefined

      if (
        data.status === 'approved' &&
        suggestion.type === 'update' &&
        suggestion.restaurantId
      ) {
        const patch: Prisma.RestaurantUpdateInput = {}
        if (suggestion.proposedName)    patch.name    = suggestion.proposedName
        if (suggestion.proposedAddress) patch.address = suggestion.proposedAddress
        if (suggestion.proposedCity)    patch.city    = suggestion.proposedCity
        if (suggestion.proposedFoodType) patch.foodType = suggestion.proposedFoodType
        if (suggestion.proposedCategory) {
          const categoryId = await resolveCategoryId(tx, suggestion.proposedCategory)
          if (categoryId) patch.category = { connect: { id: categoryId } }
        }
        if (addressChanged) {
          // The address itself changed — the old pin no longer applies. Use the
          // freshly geocoded point, or keep the old pin flagged for the
          // background re-geocode job when the lookup missed.
          if (resolvedPoint) {
            Object.assign(patch, geocodedFields(resolvedPoint))
          } else {
            patch.geoAccuracy = 'approximate'
            patch.geocodeAttemptedAt = null
          }
        } else if (
          pinMoved &&
          isFiniteNumber(suggestion.proposedLat) &&
          isFiniteNumber(suggestion.proposedLng)
        ) {
          // A moved pin on an unchanged address: the server's point for the
          // address wins; the pin itself only as 'approximate' (rule above).
          // An 'exact' pin (a GovMap house, or one an operator placed in the
          // CRM) is only ever replaced by another address-level point: neither
          // a street midpoint nor a pin without accuracy is better evidence.
          if (currentExact && !resolvedPoint?.exact) {
            // keep the stored pin
          } else if (resolvedPoint) {
            Object.assign(patch, geocodedFields(resolvedPoint))
          } else {
            assertPlausibleCoordinates({ lat: suggestion.proposedLat, lng: suggestion.proposedLng })
            patch.lat = suggestion.proposedLat
            patch.lng = suggestion.proposedLng
            patch.geoAccuracy = 'approximate'
            patch.geocodeAttemptedAt = null
          }
        }
        if (suggestion.proposedHechsher) {
          const hechsher = await resolveHechsher(tx, {
            name: suggestion.proposedHechsher,
            city: suggestion.proposedCity ?? '',
            kashrutStatus: suggestion.proposedKashrutStatus,
            reviewerRabbanutId,
          })
          patch.hechsher = { connect: { id: hechsher.id } }
          patch.rabbanut = { connect: { id: hechsher.rabbanutId } }
          patch.level = { connect: { id: await levelIdFromHechsher(tx, hechsher.type) } }
        }
        if (suggestion.proposedKashrutStatus) {
          const certStatus = toCertStatus(suggestion.proposedKashrutStatus)
          patch.expires = expiresForStatus(certStatus)
        }
        if (Object.keys(patch).length > 0) {
          await tx.restaurant.update({
            where: {
              id: suggestion.restaurantId,
              ...(reviewerRabbanutId ? { rabbanutId: reviewerRabbanutId } : {}),
            },
            data: patch,
          })
        }
      }

      if (data.status === 'approved' && suggestion.type === 'add') {
        if (!suggestion.proposedName || !suggestion.proposedAddress || !suggestion.proposedCity) {
          throw new Error('Cannot approve suggestion: name, address and city are required')
        }
        // Coordinates: the server-side lookup done above wins, with its own
        // accuracy; else the client's proposed point, as 'approximate' (it
        // carries no accuracy — see the rule above). A place with neither
        // stays coordinate-less (hidden from the map) until the re-geocode job
        // resolves it from the address.
        const hasProposed = isFiniteNumber(suggestion.proposedLat) && isFiniteNumber(suggestion.proposedLng)
        const proposed = hasProposed
          ? { lat: suggestion.proposedLat as number, lng: suggestion.proposedLng as number }
          : null
        if (!resolvedPoint && proposed) assertPlausibleCoordinates(proposed)
        const coords = resolvedPoint
          ? geocodedFields(resolvedPoint)
          : { lat: proposed?.lat ?? null, lng: proposed?.lng ?? null, geoAccuracy: 'approximate' as const, geocodeAttemptedAt: null }

        const hechsher = await resolveHechsher(tx, {
          name: suggestion.proposedHechsher,
          city: suggestion.proposedCity,
          kashrutStatus: suggestion.proposedKashrutStatus,
          reviewerRabbanutId,
        })
        const certStatus = toCertStatus(suggestion.proposedKashrutStatus)
        const categoryId = await resolveCategoryId(tx, suggestion.proposedCategory)
        const restaurant = await tx.restaurant.create({
          data: {
            name: suggestion.proposedName,
            address: suggestion.proposedAddress,
            city: suggestion.proposedCity,
            levelId: await levelIdFromHechsher(tx, hechsher.type),
            hechsherId: hechsher.id,
            mashgiachId: null,
            kitniyot: false,
            expires: expiresForStatus(certStatus),
            rabbanutId: hechsher.rabbanutId,
            notes: communityNotes(suggestion.notes),
            ...coords,
            foodType: suggestion.proposedFoodType ?? DEFAULT_ADD_FOOD_TYPE,
            ...(categoryId ? { categoryId } : {}),
          },
          select: { id: true },
        })
        linkedRestaurantId = restaurant.id
      }

      return tx.mapRestaurantSuggestion.update({
        where: {
          id,
          status: 'pending' as PrismaMapSuggestionStatus,
          ...(data.reviewerRole === 'rabbanut'
            ? {
                type: 'update' as PrismaMapSuggestionType,
                restaurant: { is: { rabbanutId: reviewerRabbanutId! } },
              }
            : {}),
        },
        data: {
          status: data.status as PrismaMapSuggestionStatus,
          ...(linkedRestaurantId ? { restaurantId: linkedRestaurantId } : {}),
          reviewerNote: data.reviewerNote ?? undefined,
          reviewedAt: new Date(),
        },
        include: {
          mapUser: { select: { id: true, name: true, email: true } },
        },
      })
    })
  },

  // Existence for the PUBLIC community surface (reviews / suggestions): a
  // soft-deleted or expired establishment is invisible on the map, so it must
  // also 404 here — otherwise a user could confirm a hidden place exists and
  // read/write reviews and update-suggestions against it via a direct id.
  async restaurantExists(restaurantId: string): Promise<boolean> {
    const row = await prisma.restaurant.findFirst({
      where: { id: restaurantId, ...publicRestaurantVisibilityWhere() },
      select: { id: true },
    })
    return Boolean(row)
  },

  // One keyset page, newest first. (createdAt, id) is a total order — id
  // breaks createdAt ties — so a cursor taken from the last row of a page
  // resumes exactly after it, and reviews written meanwhile land before the
  // cursor instead of shifting later pages. The summary is an aggregate over
  // the whole restaurant, identical on every page.
  async listReviews(restaurantId: string, page: ReviewPageInput) {
    const { limit, cursor } = page
    const [rows, summary] = await Promise.all([
      prisma.mapRestaurantReview.findMany({
        where: {
          restaurantId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        include: {
          mapUser: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // One extra row tells us whether another page exists.
        take: limit + 1,
      }),
      prisma.mapRestaurantReview.aggregate({
        where: { restaurantId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ])

    const reviews = rows.slice(0, limit)
    const last = reviews[reviews.length - 1]
    const nextCursor: ReviewCursor | null = rows.length > limit && last
      ? { createdAt: last.createdAt, id: last.id }
      : null

    return {
      reviews,
      ratingAvg: summary._avg.rating,
      reviewCount: summary._count._all,
      nextCursor,
    }
  },

  async findOwnReview(mapUserId: string, restaurantId: string) {
    return prisma.mapRestaurantReview.findUnique({
      where: {
        restaurantId_mapUserId: {
          restaurantId,
          mapUserId,
        },
      },
      include: {
        mapUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  },

  async upsertReview(mapUserId: string, restaurantId: string, input: CreateReviewInput) {
    const exists = await this.restaurantExists(restaurantId)
    if (!exists) return null

    return prisma.mapRestaurantReview.upsert({
      where: {
        restaurantId_mapUserId: {
          restaurantId,
          mapUserId,
        },
      },
      create: {
        restaurantId,
        mapUserId,
        rating: input.rating,
        text: input.text || undefined,
      },
      update: {
        rating: input.rating,
        text: input.text || null,
      },
      include: {
        mapUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  },
}
