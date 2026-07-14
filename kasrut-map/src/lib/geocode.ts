import { geocodeGovmap } from './govmapGeocode'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// Region routing: Israeli addresses go to GovMap (the authoritative Israeli
// geocoder, client-side); everything else goes to Nominatim via our own API
// (same-origin, CSP-allowed). Each falls back to the other on a miss, so a
// mis-routed or unconfigured case still resolves.
const HEBREW = /[֐-׿]/   // Hebrew Unicode block
const IL_HINTS = /\b(israel|ישראל|jerusalem|tel[ -]?aviv|haifa|ashdod|ashkelon|netanya|beer[ -]?sheva|bnei[ -]?brak|petah|rishon|holon|ramat[ -]?gan|herzliya|tiberias|eilat|nazareth|modiin|rehovot)\b/i

function isIsraeliAddress(address: string, city: string): boolean {
  const s = `${address} ${city}`
  return HEBREW.test(s) || IL_HINTS.test(s)
}

// Nominatim via our API. Returns null on 204/no-result/error.
async function geocodeNominatim(address: string, city: string): Promise<[number, number] | null> {
  try {
    const params = new URLSearchParams({ address, city })
    const response = await fetch(`${API_URL}/map/geocode?${params.toString()}`)
    if (response.status === 204 || !response.ok) return null
    const data = await response.json() as { lat?: number; lng?: number }
    if (typeof data.lat === 'number' && typeof data.lng === 'number') return [data.lat, data.lng]
  } catch { /* network/CSP — treat as no result */ }
  return null
}

export async function geocodeRestaurantAddress(address: string, city: string): Promise<[number, number] | null> {
  const addr = address.trim()
  const cty  = city.trim()
  if (!addr && !cty) return null

  if (isIsraeliAddress(addr, cty)) {
    const viaGovmap = await geocodeGovmap([addr, cty].filter(Boolean).join(', '))
    if (viaGovmap) return viaGovmap
    return geocodeNominatim(addr, cty)          // GovMap unavailable/miss → Nominatim
  }

  return geocodeNominatim(addr, cty)
}
