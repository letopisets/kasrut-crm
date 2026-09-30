import { invalidateKeys, invalidatePattern } from './cache'

// Fixed public-map keys. Dropped by name alongside the pattern sweeps, so a
// namespace grown past invalidatePattern's key cap can never leave the sitemap
// (1 h TTL), filter options or hechsher list serving withdrawn places.
export const MAP_CACHE_KEYS = {
  sitemap:    'map:sitemap',
  options:    'map:options',
  hechsherim: 'map:hechsherim',
} as const

/**
 * One-stop cache buster for map data.
 *
 * `restaurants:*` is the legacy CRM cache namespace; `map:*` covers every
 * Redis entry produced by the public map controllers that depends on CRM data
 * (restaurants, single restaurant, options, hechsherim, sitemap). OSRM walking
 * routes live under `route:*` instead: they never depend on CRM data, so CRM
 * mutations neither flush them nor have to sweep past them.
 */
export const invalidateMapCache = (): Promise<unknown> => Promise.all([
  invalidateKeys(...Object.values(MAP_CACHE_KEYS)),
  invalidatePattern('restaurants:*'),
  invalidatePattern('map:*'),
])
