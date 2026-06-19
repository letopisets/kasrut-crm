import { serializeRestaurant, serializeRestaurants } from '../serializers/restaurant.serializer'
import { serializeInspection, serializeInspections } from '../serializers/inspection.serializer'
import { serializeUser, serializeUsers } from '../serializers/user.serializer'
import type { Restaurant, Inspection, User } from '../models/types'

describe('serializers', () => {
  describe('serializeRestaurant', () => {
    const r: Restaurant = {
      id: 'r1', name: 'A', address: 'addr', city: 'TLV',
      levelId: 'kl_regular', level: 'Regular', hechsherId: 'h1', mashgiachId: undefined,
      kitniyot: false, expires: '2030-01-01', status: 'ok',
      rabbanutId: 'rb1', notes: undefined, lastInspection: undefined,
    }

    it('replaces undefined optional fields with null', () => {
      const out = serializeRestaurant(r)
      expect(out.mashgiachId).toBeNull()
      expect(out.notes).toBeNull()
      expect(out.lastInspection).toBeNull()
    })

    it('preserves all required fields', () => {
      const out = serializeRestaurant({ ...r, mashgiachId: 'm1', notes: 'n', lastInspection: '2026-01-01', levelId: 'kl_mehadrin', level: 'Mehadrin' })
      expect(out).toMatchObject({
        id: 'r1', name: 'A', mashgiachId: 'm1', notes: 'n', lastInspection: '2026-01-01',
      })
    })

    it('serializeRestaurants maps an array', () => {
      expect(serializeRestaurants([r, r])).toHaveLength(2)
    })
  })

  describe('serializeInspection', () => {
    const i: Inspection = {
      id: 'i1', restaurantId: 'r1', mashgiachId: 'm1',
      date: '2026-04-01', type: 'planned', result: 'pass',
      notes: undefined,
    }

    it('replaces undefined notes with null', () => {
      expect(serializeInspection(i).notes).toBeNull()
    })

    it('preserves notes when present', () => {
      expect(serializeInspection({ ...i, notes: 'x' }).notes).toBe('x')
    })

    it('serializeInspections maps an array', () => {
      expect(serializeInspections([i])).toHaveLength(1)
    })
  })

  describe('serializeUser', () => {
    const u: User = {
      id: 'u1', name: 'A', email: 'a@b.il',
      passwordHash: 'SECRET-HASH', role: 'owner',
      twoFactorEnabled: false, twoFactorBackupCodes: [],
    }

    it('strips passwordHash from output', () => {
      const out = serializeUser(u) as Record<string, unknown>
      expect(out.passwordHash).toBeUndefined()
      expect(JSON.stringify(out)).not.toContain('SECRET-HASH')
    })

    it('omits rabbanutId when undefined', () => {
      const out = serializeUser(u) as Record<string, unknown>
      expect(out.rabbanutId).toBeUndefined()
    })

    it('includes rabbanutId when present', () => {
      const out = serializeUser({ ...u, rabbanutId: 'rb1', role: 'rabbanut' }) as Record<string, unknown>
      expect(out.rabbanutId).toBe('rb1')
    })

    it('does not leak twoFactorSecret or backup codes', () => {
      const withSecret: User = { ...u, twoFactorSecret: 'TOTP-SEED', twoFactorBackupCodes: ['code1'] }
      const out = JSON.stringify(serializeUser(withSecret))
      expect(out).not.toContain('TOTP-SEED')
      expect(out).not.toContain('code1')
    })

    it('serializeUsers maps an array', () => {
      expect(serializeUsers([u, u])).toHaveLength(2)
    })
  })
})
