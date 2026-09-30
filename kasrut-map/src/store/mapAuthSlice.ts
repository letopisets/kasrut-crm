import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { MapUser } from '@/types'

const STORAGE_KEY = 'kasrut-map-auth'

interface MapAuthState {
  // Set only once the API has confirmed the session (sign-in or refresh), so
  // nothing treats the visitor as signed in on the strength of storage alone.
  user: MapUser | null
  // In memory only: a reload gets a new token from the httpOnly refresh
  // cookie (store/sessionRefresh.ts). Only the non-secret user is persisted,
  // as the sign that a session may exist.
  token: string | null
  // False until the startup refresh has answered for a persisted user.
  sessionChecked: boolean
  // The API refused a review or suggestion with 403 EMAIL_NOT_VERIFIED
  // (store/api/baseApi.ts); EmailVerificationHost shows the dialog.
  verificationPromptOpen: boolean
}

function persistUser(user: MapUser | null): void {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode): the session just ends with the tab.
  }
}

function loadInitialState(): MapAuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null, token: null, sessionChecked: true, verificationPromptOpen: false }
    const parsed = JSON.parse(raw) as { user?: MapUser | null; token?: unknown }
    const stored = parsed.user ?? null
    // Older builds stored the access token here too: drop it right away.
    if ('token' in parsed) persistUser(stored)
    // A stored user only means a session may exist: the startup refresh
    // (useMapSessionBootstrap) decides, and brings the user back with it.
    return { user: null, token: null, sessionChecked: !stored, verificationPromptOpen: false }
  } catch {
    return { user: null, token: null, sessionChecked: true, verificationPromptOpen: false }
  }
}

const mapAuthSlice = createSlice({
  name: 'mapAuth',
  initialState: loadInitialState(),
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: MapUser; token: string }>) {
      state.user = action.payload.user
      state.token = action.payload.token
      state.sessionChecked = true
      persistUser(state.user)
    },
    setUser(state, action: PayloadAction<MapUser>) {
      state.user = action.payload
      persistUser(state.user)
    },
    clearCredentials(state) {
      state.user = null
      state.token = null
      state.sessionChecked = true
      state.verificationPromptOpen = false
      persistUser(null)
    },
    // The refresh could not be answered (offline, server error): signed out
    // for now, but the persisted user stays so the next load tries again.
    sessionUnavailable(state) {
      state.user = null
      state.token = null
      state.sessionChecked = true
    },
    emailVerificationPrompted(state) {
      state.verificationPromptOpen = true
    },
    emailVerificationPromptClosed(state) {
      state.verificationPromptOpen = false
    },
  },
})

export const {
  setCredentials,
  setUser,
  clearCredentials,
  sessionUnavailable,
  emailVerificationPrompted,
  emailVerificationPromptClosed,
} = mapAuthSlice.actions
export const mapAuthReducer = mapAuthSlice.reducer
