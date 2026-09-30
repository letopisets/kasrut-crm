import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { MAP_TOKEN_PURGE_GRACE_MS, purgeExpiredTokens } from '../lib/tokenPurge'

// Runs repository code against a real Postgres through the real Prisma client
// and pg adapter, which the mocked suites cannot do: they never see what the
// driver returns. Opt-in, and meant for a THROWAWAY database with every
// migration applied (the tests insert and delete rows):
//   docker run -d --rm --name kwt-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55432/postgres npx prisma migrate deploy
//   POSTGRES_TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55432/postgres npx jest mapCommunity.postgres
// Skipped otherwise.
const DATABASE_URL = process.env.POSTGRES_TEST_DATABASE_URL

jest.mock('../lib/prisma', () => {
  const { PrismaClient } = jest.requireActual('../generated/prisma/client')
  const { PrismaPg } = jest.requireActual('@prisma/adapter-pg')
  const url = process.env.POSTGRES_TEST_DATABASE_URL ?? 'postgresql://unused:unused@127.0.0.1:1/unused'
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) }
})
// No Redis in this suite; the cache falls through to the loader.
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))

const describeWithPostgres = DATABASE_URL ? describe : describe.skip

describeWithPostgres('mapCommunity repository against a real Postgres', () => {
  const run = randomUUID().slice(0, 8)
  const mapUserIds: string[] = []

  async function createMapUser(): Promise<string> {
    const user = await prisma.mapUser.create({
      data: { email: `pg-${run}-${mapUserIds.length}@example.com`, name: 'PG test', emailVerifiedAt: new Date() },
      select: { id: true },
    })
    mapUserIds.push(user.id)
    return user.id
  }

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { mapUserId: { in: mapUserIds } } })
    await prisma.mapRestaurantSuggestion.deleteMany({ where: { mapUserId: { in: mapUserIds } } })
    await prisma.mapUser.deleteMany({ where: { id: { in: mapUserIds } } })
    await prisma.$disconnect()
  })

  describe('createSuggestionWithinQuota', () => {
    // Regression: the per-user advisory lock ran through $queryRaw, whose
    // result the pg adapter cannot deserialize (pg_advisory_xact_lock returns
    // void) — P2010, so every POST /api/map/suggestions answered 500.
    it('creates a pending suggestion under the per-user lock', async () => {
      const mapUserId = await createMapUser()

      const created = await mapCommunityRepo.createSuggestionWithinQuota(
        mapUserId,
        { type: 'add', proposedName: 'Falafel', proposedAddress: 'Herzl 1', proposedCity: 'Haifa' },
        5,
      )

      expect(created).toMatchObject({ mapUserId, status: 'pending', proposedName: 'Falafel' })
    })

    it('holds the cap under parallel requests from one user', async () => {
      const mapUserId = await createMapUser()

      const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
        mapCommunityRepo.createSuggestionWithinQuota(
          mapUserId,
          { type: 'add', proposedName: `Place ${i}`, proposedCity: 'Haifa' },
          2,
        )))

      expect(results.filter(Boolean)).toHaveLength(2)
      expect(await prisma.mapRestaurantSuggestion.count({ where: { mapUserId, status: 'pending' } })).toBe(2)
    })
  })

  describe('purgeExpiredTokens', () => {
    it('deletes only expired refresh tokens and map links past the grace period', async () => {
      const mapUserId = await createMapUser()
      const now = new Date()
      const ago = (ms: number) => new Date(now.getTime() - ms)
      const ahead = (ms: number) => new Date(now.getTime() + ms)
      const HOUR = 3_600_000
      const tag = (name: string) => `${run}-${name}`

      await prisma.refreshToken.createMany({
        data: [
          { tokenHash: tag('rt-expired'), familyId: tag('f1'), audience: 'map', mapUserId, sessionVersion: 0, expiresAt: ago(1000) },
          { tokenHash: tag('rt-used-live'), familyId: tag('f2'), audience: 'map', mapUserId, sessionVersion: 0, expiresAt: ahead(HOUR), usedAt: ago(HOUR) },
        ],
      })
      await prisma.mapEmailVerificationToken.createMany({
        data: [
          { mapUserId, tokenHash: tag('ev-old'), expiresAt: ago(MAP_TOKEN_PURGE_GRACE_MS + HOUR), usedAt: ago(2 * MAP_TOKEN_PURGE_GRACE_MS) },
          { mapUserId, tokenHash: tag('ev-in-grace'), expiresAt: ago(HOUR) },
          { mapUserId, tokenHash: tag('ev-live'), expiresAt: ahead(HOUR) },
        ],
      })
      await prisma.mapPasswordResetToken.createMany({
        data: [
          { mapUserId, channel: 'email', tokenHash: tag('pr-old'), expiresAt: ago(MAP_TOKEN_PURGE_GRACE_MS + HOUR) },
          { mapUserId, channel: 'email', tokenHash: tag('pr-live'), expiresAt: ahead(HOUR) },
        ],
      })

      const result = await purgeExpiredTokens(now)

      expect(result.failed).toEqual({})
      expect(result.deleted.refresh_tokens).toBeGreaterThanOrEqual(1)
      const left = async () => ({
        refresh: (await prisma.refreshToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
        verification: (await prisma.mapEmailVerificationToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
        reset: (await prisma.mapPasswordResetToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
      })
      const rows = await left()
      expect(rows.refresh).toEqual([tag('rt-used-live')])
      expect(rows.verification.sort()).toEqual([tag('ev-in-grace'), tag('ev-live')].sort())
      expect(rows.reset).toEqual([tag('pr-live')])
    })
  })
})
