import { prisma } from '../lib/prisma'
import type { MapPasswordResetChannel, MapSuggestionType } from '../models/types'
import type {
  MapAuthProvider as PrismaMapAuthProvider,
  MapPasswordResetChannel as PrismaMapPasswordResetChannel,
  MapSuggestionType as PrismaMapSuggestionType,
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
        proposedLat: input.proposedLat ?? undefined,
        proposedLng: input.proposedLng ?? undefined,
        notes: input.notes || undefined,
      },
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
