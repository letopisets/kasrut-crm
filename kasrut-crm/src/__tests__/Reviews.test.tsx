import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '@/store/api/baseApi'
import { rtkQueryErrorToast } from '@/store/errorMiddleware'
import { resetApiOnSessionChange } from '@/store/sessionReset'
import authReducer, { logout, setUser } from '@/store/authSlice'
import langReducer, { setLang, type Lang } from '@/store/langSlice'
import uiReducer from '@/store/uiSlice'
import Reviews from '@/pages/Reviews'
import type { ModeratedReview, ModeratedReviewsPage, User } from '@/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const OWNER: User = { id: 'u_owner', name: 'Owner', email: 'owner@crm.il', role: 'owner', twoFactorEnabled: false }
const RABBANUT: User = {
  id: 'u_rb', name: 'Rabbanut', email: 'rb@crm.il', role: 'rabbanut', rabbanutId: 'rb_a', twoFactorEnabled: false,
}

function review(
  id: string, rating: number, text: string | null, restaurant: string, author: string,
  updatedAt = '2026-09-20T10:00:00.000Z',
): ModeratedReview {
  return {
    id,
    rating,
    text,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt,
    restaurant: { id: `r_${id}`, name: restaurant },
    author: { id: `u_${id}`, name: author },
  }
}

const RV1 = review('rv1', 1, 'Rude staff', 'Alpha Grill', 'Dana')
const RV2 = review('rv2', 5, null, 'Beta Bakery', 'Eli')
const RV3 = review('rv3', 4, 'Good', 'Gamma Pizza', 'Noa')

function requestOf(input: RequestInfo | URL): { url: URL; method: string } {
  return input instanceof Request
    ? { url: new URL(input.url), method: input.method }
    : { url: new URL(String(input)), method: 'GET' }
}

// In-memory server: two pages over whatever reviews are still stored; DELETE
// removes one (or answers 404 for an id it does not have).
function mockServer(initial: ModeratedReview[] = [RV1, RV2, RV3]) {
  let stored = [...initial]
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const { url, method } = requestOf(input)
    if (method === 'DELETE') {
      const id = url.pathname.split('/').pop()
      if (!stored.some(r => r.id === id)) return jsonResponse({ error: 'Review not found' }, 404)
      stored = stored.filter(r => r.id !== id)
      return new Response(null, { status: 204 })
    }
    if (url.pathname.endsWith('/map/reviews')) {
      const start = url.searchParams.get('cursor') === 'CURSOR_2' ? 2 : 0
      const page: ModeratedReviewsPage = {
        reviews: stored.slice(start, start + 2),
        nextCursor: start === 0 && stored.length > 2 ? 'CURSOR_2' : null,
      }
      return jsonResponse(page)
    }
    return jsonResponse({ error: 'Not found' }, 404)
  })
  return {
    fetchMock,
    remove: (id: string) => { stored = stored.filter(r => r.id !== id) },
    calls: () => fetchMock.mock.calls.map(([input]) => {
      const { url, method } = requestOf(input)
      return `${method} ${url.pathname}${url.search}`
    }),
  }
}

function makeStore(lang: Lang = 'en', user: User = OWNER) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      lang: langReducer,
      ui: uiReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    // As in store/index.ts: the session reset is what keeps one account's
    // cached list from the next.
    middleware: (getDefault) => getDefault().concat(baseApi.middleware, rtkQueryErrorToast, resetApiOnSessionChange),
  })
  store.dispatch(setLang(lang))
  store.dispatch(setUser({ user, token: `token_${user.id}` }))
  return store
}

function renderPage(lang: Lang = 'en') {
  const store = makeStore(lang)
  render(<Provider store={store}><Reviews /></Provider>)
  return store
}

const card = (restaurant: string) => screen.getByRole('article', { name: new RegExp(`^${restaurant} — `) })

describe('Reviews moderation page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('lists restaurant, author, rating and text, and appends the next page on "Load more"', async () => {
    const server = mockServer()
    renderPage()

    expect(await screen.findByText('Alpha Grill')).toBeInTheDocument()
    const first = card('Alpha Grill')
    expect(within(first).getByText('Rude staff')).toBeInTheDocument()
    expect(within(first).getByText('Dana')).toBeInTheDocument()
    expect(within(first).getByRole('img', { name: '1 of 5' })).toBeInTheDocument()
    expect(within(first).getByText(new Date(RV1.createdAt).toLocaleDateString('en-US'))).toBeInTheDocument()
    expect(within(card('Beta Bakery')).getByText('No text, rating only')).toBeInTheDocument()
    expect(screen.queryByText('Gamma Pizza')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Gamma Pizza')).toBeInTheDocument()
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual([
      'Alpha Grill — Dana', 'Beta Bakery — Eli', 'Gamma Pizza — Noa',
    ])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument())
    expect(server.calls()).toEqual(['GET /api/map/reviews', 'GET /api/map/reviews?cursor=CURSOR_2'])
  })

  it('deletes only after confirmation, then refetches the list without the review', async () => {
    const server = mockServer()
    const store = renderPage()
    await screen.findByText('Alpha Grill')

    fireEvent.click(within(card('Alpha Grill')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this review?' })
    expect(within(dialog).getByText(/The review by Dana of Alpha Grill will be permanently removed/)).toBeInTheDocument()

    // Cancel sends nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.calls().some(call => call.startsWith('DELETE'))).toBe(false)

    fireEvent.click(within(card('Alpha Grill')).getByRole('button', { name: 'Delete' }))
    const again = await screen.findByRole('dialog', { name: 'Delete this review?' })
    server.fetchMock.mockClear()
    fireEvent.click(within(again).getByRole('button', { name: 'Delete review' }))

    await waitFor(() => expect(screen.queryByText('Alpha Grill')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The delete, then the invalidated list is fetched again from the first page.
    expect(server.calls()).toEqual(['DELETE /api/map/reviews/rv1', 'GET /api/map/reviews'])
    expect(screen.getByText('Beta Bakery')).toBeInTheDocument()
    expect(store.getState().ui.snackbar).toMatchObject({ open: true, severity: 'success', message: 'Review deleted' })
  })

  it('keeps the dialog open with an error when the delete fails, and drops the stale review', async () => {
    const server = mockServer()
    const store = renderPage()
    await screen.findByText('Alpha Grill')
    // Someone else removed it meanwhile: the DELETE answers 404.
    server.remove('rv1')

    fireEvent.click(within(card('Alpha Grill')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this review?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete review' }))

    expect(await within(dialog).findByText('Could not delete the review. It may already have been removed.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('article', { name: /^Alpha Grill/ })).not.toBeInTheDocument())
    // The dialog is the only error UI: no global toast with the server's
    // untranslated 'Review not found'.
    expect(store.getState().ui.snackbar.open).toBe(false)
  })

  it('prints author and restaurant names literally in the confirmation', async () => {
    mockServer([review('rv1', 1, 'Rude staff', 'Alpha Grill', "$' {restaurant} $&")])
    renderPage()
    await screen.findByText('Alpha Grill')

    fireEvent.click(within(card('Alpha Grill')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this review?' })

    expect(within(dialog).getByText(
      "The review by $' {restaurant} $& of Alpha Grill will be permanently removed from the public map. This cannot be undone.",
    )).toBeInTheDocument()
  })

  it('marks a review its author rewrote after posting', async () => {
    const edited = review('rv1', 1, 'Now abusive', 'Alpha Grill', 'Dana', '2026-09-22T10:00:00.000Z')
    mockServer([edited, RV2])
    renderPage()
    await screen.findByText('Alpha Grill')

    const editedOn = new Date(edited.updatedAt).toLocaleDateString('en-US')
    expect(within(card('Alpha Grill')).getByText(`· edited ${editedOn}`)).toBeInTheDocument()
    expect(within(card('Beta Bakery')).queryByText(/edited/)).not.toBeInTheDocument()
  })

  it('does not serve the previous user\'s cached list to the next user on the same tab', async () => {
    const server = mockServer()
    const store = makeStore('en', OWNER)
    const first = render(<Provider store={store}><Reviews /></Provider>)
    await screen.findByText('Alpha Grill')
    first.unmount()

    // Within the cache lifetime, the owner signs out and a rabbanut signs in;
    // the server now scopes the list to that rabbanut's tenant.
    store.dispatch(logout())
    store.dispatch(setUser({ user: RABBANUT, token: 'token_u_rb' }))
    server.remove('rv1')
    server.fetchMock.mockClear()
    render(<Provider store={store}><Reviews /></Provider>)

    expect(await screen.findByText('Beta Bakery')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Grill')).not.toBeInTheDocument()
    expect(server.calls()).toEqual(['GET /api/map/reviews'])
  })

  it('shows the empty state', async () => {
    mockServer([])
    renderPage()

    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it.each([
    ['ru', 'Загрузить ещё', 'Удалить'],
    ['he', 'טען עוד', 'מחק'],
  ] as const)('is translated in %s', async (lang, loadMore, del) => {
    mockServer()
    renderPage(lang)

    expect(await screen.findByRole('button', { name: loadMore })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: del })).toHaveLength(2)
  })
})
