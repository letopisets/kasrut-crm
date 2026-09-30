import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mapAuthReducer, setCredentials, setUser, clearCredentials, sessionUnavailable,
  emailVerificationPrompted, emailVerificationPromptClosed,
} from '@/store/mapAuthSlice'
import type { MapUser } from '@/types'

const user: MapUser = {
  id: 'u1',
  email: 'a@b.il',
  phone: null,
  firstName: 'A',
  lastName: 'B',
  name: 'A B',
  avatarUrl: null,
  emailVerified: true,
}

beforeEach(() => {
  localStorage.clear()
})

describe('mapAuthSlice', () => {
  it('starts with null user and token by default', () => {
    const initial = mapAuthReducer(undefined, { type: 'INIT' })
    expect(initial.user).toBeNull()
    expect(initial.token).toBeNull()
  })

  it('setCredentials stores user and token', () => {
    const next = mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    expect(next.user?.id).toBe('u1')
    expect(next.token).toBe('t1')
  })

  it('setCredentials persists the user but never the token', () => {
    mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    const raw = localStorage.getItem('kasrut-map-auth')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).user.id).toBe('u1')
    expect(JSON.parse(raw!)).not.toHaveProperty('token')
  })

  it('clearCredentials removes user, token and storage', () => {
    let state = mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    state = mapAuthReducer(state, clearCredentials())
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(localStorage.getItem('kasrut-map-auth')).toBeNull()
  })

  it('setUser updates user but keeps token', () => {
    let state = mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    const updated: MapUser = { ...user, name: 'C D' }
    state = mapAuthReducer(state, setUser(updated))
    expect(state.user?.name).toBe('C D')
    expect(state.token).toBe('t1')
  })

  it('opens and closes the email verification prompt; signing out closes it', () => {
    let state = mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    expect(state.verificationPromptOpen).toBe(false)
    state = mapAuthReducer(state, emailVerificationPrompted())
    expect(state.verificationPromptOpen).toBe(true)
    expect(mapAuthReducer(state, emailVerificationPromptClosed()).verificationPromptOpen).toBe(false)
    expect(mapAuthReducer(state, clearCredentials()).verificationPromptOpen).toBe(false)
  })

  it('sessionUnavailable signs out for now but keeps the persisted user for the next load', () => {
    let state = mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    state = mapAuthReducer({ ...state, sessionChecked: false }, sessionUnavailable())
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.sessionChecked).toBe(true)
    expect(JSON.parse(localStorage.getItem('kasrut-map-auth')!).user.id).toBe('u1')
  })
})

describe('mapAuthSlice — startup', () => {
  async function initialWith(saved: unknown) {
    localStorage.setItem('kasrut-map-auth', JSON.stringify(saved))
    vi.resetModules()
    const slice = await import('@/store/mapAuthSlice')
    return slice.mapAuthReducer(undefined, { type: 'INIT' })
  }

  it('starts signed out with a session still to check when a user is persisted', async () => {
    const state = await initialWith({ user })
    // Nothing may treat the visitor as signed in before the refresh confirms it.
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.sessionChecked).toBe(false)
    expect(JSON.parse(localStorage.getItem('kasrut-map-auth')!)).toEqual({ user })
  })

  it('drops an access token left in storage by an older build', async () => {
    const state = await initialWith({ user, token: 'legacy.jwt.token' })
    expect(state.token).toBeNull()
    expect(JSON.parse(localStorage.getItem('kasrut-map-auth')!)).toEqual({ user })
  })

  it('has nothing to check without a persisted user', async () => {
    vi.resetModules()
    const slice = await import('@/store/mapAuthSlice')
    expect(slice.mapAuthReducer(undefined, { type: 'INIT' }).sessionChecked).toBe(true)
  })
})
