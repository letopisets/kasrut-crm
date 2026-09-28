const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// The server may walk several providers (and Nominatim is throttled to 1 req/s),
// so allow a generous budget — but never let the caller's "locating address"
// state hang on a stalled connection.
const GEOCODE_TIMEOUT_MS = 15_000

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

// All geocoding runs server-side in our /map/geocode (same-origin, CSP-allowed,
// provider tokens stay off the public bundle). With no `country` param the API
// infers Israel from the address itself and routes it GovMap → LocationIQ →
// Nominatim; anything else goes LocationIQ → Nominatim.
// Returns [lat, lng], or null on 204/no-result/error/timeout.
export async function geocodeRestaurantAddress(address: string, city: string): Promise<[number, number] | null> {
  const addr = address.trim()
  const cty  = city.trim()
  if (!addr && !cty) return null

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)
  try {
    const params   = new URLSearchParams({ address: addr, city: cty })
    const response = await fetch(`${API_URL}/map/geocode?${params.toString()}`, { signal: controller.signal })
    if (response.status === 204 || !response.ok) return null
    const data = await response.json() as { lat?: unknown; lng?: unknown } | null
    const lat  = data?.lat
    const lng  = data?.lng
    if (isCoord(lat) && isCoord(lng)) return [lat, lng]
  } catch {
    /* network/timeout/malformed body — treat as no result */
  } finally {
    clearTimeout(timeout)
  }
  return null
}
