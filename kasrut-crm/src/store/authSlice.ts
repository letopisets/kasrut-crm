import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { User, Role } from '@/types'

const AUTH_STORAGE_KEY = 'auth-storage'
const ROLES: Role[] = ['owner', 'rabbanut', 'mashgiach']

export interface AuthState {
  user:               User | null
  token:              string | null
  role:               Role
  rabbanutFilter:     string
  twoFactorPending:   boolean
  pendingTempToken:   string | null
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

function normalizeUser(value: unknown): User | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.email !== 'string' ||
    !isRole(value.role)
  ) return null

  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    twoFactorEnabled: typeof value.twoFactorEnabled === 'boolean' ? value.twoFactorEnabled : false,
    ...(typeof value.rabbanutId === 'string' ? { rabbanutId: value.rabbanutId } : {}),
  }
}

function normalizePersisted(value: unknown): Partial<AuthState> {
  const candidate = isRecord(value) && 'state' in value ? value.state : value
  if (!isRecord(candidate)) return {}

  const user = normalizeUser(candidate.user)
  const token = typeof candidate.token === 'string' && candidate.token.trim() ? candidate.token : null
  if (!user || !token) return {}

  return {
    user,
    token,
    role: user.role,
    rabbanutFilter: typeof candidate.rabbanutFilter === 'string' ? candidate.rabbanutFilter : '',
  }
}

function loadPersisted(): Partial<AuthState> {
  try {
    const storage = getStorage()
    const raw = storage?.getItem(AUTH_STORAGE_KEY)
    if (!raw) return {}
    return normalizePersisted(JSON.parse(raw))
  } catch { return {} }
}

const persisted = loadPersisted()

const initialState: AuthState = {
  user:             persisted.user   ?? null,
  token:            persisted.token  ?? null,
  role:             persisted.role   ?? 'owner',
  rabbanutFilter:   persisted.rabbanutFilter ?? '',
  twoFactorPending: false,
  pendingTempToken: null,
}

export function persistAuthState(state: Pick<AuthState, 'user' | 'token' | 'role' | 'rabbanutFilter'>): void {
  const storage = getStorage()
  if (!storage) return

  if (!state.user || !state.token) {
    storage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    user:           state.user,
    token:          state.token,
    role:           state.user.role,
    rabbanutFilter: state.rabbanutFilter,
  }))
}

export function clearPersistedAuth(): void {
  getStorage()?.removeItem(AUTH_STORAGE_KEY)
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<{ user: User; token: string }>) {
      state.user              = action.payload.user
      state.token             = action.payload.token
      state.role              = action.payload.user.role
      state.rabbanutFilter    = ''
      state.twoFactorPending  = false
      state.pendingTempToken  = null
    },
    setTwoFactorPending(state, action: PayloadAction<{ tempToken: string }>) {
      state.twoFactorPending  = true
      state.pendingTempToken  = action.payload.tempToken
    },
    clearTwoFactorPending(state) {
      state.twoFactorPending  = false
      state.pendingTempToken  = null
    },
    setRabbanutFilter(state, action: PayloadAction<string>) {
      state.rabbanutFilter = action.payload
    },
    logout(state) {
      state.user              = null
      state.token             = null
      state.role              = 'owner'
      state.rabbanutFilter    = ''
      state.twoFactorPending  = false
      state.pendingTempToken  = null
    },
  },
})

export const {
  setUser,
  setTwoFactorPending,
  clearTwoFactorPending,
  setRabbanutFilter,
  logout,
} = authSlice.actions
export default authSlice.reducer
