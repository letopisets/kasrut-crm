# ADR-0006: Per-purpose JWT keys and a separate map secret

**Date:** 2026-09-30  
**Status:** Accepted (implements the approved security plan, stage 3, item 5:
separate secrets for CRM and map)

## Context

The security plan asked for separate secrets for CRM and map tokens, so that a
map token can never pass as a CRM token. Until then one `JWT_SECRET` signed
every token, and only claim checks (`typ`, role) kept CRM access tokens, map
access tokens and pending 2FA tokens apart.

A first version of this ADR derived every key from `JWT_SECRET` alone and left
a second secret out. That already keeps the purposes apart, but a leak of
`JWT_SECRET` still forges CRM and map tokens alike, and the map's keys cannot
be rotated without the CRM's. The plan's separate secret is therefore added
on top, as an optional variable.

## Decision

The API derives one HMAC key per token purpose with HKDF (SHA-256, salt
`kashrut-jwt-v1`, info `kashrut:<purpose>`, 32 bytes) in
`kasrut-api/src/lib/jwt.ts`:

| Purpose | Tokens | Derived from |
| --- | --- | --- |
| `crm-access` | CRM access tokens | `JWT_SECRET` |
| `2fa-pending` | CRM sign-ins waiting for the second factor | `JWT_SECRET` |
| `map-access` | Public map access tokens | `MAP_JWT_SECRET` when set, else `JWT_SECRET` |

`MAP_JWT_SECRET` is optional. Unset (or empty, which is how
`docker-compose.yml` passes an unset variable), the map key is derived from
`JWT_SECRET` exactly as before, so a deployment that does not set it behaves
as it did. When set, it must pass the same startup checks as `JWT_SECRET`
(32+ characters, no placeholder, 12+ distinct characters, no repeated pattern)
and must not equal or contain `JWT_SECRET` (`src/config/env.ts`). Production
sets it: `.env.hetzner.example` asks for it, and
`docs/deployment/hetzner.md#separate-map-secret` covers adding and rotating
it.

Verification is pinned to HS256 with issuer `kashrut-api` and a per-purpose
audience, and still checks `typ` and the other claims.

## Consequences

- A token of one purpose cannot verify as another, even where a claim check
  is missed: the keys differ, and HKDF keys are independent of each other
  (knowing one says nothing about another or about its secret).
- With `MAP_JWT_SECRET` set, a leak of one secret on its own (a value pasted
  into a ticket, a log, a copied config) forges only its side's tokens: map
  tokens for `MAP_JWT_SECRET`, CRM and pending-2FA tokens for `JWT_SECRET`.
  Both secrets still sit in the same `.env.hetzner` and the same api
  process, so a leak of the file, the container environment or the process
  exposes both; the split does not help there.
- Each secret can be rotated alone. Rotating either signs nobody out: it voids
  only the access tokens it keys (at most `ACCESS_TOKEN_TTL`, 15 minutes) and,
  for `JWT_SECRET`, 2FA sign-ins in progress; clients renew through their
  refresh cookies, which do not depend on any JWT secret. Setting
  `MAP_JWT_SECRET` for the first time, or removing it, has the same effect on
  map access tokens only.
- Two secrets to generate, validate and keep. The deploy preflight
  (`scripts/hetzner-deploy.sh`) validates both before anything restarts.
- Rotating a single purpose's keys without a new secret remains possible by
  bumping its info string or the salt in `lib/jwt.ts`.

## Alternatives considered

- **One secret, derived keys only** (the first version of this ADR). Simpler,
  but a `JWT_SECRET` leak forges map tokens too and the map's keys cannot be
  rotated on their own; it does not meet the plan's separate-secrets item.
- **Renaming `JWT_SECRET` to `CRM_JWT_SECRET`**. It would make the pairing
  symmetrical, but every existing deployment would have to rename its variable
  in lockstep with the deploy. `JWT_SECRET` stays the CRM (and 2FA) secret.
- **Making `MAP_JWT_SECRET` mandatory**. Every environment (local development,
  CI, the running server before its env file is updated) would stop starting
  until it is set. Optional with a fallback keeps today's behaviour until the
  variable is added; the production template asks for it.
