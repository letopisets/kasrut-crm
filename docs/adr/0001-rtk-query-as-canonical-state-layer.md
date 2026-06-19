# ADR-0001: RTK Query as the canonical state and networking layer

**Date:** 2025-11-01  
**Status:** Accepted

## Context

The CRM frontend started with Zustand stores and raw axios calls for data fetching. This led to:
- Duplicate fetch calls (store hydration + component-level fetches)
- Manual cache invalidation scattered across 7 store files
- No request deduplication — parallel mounts triggered multiple identical API calls

The map frontend had similar issues with its own axios-based service layer.

## Decision

Use **Redux Toolkit + RTK Query** as the single source of truth for both server state and networking across `kasrut-crm` and `kasrut-map`.

- All HTTP calls go through `src/store/api/*Api.ts` files built on `baseApi`
- Components read via `useGet*Query`, mutate via `use*Mutation`
- Cache tags (`providesTags` / `invalidatesTags`) drive automatic refetch after mutations
- Zustand shims and direct axios calls were deleted in commit `7ff8cb4`

## Consequences

**Positive:**
- Request deduplication and normalized caching out of the box
- No more manual `refetch()` calls — tag invalidation handles it
- Single `store/index.ts` to audit for all state

**Negative:**
- RTK Query's tag-based invalidation requires discipline when adding new endpoints
- Slightly more boilerplate than a raw `useSWR` hook, but buys us the Redux DevTools integration
