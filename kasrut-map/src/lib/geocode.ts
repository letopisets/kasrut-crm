const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocodeRestaurantAddress(address: string, city: string): Promise<[number, number] | null> {
  const query = `${address}, ${city}, Israel`
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'il',
  })

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`)
  if (!response.ok) return null

  const results = await response.json() as Array<{ lat?: string; lon?: string }>
  const first = results[0]
  if (!first?.lat || !first.lon) return null

  const lat = Number(first.lat)
  const lng = Number(first.lon)
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}
