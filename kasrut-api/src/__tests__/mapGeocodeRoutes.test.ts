import request from 'supertest'
import { createApp } from '../app'
import { geocodeAddress, searchNominatimPlaces } from '../lib/nominatim'
import { govmapConfigured, searchGovmapPlaces } from '../lib/govmap'

jest.mock('../lib/prisma')
jest.mock('../db/map.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))
jest.mock('../lib/nominatim', () => ({
  ...jest.requireActual('../lib/nominatim'),
  geocodeAddress:        jest.fn(),
  searchNominatimPlaces: jest.fn(),
}))
jest.mock('../lib/govmap', () => ({
  ...jest.requireActual('../lib/govmap'),
  govmapConfigured:   jest.fn(),
  searchGovmapPlaces: jest.fn(),
}))

const mockGeocode   = geocodeAddress as jest.MockedFunction<typeof geocodeAddress>
const mockNominatim = searchNominatimPlaces as jest.MockedFunction<typeof searchNominatimPlaces>
const mockGovmap    = searchGovmapPlaces as jest.MockedFunction<typeof searchGovmapPlaces>
const mockConfigured = govmapConfigured as jest.MockedFunction<typeof govmapConfigured>

const app = createApp()

const MALHA = { id: 'poi|POI_MID_POINT|95026', label: 'קניון מלחה ירושלים', detail: 'מקום', lat: 31.7518, lng: 35.1872 }
const PARIS = { id: 'osm:relation:71525', label: 'Paris', detail: 'Île-de-France, France', lat: 48.85, lng: 2.34 }

describe('GET /api/map/places', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfigured.mockReturnValue(true)
  })

  it.each([
    ['missing', ''],
    ['too short', '?q=%20a%20'],
    ['too long', `?q=${'א'.repeat(201)}`],
  ])('400 when q is %s', async (_name, qs) => {
    const res = await request(app).get(`/api/map/places${qs}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
    expect(mockGovmap).not.toHaveBeenCalled()
  })

  it('answers from GovMap when it has results', async () => {
    mockGovmap.mockResolvedValueOnce([MALHA])
    const res = await request(app).get('/api/map/places').query({ q: 'קניון מלחה' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: [MALHA] })
    expect(mockGovmap).toHaveBeenCalledWith('קניון מלחה', 'he')
    expect(mockNominatim).not.toHaveBeenCalled()
  })

  it('falls back to Nominatim when GovMap has nothing or fails', async () => {
    mockGovmap.mockResolvedValueOnce([])
    mockNominatim.mockResolvedValueOnce([PARIS])
    let res = await request(app).get('/api/map/places').query({ q: 'Paris', lang: 'ru' })
    expect(res.body).toEqual({ results: [PARIS] })
    expect(mockGovmap).toHaveBeenCalledWith('Paris', 'ru')
    expect(mockNominatim).toHaveBeenCalledWith('Paris', 'ru', 5)

    mockGovmap.mockResolvedValueOnce(null)
    mockNominatim.mockResolvedValueOnce([PARIS])
    res = await request(app).get('/api/map/places').query({ q: 'Paris' })
    expect(res.body).toEqual({ results: [PARIS] })
  })

  it('skips GovMap entirely when it is not configured', async () => {
    mockConfigured.mockReturnValue(false)
    mockNominatim.mockResolvedValueOnce([PARIS])
    const res = await request(app).get('/api/map/places').query({ q: 'Paris', lang: 'xx' })
    expect(res.body).toEqual({ results: [PARIS] })
    expect(mockGovmap).not.toHaveBeenCalled()
    expect(mockNominatim).toHaveBeenCalledWith('Paris', 'en', 5)
  })

  it('also asks Nominatim for Latin text when GovMap only has look-alike streets, listing it first', async () => {
    const PORT = { id: 'address|ADDR|263920', label: 'Nemal Tel Aviv 1 Tel Aviv-Yafo', detail: 'Address', lat: 32.09, lng: 34.77 }
    const CITY = { id: 'osm:relation:1382494', label: 'Tel Aviv-Yafo', detail: 'Tel Aviv District, Israel', lat: 32.08, lng: 34.78 }
    mockGovmap.mockResolvedValueOnce([PORT])
    mockNominatim.mockResolvedValueOnce([CITY, { ...PORT }])
    const res = await request(app).get('/api/map/places').query({ q: 'Tel Aviv', lang: 'en' })
    expect(res.body).toEqual({ results: [CITY, PORT] })   // deduped by id
    expect(mockNominatim).toHaveBeenCalledWith('Tel Aviv', 'en', 5)
  })

  it('skips Nominatim for Latin text when GovMap found the settlement itself', async () => {
    const TOWN = { id: 'settlement|SETL_MID_POINT|2600', label: 'Eilat', detail: 'Locality', lat: 29.55, lng: 34.95 }
    mockGovmap.mockResolvedValueOnce([TOWN])
    const res = await request(app).get('/api/map/places').query({ q: 'eil', lang: 'en' })
    expect(res.body).toEqual({ results: [TOWN] })
    expect(mockNominatim).not.toHaveBeenCalled()
  })

  it('returns an empty list (not an error) when every provider fails', async () => {
    mockGovmap.mockResolvedValueOnce(null)
    mockNominatim.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/map/places').query({ q: 'יפו' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: [] })
    expect(res.headers['cache-control']).toBeUndefined()
  })
})

describe('GET /api/map/places rate limit', () => {
  it('allows 60 requests per minute per IP, then 429 with Retry-After', async () => {
    mockConfigured.mockReturnValue(true)
    mockGovmap.mockResolvedValue([MALHA])
    const ip = '203.0.113.61'
    for (let i = 0; i < 60; i++) {
      const ok = await request(app).get('/api/map/places').set('X-Forwarded-For', ip).query({ q: 'קניון מלחה' })
      expect(ok.status).toBe(200)
    }
    const res = await request(app).get('/api/map/places').set('X-Forwarded-For', ip).query({ q: 'קניון מלחה' })
    expect(res.status).toBe(429)
    expect(res.headers['ratelimit-limit']).toBe('60')
    expect(res.headers['retry-after']).toBeDefined()
    mockGovmap.mockReset()
  })
})

describe('GET /api/map/geocode country inference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGeocode.mockResolvedValue({ lat: 31.78, lng: 35.22, addresstype: 'house', displayName: 'x', provider: 'govmap' })
  })

  it('infers il for Hebrew input', async () => {
    const res = await request(app).get('/api/map/geocode').query({ address: 'יפו 42', city: 'ירושלים' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ lat: 31.78, lng: 35.22 })
    expect(mockGeocode).toHaveBeenCalledWith('יפו 42', 'ירושלים', 'il')
  })

  it('infers il for a well-known Israeli city in Latin script', async () => {
    await request(app).get('/api/map/geocode').query({ address: 'Yafo 42', city: 'Jerusalem' })
    expect(mockGeocode).toHaveBeenCalledWith('Yafo 42', 'Jerusalem', 'il')
  })

  it('keeps worldwide search for foreign addresses, and an explicit country wins', async () => {
    await request(app).get('/api/map/geocode').query({ address: 'Rue des Rosiers 7', city: 'Paris' })
    expect(mockGeocode).toHaveBeenLastCalledWith('Rue des Rosiers 7', 'Paris', undefined)
    await request(app).get('/api/map/geocode').query({ address: 'יפו 42', city: 'ירושלים', country: 'FR' })
    expect(mockGeocode).toHaveBeenLastCalledWith('יפו 42', 'ירושלים', 'fr')
  })

  it('400 for oversize address or city, without geocoding', async () => {
    let res = await request(app).get('/api/map/geocode').query({ address: 'a '.repeat(151), city: 'Paris' })
    expect(res.status).toBe(400)
    res = await request(app).get('/api/map/geocode').query({ address: 'Yafo 42', city: 'a'.repeat(101) })
    expect(res.status).toBe(400)
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('retries worldwide when only the street looked Israeli (Jerusalem Ave, Hicksville NY)', async () => {
    mockGeocode.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/map/geocode').query({ address: 'Jerusalem Ave 100', city: 'Hicksville, NY' })
    expect(res.status).toBe(200)
    expect(mockGeocode.mock.calls).toEqual([
      ['Jerusalem Ave 100', 'Hicksville, NY', 'il'],
      ['Jerusalem Ave 100', 'Hicksville, NY'],
    ])
  })

  it('does not retry worldwide for an Israeli city or an explicit country', async () => {
    mockGeocode.mockResolvedValue(null)
    await request(app).get('/api/map/geocode').query({ address: 'יפו 42', city: 'ירושלים' })
    await request(app).get('/api/map/geocode').query({ address: 'Yafo 42', city: 'Jerusalem' })
    await request(app).get('/api/map/geocode').query({ address: 'Jerusalem Ave 100', city: 'Hicksville', country: 'il' })
    expect(mockGeocode).toHaveBeenCalledTimes(3)
  })

  it('204 when nothing resolves', async () => {
    mockGeocode.mockResolvedValueOnce(null)
    const res = await request(app).get('/api/map/geocode').query({ address: 'nowhere 1', city: 'Nowhere' })
    expect(res.status).toBe(204)
  })
})
