import express from 'express'
import request from 'supertest'
import { consumeRateLimit, normalizeClientIp, rateLimit, resetRateLimitMemory } from '../middleware/rateLimit'

jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))

describe('normalizeClientIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:203.0.113.7', '203.0.113.7'],
    ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['0000:0000:0000:0000:0000:ffff:cb00:7107', '203.0.113.7'],
  ])('maps IPv4 and IPv4-mapped %s to %s', (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected)
  })

  it.each([
    ['::1', '0000:0000:0000:0000::/64'],
    ['::', '0000:0000:0000:0000::/64'],
    ['2001:db8::1', '2001:0db8:0000:0000::/64'],
    ['2001:DB8:AAAA:BBBB:1:2:3:4', '2001:0db8:aaaa:bbbb::/64'],
    ['2001:0db8:0001:0002:0003:0004:0005:0006', '2001:0db8:0001:0002::/64'],
    ['2001:db8:1:2::', '2001:0db8:0001:0002::/64'],
    ['1::2:3:4:5:6:7', '0001:0000:0002:0003::/64'],
    ['1:2:3:4:5:6:7::', '0001:0002:0003:0004::/64'],
    ['64:ff9b::203.0.113.7', '0064:ff9b:0000:0000::/64'],
    ['::203.0.113.7', '0000:0000:0000:0000::/64'],
  ])('maps IPv6 %s to its /64 prefix %s', (input, expected) => {
    expect(normalizeClientIp(input)).toBe(expected)
  })

  it('strips zone ids', () => {
    expect(normalizeClientIp('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64')
    expect(normalizeClientIp('FE80::ABCD:1%25')).toBe('fe80:0000:0000:0000::/64')
    expect(normalizeClientIp('::ffff:10.0.0.1%lo')).toBe('10.0.0.1')
  })

  it('puts every address of one /64 in the same bucket and different /64s apart', () => {
    const a = normalizeClientIp('2001:db8:0:1:aaaa::1')
    expect(normalizeClientIp('2001:db8:0:1:ffff:ffff:ffff:ffff')).toBe(a)
    expect(normalizeClientIp('2001:db8:0:2:aaaa::1')).not.toBe(a)
  })

  it('returns unparseable input unchanged', () => {
    expect(normalizeClientIp('unknown')).toBe('unknown')
    expect(normalizeClientIp('2001:db8::1::2')).toBe('2001:db8::1::2')
    expect(normalizeClientIp('')).toBe('')
  })
})

describe('rateLimit bucket key', () => {
  const app = express()
  app.set('trust proxy', 1)
  app.get('/limited', rateLimit({ keyPrefix: 'test-v6', windowMs: 60_000, max: 1 }), (_req, res) => {
    res.json({ ok: true })
  })

  it('shares one budget across a rotating IPv6 /64', async () => {
    const first = await request(app).get('/limited').set('X-Forwarded-For', '2001:db8:5:6::1')
    const second = await request(app).get('/limited').set('X-Forwarded-For', '2001:db8:5:6:dead:beef:0:2')
    const otherNet = await request(app).get('/limited').set('X-Forwarded-For', '2001:db8:5:7::1')

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(otherNet.status).toBe(200)
  })

  it('treats an IPv4-mapped address as the IPv4 client', async () => {
    const first = await request(app).get('/limited').set('X-Forwarded-For', '198.51.100.9')
    const mapped = await request(app).get('/limited').set('X-Forwarded-For', '::ffff:198.51.100.9')

    expect(first.status).toBe(200)
    expect(mapped.status).toBe(429)
  })
})

describe('rateLimit keyBy', () => {
  const app = express()
  app.set('trust proxy', 1)
  app.get(
    '/per-account',
    rateLimit({ keyPrefix: 'test-key-by', windowMs: 60_000, max: 1, keyBy: req => req.get('X-Account') }),
    (_req, res) => { res.json({ ok: true }) },
  )

  it('counts per returned key whatever the address', async () => {
    const first = await request(app).get('/per-account').set('X-Account', 'a').set('X-Forwarded-For', '203.0.113.1')
    const again = await request(app).get('/per-account').set('X-Account', 'a').set('X-Forwarded-For', '203.0.113.2')
    const other = await request(app).get('/per-account').set('X-Account', 'b').set('X-Forwarded-For', '203.0.113.2')

    expect(first.status).toBe(200)
    expect(again.status).toBe(429)
    expect(other.status).toBe(200)
  })

  it('falls back to the client address when no key is returned', async () => {
    const first = await request(app).get('/per-account').set('X-Forwarded-For', '198.51.100.20')
    const second = await request(app).get('/per-account').set('X-Forwarded-For', '198.51.100.20')

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
  })
})

describe('consumeRateLimit', () => {
  const window = { keyPrefix: 'test-consume', windowMs: 60_000, max: 2 }

  it('counts each call against its bucket only', async () => {
    const results = [
      await consumeRateLimit(window, 'a'),
      await consumeRateLimit(window, 'a'),
      await consumeRateLimit(window, 'a'),
    ]
    expect(results.map(r => r.allowed)).toEqual([true, true, false])
    expect(results.map(r => r.remaining)).toEqual([1, 0, 0])
    expect(results[2].retryAfter).toBeGreaterThan(0)
    expect((await consumeRateLimit(window, 'b')).allowed).toBe(true)
  })

  it('starts over after resetRateLimitMemory', async () => {
    await consumeRateLimit(window, 'c')
    await consumeRateLimit(window, 'c')
    resetRateLimitMemory()
    expect((await consumeRateLimit(window, 'c')).allowed).toBe(true)
  })
})
