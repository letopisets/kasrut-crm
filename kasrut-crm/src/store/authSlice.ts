import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { User, Role } from '@/types'

const AUTH_STORAGE_KEY = 'auth-storage'
const ROLES: Role[] = ['owner', 'rabbanut', 'mashgiach']

export interface AuthState {
  user:               User | null
  // The access token lives in memory only; a reload gets a new one from the
  // httpOnly refresh cookie (store/sessionRefresh.ts).
  token:              string | null
  role:               Role
  rabbanutFilter:     string
  twoFactorPending:   boolean
  pendingTempToken:   string | null
  // The API confines this session to 2FA setup (REQUIRE_OWNER_2FA): the app
  // shows only the forced setup screen until it is enabled.
  twoFactorSetupRequired: boolean
  // Plain backup codes from the enable call, kept in memory (never persisted)
  // until the user confirms they have saved them.
  backupCodes:        string[] | null
  // False until the startup refresh has answered. Only then is it known
  // whether the persisted user still has a session (SessionGate waits).
  sessionChecked:     boolean
  // The startup refresh could not reach the API (offline, server error, rate
  // limit). The cookie may still be good, so SessionGate offers a retry
  // instead of signing out.
  sessionCheckFailed: boolean
}

// Nothing secret: the user and view settings survive a reload so the app
// knows a session may exist, the token does not.
type PersistedAuth = Pick<AuthState, 'user' | 'role' | 'rabbanutFilter' | 'twoFactorSetupRequired'>

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

function normalizePersisted(value: unknown): Partial<PersistedAuth> {
  const candidate = isRecord(value) && 'state' in value ? value.state : value
  if (!isRecord(candidate)) return {}

  const user = normalizeUser(candidate.user)
  if (!user) return {}

  return {
    user,
    role: user.role,
    rabbanutFilter: typeof candidate.rabbanutFilter === 'string' ? candidate.rabbanutFilter : '',
    twoFactorSetupRequired: candidate.twoFactorSetupRequired === true,
  }
}

function loadPersisted(): Partial<PersistedAuth> {
  try {
    const storage = getStorage()
    const raw = storage?.getItem(AUTH_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    const persisted = normalizePersisted(parsed)
    // Older builds stored the access token here: drop it from storage now
    // rather than at the next state change.
    const legacy = isRecord(parsed) && 'state' in parsed ? parsed.state : parsed
    if (isRecord(legacy) && 'token' in legacy) persistAuthState(persisted)
    return persisted
  } catch { return {} }
}

export function persistAuthState(state: Partial<PersistedAuth>): void {
  const storage = getStorage()
  if (!storage) return

  if (!state.user) {
    storage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    user:           state.user,
    role:           state.user.role,
    rabbanutFilter: state.rabbanutFilter,
    twoFactorSetupRequired: state.twoFactorSetupRequired,
  }))
}

export function clearPersistedAuth(): void {
  getStorage()?.removeItem(AUTH_STORAGE_KEY)
}

const persisted = loadPersisted()

const initialState: AuthState = {
  user:             persisted.user   ?? null,
  token:            null,
  role:             persisted.role   ?? 'owner',
  rabbanutFilter:   persisted.rabbanutFilter ?? '',
  twoFactorPending: false,
  pendingTempToken: null,
  twoFactorSetupRequired: persisted.twoFactorSetupRequired ?? false,
  backupCodes:      null,
  // Without a persisted user there is no session to restore.
  sessionChecked:   !persisted.user,
  sessionCheckFailed: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<{
      user: User
      token: string
      twoFactorSetupRequired?: boolean
      backupCodes?: string[]
    }>) {
      state.user              = action.payload.user
      state.token             = action.payload.token
      state.role              = action.payload.user.role
      state.rabbanutFilter    = ''
      state.twoFactorPending  = false
      state.pendingTempToken  = null
      state.twoFactorSetupRequired = action.payload.twoFactorSetupRequired === true
      state.backupCodes       = action.payload.backupCodes ?? null
      state.sessionChecked    = true
      state.sessionCheckFailed = false
    },
    // A refresh renews the same session: the view state (rabbanut filter,
    // unacknowledged backup codes) stays.
    tokenRefreshed(state, action: PayloadAction<{
      user: User
      token: string
      twoFactorSetupRequired: boolean
    }>) {
      state.user              = action.payload.user
      state.token             = action.payload.token
      state.role              = action.payload.user.role
      state.twoFactorSetupRequired = action.payload.twoFactorSetupRequired
      state.sessionChecked    = true
      state.sessionCheckFailed = false
    },
    // A refresh the API could not answer signs nobody out. At startup the
    // gate offers a retry; later on, the next request simply tries again.
    sessionUnavailable(state) {
      if (!state.sessionChecked) state.sessionCheckFailed = true
    },
    retrySessionCheck(state) {
      state.sessionCheckFailed = false
    },
    setTwoFactorSetupRequired(state, action: PayloadAction<boolean>) {
      state.twoFactorSetupRequired = action.payload
    },
    clearBackupCodes(state) {
      state.backupCodes = null
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
      state.twoFactorSetupRequired = false
      state.backupCodes       = null
      state.sessionChecked    = true
      state.sessionCheckFailed = false
    },
  },
})

export const {
  setUser,
  tokenRefreshed,
  sessionUnavailable,
  retrySessionCheck,
  setTwoFactorPending,
  clearTwoFactorPending,
  setTwoFactorSetupRequired,
  clearBackupCodes,
  setRabbanutFilter,
  logout,
} = authSlice.actions
export default authSlice.reducer
