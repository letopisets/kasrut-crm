import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { restaurantsRepo } from '../db/restaurants.repo'
import { claimTotpTimeStep, consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { purgeExpiredTokens } from '../lib/tokenPurge'

// Real Postgres for what the mocked suites cannot see: the 2FA single-use
// writes and the tenant triggers. Opt-in, for a THROWAWAY database with every
// migration applied (see mapCommunity.postgres.test.ts for the commands):
//   POSTGRES_TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55432/postgres npx jest security.postgres
// Skipped otherwise.
const DATABASE_URL = process.env.POSTGRES_TEST_DATABASE_URL

jest.mock('../lib/prisma', () => {
  const { PrismaClient } = jest.requireActual('../generated/prisma/client')
  const { PrismaPg } = jest.requireActual('@prisma/adapter-pg')
  const url = process.env.POSTGRES_TEST_DATABASE_URL ?? 'postgresql://unused:unused@127.0.0.1:1/unused'
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) }
})
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))

const describeWithPostgres = DATABASE_URL ? describe : describe.skip

describeWithPostgres('security invariants against a real Postgres', () => {
  const run = randomUUID().slice(0, 8)
  const userIds: string[] = []
  const rabbanutIds: string[] = []
  const jtiPrefix = `pg-${run}-`

  afterAll(async () => {
    await prisma.twoFactorChallenge.deleteMany({ where: { jti: { startsWith: jtiPrefix } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.inspection.deleteMany({ where: { restaurant: { rabbanutId: { in: rabbanutIds } } } })
    await prisma.restaurant.deleteMany({ where: { rabbanutId: { in: rabbanutIds } } })
    await prisma.mashgiach.deleteMany({ where: { rabbanutId: { in: rabbanutIds } } })
    await prisma.hechsher.deleteMany({ where: { rabbanutId: { in: rabbanutIds } } })
    await prisma.rabbanut.deleteMany({ where: { id: { in: rabbanutIds } } })
    await prisma.$disconnect()
  })

  describe('2FA single use without Redis', () => {
    async function owner(): Promise<string> {
      const user = await prisma.user.create({
        data: { name: 'PG owner', email: `pg-${run}-${userIds.length}@example.com`, passwordHash: 'x', role: 'owner' },
        select: { id: true },
      })
      userIds.push(user.id)
      return user.id
    }

    it('accepts each TOTP time step once, and never an older one', async () => {
      const userId = await owner()

      expect(await claimTotpTimeStep(userId, 1000)).toBe(true)
      expect(await claimTotpTimeStep(userId, 1000)).toBe(false)   // the same code again
      expect(await claimTotpTimeStep(userId, 999)).toBe(false)    // an older code
      expect(await claimTotpTimeStep(userId, 1001)).toBe(true)    // the next code
    })

    it('lets exactly one of parallel submissions of one code through', async () => {
      const userId = await owner()

      const results = await Promise.all(Array.from({ length: 6 }, () => claimTotpTimeStep(userId, 2000)))

      expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('consumes a pending challenge once, even under parallel submissions', async () => {
      const jti = `${jtiPrefix}${randomUUID()}`

      const results = await Promise.all(Array.from({ length: 6 }, () => consumeTwoFactorChallenge(jti, 300)))

      expect(results.filter(r => r === 'consumed')).toHaveLength(1)
      expect(results.filter(r => r === 'already_used')).toHaveLength(5)
      expect(await consumeTwoFactorChallenge(jti, 300)).toBe('already_used')
    })

    it('purges a consumed challenge once its pending token has expired', async () => {
      const expired = `${jtiPrefix}expired`
      const live = `${jtiPrefix}live`
      await prisma.twoFactorChallenge.createMany({
        data: [
          { jti: expired, expiresAt: new Date(Date.now() - 1000) },
          { jti: live, expiresAt: new Date(Date.now() + 300_000) },
        ],
      })

      const result = await purgeExpiredTokens()

      expect(result.failed).toEqual({})
      const left = await prisma.twoFactorChallenge.findMany({ where: { jti: { startsWith: jtiPrefix } }, select: { jti: true } })
      expect(left.map(r => r.jti)).toContain(live)
      expect(left.map(r => r.jti)).not.toContain(expired)
    })
  })

  // An inspection may only name a mashgiach of its restaurant's rabbanut.
  // Moving the restaurant used to leave its history on the old tenant's
  // mashgichim, so the new tenant read the old tenant's inspection notes
  // through a link it could not edit.
  describe('moving a restaurant to another rabbanut', () => {
    async function tenant(label: string) {
      const rabbanut = await prisma.rabbanut.create({
        data: { name: `PG ${run} ${label}`, city: `PGCity${run}${label}`, contact: '', phone: '', email: '', color: '#000' },
      })
      rabbanutIds.push(rabbanut.id)
      const hechsher = await prisma.hechsher.create({
        data: {
          name: `H ${run} ${label}`, shortName: `H${label}`, city: rabbanut.city, contact: '', phone: '', email: '',
          type: 'Rabbanut', color: '#000', rabbanutId: rabbanut.id,
        },
      })
      const mashgiach = await prisma.mashgiach.create({
        data: { name: `M ${label}`, phone: '', email: '', area: '', rabbanutId: rabbanut.id },
      })
      return { rabbanut, hechsher, mashgiach }
    }

    async function placeWithHistory(a: Awaited<ReturnType<typeof tenant>>) {
      const restaurant = await prisma.restaurant.create({
        data: {
          name: 'Falafel', address: 'Herzl 1', city: a.rabbanut.city, levelId: 'kl_regular',
          hechsherId: a.hechsher.id, rabbanutId: a.rabbanut.id, expires: new Date('2030-01-01'),
        },
      })
      const inspection = await prisma.inspection.create({
        data: {
          restaurantId: restaurant.id, mashgiachId: a.mashgiach.id, date: new Date('2026-09-01'),
          type: 'planned', notes: 'A-internal note',
        },
      })
      return { restaurant, inspection }
    }

    it('is refused by the database while its inspections name the old tenant\'s mashgiach', async () => {
      const a = await tenant('A1')
      const b = await tenant('B1')
      const { restaurant } = await placeWithHistory(a)

      await expect(prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { rabbanutId: b.rabbanut.id, hechsherId: b.hechsher.id },
      })).rejects.toThrow('Cannot move a restaurant while cross-tenant dependants remain')

      expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).rabbanutId).toBe(a.rabbanut.id)
    })

    it('keeps the history but detaches the old tenant\'s mashgiach when the CRM moves it', async () => {
      const a = await tenant('A2')
      const b = await tenant('B2')
      const { restaurant, inspection } = await placeWithHistory(a)
      const ownHistory = await prisma.inspection.create({
        data: { restaurantId: restaurant.id, date: new Date('2026-09-02'), type: 'planned' },
      })

      const moved = await restaurantsRepo.update(restaurant.id, { rabbanutId: b.rabbanut.id, hechsherId: b.hechsher.id })

      expect(moved?.rabbanutId).toBe(b.rabbanut.id)
      const rows = await prisma.inspection.findMany({ where: { restaurantId: restaurant.id }, orderBy: { date: 'asc' } })
      expect(rows.map(r => r.id)).toEqual([inspection.id, ownHistory.id])
      expect(rows.every(r => r.mashgiachId === null)).toBe(true)
    })

    it('leaves inspections alone when the rabbanut does not change', async () => {
      const a = await tenant('A3')
      const { restaurant, inspection } = await placeWithHistory(a)

      await restaurantsRepo.update(restaurant.id, { rabbanutId: a.rabbanut.id, name: 'Falafel 2' })

      expect((await prisma.inspection.findUniqueOrThrow({ where: { id: inspection.id } })).mashgiachId).toBe(a.mashgiach.id)
    })
  })
})
