import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '@/store/api/baseApi'
import authReducer, { setUser } from '@/store/authSlice'
import langReducer, { setLang } from '@/store/langSlice'
import uiReducer from '@/store/uiSlice'
import { RoleBanner } from '@/components/layout/RoleBanner'
import type { User } from '@/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const MASHGIACH: User = {
  id: 'u_mg', name: 'Yosef Levi', email: 'mg@crm.il', role: 'mashgiach',
  rabbanutId: 'rb_a', mashgiachId: 'mg_a', twoFactorEnabled: false,
}
const OWNER: User = { id: 'u_owner', name: 'Owner', email: 'owner@crm.il', role: 'owner', twoFactorEnabled: true }

const restaurant = (id: string, mashgiachId?: string) => ({
  id, name: `R ${id}`, address: 'addr', city: 'Haifa', levelId: 'kl', level: 'Regular', hechsherId: 'h1',
  mashgiachId, kitniyot: false, expires: '2030-01-01', status: 'ok', rabbanutId: 'rb_a',
})

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname.endsWith('/restaurants')) {
      return jsonResponse([restaurant('r1', 'mg_a'), restaurant('r2', 'mg_a'), restaurant('r3', 'mg_other')])
    }
    if (url.pathname.endsWith('/rabbanuts')) {
      return jsonResponse([{ id: 'rb_a', name: 'Rabbanut Haifa', city: 'Haifa', color: '#123456', active: true }])
    }
    // Stands in for the API's refusal of GET /api/mashgichim to a mashgiach.
    return jsonResponse({ error: 'Forbidden' }, 403)
  })
}

function renderBanner(user: User) {
  const store = configureStore({
    reducer: { auth: authReducer, lang: langReducer, ui: uiReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  })
  store.dispatch(setLang('en'))
  store.dispatch(setUser({ user, token: `token_${user.id}` }))
  render(<Provider store={store}><RoleBanner /></Provider>)
}

const requestedPaths = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input)).pathname)

describe('RoleBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it("shows a mashgiach's own name and establishment count from the session, without forbidden calls", async () => {
    const fetchMock = mockApi()
    renderBanner(MASHGIACH)

    expect(await screen.findByText(/Yosef Levi · .*: 2$/)).toBeInTheDocument()
    const paths = requestedPaths(fetchMock)
    expect(paths.some(p => p.endsWith('/mashgichim'))).toBe(false)
    expect(paths.some(p => p.endsWith('/rabbanuts'))).toBe(false)
  })

  it('shows the name even before the establishments load', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
    renderBanner(MASHGIACH)

    expect(screen.getByText(/Yosef Levi/)).toBeInTheDocument()
  })

  it('gives the owner the rabbanut filter without loading mashgichim or restaurants', async () => {
    const fetchMock = mockApi()
    renderBanner(OWNER)

    expect(await screen.findByRole('button', { name: 'Haifa' })).toBeInTheDocument()
    await waitFor(() => expect(requestedPaths(fetchMock)).toEqual(expect.arrayContaining([expect.stringMatching(/\/rabbanuts$/)])))
    const paths = requestedPaths(fetchMock)
    expect(paths.some(p => p.endsWith('/mashgichim'))).toBe(false)
    expect(paths.some(p => p.endsWith('/restaurants'))).toBe(false)
  })
})
