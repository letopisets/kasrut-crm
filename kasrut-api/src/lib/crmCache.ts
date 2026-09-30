import { invalidateNamespace, withNamespaceCache } from './cache'

// The CRM's restaurant and hechsher list caches, as generation-versioned
// namespaces like the public map's (ADR-0005): `restaurants:v<gen>:<suffix>`
// and `hechsherim:v<gen>:<suffix>`, generations in `restaurants:gen` and
// `hechsherim:gen`. They used to be swept with SCAN + DEL, which a Redis stall
// could cut short once commands time out (REDIS_COMMAND_TIMEOUT_MS): the
// mutation returned and its readers got the old list, a mashgiach's included,
// until the TTL ran out. A bump that fails instead leaves this process
// bypassing the namespace until one reaches Redis, and a bump that lands late
// only makes the entries written in between unreachable.
const RESTAURANTS_NAMESPACE = 'restaurants'
const HECHSHERIM_NAMESPACE = 'hechsherim'

/** Read-through cache for a CRM restaurant list entry. */
export const withRestaurantsCache = <T>(suffix: string, ttl: number, fn: () => Promise<T>): Promise<T> =>
  withNamespaceCache(RESTAURANTS_NAMESPACE, suffix, ttl, fn)

/** Read-through cache for a CRM hechsher list entry. */
export const withHechsherimCache = <T>(suffix: string, ttl: number, fn: () => Promise<T>): Promise<T> =>
  withNamespaceCache(HECHSHERIM_NAMESPACE, suffix, ttl, fn)

/** Drops every CRM restaurant list (one INCR). */
export const invalidateRestaurantsCache = (): Promise<void> => invalidateNamespace(RESTAURANTS_NAMESPACE)

/** Drops every CRM hechsher list (one INCR). */
export const invalidateHechsherimCache = (): Promise<void> => invalidateNamespace(HECHSHERIM_NAMESPACE)
