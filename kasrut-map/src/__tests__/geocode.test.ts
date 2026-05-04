import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeRestaurantAddress } from '@/lib/geocode'

describe('geocodeRestaurantAddress', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed coordinates from the first Nominatim result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '31.7683', lon: '35.2137' }],
    } as Response)

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toEqual([31.7683, 35.2137])
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(requestedUrl).toContain('countrycodes=il')
    expect(requestedUrl).toContain('Jaffa')
    expect(requestedUrl).toContain('Jerusalem')
  })

  it('returns null when the geocoder has no usable coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{}],
    } as Response)

    await expect(geocodeRestaurantAddress('Unknown', 'Unknown')).resolves.toBeNull()
  })

  it('returns null when the geocoder request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => [],
    } as Response)

    await expect(geocodeRestaurantAddress('Jaffa 1', 'Jerusalem')).resolves.toBeNull()
  })
})
