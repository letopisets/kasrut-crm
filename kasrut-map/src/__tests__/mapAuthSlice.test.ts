import { describe, it, expect, beforeEach } from 'vitest'
import { mapAuthReducer, setCredentials, setUser, clearCredentials } from '@/store/mapAuthSlice'
import type { MapUser } from '@/types'

const user: MapUser = {
  id: 'u1',
  email: 'a@b.il',
  phone: null,
  firstName: 'A',
  lastName: 'B',
  name: 'A B',
  avatarUrl: null,
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

  it('setCredentials persists to localStorage', () => {
    mapAuthReducer(undefined, setCredentials({ user, token: 't1' }))
    const raw = localStorage.getItem('kasrut-map-auth')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).token).toBe('t1')
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
})
