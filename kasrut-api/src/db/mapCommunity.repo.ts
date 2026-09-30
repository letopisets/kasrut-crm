import { prisma } from '../lib/prisma'
import { assertPlausibleCoordinates, looksLikeIsraeliAddress } from '../lib/geoValidation'
import { geocodeAddressDetailed, isAddressLevel } from '../lib/nominatim'
import { ForbiddenScopeError } from '../lib/rabbanutScope'
import { publicHechsherWhere, publicRabbanutWhere, publicRestaurantVisibilityWhere } from './map.repo'
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
  emailVerifiedAt: Date | null
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
  /** Verification link to issue with the account (hash only), if any. */
  emailVerification?: { tokenHash: string; expiresAt: Date } | null
}

/** consumeEmailVerificationToken's answer; `user` is the link's account. */
export type EmailVerificationOutcome =
  | { status: 'verified' | 'already_verified'; user: { id: string; email: string } }
  | { status: 'invalid'; user: { id: string; email: string } | null }

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

// Keyset position of the last review on a page (see listReviews). createdAt
// holds the column that list sorts by: createdAt for the public list, the
// review's updatedAt for the moderation list.
export interface ReviewCursor {
  createdAt: Date
  id: string
}

export interface ReviewPageInput {
  limit: number
  cursor?: ReviewCursor | null
}

// CRM moderator of map reviews. A rabbanut is confined to reviews of its own
// restaurants; an owner sees every review.
export interface ReviewModerationScope {
  reviewerRole: 'owner' | 'rabbanut'
  reviewerRabbanutId?: string
}

export interface ModerationReviewPageInput extends ReviewPageInput {
  restaurantId?: string
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
  emailVerifiedAt: true,
} as const

// Postgres aborted a Serializable transaction (SQLSTATE 40001); Prisma
// reports it as P2034.
function isWriteConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034'
}

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

// Approving a suggestion must never certify a place through a withdrawn
// authority: a soft-deleted or switched-off rabbanut, or a switched-off
// hechsher, is hidden from the public map (map.repo publicRabbanutWhere /
// publicHechsherWhere), and a place linked to one would silently vanish or,
// worse, revive a withdrawn name. Resolution therefore only picks active,
// non-deleted rows and refuses the approval (a 400 via the
// 'Cannot approve suggestion' prefix) rather than falling back to one.
//
// `tenantRabbanutId` pins the resolution to one tenant: an update suggestion
// always resolves inside its establishment's own rabbanut, whoever reviews it,
// so public input can never move a place (with its inspections, reviews and
// suggestions) into another tenant. A tenant move stays an explicit CRM edit.
async function resolveRabbanutId(
  tx: Prisma.TransactionClient,
  city: string,
  tenantRabbanutId?: string | null,
): Promise<string> {
  if (tenantRabbanutId) {
    const tenant = await tx.rabbanut.findFirst({
      where: { id: tenantRabbanutId, ...publicRabbanutWhere() },
      select: { id: true },
    })
    if (tenant) return tenant.id
    // Never falls through to another tenant's rabbanut.
    throw new Error('Cannot approve suggestion: the rabbanut is inactive or removed')
  }

  // A new place goes to its city's rabbanut. When the city has one but it is
  // switched off or removed, that withdrawal must not be sidestepped by
  // filing the place under an unrelated rabbanut elsewhere.
  const cityRabbanuts = await tx.rabbanut.findMany({
    where: { city: { equals: city, mode: 'insensitive' } },
    select: { id: true, active: true, deletedAt: true },
    orderBy: { name: 'asc' },
  })
  const cityRabbanut = cityRabbanuts.find(r => r.active && r.deletedAt === null)
  if (cityRabbanut) return cityRabbanut.id
  if (cityRabbanuts.length > 0) {
    throw new Error(`Cannot approve suggestion: the rabbanut of "${city}" is inactive or removed`)
  }

  // A city no rabbanut covers yet: the first active one takes the place.
  const activeRabbanut = await tx.rabbanut.findFirst({
    where: publicRabbanutWhere(),
    select: { id: true },
    orderBy: { name: 'asc' },
  })
  if (activeRabbanut) return activeRabbanut.id

  throw new Error('Cannot approve suggestion: no active rabbanut exists for the new restaurant')
}

function hechsherNameWhere(name: string): Prisma.HechsherWhereInput {
  return {
    OR: [
      { name: { equals: name, mode: 'insensitive' } },
      { shortName: { equals: name, mode: 'insensitive' } },
    ],
  }
}

function withdrawnHechsherError(name: string): Error {
  return new Error(`Cannot approve suggestion: hechsher "${name}" is inactive or its rabbanut is withdrawn`)
}

async function resolveHechsher(
  tx: Prisma.TransactionClient,
  input: {
    name: string | null
    city: string
    kashrutStatus: string | null
    tenantRabbanutId?: string | null
  },
): Promise<{ id: string; rabbanutId: string; type: string }> {
  // Inside a tenant, a same-named hechsher of a peer rabbanut never matches.
  const tenantScope: Prisma.HechsherWhereInput = input.tenantRabbanutId
    ? { rabbanutId: input.tenantRabbanutId }
    : {}
  const requestedName = input.name?.trim()
  if (requestedName) {
    const existing = await tx.hechsher.findFirst({
      where: {
        ...tenantScope,
        ...hechsherNameWhere(requestedName),
        ...publicHechsherWhere(),
        rabbanut: publicRabbanutWhere(),
      },
      select: { id: true, rabbanutId: true, type: true },
      orderBy: { name: 'asc' },
    })
    if (existing) return existing

    // The name exists but is withdrawn: creating a fresh active copy would
    // undo the operator's decision, so refuse instead.
    const withdrawn = await tx.hechsher.findFirst({
      where: { ...tenantScope, ...hechsherNameWhere(requestedName) },
      select: { id: true },
    })
    if (withdrawn) throw withdrawnHechsherError(requestedName)

    // The name is a listed hechsher of another tenant: the place would really
    // have to move there, which is an explicit CRM edit, and a same-named copy
    // inside this tenant would only be a stray duplicate. Refuse and say why.
    // Only hechsherim the public map lists (GET /api/map/hechsherim) count:
    // any map user can propose any name, so refusing on a withdrawn or
    // switched-off tenant's name would tell a tenant reviewer that the name
    // exists in another tenant's registry. Such a name is simply new here.
    if (input.tenantRabbanutId) {
      const foreign = await tx.hechsher.findFirst({
        where: {
          ...hechsherNameWhere(requestedName),
          rabbanutId: { not: input.tenantRabbanutId },
          ...publicHechsherWhere(),
          rabbanut: publicRabbanutWhere(),
        },
        select: { id: true },
      })
      if (foreign) {
        throw new Error(
          `Cannot approve suggestion: hechsher "${requestedName}" belongs to another rabbanut; ` +
          'move the establishment in the CRM instead',
        )
      }
    }
  }

  const rabbanutId = await resolveRabbanutId(tx, input.city, input.tenantRabbanutId)
  const fallbackName = requestedName || `Community review ${input.city}`.trim()
  const existingFallback = await tx.hechsher.findFirst({
    where: {
      rabbanutId,
      name: { equals: fallbackName, mode: 'insensitive' },
    },
    select: { id: true, rabbanutId: true, type: true, active: true },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })
  if (existingFallback) {
    if (!existingFallback.active) throw withdrawnHechsherError(fallbackName)
    return { id: existingFallback.id, rabbanutId: existingFallback.rabbanutId, type: existingFallback.type }
  }

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

// Rows strictly after `cursor` in (<sortKey> desc, id desc) order.
function afterReviewCursor(
  cursor: ReviewCursor | null | undefined,
  sortKey: 'createdAt' | 'updatedAt' = 'createdAt',
): Prisma.MapRestaurantReviewWhereInput {
  if (!cursor) return {}
  const at = cursor.createdAt
  return sortKey === 'createdAt'
    ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.id } }] }
    : { OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: cursor.id } }] }
}

// Tenant predicate for review moderation. It is part of every read AND of the
// delete itself, so a rabbanut can neither see nor remove a review of another
// tenant's restaurant, even by a guessed id.
function reviewModerationWhere(scope: ReviewModerationScope): Prisma.MapRestaurantReviewWhereInput {
  if (scope.reviewerRole === 'owner') return {}
  if (scope.reviewerRole === 'rabbanut' && scope.reviewerRabbanutId) {
    return { restaurant: { is: { rabbanutId: scope.reviewerRabbanutId } } }
  }
  throw new ForbiddenScopeError()
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
        // Unverified until the emailed link is followed; the token is created
        // with the account so neither exists without the other.
        emailVerifiedAt: null,
        ...(input.emailVerification
          ? { emailVerificationTokens: { create: input.emailVerification } }
          : {}),
      },
      select: mapUserSelect,
    })
  },

  // The provider has verified the email (verifyOAuthIdToken insists on it),
  // so every account created, claimed or signed into here counts as verified.
  async upsertUserFromIdentity(profile: OAuthProfile): Promise<MapUserRow> {
    return prisma.$transaction(async tx => {
      const provider = profile.provider as PrismaMapAuthProvider
      const now = new Date()
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
            emailVerifiedAt: existingIdentity.mapUser.emailVerifiedAt ?? now,
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
          data: { usedAt: now },
        })
        // Pending verification links are moot once the provider vouched for
        // the address.
        await tx.mapEmailVerificationToken.updateMany({
          where: { mapUserId: userByEmail.id, usedAt: null },
          data: { usedAt: now },
        })
        return tx.mapUser.update({
          where: { id: userByEmail.id },
          data: {
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? userByEmail.avatarUrl,
            passwordHash: null,
            phone: null,
            sessionVersion: { increment: 1 },
            emailVerifiedAt: userByEmail.emailVerifiedAt ?? now,
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
          emailVerifiedAt: now,
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

  /**
   * Deletes password-reset and email-verification links that expired before
   * `expiredBefore`, used or not: neither can work any more. Run daily from
   * server.ts (lib/tokenPurge.ts).
   */
  async purgeExpiredMapTokens(expiredBefore: Date): Promise<{ emailVerification: number; passwordReset: number }> {
    const [emailVerification, passwordReset] = await Promise.all([
      prisma.mapEmailVerificationToken.deleteMany({ where: { expiresAt: { lt: expiredBefore } } }),
      prisma.mapPasswordResetToken.deleteMany({ where: { expiresAt: { lt: expiredBefore } } }),
    ])
    return { emailVerification: emailVerification.count, passwordReset: passwordReset.count }
  },

  async createEmailVerificationToken(input: {
    mapUserId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<void> {
    await prisma.$transaction(async tx => {
      // One issuer per account at a time, so the retire below sees a link a
      // parallel resend has just committed. (Serializable would abort one of
      // two parallel resends with a write conflict, a 500.) The lock is
      // released with the transaction. $executeRaw: $queryRaw cannot
      // deserialize the function's void result.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`map-email-verification:${input.mapUserId}`}, 0))`
      // Only the newest link works: a resend retires the ones sent before.
      await tx.mapEmailVerificationToken.updateMany({
        where: { mapUserId: input.mapUserId, usedAt: null },
        data: { usedAt: new Date() },
      })
      await tx.mapEmailVerificationToken.create({ data: input })
    })
  },

  /**
   * Verifies the account of an unused, unexpired link. A link whose account is
   * verified already (opened twice, on a second device, or the address was
   * claimed by an OAuth sign-in) says so instead of failing, without being
   * used again. `user` is the link's account, if the link exists.
   */
  async consumeEmailVerificationToken(tokenHash: string): Promise<EmailVerificationOutcome> {
    try {
      return await prisma.$transaction(async tx => {
        const now = new Date()
        const token = await tx.mapEmailVerificationToken.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            usedAt: true,
            expiresAt: true,
            mapUser: { select: { id: true, email: true, emailVerifiedAt: true } },
          },
        })
        if (!token) return { status: 'invalid', user: null }
        const user = { id: token.mapUser.id, email: token.mapUser.email }
        if (token.mapUser.emailVerifiedAt !== null) return { status: 'already_verified', user }
        if (token.usedAt !== null || token.expiresAt <= now) return { status: 'invalid', user }

        // Same conditional claim as consumePasswordResetToken: exactly one
        // request can move the link from unused to used.
        const claimed = await tx.mapEmailVerificationToken.updateMany({
          where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        })
        if (claimed.count !== 1) return { status: 'invalid', user }

        // An account verified meanwhile (OAuth claim) keeps its original time.
        await tx.mapUser.updateMany({
          where: { id: user.id, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        })
        return { status: 'verified', user }
      }, { isolationLevel: 'Serializable' })
    } catch (e) {
      // A parallel use of the link, or a resend retiring it, committed first.
      if (isWriteConflict(e)) return { status: 'invalid', user: null }
      throw e
    }
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
      // $executeRaw, not $queryRaw: the function returns void, and the pg
      // adapter cannot deserialize a void column (P2010, a 500 on every
      // POST /api/map/suggestions).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`map-suggestion:${mapUserId}`}, 0))`

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
    const reviewerRabbanutId = data.reviewerRole === 'rabbanut'
      ? data.reviewerRabbanutId
      : undefined
    if (data.reviewerRole === 'rabbanut' && !reviewerRabbanutId) throw new ForbiddenScopeError()

    // Peek before anything else. A missing, already reviewed or (for a tenant
    // reviewer) out-of-scope suggestion all answer the same null (404), so a
    // rabbanut learns nothing about another tenant's ids, and no geocoding
    // budget is spent on a suggestion the reviewer may not touch. Add
    // suggestions are deliberately owner-only.
    const peek = await prisma.mapRestaurantSuggestion.findUnique({
      where: { id },
      select: {
        status: true, type: true, restaurantId: true,
        proposedAddress: true, proposedCity: true, proposedLat: true, proposedLng: true,
        restaurant: { select: { rabbanutId: true } },
      },
    })
    if (!peek || peek.status !== 'pending') return null
    if (reviewerRabbanutId && (peek.type !== 'update' || peek.restaurant?.rabbanutId !== reviewerRabbanutId)) {
      return null
    }

    // Geocoding is a network call (GovMap ≤5 s, then LocationIQ / Nominatim up
    // to 8 s each) and must not hold the transaction open, so resolve
    // coordinates BEFORE the transaction. The transaction re-reads the
    // suggestion and re-checks status, so a racing review at worst wastes this
    // lookup.
    let resolvedPoint: SuggestedPoint | null = null
    let addressChanged = false
    let pinMoved = false
    let currentExact = false
    if (data.status === 'approved') {
      const hasPin = isFiniteNumber(peek.proposedLat) && isFiniteNumber(peek.proposedLng)
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

    return prisma.$transaction(async tx => {
      const suggestion = await tx.mapRestaurantSuggestion.findUnique({ where: { id } })
      if (!suggestion || suggestion.status !== 'pending') return null

      // The establishment an update suggestion targets, read inside the same
      // transaction as the mutation. For a tenant reviewer the check repeats
      // the peek's scope (a tenant move may have raced it), and the final
      // UPDATEs repeat the predicate, so such a race fails closed.
      const target = suggestion.type === 'update' && suggestion.restaurantId
        ? await tx.restaurant.findUnique({
            where: { id: suggestion.restaurantId },
            select: {
              rabbanutId: true,
              city: true,
              deletedAt: true,
              rabbanut: { select: { active: true, deletedAt: true } },
            },
          })
        : null

      if (reviewerRabbanutId) {
        if (suggestion.type !== 'update' || !target || target.rabbanutId !== reviewerRabbanutId) {
          throw new ForbiddenScopeError()
        }
      }

      let linkedRestaurantId: string | undefined

      if (data.status === 'approved' && suggestion.type === 'update') {
        if (!target) {
          throw new Error('Cannot approve suggestion: the establishment no longer exists')
        }
        // A removed place, or one of a switched-off or removed rabbanut, is
        // hidden from the public map; approving an edit must not bring it back
        // or quietly re-home it.
        if (target.deletedAt || !target.rabbanut.active || target.rabbanut.deletedAt) {
          throw new Error('Cannot approve suggestion: the establishment or its rabbanut has been withdrawn')
        }

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
          // Resolved inside the establishment's own rabbanut, for owners too:
          // the place keeps its tenant, so no rabbanut is ever connected here.
          // Moving a place to another rabbanut stays an explicit CRM edit.
          const hechsher = await resolveHechsher(tx, {
            name: suggestion.proposedHechsher,
            city: suggestion.proposedCity ?? target.city,
            kashrutStatus: suggestion.proposedKashrutStatus,
            tenantRabbanutId: target.rabbanutId,
          })
          patch.hechsher = { connect: { id: hechsher.id } }
          patch.level = { connect: { id: await levelIdFromHechsher(tx, hechsher.type) } }
        }
        if (suggestion.proposedKashrutStatus) {
          const certStatus = toCertStatus(suggestion.proposedKashrutStatus)
          patch.expires = expiresForStatus(certStatus)
        }
        if (Object.keys(patch).length > 0) {
          await tx.restaurant.update({
            where: { id: suggestion.restaurantId!, rabbanutId: target.rabbanutId },
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
          ...(reviewerRabbanutId
            ? {
                type: 'update' as PrismaMapSuggestionType,
                restaurant: { is: { rabbanutId: reviewerRabbanutId } },
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
        where: { restaurantId, ...afterReviewCursor(cursor) },
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

  // CRM moderation list, most recently written first: an author can rewrite
  // (upsert) a review at any time, and ordering by updatedAt brings such an
  // edit back to the top instead of leaving it at its original position.
  // Unlike the public list it is not limited to publicly visible restaurants:
  // reviews of a hidden or expired establishment still exist and can still be
  // removed.
  async listReviewsForModeration(scope: ReviewModerationScope, page: ModerationReviewPageInput) {
    const { limit, cursor, restaurantId } = page
    const rows = await prisma.mapRestaurantReview.findMany({
      where: {
        ...reviewModerationWhere(scope),
        ...(restaurantId ? { restaurantId } : {}),
        ...afterReviewCursor(cursor, 'updatedAt'),
      },
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        updatedAt: true,
        restaurant: { select: { id: true, name: true } },
        // Never the email: a tenant moderator has no business with it.
        mapUser: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const reviews = rows.slice(0, limit)
    const last = reviews[reviews.length - 1]
    const nextCursor: ReviewCursor | null = rows.length > limit && last
      ? { createdAt: last.updatedAt, id: last.id }
      : null
    return { reviews, nextCursor }
  },

  // Deletes one review inside the moderator's scope. The tenant predicate is
  // repeated on the DELETE, so a restaurant moved to another rabbanut between
  // the read and the write fails closed (count 0 → null → 404). The read only
  // supplies the details the audit log records.
  async deleteReviewForModeration(id: string, scope: ReviewModerationScope) {
    const where: Prisma.MapRestaurantReviewWhereInput = { id, ...reviewModerationWhere(scope) }
    const review = await prisma.mapRestaurantReview.findFirst({
      where,
      select: { id: true, restaurantId: true, mapUserId: true, rating: true },
    })
    if (!review) return null

    const { count } = await prisma.mapRestaurantReview.deleteMany({ where })
    return count === 1 ? review : null
  },
}
