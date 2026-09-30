import fs from 'fs'
import path from 'path'
import type { redis as RedisClient } from '../lib/redis'

// Redis requires a password (docker-compose.yml: --requirepass), and the api
// learns it only from REDIS_URL (redis://:<password>@redis:6379). These tests
// pin that the one client takes it from the URL and that no other module opens
// a client of its own that would skip it.

const API_ROOT = path.resolve(__dirname, '../..')

function loadClient(url: string): typeof RedisClient {
  const saved = process.env.REDIS_URL
  process.env.REDIS_URL = url
  try {
    let client: typeof RedisClient | undefined
    jest.isolateModules(() => {
      client = (require('../lib/redis') as typeof import('../lib/redis')).redis
    })
    return client as typeof RedisClient
  } finally {
    if (saved === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = saved
  }
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return ['node_modules', 'generated', '__tests__'].includes(entry.name) ? [] : sourceFiles(full)
    }
    return /\.(ts|cjs|js)$/.test(entry.name) ? [full] : []
  })
}

describe('Redis client', () => {
  it('authenticates with the password from REDIS_URL', () => {
    const password = 'a'.repeat(64)
    const client = loadClient(`redis://:${password}@redis:6379`)

    expect(client.options.password).toBe(password)
    // No username → ioredis sends the single-argument AUTH <password> that
    // --requirepass expects.
    expect(client.options.username).toBeFalsy()
    expect(client.options.host).toBe('redis')
    expect(Number(client.options.port)).toBe(6379)
    // Tests never open the connection.
    expect(client.status).toBe('wait')
  })

  it('is the only Redis client in the api', () => {
    const opensClient = /from\s+['"]ioredis['"]|require\(\s*['"]ioredis['"]\s*\)|new\s+(IO)?Redis\s*\(/
    const offenders = ['src', 'scripts', 'prisma']
      .flatMap(dir => sourceFiles(path.join(API_ROOT, dir)))
      .filter(file => opensClient.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(API_ROOT, file).split(path.sep).join('/'))

    expect(offenders).toEqual(['src/lib/redis.ts'])
  })
})
