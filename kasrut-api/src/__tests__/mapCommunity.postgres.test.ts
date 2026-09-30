import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { mapCommunityRepo } from '../db/mapCommunity.repo'

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
})
