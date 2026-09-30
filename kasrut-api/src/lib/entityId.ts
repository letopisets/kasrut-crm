// Every id the API issues or imports is short and URL-safe: Prisma cuids, the
// PDF importer's `r_<14 hex>`, the Machpud SQL import's `r_mach_<12 hex>` and
// seed ids like `r1`. A path or body id outside this shape cannot match a row,
// so public handlers answer 404 before it costs a cache lookup or a query, and
// a NUL byte or an oversized value never reaches Postgres as a 500.
export const ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && ENTITY_ID_RE.test(value)
}
