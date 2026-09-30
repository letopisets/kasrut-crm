import { prisma } from '../lib/prisma'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { MAP_TOKEN_PURGE_GRACE_MS, purgeExpiredTokens } from '../lib/tokenPurge'

jest.mock('../lib/prisma', () => ({
  prisma: {
    refreshToken: { deleteMany: jest.fn() },
    mapEmailVerificationToken: { deleteMany: jest.fn() },
    mapPasswordResetToken: { deleteMany: jest.fn() },
    twoFactorChallenge: { deleteMany: jest.fn() },
  },
}))

jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))

const db = prisma as unknown as {
  refreshToken: { deleteMany: jest.Mock }
  mapEmailVerificationToken: { deleteMany: jest.Mock }
  mapPasswordResetToken: { deleteMany: jest.Mock }
  twoFactorChallenge: { deleteMany: jest.Mock }
}

const NOW = new Date('2026-09-30T03:00:00.000Z')
const MAP_CUTOFF = new Date(NOW.getTime() - MAP_TOKEN_PURGE_GRACE_MS)

beforeEach(() => {
  jest.resetAllMocks()
  db.refreshToken.deleteMany.mockResolvedValue({ count: 3 })
  db.mapEmailVerificationToken.deleteMany.mockResolvedValue({ count: 2 })
  db.mapPasswordResetToken.deleteMany.mockResolvedValue({ count: 1 })
  db.twoFactorChallenge.deleteMany.mockResolvedValue({ count: 4 })
})

describe('mapCommunityRepo.purgeExpiredMapTokens', () => {
  it('deletes verification and reset links that expired before the cutoff, used or not', async () => {
    const result = await mapCommunityRepo.purgeExpiredMapTokens(MAP_CUTOFF)

    expect(result).toEqual({ emailVerification: 2, passwordReset: 1 })
    // No usedAt condition: an expired link cannot work whether it was used or not.
    expect(db.mapEmailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: MAP_CUTOFF } } })
    expect(db.mapPasswordResetToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: MAP_CUTOFF } } })
  })
})

describe('purgeExpiredTokens', () => {
  it('purges expired refresh tokens at once and map links after a one-day grace', async () => {
    const result = await purgeExpiredTokens(NOW)

    expect(result).toEqual({
      deleted: { refresh_tokens: 3, map_email_verification_tokens: 2, map_password_reset_tokens: 1, two_factor_challenges: 4 },
      failed: {},
    })
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: NOW } } })
    // A consumed 2FA challenge is dead weight once its pending token expired.
    expect(db.twoFactorChallenge.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: NOW } } })
    expect(MAP_TOKEN_PURGE_GRACE_MS).toBe(24 * 60 * 60 * 1000)
    expect(db.mapEmailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: MAP_CUTOFF } } })
  })

  it('still purges the map links when the refresh-token purge fails, and reports the failure', async () => {
    const dbDown = new Error('connection lost')
    db.refreshToken.deleteMany.mockRejectedValueOnce(dbDown)

    const result = await purgeExpiredTokens(NOW)

    expect(result.failed).toEqual({ refresh_tokens: dbDown })
    expect(result.deleted).toEqual({ map_email_verification_tokens: 2, map_password_reset_tokens: 1, two_factor_challenges: 4 })
  })

  it('still purges refresh tokens when the map purge fails', async () => {
    db.mapPasswordResetToken.deleteMany.mockRejectedValueOnce(new Error('timeout'))

    const result = await purgeExpiredTokens(NOW)

    expect(result.deleted).toEqual({ refresh_tokens: 3, two_factor_challenges: 4 })
    expect(Object.keys(result.failed)).toEqual(['map_tokens'])
  })

  it('still purges the rest when the 2FA challenge purge fails', async () => {
    db.twoFactorChallenge.deleteMany.mockRejectedValueOnce(new Error('timeout'))

    const result = await purgeExpiredTokens(NOW)

    expect(result.deleted).toEqual({ refresh_tokens: 3, map_email_verification_tokens: 2, map_password_reset_tokens: 1 })
    expect(Object.keys(result.failed)).toEqual(['two_factor_challenges'])
  })
})
