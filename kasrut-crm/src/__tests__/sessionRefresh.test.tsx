import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { setUser } from '@/store/authSlice'
import langReducer from '@/store/langSlice'
import { baseApi } from '@/store/api/baseApi'
import { authApi } from '@/store/api/authApi'
import { refreshSession } from '@/store/sessionRefresh'
import { signOut } from '@/store/signOut'
import { SessionGate } from '@/components/layout/SessionGate'
import ru from '@/i18n/ru'
import type { User } from '@/types'

const user: User = { id: 'u1', name: 'Admin', email: 'admin@test.il', role: 'rabbanut', rabbanutId: 'rb1', twoFactorEnabled: false }

// A throwaway endpoint, so the tests can fire several ordinary requests at once.
const probeApi = baseApi.injectEndpoints({
  endpoints: build => ({
    probe: build.query<{ ok: string }, string>({ query: id => `/probe/${id}` }),
  }),
})

function makeStore(signedIn = true) {
  const store = configureStore({
    reducer: { auth: authReducer, lang: langReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: getDefault => getDefault().concat(baseApi.middleware),
  })
  if (signedIn) store.dispatch(setUser({ user, token: 'old-token' }))
  return store
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface SeenCall { url: string; method: string; credentials?: string; headers: Headers }

const fetchMock = vi.fn<typeof fetch>()
const seen: SeenCall[] = []
let refreshAnswer: () => Response

function describeCall(input: RequestInfo | URL, init?: RequestInit): SeenCall {
  if (input instanceof Request) {
    return { url: input.url, method: input.method, credentials: input.credentials, headers: input.headers }
  }
  return { url: String(input), method: init?.method ?? 'GET', credentials: init?.credentials, headers: new Headers(init?.headers) }
}

const refreshCalls = () => seen.filter(call => call.url.endsWith('/auth/refresh'))

beforeEach(() => {
  seen.length = 0
  refreshAnswer = () => reply(200, { user, token: 'new-token', twoFactorSetupRequired: false })
  fetchMock.mockReset()
  // The API: refresh answers after a moment; any other call accepts only the
  // renewed token.
  fetchMock.mockImplementation(async (input, init) => {
    const call = describeCall(input, init)
    seen.push(call)
    if (call.url.endsWith('/auth/refresh')) {
      await new Promise(resolve => setTimeout(resolve, 10))
      return refreshAnswer()
    }
    return call.headers.get('Authorization') === 'Bearer new-token'
      ? reply(200, { ok: call.url })
      : reply(401, { error: 'Invalid or expired token' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('base query — expired access token', () => {
  it('refreshes once for concurrent 401s and retries each request with the new token', async () => {
    const store = makeStore()

    const results = await Promise.all(['a', 'b', 'c'].map(id => store.dispatch(probeApi.endpoints.probe.initiate(id))))

    expect(refreshCalls()).toHaveLength(1)
    expect(results.map(result => result.data?.ok)).toEqual([
      expect.stringMatching(/\/probe\/a$/), expect.stringMatching(/\/probe\/b$/), expect.stringMatching(/\/probe\/c$/),
    ])
    const retries = seen.filter(call => call.headers.get('Authorization') === 'Bearer new-token')
    expect(retries).toHaveLength(3)
    expect(store.getState().auth.token).toBe('new-token')
    expect(store.getState().auth.user).toEqual(user)
  })

  it('sends the refresh with the cookie and X-Requested-With: kashrut', async () => {
    const store = makeStore()

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    const [refresh] = refreshCalls()
    expect(refresh.method).toBe('POST')
    expect(refresh.credentials).toBe('include')
    expect(refresh.headers.get('X-Requested-With')).toBe('kashrut')
  })

  it('signs out when the refresh is refused, still with a single refresh', async () => {
    const store = makeStore()
    localStorage.setItem('auth-storage', JSON.stringify({ user }))
    refreshAnswer = () => reply(401, { error: 'Session expired; sign in again' })

    const results = await Promise.all(['a', 'b'].map(id => store.dispatch(probeApi.endpoints.probe.initiate(id))))

    expect(refreshCalls()).toHaveLength(1)
    expect(results.every(result => (result.error as { status?: number } | undefined)?.status === 401)).toBe(true)
    expect(store.getState().auth.user).toBeNull()
    expect(store.getState().auth.token).toBeNull()
    expect(localStorage.getItem('auth-storage')).toBeNull()
  })

  it.each([
    ['a server error', () => reply(502, { error: 'Bad gateway' })],
    ['a rate limit', () => reply(429, { error: 'Too many requests' })],
    ['a network error', () => { throw new TypeError('Failed to fetch') }],
  ])('keeps the session when the refresh meets %s', async (_label, answer) => {
    const store = makeStore()
    localStorage.setItem('auth-storage', JSON.stringify({ user }))
    refreshAnswer = answer

    const result = await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    expect(refreshCalls()).toHaveLength(1)
    expect((result.error as { status?: number } | undefined)?.status).toBe(401)
    // The cookie may still be good: nothing is signed out, the next request tries again.
    expect(store.getState().auth.user).toEqual(user)
    expect(store.getState().auth.sessionCheckFailed).toBe(false)
    expect(localStorage.getItem('auth-storage')).not.toBeNull()
  })

  it('signs out when even the renewed token is refused', async () => {
    const store = makeStore()
    fetchMock.mockImplementation(async (input, init) => {
      const call = describeCall(input, init)
      seen.push(call)
      return call.url.endsWith('/auth/refresh')
        ? reply(200, { user, token: 'new-token' })
        : reply(401, { error: 'Account is inactive or unavailable' })
    })

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    expect(refreshCalls()).toHaveLength(1)
    expect(seen.filter(call => call.url.endsWith('/probe/a'))).toHaveLength(2)
    expect(store.getState().auth.user).toBeNull()
  })

  type Store = ReturnType<typeof makeStore>
  it.each([
    ['login', (store: Store) => store.dispatch(authApi.endpoints.login.initiate({ email: 'a@b.il', password: 'x' }))],
    ['2FA verification', (store: Store) => store.dispatch(authApi.endpoints.verify2fa.initiate({ tempToken: 't', code: '123456' }))],
  ])('never refreshes on a 401 from %s', async (_label, send) => {
    const store = makeStore()

    await send(store)

    expect(refreshCalls()).toHaveLength(0)
    expect(store.getState().auth.token).toBe('old-token')
  })

  it('does not refresh without a signed-in user', async () => {
    const store = makeStore(false)

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    expect(refreshCalls()).toHaveLength(0)
  })

  it('renews an expired token before signing out, so logout reaches the API', async () => {
    const store = makeStore()
    fetchMock.mockImplementation(async (input, init) => {
      const call = describeCall(input, init)
      seen.push(call)
      if (call.url.endsWith('/auth/refresh')) return reply(200, { user, token: 'new-token' })
      return call.headers.get('Authorization') === 'Bearer new-token'
        ? new Response(null, { status: 204 })
        : reply(401, { error: 'Invalid or expired token' })
    })

    await store.dispatch(authApi.endpoints.logout.initiate())

    const logouts = seen.filter(call => call.url.endsWith('/auth/logout'))
    expect(logouts).toHaveLength(2)
    expect(logouts[1].headers.get('Authorization')).toBe('Bearer new-token')
    expect(logouts[1].credentials).toBe('include')
    expect(logouts[1].headers.get('X-Requested-With')).toBe('kashrut')
  })

  it('lets the cookie through on the calls that set it', async () => {
    const store = makeStore(false)
    fetchMock.mockImplementation(async (input, init) => {
      seen.push(describeCall(input, init))
      return reply(200, { user, token: 'new-token' })
    })

    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@b.il', password: 'x' }))
    await store.dispatch(authApi.endpoints.verify2fa.initiate({ tempToken: 't', code: '123456' }))

    expect(seen.map(call => call.credentials)).toEqual(['include', 'include'])
  })
})

describe('refreshSession', () => {
  it('takes the cross-tab lock when the browser has Web Locks', async () => {
    const store = makeStore()
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })

    expect(await refreshSession(store.dispatch)).toBe('new-token')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBe('kashrut-crm-refresh')
  })

  it('shares one request between callers', async () => {
    const store = makeStore()

    const tokens = await Promise.all([refreshSession(store.dispatch), refreshSession(store.dispatch)])

    expect(tokens).toEqual(['new-token', 'new-token'])
    expect(refreshCalls()).toHaveLength(1)
    // A later call starts a new refresh.
    await refreshSession(store.dispatch)
    expect(refreshCalls()).toHaveLength(2)
  })
})

describe('signOut', () => {
  const logoutCalls = () => seen.filter(call => call.url.endsWith('/auth/logout'))

  // Signed in, but holding no access token (e.g. it could not be renewed).
  function tokenlessStore() {
    return configureStore({
      reducer: { auth: authReducer, lang: langReducer, [baseApi.reducerPath]: baseApi.reducer },
      middleware: getDefault => getDefault().concat(baseApi.middleware),
      preloadedState: { auth: { ...authReducer(undefined, { type: '@@INIT' }), user, sessionChecked: true } },
    })
  }

  function api(answer: (call: SeenCall) => Response | Promise<Response>) {
    fetchMock.mockImplementation(async (input, init) => {
      const call = describeCall(input, init)
      seen.push(call)
      return answer(call)
    })
  }

  it('ends the session on the API with the refresh cookie alone when no access token is held', async () => {
    const store = tokenlessStore()
    localStorage.setItem('auth-storage', JSON.stringify({ user }))
    api(() => new Response(null, { status: 204 }))

    expect(await store.dispatch(signOut())).toBe(true)

    expect(logoutCalls()).toHaveLength(1)
    expect(logoutCalls()[0].headers.get('Authorization')).toBeNull()
    expect(logoutCalls()[0].headers.get('X-Requested-With')).toBe('kashrut')
    expect(logoutCalls()[0].credentials).toBe('include')
    expect(store.getState().auth.user).toBeNull()
    expect(localStorage.getItem('auth-storage')).toBeNull()
  })

  it('keeps the session when the API cannot be reached', async () => {
    const store = makeStore()
    api(() => { throw new TypeError('Failed to fetch') })

    expect(await store.dispatch(signOut())).toBe(false)

    expect(store.getState().auth.user).toEqual(user)
    expect(store.getState().auth.token).toBe('old-token')
  })

  it('keeps the session when an expired access token cannot be renewed', async () => {
    const store = makeStore()
    api(call => call.url.endsWith('/auth/refresh')
      ? reply(503, { error: 'Service unavailable' })
      : reply(401, { error: 'Invalid or expired token' }))

    expect(await store.dispatch(signOut())).toBe(false)

    expect(store.getState().auth.user).toEqual(user)
  })

  it('counts a session the API refuses outright as signed out', async () => {
    const store = makeStore()
    api(() => reply(401, { error: 'Session expired; sign in again' }))

    expect(await store.dispatch(signOut())).toBe(true)

    expect(store.getState().auth.user).toBeNull()
  })

  it('keeps the session on a server error', async () => {
    const store = makeStore()
    api(() => reply(500, { error: 'Internal server error' }))

    expect(await store.dispatch(signOut())).toBe(false)

    expect(store.getState().auth.user).toEqual(user)
  })
})

describe('SessionGate', () => {
  function gatedStore() {
    return configureStore({
      reducer: { auth: authReducer, lang: langReducer, [baseApi.reducerPath]: baseApi.reducer },
      middleware: getDefault => getDefault().concat(baseApi.middleware),
      preloadedState: {
        auth: { ...authReducer(undefined, { type: '@@INIT' }), user, sessionChecked: false },
      },
    })
  }

  it('shows a spinner until the startup refresh answers, then the app', async () => {
    const store = gatedStore()

    render(
      <StrictMode>
        <Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>
      </StrictMode>,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
    expect(await screen.findByText('app content')).toBeInTheDocument()
    expect(refreshCalls()).toHaveLength(1)
    expect(store.getState().auth.token).toBe('new-token')
  })

  it('clears the persisted user when there is no session to restore', async () => {
    const store = gatedStore()
    refreshAnswer = () => reply(401, { error: 'Session expired; sign in again' })

    render(<Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>)

    expect(await screen.findByText('app content')).toBeInTheDocument()
    expect(store.getState().auth.user).toBeNull()
    expect(store.getState().auth.token).toBeNull()
  })

  it('offers a retry instead of signing out when the API cannot be reached', async () => {
    const store = gatedStore()
    refreshAnswer = () => reply(503, { error: 'Service unavailable' })

    render(<Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(ru.sessionUnavailable)
    expect(screen.queryByText('app content')).not.toBeInTheDocument()
    expect(store.getState().auth.user).toEqual(user)
    expect(refreshCalls()).toHaveLength(1)

    refreshAnswer = () => reply(200, { user, token: 'new-token', twoFactorSetupRequired: false })
    fireEvent.click(within(alert).getByRole('button', { name: ru.sessionRetry }))

    expect(await screen.findByText('app content')).toBeInTheDocument()
    expect(refreshCalls()).toHaveLength(2)
    expect(store.getState().auth.token).toBe('new-token')
  })

  it('lets the user sign in anew when the API cannot be reached', async () => {
    const store = gatedStore()
    localStorage.setItem('auth-storage', JSON.stringify({ user }))
    refreshAnswer = () => { throw new TypeError('Failed to fetch') }

    render(<Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>)
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: ru.sessionSignIn }))

    expect(await screen.findByText('app content')).toBeInTheDocument()
    expect(store.getState().auth.user).toBeNull()
    expect(localStorage.getItem('auth-storage')).toBeNull()
  })

  it('asks the API to end the stored session before signing in anew', async () => {
    const store = gatedStore()
    refreshAnswer = () => reply(503, { error: 'Service unavailable' })

    render(<Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>)
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: ru.sessionSignIn }))

    expect(await screen.findByText('app content')).toBeInTheDocument()
    const logouts = seen.filter(call => call.url.endsWith('/auth/logout'))
    expect(logouts).toHaveLength(1)
    expect(logouts[0].headers.get('Authorization')).toBeNull()
    expect(logouts[0].headers.get('X-Requested-With')).toBe('kashrut')
    expect(logouts[0].credentials).toBe('include')
    expect(store.getState().auth.user).toBeNull()
  })

  it('renders at once when there is nothing to restore', () => {
    const store = makeStore(false)

    render(<Provider store={store}><SessionGate><div>app content</div></SessionGate></Provider>)

    expect(screen.getByText('app content')).toBeInTheDocument()
    expect(refreshCalls()).toHaveLength(0)
  })
})
