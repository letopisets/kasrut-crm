import { redis } from './redis'
import { logger } from './logger'

// Collapse concurrent misses for the same key inside this API process. This
// prevents a burst from fanning out into identical database/upstream requests.
// Each flight remembers the generation it started in (see below): a caller
// arriving after an invalidation must not join a load that may have read the
// pre-mutation rows, so it starts a fresh one instead.
interface InFlightLoad { generation: number; promise: Promise<unknown> }
const inFlightLoads = new Map<string, InFlightLoad>()

// Any invalidation advances this process-local generation. A loader captures
// the generation before reading from the database and may populate Redis only
// if no mutation invalidated caches while that read was in flight. This closes
// the read -> invalidate -> stale SETEX race without coupling callers to cache
// implementation details. A global generation is intentionally conservative:
// unrelated invalidations can cause an extra miss, never stale data.
let cacheGeneration = 0

/**
 * Run fn() once per key for all concurrent callers of the same generation.
 * `store` (when given) receives a non-null result, unless an invalidation ran
 * while fn() was in flight.
 */
async function loadOnce<T>(key: string, fn: () => Promise<T>, store?: (data: T) => Promise<unknown>): Promise<T> {
  const existing = inFlightLoads.get(key)
  if (existing && existing.generation === cacheGeneration) return existing.promise as Promise<T>

  const loadGeneration = cacheGeneration
  const pending = (async () => {
    const data = await fn()

    // ── try write ───────────────────────────────────────────────────────────
    if (store && data != null && loadGeneration === cacheGeneration) {
      try {
        await store(data)
      } catch {
        // ignore
      }
    }

    return data
  })()

  inFlightLoads.set(key, { generation: loadGeneration, promise: pending })
  try {
    return await pending
  } finally {
    // Do not delete a newer flight if this promise finishes after a
    // replacement was installed for the same key.
    if (inFlightLoads.get(key)?.promise === pending) inFlightLoads.delete(key)
  }
}

/**
 * Read-through cache.
 * Falls back to fn() silently when Redis is unavailable.
 * A null/undefined result is returned but never stored: misses (e.g. an
 * unknown id) cost one indexed lookup, while caching them would let any
 * client mint keys at will, each held in Redis for its TTL.
 * @param key  Cache key
 * @param ttl  Time-to-live in seconds
 * @param fn   Data-loader called on cache miss
 */
export async function withCache<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  // ── try read ─────────────────────────────────────────────────────────────
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {
    // Redis down → continue to DB
  }

  return loadOnce(key, fn, data => redis.setex(key, ttl, JSON.stringify(data)))
}

// ── Generation-versioned namespaces ─────────────────────────────────────────
// Deleting a namespace's keys (SCAN + DEL) has to visit every key, so a
// namespace whose keys the public can mint (every distinct map viewport is an
// entry) can be flooded until a sweep no longer reaches, say, the entry of a
// withdrawn place; and a sweep that a Redis stall cuts short (commands time
// out, see REDIS_COMMAND_TIMEOUT_MS) leaves the rest in place with nothing
// owing the difference. A namespace instead embeds a
// generation counter kept in Redis (`<ns>:gen`) in every key it writes
// (`<ns>:v<gen>:<suffix>`). Invalidation is one INCR, however many keys exist:
// no reader can compute an old key again, and old keys expire by their TTL.
// The counter is read on every request, so every API process sees a bump that
// reached Redis at once; a mutation commits before it invalidates, so any load
// that read the new generation also reads the committed rows. A bump that
// failed is owed only by the process that issued it (see pendingBumps).

// Namespaces whose last bump never reached Redis. Until one succeeds this
// process cannot tell whether the stored generation predates that mutation,
// so it bypasses the namespace and retries the bump on the next read.
const pendingBumps = new Set<string>()

// At most 18 digits, so INCR (a signed 64-bit integer) can always advance it.
const GENERATION_RE = /^\d{1,18}$/

const generationKey = (namespace: string) => `${namespace}:gen`

// Seeding from the clock rather than from 0 means a counter lost to a flush or
// eviction can never walk back onto keys a previous counter wrote that are
// still within their TTL.
const seedGeneration = (key: string) => redis.set(key, String(Date.now()), 'NX')

// Compare-and-set: replaces the value only while it is still the unusable one
// this process read, so a concurrent repair or bump is never overwritten.
const RESEED_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end return 0"

/**
 * The counter stored at `key`, seeded from the clock when it is missing and
 * reseeded when it is not a counter (a hand edit, a foreign writer), since
 * otherwise no bump could ever advance it. Throws when Redis refuses.
 */
async function currentGeneration(key: string): Promise<string | null> {
  const current = await redis.get(key)
  if (current !== null && GENERATION_RE.test(current)) return current
  if (current === null) {
    await seedGeneration(key)
  } else if (await redis.eval(RESEED_SCRIPT, 1, key, current, String(Date.now())) === 1) {
    logger.warn({ key }, 'cache generation was not a counter; reseeded it from the clock')
  }
  const seeded = await redis.get(key)
  return seeded !== null && GENERATION_RE.test(seeded) ? seeded : null
}

async function bumpGeneration(namespace: string): Promise<void> {
  const key = generationKey(namespace)
  await currentGeneration(key)
  await redis.incr(key)
  pendingBumps.delete(namespace)
}

/** The namespace's current generation, or null when Redis cannot vouch for one. */
async function readGeneration(namespace: string): Promise<string | null> {
  try {
    if (pendingBumps.has(namespace)) await bumpGeneration(namespace)
    return await currentGeneration(generationKey(namespace))
  } catch {
    return null
  }
}

// A bypassed namespace sends every read to the source, which is worth knowing
// while it lasts (Redis down, or up but refusing writes: MISCONF, OOM), but
// not once per request.
const BYPASS_WARN_INTERVAL_MS = 5 * 60_000
const lastBypassWarn = new Map<string, number>()

function warnBypassed(namespace: string): void {
  const now = Date.now()
  const last = lastBypassWarn.get(namespace)
  if (last !== undefined && now - last < BYPASS_WARN_INTERVAL_MS) return
  lastBypassWarn.set(namespace, now)
  logger.warn(
    { namespace, bumpOwed: pendingBumps.has(namespace) },
    'cache namespace bypassed: Redis cannot vouch for its generation; reads go to the source',
  )
}

/**
 * withCache for the entry `suffix` of a generation-versioned namespace (see
 * invalidateNamespace). Without a trustworthy generation (Redis down, or a
 * bump still owed) it neither reads nor writes Redis: it loads from the
 * source, still coalescing concurrent callers inside this process.
 */
export async function withNamespaceCache<T>(
  namespace: string, suffix: string, ttl: number, fn: () => Promise<T>,
): Promise<T> {
  const generation = await readGeneration(namespace)
  if (generation === null) {
    warnBypassed(namespace)
    return loadOnce(`${namespace}:offline:${suffix}`, fn)
  }
  return withCache(`${namespace}:v${generation}:${suffix}`, ttl, fn)
}

/**
 * Invalidate every entry of a namespace in O(1) by advancing its generation.
 * Nothing is deleted: superseded entries are unreachable and expire by TTL.
 */
export async function invalidateNamespace(namespace: string): Promise<void> {
  // Advance before the Redis round trip, like invalidateKeys: loads that
  // started before this mutation must not write their snapshot back.
  cacheGeneration += 1
  try {
    await bumpGeneration(namespace)
  } catch {
    pendingBumps.add(namespace)
    logger.warn({ namespace }, 'cache generation bump failed; namespace bypassed until Redis accepts one')
  }
}

/**
 * Delete specific keys. For fixed keys that must go on every invalidation
 * regardless of how large the surrounding namespace has grown.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  cacheGeneration += 1
  if (!keys.length) return
  try {
    await redis.del(...keys)
  } catch {
    // ignore
  }
}
