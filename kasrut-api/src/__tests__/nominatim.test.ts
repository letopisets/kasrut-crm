import {
  normalizeHebrewAddress, geocodeAddress, geocodeAddressDetailed, searchNominatimPlaces, isAddressLevel,
  deferredGeocodeStamp, resetFallbackWarnings,
} from '../lib/nominatim'
import { resetGovmapState } from '../lib/govmap'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

jest.mock('../lib/redis', () => ({
  redis: {
    get:   jest.fn(),
    setex: jest.fn(),
  },
}))

const mockedRedis = redis as unknown as { get: jest.Mock; setex: jest.Mock }

describe('normalizeHebrewAddress', () => {
  it('strips the street designator, which Nominatim does not index', () => {
    expect(normalizeHebrewAddress("רח' יפו 42")).toBe('יפו 42')
    expect(normalizeHebrewAddress('רח׳ יפו 42')).toBe('יפו 42')
    expect(normalizeHebrewAddress('רחוב יפו 42')).toBe('יפו 42')
    expect(normalizeHebrewAddress('רח. בן יהודה 18')).toBe('בן יהודה 18')
  })

  it('expands the boulevard abbreviation to the full word Nominatim matches', () => {
    expect(normalizeHebrewAddress("שד' הרצל 55")).toBe('שדרות הרצל 55')
    expect(normalizeHebrewAddress('שד׳ רוטשילד 1')).toBe('שדרות רוטשילד 1')
  })

  it('leaves already-clean and non-Hebrew addresses untouched', () => {
    expect(normalizeHebrewAddress('יפו 42')).toBe('יפו 42')
    expect(normalizeHebrewAddress('שדרות הרצל 55')).toBe('שדרות הרצל 55')
    expect(normalizeHebrewAddress('5th Avenue 350')).toBe('5th Avenue 350')
    expect(normalizeHebrewAddress('Rue des Rosiers 7')).toBe('Rue des Rosiers 7')
  })

  it('handles a designator in the middle of a compound address', () => {
    expect(normalizeHebrewAddress("קניון עזריאלי, רח' בגין 132")).toBe('קניון עזריאלי, בגין 132')
  })
})

describe('geocodeAddress provider chain', () => {
  const fetchMock = jest.fn()
  const GOVMAP_HIT = {
    id: 'address|ADDR|53871547', text: 'יפו 42 ירושלים', type: 'address', centroid: 'POINT (220915.5 632151.46)',
  }
  const OSM_HIT = [{
    lat: '31.7820', lon: '35.2198', addresstype: 'house', display_name: 'יפו 42, ירושלים', address: { city: 'ירושלים' },
  }]

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  // Route by host; unconfigured hosts must never be called.
  function route(h: { govmap?: unknown; locationiq?: unknown; nominatim?: unknown }) {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes('govmap.gov.il')) return json(200, { results: h.govmap ?? [] })
      if (u.includes('locationiq.com')) return json(200, h.locationiq ?? [])
      if (u.includes('nominatim.openstreetmap.org')) return json(200, h.nominatim ?? [])
      throw new Error(`unexpected fetch ${u}`)
    })
  }
  const calledHosts = () => fetchMock.mock.calls.map(c => new URL(String(c[0])).host)

  beforeAll(() => { global.fetch = fetchMock as unknown as typeof fetch })

  beforeEach(() => {
    fetchMock.mockReset()
    resetGovmapState()
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')
    process.env.GOVMAP_API_KEY = 'test-govmap-key'
    delete process.env.LOCATIONIQ_API_KEY
  })

  afterAll(() => {
    delete process.env.GOVMAP_API_KEY
    delete process.env.LOCATIONIQ_API_KEY
  })

  it('IL + GovMap key → GovMap answers first, nobody else is asked', async () => {
    route({ govmap: [GOVMAP_HIT] })
    const p = await geocodeAddress("רח' יפו 42", 'ירושלים', 'IL')
    expect(p).toMatchObject({ provider: 'govmap', addresstype: 'house' })
    expect(calledHosts()).toEqual(['www.govmap.gov.il'])
  })

  it('GovMap miss → LocationIQ when configured', async () => {
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    route({ locationiq: OSM_HIT })
    const p = await geocodeAddress('יפו 42', 'ירושלים', 'il')
    expect(p).toMatchObject({ provider: 'locationiq', lat: 31.782 })
    expect(calledHosts()[0]).toBe('www.govmap.gov.il')
    expect(calledHosts()).not.toContain('nominatim.openstreetmap.org')
  })

  it('GovMap miss → Nominatim without LocationIQ', async () => {
    route({ nominatim: OSM_HIT })
    const p = await geocodeAddress('יפו 42', 'ירושלים', 'IL')
    expect(p).toMatchObject({ provider: 'nominatim' })
    expect(calledHosts()[0]).toBe('www.govmap.gov.il')
    expect(calledHosts()[calledHosts().length - 1]).toBe('nominatim.openstreetmap.org')
  })

  it('never uses GovMap for non-IL or worldwide searches', async () => {
    route({ govmap: [GOVMAP_HIT], nominatim: OSM_HIT })
    expect(await geocodeAddress('Rue des Rosiers 7', 'Paris', 'FR')).toMatchObject({ provider: 'nominatim' })
    expect(await geocodeAddress('Rue des Rosiers 7', 'Paris')).toMatchObject({ provider: 'nominatim' })
    expect(calledHosts()).not.toContain('www.govmap.gov.il')
  })

  it('without GOVMAP_API_KEY behaves exactly as before', async () => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: OSM_HIT })
    expect(await geocodeAddress('יפו 42', 'ירושלים', 'IL')).toMatchObject({ provider: 'nominatim' })
    expect(calledHosts()).toEqual(['nominatim.openstreetmap.org'])
  })

  it('IL fallback skips a hit in another city for one in the input city', async () => {
    delete process.env.GOVMAP_API_KEY
    // live: "הרצל 20, חיפה" → Herzl 20 in Hadera first
    route({ nominatim: [
      { lat: '32.4372', lon: '34.9196', addresstype: 'building', display_name: '20, הרצל, חדרה, מחוז חיפה', address: { city: 'חדרה', state: 'מחוז חיפה' } },
      { lat: '32.8110', lon: '34.9978', addresstype: 'building', display_name: '20, הרצל, חיפה', address: { city: 'חיפה' } },
    ] })
    expect(await geocodeAddress('הרצל 20', 'חיפה', 'IL')).toMatchObject({ provider: 'nominatim', lat: 32.811 })
    const url = new URL(String(fetchMock.mock.calls.at(-1)![0]))
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('accept-language')).toBe('he')
    expect(url.searchParams.get('countrycodes')).toBe('il,ps')
  })

  it('IL fallback returns null rather than a wrong-city point', async () => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: [
      { lat: '32.0170', lon: '34.7500', addresstype: 'road', display_name: 'רוטשילד, בת ים', address: { road: 'רוטשילד', city: 'בת ים' } },
    ] })
    expect(await geocodeAddress('רוטשילד 200', 'תל אביב', 'IL')).toBeNull()
  })

  it('IL fallback folds official long forms and compares Latin input in English', async () => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: [
      { lat: '32.0662', lon: '34.7700', addresstype: 'house', display_name: 'x', address: { city: 'תל־אביב–יפו' } },
    ] })
    expect(await geocodeAddress('הרצל 10', 'תל אביב', 'IL')).not.toBeNull()

    route({ nominatim: [
      { lat: '32.1805', lon: '34.8134', addresstype: 'road', display_name: 'x', address: { city: 'Herzliya' } },
      { lat: '32.1053', lon: '34.7970', addresstype: 'road', display_name: 'x', address: { city: 'Tel Aviv-Yafo' } },
    ] })
    expect(await geocodeAddress('Keren HaYesod 3', 'Tel Aviv', 'IL')).toMatchObject({ lat: 32.1053 })
    expect(new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams.get('accept-language')).toBe('en')
  })

  // Nominatim rows (address fields verbatim) for DB city spellings the first
  // city check rejected — each point was right (live, 2026-09).
  it.each([
    ["רח' הרצל 52 ראשון לציון", 'ראשון', { road: 'הרצל', house_number: '52', suburb: 'אברמוביץ', town: 'ראשון לציון' }],
    ["רח' השחרור 15 טירת הכרמל", 'טירת הכרמל', { road: 'השחרור', town: 'טירת כרמל' }],
    ["רח' נחל צאלים 2 בית שמש", 'רמת בית שמש', { road: 'שדרות נחל צאלים', suburb: 'רמת בית שמש א', town: 'בית שמש' }],
    ['9 בן גוריון, חצור הגלילית', 'חצור', { road: 'בן גוריון', town: 'חצור הגלילית' }],
    ['קדושי השואה 9', 'קריית שמואל', { road: 'קדושי השואה', suburb: 'קרית חיים', city_district: 'רובע קריית חיים - קריית שמואל', city: 'חיפה' }],
    ['14 ן"הר', 'ביתר עלית', { road: 'הר"ן', city: 'ביתר עילית' }],
    ['6 דקלה', 'מישור אדומים', { road: 'דקלה', house_number: '6', suburb: 'נופי סלע', city: 'מעלה אדומים' }],
  ])('IL fallback accepts "%s" in DB city "%s"', async (address, city, osmAddress) => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: [{ lat: '31.9662', lon: '34.8021', addresstype: 'road', display_name: 'x', address: osmAddress }] })
    expect(await geocodeAddress(address, city, 'IL')).toMatchObject({ provider: 'nominatim', lat: 31.9662 })
  })

  it('IL fallback still rejects a row in another place', async () => {
    delete process.env.GOVMAP_API_KEY
    // live: "'בית אל ב.ת.א | בית אל" → a road in Jerusalem (the old path published it, 18.8 km off)
    route({ nominatim: [{ lat: '31.7673', lon: '35.2318', addresstype: 'highway', display_name: 'x', address: { road: 'וואדי הילווה', suburb: 'אבו טור', city: 'ירושלים' } }] })
    expect(await geocodeAddress("'בית אל ב.ת.א", 'בית אל', 'IL')).toBeNull()
    // live: "3 פריאל | מישור אדומים" → tagged Gush Etzion regional council
    route({ nominatim: [{ lat: '31.7944', lon: '35.3347', addresstype: 'road', display_name: 'x', address: { road: 'פריאל', city: 'מועצה אזורית גוש עציון' } }] })
    expect(await geocodeAddress('3 פריאל', 'מישור אדומים', 'IL')).toBeNull()
  })

  it('IL fallback searches il,ps (OSM tags Judea & Samaria settlements "ps"); worldwide stays unrestricted', async () => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: [{ lat: '31.7044', lon: '35.1166', addresstype: 'building', display_name: 'x', address: { road: 'הרב ברים', house_number: '4', city: 'ביתר עילית' } }] })
    expect(await geocodeAddress('4 הרב ברים', 'ביתר עילית', 'IL')).toMatchObject({ lat: 31.7044 })
    expect(new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams.get('countrycodes')).toBe('il,ps')
    route({ nominatim: [{ lat: '48.857', lon: '2.361', addresstype: 'house', display_name: 'x' }] })
    await geocodeAddress('Rue des Rosiers 7', 'Paris')
    expect(new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams.has('countrycodes')).toBe(false)
  })

  it('geocodeAddressDetailed flags a transient GovMap failure so batch jobs can retry the row', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes('govmap.gov.il')) return json(429, {})
      return json(200, OSM_HIT)
    })
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toMatchObject({ govmapTransient: true, point: { provider: 'nominatim' } })

    resetGovmapState()
    route({ nominatim: OSM_HIT })   // GovMap: a definitive 200 with no hit
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toMatchObject({ govmapTransient: false, point: { provider: 'nominatim' } })

    resetGovmapState()
    route({ govmap: [GOVMAP_HIT] })
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toMatchObject({ govmapTransient: false, point: { provider: 'govmap' } })
  })

  it('IL fallback: a row with a city/town/village must be in THAT place; a same-named suburb elsewhere is not', async () => {
    delete process.env.GOVMAP_API_KEY
    // "רמות" is a Jerusalem neighbourhood (an input alias), but Beersheba has one too
    route({ nominatim: [{ lat: '31.2700', lon: '34.8100', addresstype: 'house', display_name: 'x', address: { road: 'הרצל', suburb: 'רמות', city: 'באר שבע' } }] })
    expect(await geocodeAddress('הרצל 5', 'ירושלים', 'IL')).toBeNull()
    expect(await geocodeAddress('הרצל 5', 'רמות', 'IL')).toBeNull()
    // …while a Jerusalem row serves both the city and the neighbourhood-as-city
    route({ nominatim: [{ lat: '31.8200', lon: '35.1900', addresstype: 'house', display_name: 'x', address: { road: 'גולדה מאיר', suburb: 'רמות', city: 'ירושלים' } }] })
    expect(await geocodeAddress('גולדה מאיר 5', 'ירושלים', 'IL')).toMatchObject({ lat: 31.82 })
    expect(await geocodeAddress('גולדה מאיר 6', 'רמות', 'IL')).toMatchObject({ lat: 31.82 })
    // a row without any settlement field is judged by its other locality fields
    route({ nominatim: [{ lat: '31.8000', lon: '35.3000', addresstype: 'house', display_name: 'x', address: { road: 'דקלה', suburb: 'מעלה אדומים' } }] })
    expect(await geocodeAddress('דקלה 7', 'מעלה אדומים', 'IL')).toMatchObject({ lat: 31.8 })
  }, 15_000)   // 5 Nominatim calls at the real 1.1 s spacing

  it('IL fallback searches a Hebrew address with a Latin Israeli city under the Hebrew name', async () => {
    delete process.env.GOVMAP_API_KEY
    route({ nominatim: OSM_HIT })
    expect(await geocodeAddress('יפו 42', 'Jerusalem', 'IL')).toMatchObject({ provider: 'nominatim', lat: 31.782 })
    const url = new URL(String(fetchMock.mock.calls.at(-1)![0]))
    expect(url.searchParams.get('q')).toBe('יפו 42, ירושלים')
    expect(url.searchParams.get('accept-language')).toBe('he')

    // and GovMap gets the Hebrew city too
    process.env.GOVMAP_API_KEY = 'test-govmap-key'
    resetGovmapState()
    route({ govmap: [GOVMAP_HIT] })
    expect(await geocodeAddress('יפו 42', 'Jerusalem', 'IL')).toMatchObject({ provider: 'govmap' })
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)![1].body)).searchText).toBe('יפו 42 ירושלים')
  })

  it('deferOnGovmapTransient: a GovMap outage returns at once, without spending fallback quota', async () => {
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    fetchMock.mockImplementation(async (url: string) =>
      (String(url).includes('govmap.gov.il') ? json(503, {}) : json(200, OSM_HIT)))
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL', { deferOnGovmapTransient: true }))
      .toEqual({ point: null, govmapTransient: true, fallbackTransient: false })
    expect(calledHosts().every(h => h === 'www.govmap.gov.il')).toBe(true)
    // without the option the interactive chain still falls back
    resetGovmapState()
    fetchMock.mockClear()
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toMatchObject({ govmapTransient: true, point: { provider: 'locationiq' } })
  })

  it('Nominatim: caches a 200 only; a 429 / timeout is transient and uncached', async () => {
    delete process.env.GOVMAP_API_KEY
    fetchMock.mockResolvedValueOnce(json(429, {}))
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toEqual({ point: null, govmapTransient: false, fallbackTransient: true })
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL')).toMatchObject({ point: null, fallbackTransient: true })
    expect(mockedRedis.setex).not.toHaveBeenCalled()

    route({ nominatim: [] })   // a definitive "nothing"
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL'))
      .toEqual({ point: null, govmapTransient: false, fallbackTransient: false })
    expect(mockedRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^nominatim:addr:/), 86_400, 'null')
  }, 15_000)

  it('LocationIQ: a 404 ("Unable to geocode") is a definitive miss, a 5xx is transient', async () => {
    delete process.env.GOVMAP_API_KEY
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    fetchMock.mockImplementation(async (url: string) =>
      (String(url).includes('locationiq.com') ? json(404, { error: 'Unable to geocode' }) : json(200, [])))
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL')).toMatchObject({ point: null, fallbackTransient: false })
    fetchMock.mockImplementation(async (url: string) =>
      (String(url).includes('locationiq.com') ? json(502, {}) : json(200, [])))
    expect(await geocodeAddressDetailed('יפו 43', 'ירושלים', 'IL')).toMatchObject({ point: null, fallbackTransient: true })
  }, 15_000)

  it('a rejected key (401) or a blocked client (403) is no answer, not transient: batch jobs settle the row', async () => {
    delete process.env.GOVMAP_API_KEY
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    resetFallbackWarnings()
    const warn = jest.spyOn(logger, 'warn')
    // a bad LocationIQ key: Nominatim's definitive answer settles the row
    fetchMock.mockImplementation(async (url: string) =>
      (String(url).includes('locationiq.com') ? json(401, { error: 'Invalid key' }) : json(200, [])))
    expect(await geocodeAddressDetailed('יפו 44', 'ירושלים', 'IL'))
      .toEqual({ point: null, govmapTransient: false, fallbackTransient: false })
    // Nominatim blocking us (a 403 HTML page): nothing to wait for, and never cached
    delete process.env.LOCATIONIQ_API_KEY
    fetchMock.mockImplementation(async () => new Response('<html>Access blocked</html>', { status: 403 }))
    for (const a of ['יפו 45', 'יפו 46']) {
      expect(await geocodeAddressDetailed(a, 'ירושלים', 'IL'))
        .toEqual({ point: null, govmapTransient: false, fallbackTransient: false })
    }
    expect(mockedRedis.setex.mock.calls.some(c => /יפו 4[56]/.test(String(c[0])))).toBe(false)
    // …logged once per provider and status, so the misconfiguration shows
    const messages = warn.mock.calls.map(c => String(c[0]))
    expect(messages.filter(m => m.includes('LocationIQ geocoder: HTTP 401'))).toHaveLength(1)
    expect(messages.filter(m => m.includes('Nominatim geocoder: HTTP 403'))).toHaveLength(1)
    // a server error is still transient
    fetchMock.mockImplementation(async () => json(503, {}))
    expect(await geocodeAddressDetailed('יפו 47', 'ירושלים', 'IL')).toMatchObject({ point: null, fallbackTransient: true })
    warn.mockRestore()
  }, 20_000)

  it('LocationIQ rows have OSM class/type but no addresstype: a highway is a street, never an exact pin', async () => {
    delete process.env.GOVMAP_API_KEY
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    const row = (extra: Record<string, string>) => [{ lat: '31.7820', lon: '35.2198', display_name: 'יפו, ירושלים', address: { city: 'ירושלים' }, ...extra }]
    route({ locationiq: row({ class: 'highway', type: 'primary' }) })
    const street = await geocodeAddress('יפו', 'ירושלים', 'IL')
    expect(street).toMatchObject({ provider: 'locationiq', addresstype: 'road' })
    expect(isAddressLevel(street!)).toBe(false)
    route({ locationiq: row({ class: 'building', type: 'yes' }) })
    const building = await geocodeAddress('יפו 42', 'ירושלים', 'IL')
    expect(isAddressLevel(building!)).toBe(true)
    // Nominatim jsonv2 calls the class "category"; its own addresstype wins when present
    delete process.env.LOCATIONIQ_API_KEY
    route({ nominatim: row({ category: 'highway', type: 'tertiary' }) })
    expect(await geocodeAddress('יפו', 'ירושלים', 'IL')).toMatchObject({ provider: 'nominatim', addresstype: 'road' })
    route({ nominatim: row({ category: 'highway', type: 'tertiary', addresstype: 'road' }) })
    expect(await geocodeAddress('יפו', 'ירושלים', 'IL')).toMatchObject({ addresstype: 'road' })
  }, 20_000)

  it('isAddressLevel is a positive list: Nominatim stops, zones and unknown types are never exact pins', () => {
    for (const t of ['house', 'building', 'place', 'house_number', 'amenity', 'shop', 'tourism', 'office', 'leisure']) {
      expect(isAddressLevel({ addresstype: t })).toBe(true)
    }
    // "ת.רק״ל … הרב ניסנבאום" came back as 'highway' for "הרב ניסנבאום 29, בת ים" (live, 2026-09)
    for (const t of ['highway', 'industrial', 'commercial', 'retail', 'landuse', 'plot', 'square', 'farmyard',
      'road', 'suburb', 'area', 'city', 'state_district', '']) {
      expect(isAddressLevel({ addresstype: t })).toBe(false)
    }
  })

  it('an aliased city (רמות → ירושלים) does not accept a row whose village is literally רמות', async () => {
    delete process.env.GOVMAP_API_KEY
    delete process.env.LOCATIONIQ_API_KEY
    route({ nominatim: [{ lat: '32.85', lon: '35.66', display_name: 'רמות', addresstype: 'house', address: { village: 'רמות' } }] })
    expect(await geocodeAddress('הדקל 5', 'רמות', 'IL')).toBeNull()
    route({ nominatim: [{ lat: '31.82', lon: '35.20', display_name: 'רמות, ירושלים', addresstype: 'house', address: { suburb: 'רמות', city: 'ירושלים' } }] })
    expect(await geocodeAddress('הדקל 6', 'רמות', 'IL')).toMatchObject({ provider: 'nominatim' })
  }, 20_000)

  it('LocationIQ rows without addresstype: only a building/named place (or place=house) is an exact pin, an area never', async () => {
    delete process.env.GOVMAP_API_KEY
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    const row = (extra: Record<string, string>) => [{ lat: '31.7820', lon: '35.2198', display_name: 'x, ירושלים', address: { city: 'ירושלים' }, ...extra }]
    const cases: Array<[Record<string, string>, string, boolean]> = [
      [{ class: 'landuse', type: 'commercial' }, 'area', false],   // a zone / mall-area centroid
      [{ class: 'landuse', type: 'industrial' }, 'area', false],
      [{ class: 'landuse', type: 'retail' }, 'area', false],
      [{ class: 'landuse', type: 'residential' }, 'residential', false],
      [{ class: 'place', type: 'plot' }, 'area', false],
      [{ class: 'place', type: 'suburb' }, 'suburb', false],
      [{}, 'area', false],                                        // no class/type at all
      [{ class: 'place', type: 'house' }, 'house', true],
      [{ class: 'amenity', type: 'restaurant' }, 'amenity', true],
      [{ class: 'shop', type: 'mall' }, 'shop', true],
      [{ class: 'building', type: 'residential' }, 'building', true],
    ]
    let n = 0
    for (const [extra, addresstype, exact] of cases) {
      route({ locationiq: row(extra) })
      const p = await geocodeAddress(`יפו ${++n}`, 'ירושלים', 'IL')
      expect({ extra, p: p && { provider: p.provider, addresstype: p.addresstype, exact: isAddressLevel(p) } })
        .toEqual({ extra, p: { provider: 'locationiq', addresstype, exact } })
    }
    // a city-level row is still no answer at all
    route({ locationiq: row({ class: 'boundary', type: 'administrative' }) })
    expect(await geocodeAddress('יפו 99', 'ירושלים', 'IL')).toBeNull()
  }, 30_000)

  it('govmapOnly (re-checking an exact row): a GovMap miss asks no fallback', async () => {
    process.env.LOCATIONIQ_API_KEY = 'liq-test'
    route({ locationiq: OSM_HIT, nominatim: OSM_HIT })
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL', { deferOnGovmapTransient: true, govmapOnly: true }))
      .toEqual({ point: null, govmapTransient: false, fallbackTransient: false })
    expect(calledHosts().every(h => h === 'www.govmap.gov.il')).toBe(true)
    route({ govmap: [GOVMAP_HIT] })
    expect(await geocodeAddressDetailed('יפו 42', 'ירושלים', 'IL', { govmapOnly: true }))
      .toMatchObject({ point: { provider: 'govmap', addresstype: 'house' } })
    // a worldwide row has no GovMap answer to give
    fetchMock.mockClear()
    expect((await geocodeAddressDetailed('Rue des Rosiers 7', 'Paris', undefined, { govmapOnly: true })).point).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('worldwide searches keep the old single-row behaviour (no city check)', async () => {
    route({ nominatim: [{ lat: '48.857', lon: '2.361', addresstype: 'house', display_name: '7, Rue des Rosiers, Paris' }] })
    expect(await geocodeAddress('Rue des Rosiers 7', 'Paris')).toMatchObject({ provider: 'nominatim' })
    const url = new URL(String(fetchMock.mock.calls.at(-1)![0]))
    expect(url.searchParams.get('addressdetails')).toBe('0')
    expect(url.searchParams.get('limit')).toBe('1')
  })
})

describe('deferredGeocodeStamp (re-geocode job)', () => {
  const DAY = 86_400_000
  const now = new Date('2026-09-27T03:30:00Z')
  const later = (ms: number) => new Date(now.getTime() + ms)
  // the job's selection: never attempted, or attempted before now − retryDays
  const due = (stamp: Date, at: Date, retryDays: number) => stamp.getTime() < at.getTime() - retryDays * DAY

  it('nightly (30 d): due again from the next night, not in a same-night re-run, queued after rows already due', () => {
    const s = deferredGeocodeStamp(now, 30)
    expect(due(s, later(60_000), 30)).toBe(false)
    expect(due(s, later(DAY), 30)).toBe(true)
    expect(s.getTime()).toBeGreaterThan(now.getTime() - 30 * DAY)   // newer than every row due now → sorts after them
  })

  it('a full pass (0) or a short-window run hands deferred rows to the next nightly run and to a 1-day re-run', () => {
    for (const retryDays of [0, 1, 7]) {
      const s = deferredGeocodeStamp(now, retryDays)
      expect(due(s, later(DAY), 30)).toBe(true)
      expect(due(s, later(60_000), 1)).toBe(true)
    }
  })

  it('a short-window run: still after the never-attempted rows (unstamped), but not after every row due', () => {
    // the job sorts geocodeAttemptedAt ascending, nulls first
    const s = deferredGeocodeStamp(now, 7)
    expect(s.getTime()).toBeLessThan(now.getTime() - 7 * DAY)   // sorts before rows attempted 7–29.5 d ago
  })

  it('follows a longer retry window', () => {
    const s = deferredGeocodeStamp(now, 60)
    expect(due(s, later(60_000), 60)).toBe(false)
    expect(due(s, later(DAY), 60)).toBe(true)
  })
})

describe('isAddressLevel', () => {
  it('is true for houses, buildings and named places, false for streets and areas', () => {
    for (const t of ['house', 'building', 'place', 'amenity', 'shop']) expect(isAddressLevel({ addresstype: t })).toBe(true)
    for (const t of ['road', 'suburb', 'neighbourhood', 'city', 'village', 'area', '']) expect(isAddressLevel({ addresstype: t })).toBe(false)
  })
})

describe('searchNominatimPlaces', () => {
  const fetchMock = jest.fn()
  beforeAll(() => { global.fetch = fetchMock as unknown as typeof fetch })
  beforeEach(() => {
    fetchMock.mockReset()
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')
  })

  it('maps display_name into label + context and caches the answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      { osm_type: 'relation', osm_id: 71525, name: 'Париж', display_name: 'Париж, Иль-де-Франс, Франция', lat: '48.85', lon: '2.34' },
      { osm_type: 'node', osm_id: 1, display_name: 'bad', lat: 'x', lon: 'y' },
    ]), { status: 200 }))

    const places = await searchNominatimPlaces(' Paris ', 'ru', 5)

    expect(places).toEqual([
      { id: 'osm:relation:71525', label: 'Париж', detail: 'Иль-де-Франс, Франция', lat: 48.85, lng: 2.34 },
    ])
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('q')).toBe('Paris')
    expect(url.searchParams.get('accept-language')).toBe('ru,en')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(mockedRedis.setex).toHaveBeenCalledWith('nominatim:places:ru:5:paris', 86_400, JSON.stringify(places))
  })

  it('returns null (uncached) on a transient failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 }))
    expect(await searchNominatimPlaces('Paris', 'en', 5)).toBeNull()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })
})

// Fresh module (own slot state) on a fake clock, so the 1.1 s / 2 s spacing is
// asserted without real waiting and without skewing the suites above.
describe('Nominatim rate limiting', () => {
  const fetchMock = jest.fn()
  let nom: typeof import('../lib/nominatim')
  const place = [{ osm_type: 'node', osm_id: 1, name: 'X', display_name: 'X, Y', lat: '1', lon: '2' }]

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
    global.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockReset()
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nom = require('../lib/nominatim')
    })
  })
  afterEach(() => { jest.useRealTimers() })

  it('spaces concurrent callers ≥1.1 s apart instead of letting them fire together', async () => {
    const at: number[] = []
    fetchMock.mockImplementation(async () => { at.push(Date.now()); return new Response('[]', { status: 200 }) })
    const all = Promise.all(['a', 'b', 'c', 'd'].map(q => nom.geocodeSettlement(`spacing-${q}`)))
    await jest.advanceTimersByTimeAsync(10_000)
    await all
    expect(at).toHaveLength(4)
    const gaps = at.slice(1).map((t, i) => t - at[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1_100)
  })

  it('place search: ≤1 Nominatim call per 2 s app-wide, a burst gives up instead of queueing', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(place), { status: 200 }))
    const burst = Promise.all(['p1', 'p2', 'p3', 'p4'].map(q => nom.searchNominatimPlaces(q, 'en', 5)))
    await jest.advanceTimersByTimeAsync(10_000)
    const answers = await burst
    expect(answers.map(a => (a === null ? null : a.length))).toEqual([1, 1, null, null])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('place search gives up when geocoding has the Nominatim queue busy', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }))
    const queued = Promise.all(['a', 'b', 'c', 'd'].map(q => nom.geocodeSettlement(`busy-${q}`)))
    const t0 = Date.now()
    expect(await nom.searchNominatimPlaces('Paris', 'en', 5)).toBeNull()
    expect(Date.now() - t0).toBe(0)
    await jest.advanceTimersByTimeAsync(10_000)
    await queued
  })
})
