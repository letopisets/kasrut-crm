import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { mapAuthReducer, setCredentials } from '@/store/mapAuthSlice'
import { baseApi } from '@/store/api/baseApi'
import { mapCommunityApi } from '@/store/api/mapCommunityApi'
import { refreshMapSession } from '@/store/sessionRefresh'
import { useMapSessionBootstrap } from '@/hooks/useMapSessionBootstrap'
import type { MapUser } from '@/types'

const user: MapUser = { id: 'mu1', email: 'a@b.il', phone: null, firstName: 'A', lastName: 'B', name: 'A B', avatarUrl: null, emailVerified: true }

// A throwaway endpoint, so the tests can fire several ordinary requests at once.
const probeApi = baseApi.injectEndpoints({
  endpoints: build => ({
    probe: build.query<{ ok: string }, string>({ query: id => `/probe/${id}` }),
  }),
})

function makeStore(signedIn = true, preloaded?: { user: MapUser | null; token: string | null; sessionChecked: boolean }) {
  const store = configureStore({
    reducer: { mapAuth: mapAuthReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: getDefault => getDefault().concat(baseApi.middleware),
    ...(preloaded ? { preloadedState: { mapAuth: { ...preloaded, verificationPromptOpen: false } } } : {}),
  })
  if (signedIn && !preloaded) store.dispatch(setCredentials({ user, token: 'old-token' }))
  return store
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface SeenCall { url: string; method: string; credentials?: string; headers: Headers }

const fetchMock = vi.fn<typeof fetch>()
const seen: SeenCall[] = []
let refreshAnswer: () => Response | Promise<Response>

function describeCall(input: RequestInfo | URL, init?: RequestInit): SeenCall {
  if (input instanceof Request) {
    return { url: input.url, method: input.method, credentials: input.credentials, headers: input.headers }
  }
  return { url: String(input), method: init?.method ?? 'GET', credentials: init?.credentials, headers: new Headers(init?.headers) }
}

const refreshCalls = () => seen.filter(call => call.url.endsWith('/map-auth/refresh'))

beforeEach(() => {
  seen.length = 0
  refreshAnswer = () => reply(200, { user, token: 'new-token' })
  fetchMock.mockReset()
  // The API: refresh answers after a moment; any other call accepts only the
  // renewed token.
  fetchMock.mockImplementation(async (input, init) => {
    const call = describeCall(input, init)
    seen.push(call)
    if (call.url.endsWith('/map-auth/refresh')) {
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

describe('map base query — expired access token', () => {
  it('refreshes once for concurrent 401s and retries each request with the new token', async () => {
    const store = makeStore()

    const results = await Promise.all(['a', 'b', 'c'].map(id => store.dispatch(probeApi.endpoints.probe.initiate(id))))

    expect(refreshCalls()).toHaveLength(1)
    expect(results.every(result => result.data?.ok)).toBe(true)
    expect(seen.filter(call => call.headers.get('Authorization') === 'Bearer new-token')).toHaveLength(3)
    expect(store.getState().mapAuth.token).toBe('new-token')
  })

  it('sends the refresh with the cookie and X-Requested-With: kashrut', async () => {
    const store = makeStore()

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    const [refresh] = refreshCalls()
    expect(refresh.method).toBe('POST')
    expect(refresh.credentials).toBe('include')
    expect(refresh.headers.get('X-Requested-With')).toBe('kashrut')
  })

  it('signs out for good when the refresh is refused', async () => {
    const store = makeStore()
    refreshAnswer = () => reply(401, { error: 'Session expired; sign in again' })

    await Promise.all(['a', 'b'].map(id => store.dispatch(probeApi.endpoints.probe.initiate(id))))

    expect(refreshCalls()).toHaveLength(1)
    expect(store.getState().mapAuth.user).toBeNull()
    expect(localStorage.getItem('kasrut-map-auth')).toBeNull()
  })

  it.each([
    ['a server error', () => reply(503, { error: 'Unavailable' })],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('after %s signs out for this load only, keeping the stored user', async (_label, answer) => {
    const store = makeStore()
    refreshAnswer = answer

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    expect(store.getState().mapAuth.user).toBeNull()
    expect(store.getState().mapAuth.token).toBeNull()
    expect(JSON.parse(localStorage.getItem('kasrut-map-auth')!).user.id).toBe(user.id)
  })

  it.each(['login', 'register', 'oauth', 'password-reset/confirm'])('never refreshes on a 401 from /map-auth/%s', async path => {
    const store = makeStore()
    const send = {
      login:    () => store.dispatch(mapCommunityApi.endpoints.loginWithPassword.initiate({ email: 'a@b.il', password: 'x' })),
      register: () => store.dispatch(mapCommunityApi.endpoints.registerWithPassword.initiate({
        firstName: 'A', lastName: 'B', email: 'a@b.il', phone: '0500000000', password: 'Passw0rd1',
      })),
      oauth:    () => store.dispatch(mapCommunityApi.endpoints.oauthLogin.initiate({ provider: 'google', idToken: 'x' })),
      'password-reset/confirm': () => store.dispatch(mapCommunityApi.endpoints.confirmPasswordReset.initiate({ token: 't', password: 'p' })),
    }[path]!

    await send()

    expect(refreshCalls()).toHaveLength(0)
    expect(store.getState().mapAuth.token).toBe('old-token')
    // These calls set the refresh cookie, so they must let it through.
    expect(seen[0].credentials).toBe('include')
  })

  it('does not refresh for an anonymous visitor', async () => {
    const store = makeStore(false)

    await store.dispatch(probeApi.endpoints.probe.initiate('a'))

    expect(refreshCalls()).toHaveLength(0)
  })

  it('renews an expired token before signing out, so logout reaches the API', async () => {
    const store = makeStore()
    fetchMock.mockImplementation(async (input, init) => {
      const call = describeCall(input, init)
      seen.push(call)
      if (call.url.endsWith('/map-auth/refresh')) return reply(200, { user, token: 'new-token' })
      return call.headers.get('Authorization') === 'Bearer new-token'
        ? new Response(null, { status: 204 })
        : reply(401, { error: 'Invalid or expired token' })
    })

    await store.dispatch(mapCommunityApi.endpoints.logoutMap.initiate())

    const logouts = seen.filter(call => call.url.endsWith('/map-auth/logout'))
    expect(logouts).toHaveLength(2)
    expect(logouts[1].credentials).toBe('include')
    expect(logouts[1].headers.get('X-Requested-With')).toBe('kashrut')
  })
})

describe('refreshMapSession', () => {
  it('takes the cross-tab lock when the browser has Web Locks', async () => {
    const store = makeStore()
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })

    expect(await refreshMapSession(store.dispatch)).toBe('new-token')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toBe('kashrut-map-refresh')
  })
})

describe('useMapSessionBootstrap', () => {
  function Probe() {
    const checked = useMapSessionBootstrap()
    return <div>{checked ? 'checked' : 'checking'}</div>
  }

  it('refreshes once at startup for a persisted user', async () => {
    const store = makeStore(true, { user: null, token: null, sessionChecked: false })

    render(<StrictMode><Provider store={store}><Probe /></Provider></StrictMode>)

    expect(screen.getByText('checking')).toBeInTheDocument()
    expect(await screen.findByText('checked')).toBeInTheDocument()
    expect(refreshCalls()).toHaveLength(1)
    expect(store.getState().mapAuth.token).toBe('new-token')
    expect(store.getState().mapAuth.user).toEqual(user)
  })

  it('does nothing for an anonymous visitor', () => {
    const store = makeStore(false, { user: null, token: null, sessionChecked: true })

    render(<Provider store={store}><Probe /></Provider>)

    expect(screen.getByText('checked')).toBeInTheDocument()
    expect(refreshCalls()).toHaveLength(0)
  })
})
