import fs from 'fs'
import net from 'net'
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

// A Redis that accepts the connection and answers the ready check, then stops
// answering: what a paused container or a stalled fork looks like to the API.
function startSilentRedis(): Promise<{ server: net.Server; port: number }> {
  const info = '# Server\r\nloading:0\r\n'
  const server = net.createServer(socket => {
    socket.on('data', chunk => {
      // Only the connection handshake (CLIENT SETINFO, then the INFO ready
      // check) is answered, in order; every later command hangs.
      for (const [, name] of chunk.toString('latin1').matchAll(/\*\d+\r\n\$\d+\r\n([A-Za-z]+)\r\n/g)) {
        const command = name.toLowerCase()
        if (command === 'client') socket.write('+OK\r\n')
        else if (command === 'info') socket.write(`$${info.length}\r\n${info}\r\n`)
      }
    })
    socket.on('error', () => { /* the client hangs up at the end */ })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port }))
  })
}

describe('Redis client against an unresponsive server', () => {
  it('fails a command after the command timeout instead of waiting forever', async () => {
    const { server, port } = await startSilentRedis()
    const client = loadClient(`redis://127.0.0.1:${port}`)
    try {
      await client.connect()
      expect(client.status).toBe('ready')

      const started = Date.now()
      await expect(client.get('any-key')).rejects.toThrow(/timed out/i)
      const elapsed = Date.now() - started
      expect(elapsed).toBeGreaterThanOrEqual(400)
      expect(elapsed).toBeLessThan(3000)
      // Still 'ready': callers that only check the status would not notice,
      // which is why the timeout has to come from the client.
      expect(client.status).toBe('ready')
    } finally {
      client.disconnect()
      await new Promise(resolve => server.close(resolve))
    }
  }, 10_000)
})
