import { prisma } from '../lib/prisma'
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

const mapUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  name: true,
  avatarUrl: true,
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

  async setPassword(mapUserId: string, passwordHash: string): Promise<void> {
    await prisma.mapUser.update({
      where: { id: mapUserId },
      data: { passwordHash },
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
        return tx.mapUser.update({
          where: { id: userByEmail.id },
          data: {
            name: profile.name,
            avatarUrl: profile.avatarUrl ?? userByEmail.avatarUrl,
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
    await prisma.mapPasswordResetToken.updateMany({
      where: { mapUserId: input.mapUserId, usedAt: null },
      data: { usedAt: new Date() },
    })

    return prisma.mapPasswordResetToken.create({
      data: {
        mapUserId: input.mapUserId,
        channel: input.channel as PrismaMapPasswordResetChannel,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    })
  },

  async findValidPasswordResetToken(tokenHash: string) {
    return prisma.mapPasswordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        mapUser: { select: mapUserSelect },
      },
    })
  },

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await prisma.mapPasswordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    })
  },

  async createSuggestion(mapUserId: string, input: CreateSuggestionInput) {
    return prisma.mapRestaurantSuggestion.create({
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
  },

  async listSuggestions(filter: { status?: MapSuggestionStatus }) {
    return prisma.mapRestaurantSuggestion.findMany({
      where: filter.status ? { status: filter.status as PrismaMapSuggestionStatus } : undefined,
      include: {
        mapUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  async reviewSuggestion(id: string, data: {
    status: 'approved' | 'rejected'
    reviewerNote?: string | null
    reviewerRabbanutId?: string | null
  }) {
    return prisma.$transaction(async tx => {
      const suggestion = await tx.mapRestaurantSuggestion.findUnique({ where: { id } })
      if (!suggestion || suggestion.status !== 'pending') return null

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
        if (
          isFiniteNumber(suggestion.proposedLat) &&
          isFiniteNumber(suggestion.proposedLng)
        ) {
          patch.lat = suggestion.proposedLat
          patch.lng = suggestion.proposedLng
        }
        if (suggestion.proposedHechsher) {
          const hechsher = await resolveHechsher(tx, {
            name: suggestion.proposedHechsher,
            city: suggestion.proposedCity ?? '',
            kashrutStatus: suggestion.proposedKashrutStatus,
            reviewerRabbanutId: data.reviewerRabbanutId,
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
          await tx.restaurant.update({ where: { id: suggestion.restaurantId }, data: patch })
        }
      }

      if (data.status === 'approved' && suggestion.type === 'add') {
        if (!suggestion.proposedName || !suggestion.proposedAddress || !suggestion.proposedCity) {
          throw new Error('Cannot approve suggestion: name, address and city are required')
        }
        if (!isFiniteNumber(suggestion.proposedLat) || !isFiniteNumber(suggestion.proposedLng)) {
          throw new Error('Cannot approve suggestion: coordinates are required for map display')
        }

        const hechsher = await resolveHechsher(tx, {
          name: suggestion.proposedHechsher,
          city: suggestion.proposedCity,
          kashrutStatus: suggestion.proposedKashrutStatus,
          reviewerRabbanutId: data.reviewerRabbanutId,
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
            lat: suggestion.proposedLat,
            lng: suggestion.proposedLng,
            foodType: suggestion.proposedFoodType ?? DEFAULT_ADD_FOOD_TYPE,
            ...(categoryId ? { categoryId } : {}),
          },
          select: { id: true },
        })
        linkedRestaurantId = restaurant.id
      }

      return tx.mapRestaurantSuggestion.update({
        where: { id },
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

  async restaurantExists(restaurantId: string): Promise<boolean> {
    const row = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } })
    return Boolean(row)
  },

  async listReviews(restaurantId: string) {
    const [reviews, summary] = await Promise.all([
      prisma.mapRestaurantReview.findMany({
        where: { restaurantId },
        include: {
          mapUser: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mapRestaurantReview.aggregate({
        where: { restaurantId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ])

    return {
      reviews,
      ratingAvg: summary._avg.rating,
      reviewCount: summary._count._all,
    }
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
