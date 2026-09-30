import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { setUser } from '@/store/authSlice'
import { baseApi } from '@/store/api/baseApi'
import { authApi } from '@/store/api/authApi'
import { rtkQueryErrorToast } from '@/store/errorMiddleware'
import type { User } from '@/types'

const owner: User = { id: 'u1', name: 'Owner', email: 'owner@test.il', role: 'owner', twoFactorEnabled: false }
const SETUP_REQUIRED = { error: 'Two-factor authentication setup required', code: 'TWO_FACTOR_SETUP_REQUIRED' }

function makeStore() {
  const store = configureStore({
    reducer: { auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: getDefault => getDefault().concat(baseApi.middleware),
  })
  store.dispatch(setUser({ user: owner, token: 'first-token' }))
  return store
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('base query — REQUIRE_OWNER_2FA', () => {
  it('switches to the forced setup screen on 403 TWO_FACTOR_SETUP_REQUIRED', async () => {
    const store = makeStore()
    fetchMock.mockResolvedValue(reply(403, SETUP_REQUIRED))

    await store.dispatch(authApi.endpoints.getMe.initiate())

    expect(store.getState().auth.twoFactorSetupRequired).toBe(true)
    expect(store.getState().auth.token).toBe('first-token')
  })

  it('ignores other 403s', async () => {
    const store = makeStore()
    fetchMock.mockResolvedValue(reply(403, { error: 'Forbidden' }))

    await store.dispatch(authApi.endpoints.getMe.initiate())

    expect(store.getState().auth.twoFactorSetupRequired).toBe(false)
  })

  it('takes the flag from /auth/me', async () => {
    const store = makeStore()
    fetchMock.mockResolvedValue(reply(200, { ...owner, twoFactorSetupRequired: true }))

    await store.dispatch(authApi.endpoints.getMe.initiate())

    expect(store.getState().auth.twoFactorSetupRequired).toBe(true)
  })

  it('retries with the token that replaced the one a 401 answered (2FA just enabled)', async () => {
    const store = makeStore()
    fetchMock
      .mockImplementationOnce(async () => {
        store.dispatch(setUser({ user: { ...owner, twoFactorEnabled: true }, token: 'second-token' }))
        return reply(401, { error: 'Authorization has changed; sign in again' })
      })
      .mockResolvedValueOnce(reply(200, { ...owner, twoFactorEnabled: true, twoFactorSetupRequired: false }))

    await store.dispatch(authApi.endpoints.getMe.initiate())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retry = fetchMock.mock.calls[1][0] as Request
    expect(retry.headers.get('Authorization')).toBe('Bearer second-token')
    expect(store.getState().auth.token).toBe('second-token')
    expect(store.getState().auth.twoFactorSetupRequired).toBe(false)
  })
})

describe('error toast — REQUIRE_OWNER_2FA', () => {
  function rejectedMutation(payload: unknown) {
    return {
      type: 'api/executeMutation/rejected',
      payload,
      error: { message: 'Rejected' },
      meta: {
        arg: { type: 'mutation', endpointName: 'createRestaurant' },
        requestId: 'r1', requestStatus: 'rejected', rejectedWithValue: true, aborted: false, condition: false,
      },
    }
  }

  function toastsFor(payload: unknown) {
    const store = { dispatch: vi.fn(), getState: vi.fn() }
    rtkQueryErrorToast(store)(vi.fn())(rejectedMutation(payload))
    return store.dispatch.mock.calls.length
  }

  it('does not toast the setup-required 403', () => {
    expect(toastsFor({ status: 403, data: SETUP_REQUIRED })).toBe(0)
  })

  it('still toasts other failures', () => {
    expect(toastsFor({ status: 403, data: { error: 'Forbidden' } })).toBe(1)
  })
})
