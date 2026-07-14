import proj4 from 'proj4'

// GovMap (Survey of Israel) is a client-side JS SDK — the authoritative geocoder
// for Israeli addresses. It returns Israeli TM Grid (EPSG:2039) X/Y, which we
// project to WGS84 lat/lng. Requires a token (register at govmap.gov.il); without
// one this module is a no-op and the caller falls back to Nominatim.

const SDK_URL = 'https://www.govmap.gov.il/govmap/api/govmap.api.js'
// EPSG:2039 — Israel 1993 / Israeli TM Grid.
const ITM =
  '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 ' +
  '+x_0=219529.584 +y_0=626907.39 +ellps=GRS80 ' +
  '+towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4262 +units=m +no_defs'
proj4.defs('EPSG:2039', ITM)

const TOKEN = import.meta.env.VITE_GOVMAP_TOKEN as string | undefined

interface GovmapDeferred<T> { then(cb: (r: T) => void): GovmapDeferred<T>; fail(cb: (r: unknown) => void): GovmapDeferred<T> }
interface GeocodeResult { status: number; data?: Array<{ X?: number; Y?: number; ResultLable?: string }> }
interface GovmapSdk {
  createMap(elementId: string, opts: Record<string, unknown>): void
  geocode(params: { keyword: string }, type: unknown): GovmapDeferred<GeocodeResult> | Promise<GeocodeResult>
  geocodeType: { FullResult: unknown }
}
declare global { interface Window { govmap?: GovmapSdk } }

const HIDDEN_DIV_ID = 'govmap-geocode-host'

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('govmap sdk failed to load'))
    document.head.appendChild(s)
  })
}

let readyPromise: Promise<GovmapSdk | null> | null = null

function ensureReady(): Promise<GovmapSdk | null> {
  if (!TOKEN) return Promise.resolve(null)              // not configured → skip
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    try {
      await loadScriptOnce(SDK_URL)
      const sdk = window.govmap
      if (!sdk) return null
      // GovMap's geocode context is established by createMap; give it a hidden,
      // sized host (an off-screen display:none element can break its init).
      if (!document.getElementById(HIDDEN_DIV_ID)) {
        const div = document.createElement('div')
        div.id = HIDDEN_DIV_ID
        div.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:320px;height:320px;visibility:hidden;'
        document.body.appendChild(div)
      }
      try {
        sdk.createMap(HIDDEN_DIV_ID, { token: TOKEN, showXY: true, level: 5, center: { x: 217009, y: 708689 } })
      } catch { /* createMap may still leave geocode usable */ }
      // Wait briefly for the geocode function to become callable.
      const start = Date.now()
      while (typeof sdk.geocode !== 'function' && Date.now() - start < 8000) {
        await new Promise(r => setTimeout(r, 100))
      }
      return typeof sdk.geocode === 'function' ? sdk : null
    } catch {
      return null
    }
  })()
  return readyPromise
}

/** Geocode an Israeli address via GovMap → WGS84 [lat, lng], or null (not
 *  configured, no result, out of range, or any SDK error — caller falls back). */
export async function geocodeGovmap(keyword: string): Promise<[number, number] | null> {
  const q = keyword.trim()
  if (!q) return null
  const sdk = await ensureReady()
  if (!sdk) return null

  try {
    const res = await new Promise<GeocodeResult>((resolve, reject) => {
      const d = sdk.geocode({ keyword: q }, sdk.geocodeType.FullResult)
      if (d && typeof (d as GovmapDeferred<GeocodeResult>).fail === 'function') {
        const def = d as GovmapDeferred<GeocodeResult>
        def.then(resolve); def.fail(reject)
      } else {
        Promise.resolve(d as Promise<GeocodeResult>).then(resolve, reject)
      }
    })

    const hit = res?.status === 0 ? res.data?.[0] : undefined
    if (hit && typeof hit.X === 'number' && typeof hit.Y === 'number') {
      const [lng, lat] = proj4('EPSG:2039', 'WGS84', [hit.X, hit.Y])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng]
    }
  } catch { /* fall through to null → caller uses Nominatim */ }
  return null
}

export const govmapConfigured = Boolean(TOKEN)
