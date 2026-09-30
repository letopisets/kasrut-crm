import { prisma } from '../lib/prisma'
import type { Prisma, RefreshTokenAudience } from '../generated/prisma/client'

export type { RefreshTokenAudience }

export interface RefreshTokenRow {
  id:             string
  familyId:       string
  audience:       RefreshTokenAudience
  userId:         string | null
  mapUserId:      string | null
  sessionVersion: number
  expiresAt:      Date
  usedAt:         Date | null
  revokedAt:      Date | null
}

export interface NewRefreshToken {
  tokenHash:      string
  familyId:       string
  audience:       RefreshTokenAudience
  /** users.id for 'crm', map_users.id for 'map'. */
  ownerId:        string
  sessionVersion: number
  expiresAt:      Date
  userAgent:      string | null
}

const rowSelect = {
  id:             true,
  familyId:       true,
  audience:       true,
  userId:         true,
  mapUserId:      true,
  sessionVersion: true,
  expiresAt:      true,
  usedAt:         true,
  revokedAt:      true,
} as const

function toCreateData(token: NewRefreshToken): Prisma.RefreshTokenUncheckedCreateInput {
  return {
    tokenHash:      token.tokenHash,
    familyId:       token.familyId,
    audience:       token.audience,
    sessionVersion: token.sessionVersion,
    expiresAt:      token.expiresAt,
    userAgent:      token.userAgent,
    // The CHECK constraint requires exactly the audience's owner column.
    ...(token.audience === 'crm' ? { userId: token.ownerId } : { mapUserId: token.ownerId }),
  }
}

// Still usable: not used, not revoked, not expired.
function liveWhere(now: Date): Prisma.RefreshTokenWhereInput {
  return { usedAt: null, revokedAt: null, expiresAt: { gt: now } }
}

export const refreshTokensRepo = {
  async create(token: NewRefreshToken): Promise<void> {
    await prisma.refreshToken.create({ data: toCreateData(token), select: { id: true } })
  },

  findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    return prisma.refreshToken.findUnique({ where: { tokenHash }, select: rowSelect })
  },

  /**
   * Claims token `id` (marks it used) and stores `successor` in one
   * transaction. The claim is a conditional update, so of two concurrent
   * rotations of the same token exactly one succeeds; false means the token
   * was already used, revoked or expired and nothing was stored.
   */
  async rotate(id: string, successor: NewRefreshToken, now: Date): Promise<boolean> {
    return prisma.$transaction(async tx => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id, ...liveWhere(now) },
        data:  { usedAt: now },
      })
      if (claimed.count !== 1) return false
      await tx.refreshToken.create({ data: toCreateData(successor), select: { id: true } })
      return true
    })
  },

  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data:  { revokedAt: now },
    })
    return result.count
  },

  /**
   * Reuse response: revokes the token's family and bumps the owner's
   * sessionVersion so access tokens already issued from the family stop
   * working. The bump is conditional on the family's version still being the
   * current one; otherwise those access tokens are dead already and a bump
   * would only sign the owner out of their newer sessions.
   */
  async revokeFamilyAndSessions(token: RefreshTokenRow, now: Date): Promise<void> {
    await prisma.$transaction(async tx => {
      await tx.refreshToken.updateMany({
        where: { familyId: token.familyId, revokedAt: null },
        data:  { revokedAt: now },
      })
      const bump = { sessionVersion: { increment: 1 } }
      if (token.audience === 'crm' && token.userId) {
        await tx.user.updateMany({ where: { id: token.userId, sessionVersion: token.sessionVersion }, data: bump })
      } else if (token.audience === 'map' && token.mapUserId) {
        await tx.mapUser.updateMany({ where: { id: token.mapUserId, sessionVersion: token.sessionVersion }, data: bump })
      }
    })
  },

  /** Deletes expired rows. Used and revoked rows stay until they expire, for reuse detection. */
  async purgeExpired(now: Date): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } })
    return result.count
  },
}
