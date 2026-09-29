import type { Request } from 'express'

/**
 * Helpers that centralise the rabbanut-scoping logic. Three controllers
 * (restaurant, hechsher, mashgiach — and to a lesser extent inspection) used
 * to repeat `req.user?.role === 'rabbanut' ? req.user.rabbanutId : ...` in
 * four or five places each. A single bug there could leak data across
 * tenants, so the rules now live here.
 *
 * Conventions:
 * - Owner can pass any `rabbanutId` in the body / query (and is the only role
 *   allowed to create/move data across rabbanuts).
 * - Rabbanut is forced into their own `rabbanutId` and is forbidden from
 *   acting on entities owned by another rabbanut.
 * - Mashgiach reads are confined to their own `rabbanutId` exactly like a
 *   rabbanut's. Their writes are gated by requireRole on the routes, not here.
 * - Reads are allow-listed: only the owner is unscoped. Every other role (and
 *   a request without a user) must carry a rabbanutId or is refused, so a
 *   malformed account or a future role fails closed instead of reading all.
 */

export class ForbiddenScopeError extends Error {
  readonly status = 403 as const
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenScopeError'
  }
}

/** Resolve which rabbanutId a list/read query should be scoped to. Owners get
 *  the caller-supplied `fallback` (undefined = all tenants); every other role
 *  is pinned to its own rabbanutId, whatever it asked for. */
export function resolveScopeRabbanutId(
  req: Request,
  fallback?: string,
): string | undefined {
  // Callers pass raw query values: qs turns `?rabbanutId[not]=x` into an
  // object that Prisma would read as a filter operator and that cache keys
  // would stringify to '[object Object]'. Only a plain string is a filter.
  if (req.user?.role === 'owner') return typeof fallback === 'string' ? fallback : undefined
  // A tenant role without a tenant assignment must fail closed. Returning
  // undefined here is interpreted by repositories (and cache keys) as "no
  // filter", which would turn a malformed account into a global reader.
  if (!req.user?.rabbanutId) throw new ForbiddenScopeError()
  return req.user.rabbanutId
}

/** Force a rabbanut user's writes onto their own rabbanutId. Owner passes
 *  through unchanged. Throws if a rabbanut tries to set a different id. */
export function applyWriteScope<T extends { rabbanutId?: string }>(
  req: Request,
  body: T,
): T & { rabbanutId?: string } {
  if (req.user?.role !== 'rabbanut') return body

  if (!req.user.rabbanutId) throw new ForbiddenScopeError()

  if (body.rabbanutId !== undefined && body.rabbanutId !== req.user.rabbanutId) {
    throw new ForbiddenScopeError()
  }
  return { ...body, rabbanutId: req.user.rabbanutId }
}

/** Throw if a non-owner (rabbanut or mashgiach) is acting on an entity owned
 *  by another rabbanut, or has no rabbanut at all. Owners and entity-less
 *  callers pass through. */
export function assertOwnsRabbanut(
  req: Request,
  entity: { rabbanutId: string } | null | undefined,
): void {
  if (!entity) return
  if (req.user?.role === 'owner') return
  if (!req.user?.rabbanutId || entity.rabbanutId !== req.user.rabbanutId) {
    throw new ForbiddenScopeError()
  }
}
