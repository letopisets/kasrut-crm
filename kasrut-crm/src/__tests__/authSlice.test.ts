import { describe, it, expect, vi, afterEach } from 'vitest'
import authReducer, {
  setUser,
  tokenRefreshed,
  setTwoFactorPending,
  clearTwoFactorPending,
  setTwoFactorSetupRequired,
  clearBackupCodes,
  persistAuthState,
  logout,
  sessionUnavailable,
  retrySessionCheck,
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
      persistAuthState({ user: testUser, role: 'owner', rabbanutFilter: '', twoFactorSetupRequired: true })
      const saved = JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? '{}')
      expect(saved.twoFactorSetupRequired).toBe(true)
      expect(saved).not.toHaveProperty('backupCodes')
    } finally {
      setItem.mockRestore()
      localStorage.clear()
    }
  })
})

describe('authSlice — in-memory access token', () => {
  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  async function loadWithStorage(saved: unknown) {
    localStorage.setItem('auth-storage', JSON.stringify(saved))
    vi.resetModules()
    const slice = await import('@/store/authSlice')
    return slice.default(undefined, { type: '@@INIT' })
  }

  it('never writes the token to localStorage', () => {
    persistAuthState({ user: testUser, role: 'owner', rabbanutFilter: 'rb1', twoFactorSetupRequired: false })
    const saved = JSON.parse(localStorage.getItem('auth-storage') ?? '{}')
    expect(saved.user).toEqual(testUser)
    expect(saved.rabbanutFilter).toBe('rb1')
    expect(saved).not.toHaveProperty('token')
  })

  it('removes the entry once there is no user', () => {
    persistAuthState({ user: testUser, role: 'owner', rabbanutFilter: '', twoFactorSetupRequired: false })
    persistAuthState({ user: null, role: 'owner', rabbanutFilter: '', twoFactorSetupRequired: false })
    expect(localStorage.getItem('auth-storage')).toBeNull()
  })

  it('starts with the persisted user, no token, and a session still to check', async () => {
    const state = await loadWithStorage({ user: testUser, role: 'owner', rabbanutFilter: 'rb1' })
    expect(state.user).toEqual(testUser)
    expect(state.token).toBeNull()
    expect(state.rabbanutFilter).toBe('rb1')
    expect(state.sessionChecked).toBe(false)
  })

  it('drops an access token left in storage by an older build', async () => {
    const state = await loadWithStorage({ user: testUser, token: 'legacy.jwt.token', role: 'owner', rabbanutFilter: '' })
    expect(state.token).toBeNull()
    expect(state.user).toEqual(testUser)
    const saved = JSON.parse(localStorage.getItem('auth-storage') ?? '{}')
    expect(saved).not.toHaveProperty('token')
    expect(saved.user).toEqual(testUser)
  })

  it('has nothing to check without a persisted user', async () => {
    localStorage.clear()
    vi.resetModules()
    const slice = await import('@/store/authSlice')
    expect(slice.default(undefined, { type: '@@INIT' }).sessionChecked).toBe(true)
  })

  it('tokenRefreshed renews the token and keeps the view state', () => {
    const loggedIn = authReducer(initial, setUser({ user: testUser, token: 'old', backupCodes: ['AAAA'] }))
    const filtered = { ...loggedIn, rabbanutFilter: 'rb1' }
    const state = authReducer(filtered, tokenRefreshed({ user: testUser, token: 'new', twoFactorSetupRequired: true }))
    expect(state.token).toBe('new')
    expect(state.rabbanutFilter).toBe('rb1')
    expect(state.backupCodes).toEqual(['AAAA'])
    expect(state.twoFactorSetupRequired).toBe(true)
    expect(state.sessionChecked).toBe(true)
  })

  it('logout marks the session as checked', () => {
    const state = authReducer({ ...initial, sessionChecked: false }, logout())
    expect(state.sessionChecked).toBe(true)
  })

  it('sessionUnavailable fails only the startup check and signs nobody out', () => {
    const starting = { ...initial, user: testUser, sessionChecked: false }
    const failed = authReducer(starting, sessionUnavailable())
    expect(failed.sessionCheckFailed).toBe(true)
    expect(failed.sessionChecked).toBe(false)
    expect(failed.user).toEqual(testUser)
    expect(authReducer(failed, retrySessionCheck()).sessionCheckFailed).toBe(false)

    const running = authReducer(initial, setUser({ user: testUser, token: 't' }))
    expect(authReducer(running, sessionUnavailable())).toEqual(running)
  })
})
