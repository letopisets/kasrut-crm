# KashrutCRM — Project Context for Claude Code

## Project Overview

A multi-tenant CRM system for kashrut (kosher certification) management organizations. The system manages establishments (restaurants, food businesses), inspections, certifying organizations (hechsherim), mashgichim (supervisors), and related documentation.

---

## Current State

- **Prototype:** Fully functional React prototype built as standalone HTML (React + Babel via CDN). All core modules are implemented and working.
- **Stage:** Moving from prototype to production. Frontend scaffolding is the immediate next step.
- **Frontend stack chosen:** React + Vite + TypeScript + Zustand + React Router + Axios
- **Backend stack chosen (not started):** NestJS + PostgreSQL + Prisma + Redis

---

## Three User Roles

| Role | Access | Can Edit |
|------|--------|----------|
| **Owner** | Everything — all rabbanuts, all data, Users module, Rabbanuts module | Yes |
| **Rabbanut** | Only their own organization's data (restaurants, mashgichim, hechsherim, inspections, documents) | Yes |
| **Mashgiach** | Only their own assigned establishments and inspections | No |

Role is stored in Zustand auth store and persisted to localStorage.

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

### Key relationships:
- One **Rabbanut** has many **Hechsherim**
- One **Hechsher** certifies many **Restaurants**
- One **Mashgiach** can represent multiple **Hechsherim** (many-to-many)
- One **Restaurant** has one **Mashgiach** and one **Hechsher**
- One **Restaurant** has many **Inspections**

---

## TypeScript Types (already defined)

```ts
// types/user.ts
export type Role = 'owner' | 'rabbanut' | 'mashgiach'

export interface User {
  id: string
  name: string
  role: Role
  rabbanutId?: string
  email: string
}

// types/restaurant.ts
export type CertStatus = 'ok' | 'warning' | 'critical'

export interface Restaurant {
  id: string
  name: string
  address: string
  city: string
  level: 'Regular' | 'Mehadrin'
  hechsherId: string
  mashgiachId: string
  kitniyot: 'ללא חשש קטניות' | 'מכיל קטניות'
  expires: string
  status: CertStatus
  rabbanutId: string
  notes?: string
  lastInspection?: string
}

// types/inspection.ts
export type InspectionResult = 'pending' | 'open' | 'pass' | 'fail'
export type InspectionType = 'planned' | 'urgent'

export interface Inspection {
  id: string
  restaurantId: string
  mashgiachId: string
  date: string
  type: InspectionType
  result: InspectionResult
  notes?: string
}

// types/hechsher.ts
export type HechsherType = 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'

export interface Hechsher {
  id: string
  name: string
  shortName: string
  city: string
  contact: string
  phone: string
  email: string
  type: HechsherType
  color: string
  rabbanutId: string
}

// types/mashgiach.ts
export interface Mashgiach {
  id: string
  name: string
  phone: string
  email: string
  area: string
  hechsherimIds: string[]
  assignedRestaurantIds: string[]
  active: boolean
  rabbanutId: string
}

// types/rabbanut.ts
export interface Rabbanut {
  id: string
  name: string
  city: string
  contact: string
  phone: string
  email: string
  active: boolean
  color: string
}

// types/document.ts
export type DocumentCategory = 'Instructions' | 'Forms' | 'Regulations' | 'Pesach'

export interface KashrutDocument {
  id: string
  name: string
  category: DocumentCategory
  date: string
  size: string
  ext: 'PDF' | 'DOCX' | 'XLSX'
  url?: string
}
```

---

## Permissions System (already defined)

```ts
// lib/permissions.ts
import { Role } from '@/types'

interface Permissions {
  tabs: string[]
  canEdit: boolean
  seeAll: boolean
  isOwner: boolean
}

export const PERMISSIONS: Record<Role, Permissions> = {
  owner: {
    tabs: ['dashboard','restaurants','inspections','mashgichim','hechsherim','documents','rabbanuts','users'],
    canEdit: true,
    seeAll: true,
    isOwner: true,
  },
  rabbanut: {
    tabs: ['dashboard','restaurants','inspections','mashgichim','hechsherim','documents'],
    canEdit: true,
    seeAll: false,
    isOwner: false,
  },
  mashgiach: {
    tabs: ['dashboard','restaurants','inspections','documents'],
    canEdit: false,
    seeAll: false,
    isOwner: false,
  },
}
```

---

## Zustand Stores (already defined)

```ts
// store/useAuthStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, Role } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  role: Role
  setUser: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      role: 'rabbanut',
      setUser: (user, token) => set({ user, token, role: user.role }),
      logout: () => set({ user: null, token: null, role: 'rabbanut' }),
    }),
    { name: 'auth-storage' }
  )
)
```

---

## Multilingual Support

Three languages with full UI translation: **English**, **Russian**, **Hebrew** (with RTL layout).

Language is stored in a separate Zustand store:
```ts
// store/useLangStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Lang = 'en' | 'ru' | 'he'

export const useLangStore = create()(
  persist(
    (set) => ({
      lang: 'ru' as Lang,
      setLang: (lang: Lang) => set({ lang }),
    }),
    { name: 'lang-storage' }
  )
)
```

Translation files live in `src/i18n/en.ts`, `src/i18n/ru.ts`, `src/i18n/he.ts`.
The `useLang()` hook returns the current translation object `t`.
When `lang === 'he'`, the root `<div>` must have `dir="rtl"`.

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
| `/login` | Login | Public |

---

## Folder Structure

```
frontend/
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Restaurants.tsx
│   │   ├── RestaurantDetail.tsx
│   │   ├── Inspections.tsx
│   │   ├── Mashgichim.tsx
│   │   ├── Hechsherim.tsx
│   │   ├── Documents.tsx
│   │   ├── Rabbanuts.tsx
│   │   ├── Users.tsx
│   │   └── Login.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Select.tsx
│   │   │   └── index.ts
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── RoleBanner.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── AppLayout.tsx
│   │   ├── restaurants/
│   │   │   ├── RestaurantList.tsx
│   │   │   ├── RestaurantCard.tsx
│   │   │   ├── RestaurantDetail.tsx
│   │   │   ├── RestaurantForm.tsx
│   │   │   └── HechsherBlock.tsx
│   │   ├── inspections/
│   │   │   ├── InspectionList.tsx
│   │   │   ├── InspectionRow.tsx
│   │   │   └── InspectionForm.tsx
│   │   ├── mashgichim/
│   │   │   ├── MashgiachGrid.tsx
│   │   │   ├── MashgiachCard.tsx
│   │   │   └── MashgiachForm.tsx
│   │   ├── hechsherim/
│   │   │   ├── HechsherGrid.tsx
│   │   │   ├── HechsherCard.tsx
│   │   │   └── HechsherForm.tsx
│   │   ├── dashboard/
│   │   │   ├── StatCard.tsx
│   │   │   ├── ExpiringList.tsx
│   │   │   └── UpcomingInspections.tsx
│   │   └── documents/
│   │       ├── DocumentList.tsx
│   │       └── DocumentUpload.tsx
│   ├── store/
│   │   ├── useAuthStore.ts
│   │   ├── useLangStore.ts
│   │   ├── useRestaurantStore.ts
│   │   ├── useInspectionStore.ts
│   │   ├── useMashgiachStore.ts
│   │   └── useHechsherStore.ts
│   ├── hooks/
│   │   ├── usePermissions.ts
│   │   ├── useRestaurants.ts
│   │   └── useInspections.ts
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── restaurants.ts
│   │   ├── inspections.ts
│   │   ├── mashgichim.ts
│   │   ├── hechsherim.ts
│   │   └── documents.ts
│   ├── i18n/
│   │   ├── en.ts
│   │   ├── ru.ts
│   │   ├── he.ts
│   │   └── useLang.ts
│   ├── lib/
│   │   ├── daysUntil.ts
│   │   ├── statusColor.ts
│   │   └── permissions.ts
│   └── types/
│       ├── restaurant.ts
│       ├── inspection.ts
│       ├── mashgiach.ts
│       ├── hechsher.ts
│       ├── rabbanut.ts
│       ├── user.ts
│       ├── document.ts
│       └── index.ts
├── .env
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Design System

Dark theme throughout. No white backgrounds anywhere.

### Color Palette (CSS variables in index.css)
```css
:root {
  --bg-base:       #0F1117;   /* page background */
  --bg-card:       #1A1D2E;   /* card background */
  --bg-elevated:   #22253A;   /* inputs, nested cards */
  --border:        #2A2D3E;   /* all borders */
  --border-subtle: #1E2030;   /* dividers inside cards */

  --text-primary:  #E8E8EE;
  --text-secondary:#999999;
  --text-muted:    #555555;
  --text-disabled: #333333;

  --gold:          #E8C96D;   /* primary accent — Owner role, logo, buttons */
  --gold-dim:      #C9A84C;

  --status-ok:     #2ECC71;
  --status-warn:   #F39C12;
  --status-crit:   #E74C3C;

  --role-owner:    #E8C96D;
  --role-rabbanut: #3498DB;
  --role-mashgiach:#2ECC71;
}
```

### Role Colors
- Owner → gold `#E8C96D`
- Rabbanut → blue `#3498DB`
- Mashgiach → green `#2ECC71`

Active nav item uses the current role's color.

### Status Colors
- `ok` → `#2ECC71`
- `warning` → `#F39C12`
- `critical` → `#E74C3C`

### Hechsher Type Colors
- Rabbanut → `#3498DB`
- Badatz → `#E74C3C`
- Mehadrin → `#9B59B6`
- Private → `#95A5A6`

### Document Category Colors
- Instructions → `#3498DB`
- Forms → `#9B59B6`
- Regulations → `#E67E22`
- Pesach → `#E8C96D`

---

## Key UI Patterns from Prototype

### Badge component
```tsx
<Badge label="Active" color="#2ECC71" small />
// renders: colored pill with 18% opacity background + 35% opacity border
```

### HechsherTag component
```tsx
<HechsherTag hechsher={hechsher} small />
// renders Badge with hechsher.shortName and hechsher.color
```

### Card style
```tsx
const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
}
```

### Restaurant list row
Left border colored by status (`borderLeft: 3px solid statusColor`).
Grid columns: `name+address | rabbanut (owner only) | hechsher | level | mashgiach | status badge`

### Inspection row
Left border colored by type: urgent = red, planned = blue.
Right side: date, result `<select>` (colored by result), type badge.

### Mashgiach card
Shows contact info grid + hechsher tags at the bottom.
Active/inactive toggle button + delete button in top right.

### Hechsher card
Click to expand contact details and mashgiachim list.
Stats grid: establishments count | mashgichim count | abbreviation.

---

## Prototype Reference

A fully working HTML prototype exists with all modules implemented.
File: `kashrut-crm.html` — standalone React app (CDN Babel).
Use it as visual and functional reference when building components.

The prototype contains:
- Full translation objects for EN / RU / HE
- All seed data (restaurants, inspections, mashgichim, hechsherim, rabbanuts, users)
- All CRUD operations with confirmation modals
- Role-scoped data filtering logic
- RTL support for Hebrew

---

## What Is Built vs What Is Next

### ✅ Done (prototype)
- All UI modules
- Role-based access control logic
- Multilingual support (EN/RU/HE + RTL)
- CRUD for all entities
- Hechsher ↔ Mashgiach binding

### 🔨 Next (production)
1. Vite project init + dependencies
2. TypeScript types (`src/types/`)
3. `lib/permissions.ts`
4. Zustand stores (`useAuthStore`, `useLangStore`)
5. `usePermissions` hook
6. `App.tsx` with React Router + `ProtectedRoute`
7. `AppLayout` + `Header` + `RoleBanner`
8. UI atoms (`Badge`, `Button`, `Input`, `Modal`, `Select`)
9. Pages one by one starting with `Dashboard`

### ⏳ Backend (not started)
NestJS + PostgreSQL + Prisma + Redis + JWT auth

---

## Coding Conventions

- **TypeScript strict mode** — no `any`
- **Named exports** for components, types, hooks
- **Default export** only for page components
- All API calls go through `src/api/` — never directly in components
- Business logic (filtering by role, date calculations) goes in `src/hooks/` — never in components
- Stores hold state only — no API calls inside stores
- Use CSS variables for all colors — no hardcoded hex in components
- `dir="rtl"` on root div when `lang === 'he'`

---

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.x",
    "zustand": "^4.x",
    "axios": "^1.x"
  },
  "devDependencies": {
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

---

## Environment Variables

```env
# .env
VITE_API_URL=http://localhost:3000/api
```

Access via `import.meta.env.VITE_API_URL` in `src/api/client.ts`.

---

## Notes for Claude Code

- When creating a new component, always check `src/types/index.ts` for existing types
- When adding a new route, update both `App.tsx` and `lib/permissions.ts`
- The `usePermissions()` hook must be used for all access checks — never read role directly in JSX
- RTL must be tested whenever layout components are changed
- The prototype HTML file is the source of truth for UI behavior and translations
