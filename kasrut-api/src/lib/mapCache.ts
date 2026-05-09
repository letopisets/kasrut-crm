import { invalidatePattern } from './cache'

/**
 * One-stop cache buster for map data.
 *
 * `restaurants:*` is the legacy CRM cache namespace; `map:*` covers every
 * Redis entry produced by the public map controllers (restaurants, options,
 * hechsherim, route). A single SCAN per namespace beats four targeted scans
 * because the cursor only walks the keyspace once.
 */
export const invalidateMapCache = (): Promise<unknown> => Promise.all([
  invalidatePattern('restaurants:*'),
  invalidatePattern('map:*'),
])
