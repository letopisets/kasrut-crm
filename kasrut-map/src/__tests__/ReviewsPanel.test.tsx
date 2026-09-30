import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '@/store/api/baseApi'
import { mapAuthReducer } from '@/store/mapAuthSlice'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'
import type { MapLang } from '@/store/mapLangSlice'
import { ReviewsPanel } from '@/components/community/ReviewsPanel'
import type { MapReview, MapReviewsPayload, MapUser } from '@/types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function review(id: string, rating: number, createdAt: string): MapReview {
  return {
    id,
    restaurantId: 'r1',
    rating,
    text: `text ${id}`,
    createdAt,
    updatedAt: createdAt,
    user: { id: `u_${id}`, name: `User ${id}`, avatarUrl: null },
  }
}

const R3 = review('rv3', 5, '2026-09-03T10:00:00.000Z')
const R2 = review('rv2', 4, '2026-09-02T10:00:00.000Z')
const R1 = review('rv1', 3, '2026-09-01T10:00:00.000Z')

const PAGE_1: MapReviewsPayload = { ratingAvg: 4, reviewCount: 3, reviews: [R3, R2], nextCursor: 'CURSOR_1' }
const PAGE_2: MapReviewsPayload = { ratingAvg: 4, reviewCount: 3, reviews: [R1], nextCursor: null }

const USER_RV1: MapUser = {
  id: 'u_rv1',
  email: 'rv1@example.com',
  phone: null,
  firstName: null,
  lastName: null,
  name: 'User rv1',
  avatarUrl: null,
}

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input))
}

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = requestUrl(input)
    if (input instanceof Request && input.method === 'POST') return jsonResponse(R1)
    if (url.pathname.endsWith('/reviews/mine')) return jsonResponse({ review: R1 })
    if (url.pathname.endsWith('/reviews')) {
      return jsonResponse(url.searchParams.get('cursor') === 'CURSOR_1' ? PAGE_2 : PAGE_1)
    }
    return jsonResponse({ error: 'not found' }, 404)
  })
}

function renderPanel(user: MapUser | null = null, lang: MapLang = 'en') {
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      mapAuth: mapAuthReducer,
      mapLang: mapLangReducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  })
  store.dispatch(setMapLang(lang))
  render(
    <Provider store={store}>
      <ReviewsPanel restaurantId="r1" user={user} onRequireAuth={vi.fn()} />
    </Provider>,
  )
}

describe('ReviewsPanel pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the first page with the restaurant-wide summary, then appends the next page on "Show more"', async () => {
    const fetchMock = mockApi()
    renderPanel()

    expect(await screen.findByText('User rv3')).toBeInTheDocument()
    expect(screen.getByText('User rv2')).toBeInTheDocument()
    expect(screen.queryByText('User rv1')).not.toBeInTheDocument()
    expect(screen.getByText('Average rating 4.0 / 5, reviews: 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }))

    expect(await screen.findByText('User rv1')).toBeInTheDocument()
    // Earlier pages stay, in order, and the button goes away on the last page.
    const names = screen.getAllByText(/^User rv\d$/).map(node => node.textContent)
    expect(names).toEqual(['User rv3', 'User rv2', 'User rv1'])
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show more reviews' })).not.toBeInTheDocument()
    })

    const listUrls = fetchMock.mock.calls
      .map(([input]) => requestUrl(input))
      .filter(url => url.pathname.endsWith('/restaurants/r1/reviews'))
    expect(listUrls.map(url => url.searchParams.get('cursor'))).toEqual([null, 'CURSOR_1'])
    // Guests never ask for their own review.
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).pathname.endsWith('/mine'))).toBe(false)
  })

  it('prefills the signed-in user\'s review even when it is not on a loaded page', async () => {
    mockApi()
    renderPanel(USER_RV1)

    expect(await screen.findByText('User rv3')).toBeInTheDocument()
    expect(screen.queryByText('User rv1')).not.toBeInTheDocument()
    expect(await screen.findByDisplayValue('text rv1')).toBeInTheDocument()
    expect(screen.getByText('Update your review')).toBeInTheDocument()
  })

  it('refetches the loaded pages and the own review after saving a review', async () => {
    const fetchMock = mockApi()
    renderPanel(USER_RV1)

    expect(await screen.findByText('User rv3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }))
    expect(await screen.findByText('User rv1')).toBeInTheDocument()
    await screen.findByDisplayValue('text rv1')
    fetchMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Save review' }))

    expect(await screen.findByText('Review saved.')).toBeInTheDocument()
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => {
        const url = requestUrl(input)
        const method = input instanceof Request ? input.method : 'GET'
        const kind = url.pathname.endsWith('/mine') ? 'mine' : 'list'
        return `${method} ${kind} ${url.searchParams.get('cursor') ?? '-'}`
      })
      // The save, then both cached list pages (from the first) and the own review.
      expect(calls.sort()).toEqual(['GET list -', 'GET list CURSOR_1', 'GET mine -', 'POST list -'])
    })
  })

  it('keeps Save disabled and shows an error when the own review fails to load, until a retry succeeds', async () => {
    const fetchMock = mockApi()
    const listOnly = fetchMock.getMockImplementation()!
    let mineFails = true
    fetchMock.mockImplementation(async (input) => {
      if (requestUrl(input).pathname.endsWith('/reviews/mine') && mineFails) {
        return jsonResponse({ error: 'Internal server error' }, 500)
      }
      return listOnly(input)
    })
    renderPanel(USER_RV1)

    expect(await screen.findByText('User rv3')).toBeInTheDocument()
    expect(await screen.findByText(/Could not load your review/)).toBeInTheDocument()
    // The list loaded fine, but an upsert from the blank form would overwrite rv1.
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled()
    expect(screen.getByText('Your review')).toBeInTheDocument()

    mineFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByDisplayValue('text rv1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save review' })).toBeEnabled()
    expect(screen.queryByText(/Could not load your review/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => input instanceof Request && input.method === 'POST')).toBe(false)
  })

  it.each([
    ['ru', 'Показать ещё отзывы'],
    ['he', 'הצג ביקורות נוספות'],
  ] as const)('labels the "Show more" button in %s', async (lang, label) => {
    mockApi()
    renderPanel(null, lang)

    expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
  })
})
