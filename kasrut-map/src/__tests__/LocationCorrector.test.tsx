import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'
import type { MapLang } from '@/store/mapLangSlice'
import { LocationCorrector } from '@/components/location/LocationCorrector'

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}

function renderCorrector(lang: MapLang = 'en') {
  const store = configureStore({ reducer: { mapLang: mapLangReducer } })
  store.dispatch(setMapLang(lang))
  const onApply  = vi.fn()
  const onCancel = vi.fn()
  render(
    <Provider store={store}>
      <LocationCorrector onApply={onApply} onCancel={onCancel} />
    </Provider>,
  )
  return { onApply, onCancel, input: screen.getByRole('textbox') }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('LocationCorrector', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('searches our /map/places and applies the picked coordinates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      results: [
        { id: 'address|ADDR|1', label: 'יפו 42 ירושלים', detail: 'כתובת', lat: 31.782057, lng: 35.21984 },
        { id: 'settlement|1',   label: 'ירושלים',                          lat: 31.7683,   lng: 35.2137 },
      ],
    }))
    const { onApply, input } = renderCorrector('he')

    fireEvent.change(input, { target: { value: 'יפו 42 ירושלים' } })

    expect(await screen.findByText('יפו 42 ירושלים')).toBeInTheDocument()
    expect(screen.getByText('כתובת')).toBeInTheDocument()
    expect(screen.getByText('ירושלים')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(url.pathname).toMatch(/\/map\/places$/)
    expect(url.searchParams.get('q')).toBe('יפו 42 ירושלים')
    expect(url.searchParams.get('lang')).toBe('he')
    expect(url.href).not.toMatch(/nominatim|govmap/i)

    fireEvent.click(screen.getByText('יפו 42 ירושלים'))
    expect(onApply).toHaveBeenCalledWith([31.782057, 35.21984])
  })

  it('does not search for queries shorter than 3 characters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { input } = renderCorrector()

    fireEvent.change(input, { target: { value: 'ab ' } })
    await new Promise(r => setTimeout(r, 500))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows nothing when the API fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
    const { input } = renderCorrector()

    fireEvent.change(input, { target: { value: 'Yafo 42' } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('aborts a stale request so its late response cannot overwrite newer results', async () => {
    const first  = deferred<Response>()
    const second = deferred<Response>()
    const signals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      signals.push(init!.signal!)
      return signals.length === 1 ? first.promise : second.promise
    })
    const { input } = renderCorrector()

    fireEvent.change(input, { target: { value: 'Yafo' } })
    await waitFor(() => expect(signals).toHaveLength(1))

    fireEvent.change(input, { target: { value: 'Yafo 42' } })
    expect(signals[0]!.aborted).toBe(true)
    await waitFor(() => expect(signals).toHaveLength(2))

    second.resolve(jsonResponse({ results: [{ id: 'new', label: 'Yafo 42 Jerusalem', lat: 31.78, lng: 35.22 }] }))
    expect(await screen.findByText('Yafo 42 Jerusalem')).toBeInTheDocument()

    first.resolve(jsonResponse({ results: [{ id: 'old', label: 'Yafo Street', lat: 32.05, lng: 34.75 }] }))
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText('Yafo Street')).not.toBeInTheDocument()
    expect(screen.getByText('Yafo 42 Jerusalem')).toBeInTheDocument()
  })
})
