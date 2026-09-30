import { describe, it, expect, vi } from 'vitest'
import authReducer, {
  setUser,
  setTwoFactorPending,
  clearTwoFactorPending,
  setTwoFactorSetupRequired,
  clearBackupCodes,
  persistAuthState,
  logout,
} from '@/store/authSlice'
import type { User } from '@/types'

const testUser: User = {
  id:               'u1',
  name:             'Test Owner',
  email:            'owner@test.il',
  role:             'owner',
  twoFactorEnabled: false,
}

const initial = authReducer(undefined, { type: '@@INIT' })

describe('authSlice', () => {
  it('has correct initial state', () => {
    expect(initial.user).toBeNull()
    expect(initial.token).toBeNull()
    expect(initial.role).toBe('owner')
    expect(initial.twoFactorPending).toBe(false)
    expect(initial.pendingTempToken).toBeNull()
  })

  it('setUser stores user, token and role', () => {
    const state = authReducer(initial, setUser({ user: testUser, token: 'abc.def.ghi' }))
    expect(state.user).toEqual(testUser)
    expect(state.token).toBe('abc.def.ghi')
    expect(state.role).toBe('owner')
    expect(state.twoFactorPending).toBe(false)
    expect(state.pendingTempToken).toBeNull()
  })

  it('setTwoFactorPending stores tempToken and sets flag', () => {
    const state = authReducer(initial, setTwoFactorPending({ tempToken: 'temp.token' }))
    expect(state.twoFactorPending).toBe(true)
    expect(state.pendingTempToken).toBe('temp.token')
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
  })

  it('clearTwoFactorPending resets 2FA state', () => {
    const pending = authReducer(initial, setTwoFactorPending({ tempToken: 'temp.token' }))
    const cleared = authReducer(pending, clearTwoFactorPending())
    expect(cleared.twoFactorPending).toBe(false)
    expect(cleared.pendingTempToken).toBeNull()
  })

  it('setUser after 2FA clears pending state', () => {
    const pending = authReducer(initial, setTwoFactorPending({ tempToken: 'temp.token' }))
    const state   = authReducer(pending, setUser({ user: testUser, token: 'full.token' }))
    expect(state.twoFactorPending).toBe(false)
    expect(state.pendingTempToken).toBeNull()
    expect(state.user).toEqual(testUser)
  })

  it('logout clears all state', () => {
    const loggedIn = authReducer(initial, setUser({ user: testUser, token: 'abc' }))
    const state    = authReducer(loggedIn, logout())
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
    expect(state.twoFactorPending).toBe(false)
    expect(state.pendingTempToken).toBeNull()
  })

  it('setRabbanutFilter for rabbanut role', () => {
    const rabbanutUser: User = { ...testUser, role: 'rabbanut', rabbanutId: 'rb1' }
    const loggedIn = authReducer(initial, setUser({ user: rabbanutUser, token: 'tok' }))
    expect(loggedIn.role).toBe('rabbanut')
    expect(loggedIn.rabbanutFilter).toBe('')
  })
})

describe('authSlice — forced 2FA setup (REQUIRE_OWNER_2FA)', () => {
  it('setUser records whether the session is confined to 2FA setup', () => {
    const required = authReducer(initial, setUser({ user: testUser, token: 't', twoFactorSetupRequired: true }))
    expect(required.twoFactorSetupRequired).toBe(true)

    const plain = authReducer(required, setUser({ user: testUser, token: 't2' }))
    expect(plain.twoFactorSetupRequired).toBe(false)
  })

  it('setTwoFactorSetupRequired toggles the flag', () => {
    const loggedIn = authReducer(initial, setUser({ user: testUser, token: 't' }))
    expect(authReducer(loggedIn, setTwoFactorSetupRequired(true)).twoFactorSetupRequired).toBe(true)
  })

  it('keeps enable-time backup codes until they are acknowledged', () => {
    const required = authReducer(initial, setUser({ user: testUser, token: 't', twoFactorSetupRequired: true }))
    const enabled  = authReducer(required, setUser({
      user: { ...testUser, twoFactorEnabled: true }, token: 't2', backupCodes: ['AAAA', 'BBBB'],
    }))
    expect(enabled.twoFactorSetupRequired).toBe(false)
    expect(enabled.backupCodes).toEqual(['AAAA', 'BBBB'])

    expect(authReducer(enabled, clearBackupCodes()).backupCodes).toBeNull()
  })

  it('logout clears the flag and the backup codes', () => {
    const state = authReducer(
      authReducer(initial, setUser({ user: testUser, token: 't', twoFactorSetupRequired: true, backupCodes: ['AAAA'] })),
      logout(),
    )
    expect(state.twoFactorSetupRequired).toBe(false)
    expect(state.backupCodes).toBeNull()
  })

  it('persists the flag but never the backup codes', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    try {
      persistAuthState({ user: testUser, token: 't', role: 'owner', rabbanutFilter: '', twoFactorSetupRequired: true })
      const saved = JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? '{}')
      expect(saved.twoFactorSetupRequired).toBe(true)
      expect(saved).not.toHaveProperty('backupCodes')
    } finally {
      setItem.mockRestore()
      localStorage.clear()
    }
  })
})
