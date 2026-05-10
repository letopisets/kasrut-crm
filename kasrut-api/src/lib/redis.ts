import Redis from 'ioredis'
import { env } from '../config/env'
import { isTest } from './runtime'

// Lazy-connect so the API starts even if Redis is not running
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect:         true,
  enableOfflineQueue:  false,
  connectTimeout:      2000,
  maxRetriesPerRequest: 0,
})

if (!isTest) {
  redis.on('connect', () => console.log('[Redis] connected'))
  redis.on('error',   (e: Error) => {
    // Only log once to avoid flooding logs
    if ((redis as unknown as { _redisWarned?: boolean })._redisWarned) return
    ;(redis as unknown as { _redisWarned?: boolean })._redisWarned = true
    console.warn('[Redis] unavailable — running without cache:', e.message)
  })

  /** Attempt connection in background; failures are swallowed */
  redis.connect().catch(() => { /* will be logged by the error handler above */ })
}
