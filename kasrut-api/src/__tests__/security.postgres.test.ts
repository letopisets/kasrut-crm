import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { claimTotpTimeStep, consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { purgeExpiredTokens } from '../lib/tokenPurge'

// Real Postgres for what the mocked suites cannot see: the 2FA single-use
// writes. Opt-in, for a THROWAWAY database with every
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
  const jtiPrefix = `pg-${run}-`

  afterAll(async () => {
    await prisma.twoFactorChallenge.deleteMany({ where: { jti: { startsWith: jtiPrefix } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
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
})
