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
 */

export class ForbiddenScopeError extends Error {
  readonly status = 403 as const
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenScopeError'
  }
}

/** Resolve which rabbanutId a list/read query should be scoped to. */
export function resolveScopeRabbanutId(
  req: Request,
  fallback?: string,
): string | undefined {
  if (req.user?.role === 'rabbanut') return req.user.rabbanutId
  return fallback
}

/** Force a rabbanut user's writes onto their own rabbanutId. Owner passes
 *  through unchanged. Throws if a rabbanut tries to set a different id. */
export function applyWriteScope<T extends { rabbanutId?: string }>(
  req: Request,
  body: T,
): T & { rabbanutId?: string } {
  if (req.user?.role !== 'rabbanut') return body

  if (body.rabbanutId !== undefined && body.rabbanutId !== req.user.rabbanutId) {
    throw new ForbiddenScopeError()
  }
  return { ...body, rabbanutId: req.user.rabbanutId! }
}

/** Throw if a rabbanut user is acting on an entity owned by another rabbanut.
 *  Owners and entity-less callers pass through. */
export function assertOwnsRabbanut(
  req: Request,
  entity: { rabbanutId: string } | null | undefined,
): void {
  if (!entity) return
  if (req.user?.role === 'rabbanut' && entity.rabbanutId !== req.user.rabbanutId) {
    throw new ForbiddenScopeError()
  }
}
