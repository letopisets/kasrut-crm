import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { MapUser } from '@/types'

const STORAGE_KEY = 'kasrut-map-auth'

interface MapAuthState {
  user: MapUser | null
  token: string | null
}

function loadInitialState(): MapAuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { user: null, token: null }
    const parsed = JSON.parse(raw) as MapAuthState
    return {
      user: parsed.user ?? null,
      token: parsed.token ?? null,
    }
  } catch {
    return { user: null, token: null }
  }
}

function persist(state: MapAuthState): void {
  if (!state.token || !state.user) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: state.user, token: state.token }))
}

const mapAuthSlice = createSlice({
  name: 'mapAuth',
  initialState: loadInitialState(),
  reducers: {
    setCredentials(state, action: PayloadAction<MapAuthState>) {
      state.user = action.payload.user
      state.token = action.payload.token
      persist(state)
    },
    setUser(state, action: PayloadAction<MapUser>) {
      state.user = action.payload
      persist(state)
    },
    clearCredentials(state) {
      state.user = null
      state.token = null
      persist(state)
    },
  },
})

export const { setCredentials, setUser, clearCredentials } = mapAuthSlice.actions
export const mapAuthReducer = mapAuthSlice.reducer
