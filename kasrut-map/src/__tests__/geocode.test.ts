import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeRestaurantAddress } from '@/lib/geocode'

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}): Response {
  const status = init.status ?? 200
  return {
    status,
    ok:   init.ok ?? (status >= 200 && status < 300),
    json: async () => body,
  } as Response
}

describe('geocodeRestaurantAddress', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks our /map/geocode with address and city, and no country (server infers it)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ lat: 31.782057, lng: 35.21984 }))

    await geocodeRestaurantAddress(' יפו 42 ', ' ירושלים ')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]!
    const url = new URL(String(input), 'http://localhost')
    expect(url.pathname).toMatch(/\/map\/geocode$/)
    expect(url.searchParams.get('address')).toBe('יפו 42')
    expect(url.searchParams.get('city')).toBe('ירושלים')
    expect(url.searchParams.has('country')).toBe(false)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('never calls a third-party geocoder from the browser', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ lat: 1, lng: 2 }))

    await geocodeRestaurantAddress('Yafo 42', 'Jerusalem')

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).not.toMatch(/nominatim|govmap|locationiq/i)
  })

  it('returns [lat, lng] from the {lat, lng} body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ lat: 31.7683, lng: 35.2137 }))

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toEqual([31.7683, 35.2137])
  })

  it('returns null on 204 (no result)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(null, { status: 204 }))

    await expect(geocodeRestaurantAddress('Unknown', 'Nowhere')).resolves.toBeNull()
  })

  it('returns null on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, { status: 429 }))

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toBeNull()
  })

  it('returns null on a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toBeNull()
  })

  it.each([
    ['empty object',       {}],
    ['string coordinates', { lat: '31.7', lng: '35.2' }],
    ['non-finite',         { lat: Number.NaN, lng: 35.2 }],
    ['null body',          null],
    ['array body',         [{ lat: 31.7, lon: 35.2 }]],
  ])('returns null on a malformed body (%s)', async (_label, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(body))

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toBeNull()
  })

  it('returns null when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      ok:     true,
      json:   async () => { throw new SyntaxError('Unexpected token <') },
    } as unknown as Response)

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toBeNull()
  })

  it('returns null without a request when both fields are blank', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(geocodeRestaurantAddress('  ', '')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up (null) when the API stalls past the timeout', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))

      const pending = geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(pending).resolves.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
