import { withCache, invalidatePattern } from '../lib/cache'
import { redis } from '../lib/redis'

jest.mock('../lib/redis', () => ({
  redis: {
    get:    jest.fn(),
    setex:  jest.fn(),
    scan:   jest.fn(),
    del:    jest.fn(),
  },
}))

const mockedRedis = redis as unknown as {
  get:   jest.Mock
  setex: jest.Mock
  scan:  jest.Mock
  del:   jest.Mock
}

describe('withCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns cached value on hit (does not call loader)', async () => {
    mockedRedis.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }))
    const loader = jest.fn().mockResolvedValue({ a: 999 })

    const data = await withCache('k', 60, loader)

    expect(data).toEqual({ a: 1 })
    expect(loader).not.toHaveBeenCalled()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('falls back to loader on miss and writes through to redis', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    mockedRedis.setex.mockResolvedValueOnce('OK')
    const loader = jest.fn().mockResolvedValue({ a: 2 })

    const data = await withCache('k', 60, loader)

    expect(data).toEqual({ a: 2 })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('k', 60, JSON.stringify({ a: 2 }))
  })

  it('returns loader result when redis read throws', async () => {
    mockedRedis.get.mockRejectedValueOnce(new Error('redis down'))
    const loader = jest.fn().mockResolvedValue('fresh')

    const data = await withCache('k', 60, loader)

    expect(data).toBe('fresh')
  })

  it('returns loader result when redis write throws', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    mockedRedis.setex.mockRejectedValueOnce(new Error('write fail'))
    const loader = jest.fn().mockResolvedValue('fresh')

    const data = await withCache('k', 60, loader)

    expect(data).toBe('fresh')
  })
})

describe('invalidatePattern', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes all matching keys across multiple scan pages', async () => {
    mockedRedis.scan
      .mockResolvedValueOnce(['10', ['a:1', 'a:2']])
      .mockResolvedValueOnce(['0',  ['a:3']])
    await invalidatePattern('a:*')
    expect(mockedRedis.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'a:*', 'COUNT', 200)
    expect(mockedRedis.scan).toHaveBeenNthCalledWith(2, '10', 'MATCH', 'a:*', 'COUNT', 200)
    expect(mockedRedis.del).toHaveBeenCalledWith('a:1', 'a:2')
    expect(mockedRedis.del).toHaveBeenCalledWith('a:3')
  })

  it('does nothing when no keys match', async () => {
    mockedRedis.scan.mockResolvedValueOnce(['0', []])
    await invalidatePattern('z:*')
    expect(mockedRedis.del).not.toHaveBeenCalled()
  })

  it('swallows redis errors silently', async () => {
    mockedRedis.scan.mockRejectedValueOnce(new Error('down'))
    await expect(invalidatePattern('a:*')).resolves.toBeUndefined()
  })
})
