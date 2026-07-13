const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// Geocode via our own API (same-origin, allowed by the CSP). The browser used to
// hit Nominatim directly, which the prod CSP blocks — the request failed silently
// and the caller fell back to the map centre instead of the typed address.
export async function geocodeRestaurantAddress(address: string, city: string): Promise<[number, number] | null> {
  const params = new URLSearchParams({ address, city })
  const response = await fetch(`${API_URL}/map/geocode?${params.toString()}`)
  if (response.status === 204 || !response.ok) return null

  const data = await response.json() as { lat?: number; lng?: number }
  if (typeof data.lat === 'number' && typeof data.lng === 'number') return [data.lat, data.lng]
  return null
}
