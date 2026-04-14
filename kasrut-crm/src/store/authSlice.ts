import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { User, Role } from '@/types'

interface AuthState {
  user:               User | null
  token:              string | null
  role:               Role
  rabbanutFilter:     string
  twoFactorPending:   boolean
  pendingTempToken:   string | null
}

function loadPersisted(): Partial<AuthState> {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<AuthState>
    return parsed
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
