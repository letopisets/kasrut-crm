import { invalidateKeys, invalidateNamespace, invalidatePattern, withNamespaceCache } from './cache'

// Every public-map response that depends on CRM data (restaurant list pages,
// single restaurant, filter options, hechsher list, sitemap) is cached in this
// generation-versioned namespace: `map:v<gen>:<suffix>`, generation in
// `map:gen`. Its keys can be minted by anyone (each distinct viewport or
// filter is an entry), so it is invalidated by bumping the generation, which
// is complete however many keys a scraper has created. OSRM walking routes
// live under `route:*` instead: they never depend on CRM data.
const MAP_NAMESPACE = 'map'

/** Read-through cache for the public-map entry `suffix`. */
export const withMapCache = <T>(suffix: string, ttl: number, fn: () => Promise<T>): Promise<T> =>
  withNamespaceCache(MAP_NAMESPACE, suffix, ttl, fn)

// Fixed keys of the unversioned layout that builds before ADR-0005 read. This
// build never reads them, but it drops them on every invalidation so that a
// rollback to such a build cannot serve a snapshot (the sitemap lives 1 h)
// taken before a mutation made here. Safe to remove one release after.
const LEGACY_MAP_KEYS = ['map:sitemap', 'map:options', 'map:hechsherim']

/**
 * One-stop cache buster for map data.
 *
 * Bumps the map namespace generation (O(1), complete), drops the legacy fixed
 * keys and sweeps `restaurants:*`, the legacy CRM cache namespace, which only
 * authenticated CRM requests can populate.
 */
export const invalidateMapCache = (): Promise<unknown> => Promise.all([
  invalidateNamespace(MAP_NAMESPACE),
  invalidateKeys(...LEGACY_MAP_KEYS),
  invalidatePattern('restaurants:*'),
])
