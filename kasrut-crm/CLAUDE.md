

# KashrutCRM — Project Context for Claude Code

## Project Overview

A multi-tenant CRM system for kashrut (kosher certification) management organizations. The system manages establishments (restaurants, food businesses), inspections, certifying organizations (hechsherim), mashgichim (supervisors), and related documentation.

This is the CRM frontend. The matching backend lives in `../kasrut-api/`, the public map app in `../kasrut-map/`, shared types in `../packages/shared/`.

---

## Stack (current, as built)

- **React 19** + **Vite 8** + **TypeScript** (strict)
- **Redux Toolkit + RTK Query** for all state and networking. There is no Zustand and no axios — earlier versions of this doc referenced both, but the codebase is fully on RTK.
- **MUI v9** (`@mui/material` + `@emotion/*`) for components and theming
- **react-router-dom v7** for routing
- **Sentry** (`@sentry/react`) for error reporting
- **Vitest** + **@testing-library/react** for tests

The matching backend is **Express + Prisma + PostgreSQL + Redis** (see `kasrut-api/` for source).

---

## Three User Roles

| Role | Access | Can Edit |
|------|--------|----------|
| **Owner** | Everything — all rabbanuts, all data, Users module, Rabbanuts module | Yes |
| **Rabbanut** | Only their own organization's data (restaurants, mashgichim, hechsherim, inspections, documents) | Yes |
| **Mashgiach** | Only their own assigned establishments and inspections | No |

Role is stored in the `auth` slice and persisted to `localStorage` (key `auth-storage`). See `src/store/authSlice.ts` for the persistence helpers.

---

## Core Data Model

```
Rabbanut (organization)
  └── Hechsher (certifying body, belongs to rabbanut)
        └── Restaurant / Establishment
              ├── Mashgiach (assigned, can represent multiple hechsherim)
              └── Inspections (linked to restaurant + mashgiach)
                    └── Documents (instructions, forms, regulations)
```

### Key relationships
- One **Rabbanut** has many **Hechsherim**
- One **Hechsher** certifies many **Restaurants**
- One **Mashgiach** can represent multiple **Hechsherim**
- One **Restaurant** has one **Mashgiach** and one **Hechsher**
- One **Restaurant** has many **Inspections**

Domain types live in `src/types/` for UI shapes and in `packages/shared/types.ts` for the cross-project enums (`Role`, `CertStatus`, `HechsherType`, etc.).

---

## State Architecture (canonical RTK)

All state goes through the single Redux store in `src/store/index.ts`:

- **Slices** (`authSlice`, `langSlice`) — local UI state.
- **`baseApi`** (`src/store/api/baseApi.ts`) — RTK Query base. Per-domain endpoints injected from `src/store/api/{auth,restaurants,inspections,…}Api.ts`.

### Reading state
```ts
import { useAppSelector } from '@/store'
const role = useAppSelector(s => s.auth.role)
const lang = useAppSelector(s => s.lang.lang)
```

### Writing state
```ts
import { useAppDispatch } from '@/store'
import { setRabbanutFilter } from '@/store/authSlice'
import { setLang } from '@/store/langSlice'
const dispatch = useAppDispatch()
dispatch(setLang('he'))
```

### Fetching server data
```ts
import { useGetRestaurantsQuery, useCreateRestaurantMutation } from '@/store/api/restaurantsApi'

const { data: restaurants = [], isLoading } = useGetRestaurantsQuery()
const [create] = useCreateRestaurantMutation()
await create(payload).unwrap()
```

**No new Zustand stores. No new axios calls.** If you find yourself wanting "global UI state outside Redux," talk it through first — the answer is almost always a small slice.

---

## Page-level Controllers

Each non-trivial page has a `controllers/use{Page}Controller.ts` that:
1. Pulls server data via RTK Query
2. Pulls role/user state via `useAppSelector`
3. Owns local UI state (form open, filter values, search)
4. Returns a flat object the page consumes

Examples: `useRestaurantsController`, `useInspectionsController`, `useDashboardController`. New pages should follow this shape — keeps components dumb and testable.

---

## Permissions

```ts
// lib/permissions.ts
export const PERMISSIONS: Record<Role, Permissions> = {
  owner:     { tabs: [...all], canEdit: true,  seeAll: true,  isOwner: true  },
  rabbanut:  { tabs: [...own], canEdit: true,  seeAll: false, isOwner: false },
  mashgiach: { tabs: [...own], canEdit: false, seeAll: false, isOwner: false },
}
```

**Use `usePermissions()` for every access check.** `ProtectedRoute` enforces tab access, components gate destructive UI on `perm.canEdit`, owner-only sections on `perm.isOwner`. Reading `role` directly is reserved for display (theme colours, i18n labels) and per-role data scoping inside `useRestaurants`/`useInspections`.

---

## Multilingual Support

Three languages with full UI translation: **English**, **Russian**, **Hebrew** (with RTL layout).

Language is stored in `langSlice` and persisted to `localStorage` (key `lang-storage`). The `useLang()` hook in `src/i18n/useLang.ts` returns the active translation object `t`. When `lang === 'he'`, the root `<Box>` in `AppLayout` gets `dir="rtl"`.

Translation files: `src/i18n/{en,ru,he}.ts`, type `Translations` in `src/i18n/types.ts`.

---

## Navigation Modules

| Route | Component | Roles |
|-------|-----------|-------|
| `/dashboard` | Dashboard | All |
| `/restaurants` | Restaurants | All |
| `/restaurants/:id` | RestaurantDetail | All |
| `/inspections` | Inspections | Owner, Rabbanut, Mashgiach |
| `/mashgichim` | Mashgichim | Owner, Rabbanut |
| `/hechsherim` | Hechsherim | Owner, Rabbanut |
| `/documents` | Documents | All |
| `/rabbanuts` | Rabbanuts | Owner only |
| `/users` | Users | Owner only |
| `/suggestions` | Suggestions | Owner, Rabbanut |
| `/logs` | Logs | Owner only |
| `/login` | Login | Public |

When adding a new route, update both `App.tsx` and `lib/permissions.ts`.

---

## Folder Structure

```
src/
├── main.tsx, App.tsx, theme.ts
├── pages/                 # one per route — composes controller + layout
├── controllers/           # use{Page}Controller — orchestration layer
├── components/
│   ├── ui/                # atoms (Badge, Button, Input, Modal, Select)
│   ├── layout/            # Header, Sidebar, AppLayout, ProtectedRoute, RoleBanner
│   ├── auth/              # 2FA UI
│   ├── restaurants/, inspections/, mashgichim/, hechsherim/, dashboard/, documents/, rabbanuts/, users/
├── store/
│   ├── index.ts           # configureStore, useAppSelector/useAppDispatch
│   ├── authSlice.ts, langSlice.ts
│   └── api/               # one file per RTK Query namespace
├── hooks/                 # cross-cutting hooks (usePermissions, useRestaurants, useInspections)
├── lib/                   # pure helpers (permissions, daysUntil, statusColor, sentry)
├── i18n/                  # translations + useLang hook
├── types/                 # domain types
└── __tests__/             # vitest tests
```

---

## Build / Vite

`vite.config.ts` splits vendors into named chunks (`vendor-mui`, `vendor-redux`, `vendor-router`, `vendor-react`, `vendor-sentry`) so a code-only deploy keeps the heavy chunks cached.

Scripts:
- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build`
- `npm test` / `npm run test:watch` — vitest
- `npm run lint`

---

## Design System

Dark theme throughout. No white backgrounds. CSS variables in `index.css` (or via MUI theme in `src/theme.ts`).

### Role Colours
- Owner → gold `#E8C96D`
- Rabbanut → blue `#3498DB`
- Mashgiach → green `#2ECC71`

### Status Colours
- `ok` → `#2ECC71`, `warning` → `#F39C12`, `critical` → `#E74C3C`

### Hechsher Type Colours
- Rabbanut `#3498DB`, Badatz `#E74C3C`, Mehadrin `#9B59B6`, Private `#95A5A6`

Active nav item, role banner accent, and key buttons use the current role's colour.

---

## Coding Conventions

- **TypeScript strict** — no `any`. Use the shared enums from `packages/shared/types.ts` when adding domain types.
- **Named exports** for components, hooks, types. **Default export** only for page components (so React.lazy works).
- All API calls go through `src/store/api/*` (RTK Query). Never call `fetch` directly from a component.
- Business logic (filtering by role, date math) goes in `src/hooks/` or `src/lib/`, never inside components.
- Slices hold state only — no API calls inside reducers.
- Use the MUI theme tokens (`sx`, `alpha`, theme-driven colours) — avoid hardcoded hex in components when a theme value exists.
- `dir="rtl"` is set once at the root in `AppLayout` based on `lang === 'he'`.
- Comments are for the non-obvious **why** only. No JSDoc walls of text, no "added by X" notes.

---

## Notes for Claude Code

- When creating a new component, check `src/types/index.ts` and `packages/shared/types.ts` first.
- For new routes: update `App.tsx` + `lib/permissions.ts`.
- Use `usePermissions()` for every access check; reading `role` directly is for display/scoping only.
- Long lists (>~60 rows) should be virtualised — see `kasrut-map/src/components/list/RestaurantListView.tsx` and `src/components/inspections/InspectionList.tsx` for the pattern.
- The CRM works alongside `kasrut-map` (public app) and `kasrut-api` (Express backend). Cross-cutting changes (auth payload, restaurant fields) usually need updates in all three plus `packages/shared/types.ts`.
