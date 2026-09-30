# ADR-0006: Per-purpose JWT keys derived from one secret

**Date:** 2026-09-30  
**Status:** Proposed (awaiting sign-off: security plan stage 3, item 5)

## Context

The security plan asked for separate secrets for CRM and map tokens, so that a
map token can never pass as a CRM token. Until then one `JWT_SECRET` signed
every token, and only claim checks (`typ`, role) kept CRM access tokens, map
access tokens and pending 2FA tokens apart.

## Decision

The API derives one HMAC key per token purpose from `JWT_SECRET` with HKDF
(SHA-256, salt `kashrut-jwt-v1`, info `kashrut:<purpose>`) in
`kasrut-api/src/lib/jwt.ts`: `crm-access`, `map-access` and `2fa-pending`.
Verification is pinned to HS256 with issuer `kashrut-api` and a per-purpose
audience, and still checks `typ` and the other claims. No second secret is
configured.

## Consequences

- A token of one purpose cannot verify as another, even where a claim check
  is missed: the keys differ, and HKDF keys are independent of each other
  (knowing one says nothing about another or about `JWT_SECRET`).
- A leak of `JWT_SECRET` itself still lets an attacker forge CRM and map
  tokens alike. Separate `CRM_JWT_SECRET` / `MAP_JWT_SECRET` values would not
  change that in practice: both would live in the same `.env.hetzner`, read by
  the same api process, so any leak that exposes one exposes the other.
- One secret to generate, validate at startup (placeholder and low-entropy
  values are refused) and rotate. Rotating it signs nobody out: refresh
  cookies do not depend on it (see `docs/deployment/hetzner.md`).
- Rotating a single purpose's keys, should that ever be needed, means bumping
  its info string or the salt in `lib/jwt.ts`.

## Alternative considered

An optional `MAP_JWT_SECRET` that, when set, keys `map-access` instead. It adds
an environment variable, compose forwarding and startup validation for no
separation that the derived keys do not already give, so it is left out
unless the map and the CRM API ever run as separate services with separate
configuration.
