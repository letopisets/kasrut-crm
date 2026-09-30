import Redis from 'ioredis'
import { env } from '../config/env'
import { isTest } from './runtime'

// A Redis that accepts connections but stops answering (paused container,
// fork or OOM stall, network black hole) stays 'ready', so without a command
// timeout every call would wait forever and the fallbacks that engage on an
// error (in-memory rate limiter and login throttle, fail-open blacklist,
// map-cache bypass, /health "redis":"error") never would. Commands normally
// answer in well under a millisecond on the compose network.
export const REDIS_COMMAND_TIMEOUT_MS = 500

// Lazy-connect so the API starts even if Redis is not running
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect:         true,
  enableOfflineQueue:  false,
  connectTimeout:      2000,
  commandTimeout:      REDIS_COMMAND_TIMEOUT_MS,
  maxRetriesPerRequest: 0,
  retryStrategy:        isTest ? () => null : undefined,
})

redis.on('error', (e: Error) => {
  if (isTest) return
  // Only log once to avoid flooding logs
  if ((redis as unknown as { _redisWarned?: boolean })._redisWarned) return
  ;(redis as unknown as { _redisWarned?: boolean })._redisWarned = true
  console.warn('[Redis] unavailable — running without cache:', e.message)
})

if (!isTest) {
  // 'ready', not 'connect': 'connect' fires on every TCP (re)connect, before
  // AUTH, so a wrong REDIS_PASSWORD printed "connected" every couple of
  // seconds. 'ready' means authenticated and usable.
  redis.on('ready', () => console.log('[Redis] ready'))
  /** Attempt connection in background; failures are swallowed */
  redis.connect().catch(() => { /* will be logged by the error handler above */ })
}
