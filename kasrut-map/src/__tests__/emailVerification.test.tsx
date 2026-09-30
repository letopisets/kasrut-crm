import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from '@/store/api/baseApi'
import { mapCommunityApi } from '@/store/api/mapCommunityApi'
import { mapAuthReducer, setCredentials } from '@/store/mapAuthSlice'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'
import { EmailVerificationHost, takeVerifyEmailToken } from '@/components/auth/EmailVerificationHost'
import en from '@/i18n/en'
import type { MapUser } from '@/types'

const user: MapUser = {
  id: 'mu1', email: 'new@example.com', phone: null, firstName: 'New', lastName: 'User',
  name: 'New User', avatarUrl: null, emailVerified: false,
}

interface SeenCall { url: string; method: string; body: unknown }

const seen: SeenCall[] = []
const fetchMock = vi.fn<typeof fetch>()
let answer: (call: SeenCall) => Response

function reply(status: number, body?: unknown) {
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeStore(signedIn = true) {
  const store = configureStore({
    reducer: { mapAuth: mapAuthReducer, mapLang: mapLangReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: getDefault => getDefault().concat(baseApi.middleware),
  })
  store.dispatch(setMapLang('en'))
  if (signedIn) store.dispatch(setCredentials({ user, token: 'access-token' }))
  return store
}

function renderHost(store = makeStore(), strict = false) {
  const tree = <Provider store={store}><EmailVerificationHost /></Provider>
  render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return store
}

const callsTo = (path: string) => seen.filter(call => new URL(call.url).pathname.endsWith(path))

beforeEach(() => {
  seen.length = 0
  answer = () => reply(404, { error: 'Not found' })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async input => {
    const req = input as Request
    const text = await req.clone().text()
    const call = { url: req.url, method: req.method, body: text ? JSON.parse(text) : undefined }
    seen.push(call)
    return answer(call)
  })
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('takeVerifyEmailToken', () => {
  it('returns the token once and removes only it from the address bar', () => {
    window.history.replaceState({ usr: null, key: 'k1', idx: 0 }, '', '/?lang=he&verifyEmail=tok-123#top')

    expect(takeVerifyEmailToken()).toBe('tok-123')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/?lang=he#top')
    expect(window.history.state).toEqual({ usr: null, key: 'k1', idx: 0 })
    expect(takeVerifyEmailToken()).toBeNull()
  })

  it('returns null and leaves the address alone without a link', () => {
    window.history.replaceState(null, '', '/r/abc?x=1')
    expect(takeVerifyEmailToken()).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/r/abc?x=1')
  })
})

describe('EmailVerificationHost — emailed link', () => {
  const config = (emailVerification: 'required' | 'off') => reply(200, { providers: [], emailVerification })
  const deadLink = (mode: 'required' | 'off' = 'required') => (call: SeenCall) => (
    call.url.endsWith('/map-auth/config') ? config(mode) : reply(400, { error: 'Invalid or expired verification link' })
  )
  const confirmButton = () => screen.findByRole('button', { name: en.verifyEmailConfirmBtn })

  it('sends nothing until the visitor confirms, then confirms once, even under StrictMode', async () => {
    answer = call => (call.url.endsWith('/map-auth/verify-email') ? reply(200, { ok: true }) : reply(404, {}))
    window.history.replaceState(null, '', '/?verifyEmail=tok-abc')

    renderHost(makeStore(false), true)

    // A mail scanner opening the link gets this far: the token has left the
    // address bar, but nothing reached the API.
    expect(await screen.findByText(en.verifyEmailConfirmText)).toBeInTheDocument()
    expect(window.location.search).toBe('')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(seen).toHaveLength(0)

    fireEvent.click(await confirmButton())

    expect(await screen.findByText(en.emailVerifiedSuccess)).toBeInTheDocument()
    expect(callsTo('/map-auth/verify-email')).toEqual([
      expect.objectContaining({ method: 'POST', body: { token: 'tok-abc' } }),
    ])
    await waitFor(() => expect(screen.queryByText(en.verifyEmailConfirmText)).toBeNull())
  })

  it('sends nothing when the visitor cancels', async () => {
    window.history.replaceState(null, '', '/?verifyEmail=tok-abc')

    renderHost(makeStore(false))
    fireEvent.click(await screen.findByRole('button', { name: en.cancelBtn }))

    await waitFor(() => expect(screen.queryByText(en.verifyEmailConfirmText)).toBeNull())
    expect(seen).toHaveLength(0)
  })

  it('reports a link of an account that is verified already as confirmed', async () => {
    answer = () => reply(200, { ok: true, alreadyVerified: true })
    window.history.replaceState(null, '', '/?verifyEmail=used')

    renderHost(makeStore(false))
    fireEvent.click(await confirmButton())

    expect(await screen.findByText(en.emailVerifiedSuccess)).toBeInTheDocument()
  })

  it('reports an expired or used link', async () => {
    answer = deadLink()
    window.history.replaceState(null, '', '/?verifyEmail=old')

    renderHost(makeStore(false))
    fireEvent.click(await confirmButton())

    expect(await screen.findByText(en.emailVerifyFailed)).toBeInTheDocument()
    expect(screen.queryByText(en.verifyEmailRequired.replace('{email}', user.email))).toBeNull()
  })

  it('offers a new link once an unverified account is signed in', async () => {
    answer = deadLink()
    window.history.replaceState(null, '', '/?verifyEmail=old')
    const store = makeStore(false)

    renderHost(store)
    fireEvent.click(await confirmButton())
    expect(await screen.findByText(en.emailVerifyFailed)).toBeInTheDocument()

    // The session restores after the link was tried.
    act(() => { store.dispatch(setCredentials({ user, token: 'access-token' })) })

    expect(await screen.findByText(en.verifyEmailRequired.replace('{email}', user.email))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.verifyEmailResend })).toBeInTheDocument()
  })

  it('offers nothing while posting does not need a verified email', async () => {
    answer = deadLink('off')
    window.history.replaceState(null, '', '/?verifyEmail=old')
    const store = makeStore()

    renderHost(store)
    fireEvent.click(await confirmButton())

    expect(await screen.findByText(en.emailVerifyFailed)).toBeInTheDocument()
    await waitFor(() => expect(callsTo('/map-auth/config')).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(store.getState().mapAuth.verificationPromptOpen).toBe(false)
  })

  it('offers nothing to an account that is already verified', async () => {
    answer = deadLink()
    window.history.replaceState(null, '', '/?verifyEmail=old')
    const store = makeStore(false)
    store.dispatch(setCredentials({ user: { ...user, emailVerified: true }, token: 'access-token' }))

    renderHost(store)
    fireEvent.click(await confirmButton())

    expect(await screen.findByText(en.emailVerifyFailed)).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(store.getState().mapAuth.verificationPromptOpen).toBe(false)
  })

  it('sends nothing without a link', async () => {
    renderHost()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(seen).toHaveLength(0)
    expect(screen.queryByText(en.verifyEmailConfirmText)).toBeNull()
  })
})

describe('EmailVerificationHost — 403 EMAIL_NOT_VERIFIED', () => {
  const refused = () => reply(403, { error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' })

  it('opens the dialog when a review is refused, and sends the link again', async () => {
    answer = call => {
      if (call.url.endsWith('/reviews')) return refused()
      if (call.url.endsWith('/map-auth/verify-email/resend')) return reply(204)
      return reply(404, {})
    }
    const store = renderHost()

    await store.dispatch(mapCommunityApi.endpoints.submitRestaurantReview.initiate({ restaurantId: 'r1', rating: 5 }))

    expect(store.getState().mapAuth.verificationPromptOpen).toBe(true)
    expect(await screen.findByText(en.verifyEmailRequired.replace('{email}', user.email))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: en.verifyEmailResend }))

    expect(await screen.findByText(en.verifyEmailResent)).toBeInTheDocument()
    expect(callsTo('/map-auth/verify-email/resend')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: en.closeBtn }))
    await waitFor(() => expect(store.getState().mapAuth.verificationPromptOpen).toBe(false))
  })

  it('opens it for a suggestion too, and shows the resend limit', async () => {
    answer = call => {
      if (call.url.endsWith('/map/suggestions')) return refused()
      if (call.url.endsWith('/map-auth/verify-email/resend')) return reply(429, { error: 'Too many requests. Please try again later.' })
      return reply(404, {})
    }
    const store = renderHost()

    await store.dispatch(mapCommunityApi.endpoints.submitSuggestion.initiate({ type: 'add', proposedName: 'X' }))
    fireEvent.click(await screen.findByRole('button', { name: en.verifyEmailResend }))

    expect(await screen.findByText(en.tooManyAttempts)).toBeInTheDocument()
  })

  it('ignores other 403s', async () => {
    answer = () => reply(403, { error: 'Forbidden' })
    const store = renderHost()

    await store.dispatch(mapCommunityApi.endpoints.submitRestaurantReview.initiate({ restaurantId: 'r1', rating: 5 }))

    expect(store.getState().mapAuth.verificationPromptOpen).toBe(false)
    expect(screen.queryByText(en.verifyEmailTitle)).toBeNull()
  })
})
