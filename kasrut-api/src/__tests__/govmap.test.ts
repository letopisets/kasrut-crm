import {
  parseCentroid, itmToWgs84, centroidToLatLng, parseGovmapAddress, validateGovmapCandidate,
  searchGovmap, geocodeGovmapAddressDetailed, searchGovmapPlaces, resetGovmapState,
  govmapConfigured, placeIsCity, cityNamedIn, hebrewCityForAddress, govmapAuthRejected,
  type GovmapResult, type GovmapAddressInput,
} from '../lib/govmap'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

jest.mock('../lib/redis', () => ({
  redis: {
    get:   jest.fn(),
    setex: jest.fn(),
  },
}))

const mockedRedis = redis as unknown as { get: jest.Mock; setex: jest.Mock }
const fetchMock = jest.fn()
const TEST_KEY = 'test-govmap-key-not-real'
const SEARCH_URL = 'https://www.govmap.gov.il/api/search-service/api-search'

// Real responses captured from the live service (2026-09).
const YAFO_42: GovmapResult = {
  id: 'address|ADDR|53871547', text: 'יפו 42 ירושלים', type: 'address', score: 2906.49,
  centroid: 'POINT (220915.5 632151.46)',
}

function plan(address: string, city: string): GovmapAddressInput {
  const p = parseGovmapAddress(address, city)
  if (!p) throw new Error(`no plan for ${address} | ${city}`)
  return p
}

/** GovMap's point for an address when every call answers `results`. */
async function pick(address: string, city: string, results: GovmapResult[]) {
  resetGovmapState()
  fetchMock.mockImplementation(async () => jsonResponse(200, { results }))
  return (await geocodeGovmapAddressDetailed(address, city)).point
}

const geocodePoint = async (address: string, city: string) =>
  (await geocodeGovmapAddressDetailed(address, city)).point

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

beforeAll(() => { global.fetch = fetchMock as unknown as typeof fetch })

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset()
  resetGovmapState()
  process.env.GOVMAP_API_KEY = TEST_KEY
  delete process.env.GOVMAP_ORIGIN
  mockedRedis.get.mockResolvedValue(null)
  mockedRedis.setex.mockResolvedValue('OK')
})

afterAll(() => { delete process.env.GOVMAP_API_KEY })

describe('centroid parsing + ITM → WGS84', () => {
  it('accepts "POINT (x y)" and "POINT(x y)"', () => {
    expect(parseCentroid('POINT (220915.5 632151.46)')).toEqual({ x: 220915.5, y: 632151.46 })
    expect(parseCentroid('POINT(220915.5 632151.46)')).toEqual({ x: 220915.5, y: 632151.46 })
  })

  it('rejects anything else', () => {
    expect(parseCentroid('POLYGON ((1 2, 3 4))')).toBeNull()
    expect(parseCentroid('POINT (abc 1)')).toBeNull()
    expect(parseCentroid(undefined)).toBeNull()
    expect(centroidToLatLng('')).toBeNull()
  })

  it('projects יפו 42 ירושלים within 20 m of its known position', () => {
    const p = itmToWgs84(220915.5, 632151.46)
    expect(p).not.toBeNull()
    expect(metersBetween(p!, { lat: 31.782057, lng: 35.219840 })).toBeLessThan(20)
  })
})

describe('parseGovmapAddress', () => {
  it('strips designators and keeps the plain query first', () => {
    expect(plan("רח' שמעון בן שטח 8 אלעד", 'אלעד').queries).toEqual(['שמעון בן שטח 8 אלעד'])
    expect(plan('רחוב יפו 42', 'ירושלים').queries).toEqual(['יפו 42 ירושלים'])
    expect(plan('רחובות הבוכרים 2', 'ירושלים').queries).toEqual(['רחובות הבוכרים 2 ירושלים'])
  })

  it('moves a leading house number after the street and drops a leading דרך as a 2nd variant', () => {
    expect(plan('2 דרך ירושלים', 'רחובות').queries).toEqual(['דרך ירושלים 2 רחובות', 'ירושלים 2 רחובות'])
  })

  it('maps a Jerusalem neighbourhood used as city and drops a trailing quoted שד\'', () => {
    const p = plan("164 משה דיין 'שד'", 'פסגת זאב')
    expect(p.queries).toEqual(['משה דיין 164 ירושלים'])
    expect(p.cityWords).toEqual(['ירושלים'])
  })

  it('cuts mall noise after the number and a repeated city', () => {
    expect(plan('דרך יצחק רבין 2 קניון נעימי בית שמש', 'בית שמש').queries)
      .toEqual(['דרך יצחק רבין 2 בית שמש', 'יצחק רבין 2 בית שמש'])
    expect(plan("רח' מרכז טאגור 31 תל אביב", 'תל אביב').queries)
      .toEqual(['מרכז טאגור 31 תל אביב', 'טאגור 31 תל אביב'])
  })

  it('prefers the comma segment carrying the house number', () => {
    expect(plan('קניון עזריאלי, בגין 132', 'תל אביב').queries).toEqual(['בגין 132 תל אביב'])
  })

  it('does not strip a street that is named after the city', () => {
    expect(plan('2 דרך ירושלים', 'ירושלים').queries[0]).toBe('דרך ירושלים 2 ירושלים')
  })

  it('adds a no-letter variant for a lettered house number', () => {
    expect(plan('יוהנסבורג 1א', 'אשקלון').queries).toEqual(['יוהנסבורג 1א אשקלון', 'יוהנסבורג 1 אשקלון'])
  })

  it('returns null with no street or no city', () => {
    expect(parseGovmapAddress('42', 'ירושלים')).toBeNull()
    expect(parseGovmapAddress('יפו 42', '')).toBeNull()
  })

  it('keeps a numbered alley in the street and takes the next number as the house', () => {
    const p = plan('דרך בית לחם הישנה סמטה 9 3', 'ירושלים')
    expect(p.house).toEqual({ num: '3', letter: undefined })
    expect(p.streetSig).toEqual(['בית', 'לחם', 'הישנה', 'סמטה9'])
  })

  it('does not trip over Object.prototype names in user text', () => {
    expect(() => parseGovmapAddress('constructor 5', 'toString')).not.toThrow()
    expect(() => parseGovmapAddress('hasOwnProperty 5', 'constructor')).not.toThrow()
  })

  it('treats generic words the same with or without ה (המרכז המסחרי is generic only)', () => {
    expect(parseGovmapAddress('המרכז המסחרי', 'אפרת')).toBeNull()
  })

  it('ignores oversize input without building anything from it', () => {
    expect(parseGovmapAddress('א '.repeat(2700), 'ירושלים')).toBeNull()
    expect(parseGovmapAddress('יפו 42', 'a '.repeat(1300))).toBeNull()
    // the trailing-city strip is word-based: a long-but-valid pair stays fast
    const t0 = Date.now()
    expect(parseGovmapAddress(`${'אב '.repeat(95)}5`, 'תל אביב '.repeat(12).trim())).not.toBeNull()
    expect(Date.now() - t0).toBeLessThan(200)
  })
})

describe('validateGovmapCandidate', () => {
  it('accepts an exact bare-id address', () => {
    const v = validateGovmapCandidate(plan('יפו 42', 'ירושלים'), YAFO_42)
    expect(v?.point).toMatchObject({ addresstype: 'house', provider: 'govmap', displayName: 'יפו 42 ירושלים' })
  })

  it('rejects a wrong house even when GovMap calls it accurate (רוטשילד 200 → 100)', () => {
    const r: GovmapResult = {
      id: 'address|ADDR|53793434|רוטשילד|100|תל-אביב', text: 'רוטשילד 100 תל-אביב', type: 'address',
      centroid: 'POINT (178994.2 663780.5)',
    }
    expect(validateGovmapCandidate(plan('רוטשילד 200', 'תל אביב'), r)).toBeNull()
  })

  it('never lets 6 match 16 or 60', () => {
    const input = plan('מצדה 6', 'באר שבע')
    for (const n of ['16', '60', '61']) {
      expect(validateGovmapCandidate(input, {
        id: 'address|ADDR|1', text: `מצדה ${n} באר שבע`, type: 'address', centroid: 'POINT (180521.08 574201.55)',
      })).toBeNull()
    }
  })

  it('rejects a street named after the input city (רחובות הבוכרים 2 ירושלים ≠ רחובות)', async () => {
    const input = plan('2 דרך ירושלים', 'רחובות')
    const wrong: GovmapResult = {
      id: 'address|ADDR|53840278', text: 'רחובות הבוכרים 2 ירושלים', type: 'address',
      centroid: 'POINT (221043.13 633124.43)',
    }
    const right: GovmapResult = {
      id: 'address|ADDR|53635173', text: 'ירושלים 2 רחובות', type: 'address',
      centroid: 'POINT (183119.58 643910.97)',
    }
    expect(validateGovmapCandidate(input, wrong)).toBeNull()
    expect(validateGovmapCandidate(input, right)).not.toBeNull()
    expect((await pick('2 דרך ירושלים', 'רחובות', [wrong, right]))?.displayName).toBe('ירושלים 2 רחובות')
  })

  it('accepts the Beersheva municipal address layer (entity) for דרך מצדה 6', () => {
    const entity: GovmapResult = {
      id: 'layer|215337|entity|154942', text: 'מערך כתובות באר שבע דרך מצדה 6', originalText: 'דרך מצדה,  6',
      type: '215337|מערך כתובות באר שבע|entity', centroid: 'POINT (180522.36 574201.26)',
    }
    const v = validateGovmapCandidate(plan('דרך מצדה 6', 'באר שבע'), entity)
    expect(v?.point.addresstype).toBe('house')
    expect(metersBetween(v!.point, { lat: 31.258763, lng: 34.795661 })).toBeLessThan(20)
    // …but not for another city, nor from a non-address layer
    expect(validateGovmapCandidate(plan('דרך מצדה 6', 'אשדוד'), entity)).toBeNull()
    expect(validateGovmapCandidate(plan('דרך מצדה 6', 'באר שבע'),
      { ...entity, type: '999|מסעדות באר שבע|entity' })).toBeNull()
  })

  it('rejects a different street sharing one word', () => {
    // live: "ברזיל 21 ירושלים" (fuzzy) → "חרשי ברזל 21 ירושלים"
    expect(validateGovmapCandidate(plan('ברזיל 21', 'ירושלים'), {
      id: 'address|ADDR|1', text: 'חרשי ברזל 21 ירושלים', type: 'address', centroid: 'POINT (220915.5 632151.46)',
    })).toBeNull()
    // live: "יצחק רבין 2 בית שמש" → also "רבי שלמה בן יצחק 2 בית-שמש"
    expect(validateGovmapCandidate(plan('יצחק רבין 2', 'בית שמש'), {
      id: 'address|ADDR|72599483|רבי שלמה בן יצחק|2|בית-שמש', text: 'רבי שלמה בן יצחק 2 בית-שמש',
      originalText: 'רש"י 2 בית שמש', type: 'address', centroid: 'POINT (199064.28 627659.5)',
    })).toBeNull()
  })

  it('picks הרצל over ד"ר רוזנבלום הרצל regardless of GovMap order', async () => {
    const rosenblum: GovmapResult = {
      id: 'address|ADDR|53912853|ד"ר רוזנבלום הרצל|10|תל אביב', text: 'ד"ר רוזנבלום הרצל 10 תל אביב',
      originalText: 'הרצל רוזנבלום 10 תל אביב-יפו', type: 'address', centroid: 'POINT (180474.57 671763.43)',
    }
    const herzl: GovmapResult = {
      id: 'address|ADDR|53792111|הרצל|10|תל אביב', text: 'הרצל 10 תל אביב',
      originalText: 'הרצל 10 תל אביב-יפו', type: 'address', centroid: 'POINT (178428.33 663330.93)',
    }
    const input = plan('הרצל 10', 'תל אביב')
    expect(validateGovmapCandidate(input, rosenblum)).toBeNull()
    expect((await pick('הרצל 10', 'תל אביב', [rosenblum, herzl]))?.displayName).toBe('הרצל 10 תל אביב-יפו')
  })

  it('rejects the right house number in the wrong city', () => {
    // live: "חיפה 52 קריית אתא" → Haifa addresses
    expect(validateGovmapCandidate(plan('דרך חיפה 52', 'קריית אתא'), {
      id: 'address|ADDR|53663305|אבא חושי|52|חיפה\\קריית חיים', text: 'אבא חושי 52 חיפה\\קריית חיים',
      type: 'address', centroid: 'POINT (200257.96 742458.23)',
    })).toBeNull()
  })

  it('folds ו/י spelling variants in streets and cities', () => {
    expect(validateGovmapCandidate(plan('הנשיא וויצמן 17', 'עפולה'), {
      id: 'address|ADDR|53560084|הנשיא וייצמן|17|עפולה', text: 'הנשיא וייצמן 17 עפולה',
      originalText: 'הנשיא ויצמן 17 עפולה', type: 'address', centroid: 'POINT (227351.98 724011.26)',
    })).not.toBeNull()
    expect(validateGovmapCandidate(plan("ז'בוטינסקי 7", 'פתח תקוה'), {
      id: 'address|ADDR|1', text: "ז'בוטינסקי 7 פתח תקווה", type: 'address', centroid: 'POINT (188590 665400)',
    })).not.toBeNull()
  })

  it('matches house letters strictly only when both sides have one', () => {
    const r: GovmapResult = {
      id: 'address|ADDR|74213174', text: 'יוהנסבורג 1א אשקלון', type: 'address', centroid: 'POINT (159136.22 620712.7)',
    }
    expect(validateGovmapCandidate(plan('יוהנסבורג 1א', 'אשקלון'), r)).not.toBeNull()
    expect(validateGovmapCandidate(plan('יוהנסבורג 1', 'אשקלון'), r)).not.toBeNull()
    expect(validateGovmapCandidate(plan('יוהנסבורג 1ב', 'אשקלון'), r)).toBeNull()
  })

  it('rejects area-level types, and a street when a house number was given', () => {
    const input = plan('יפו 42', 'ירושלים')
    for (const type of ['settlement', 'neighborhood', 'statistic', 'block', 'parcel', 'junction', 'ways', 'street']) {
      expect(validateGovmapCandidate(input, { ...YAFO_42, type })).toBeNull()
    }
  })

  it('rejects points outside Israel or out at sea', () => {
    const input = plan('יפו 42', 'ירושלים')
    expect(validateGovmapCandidate(input, { ...YAFO_42, centroid: 'POINT (0 0)' })).toBeNull()
    expect(validateGovmapCandidate(input, { ...YAFO_42, centroid: 'POINT (170000 665000)' })).toBeNull()   // off Tel Aviv
    expect(validateGovmapCandidate(input, { ...YAFO_42, centroid: undefined })).toBeNull()
  })

  it('rejects the same street + house in another city (id city and text city)', () => {
    const input = plan('הרצל 10', 'רחובות')
    expect(validateGovmapCandidate(input, {
      id: 'address|ADDR|53792111|הרצל|10|תל אביב', text: 'הרצל 10 תל אביב', type: 'address',
      centroid: 'POINT (178428.33 663330.93)',
    })).toBeNull()
    expect(validateGovmapCandidate(input, {
      id: 'address|ADDR|1', text: 'הרצל 10 תל אביב', type: 'address', centroid: 'POINT (178428.33 663330.93)',
    })).toBeNull()
  })

  it('matches the city only on the primary part of GovMap "city/suffix"', () => {
    // live: GovMap tags Carmel/Hadar addresses "חיפה/קריית חיים"
    const carmel: GovmapResult = {
      id: 'address|ADDR|53663305|אבא חושי|52|חיפה/קריית חיים', text: 'אבא חושי 52 חיפה/קריית חיים',
      originalText: 'אבא חושי 52 חיפה', type: 'address', centroid: 'POINT (200257.96 742458.23)',
    }
    expect(validateGovmapCandidate(plan('אבא חושי 52', 'קריית חיים'), carmel)).toBeNull()
    expect(validateGovmapCandidate(plan('אבא חושי 52', 'חיפה'), carmel)).not.toBeNull()
  })

  it('accepts central Haifa (not "in the sea")', () => {
    // live: "ביכורים 2 חיפה" → 32.801929, 34.984855
    expect(validateGovmapCandidate(plan("רח' הביכורים 2", 'חיפה'), {
      id: 'address|ADDR|1', text: 'ביכורים 2 חיפה', type: 'address', centroid: 'POINT (198890.08 745268.46)',
    })).not.toBeNull()
  })

  it('accepts a two-letter street name when it matches word for word (הרב שך)', () => {
    expect(validateGovmapCandidate(plan('הרב שך 5', 'בני ברק'), {
      id: 'address|ADDR|53898553|הרב שך|5|בני-ברק', text: 'הרב שך 5 בני-ברק', originalText: 'הרב שך 5 בני ברק',
      type: 'address', centroid: 'POINT (184900 665700)',
    })).not.toBeNull()
  })

  it('rejects a street that differs by a modifier (בית לחם ≠ בית לחם הישנה)', () => {
    const oldRoad: GovmapResult = {
      id: 'address|ADDR|71193785', text: 'בית לחם הישנה 3 ירושלים', type: 'address', centroid: 'POINT (223100 631000)',
    }
    expect(validateGovmapCandidate(plan('בית לחם 3', 'ירושלים'), oldRoad)).toBeNull()
    expect(validateGovmapCandidate(plan('דרך בית לחם הישנה 3', 'ירושלים'), oldRoad)).not.toBeNull()
  })

  it('never lets an alley off the road stand for the road itself', () => {
    const alley: GovmapResult = {
      id: 'address|ADDR|71196607', text: 'דרך בית לחם הישנה סמטה 9 3 ירושלים', type: 'address',
      centroid: 'POINT (223700 630300)',
    }
    expect(validateGovmapCandidate(plan('דרך בית לחם 3', 'ירושלים'), alley)).toBeNull()
    expect(validateGovmapCandidate(plan('דרך בית לחם הישנה 3', 'ירושלים'), alley)).toBeNull()
    expect(validateGovmapCandidate(plan('דרך בית לחם הישנה סמטה 9 3', 'ירושלים'), alley)).not.toBeNull()
    expect(validateGovmapCandidate(plan('דרך בית לחם הישנה סמטה 10 3', 'ירושלים'), alley)).toBeNull()
  })

  it('drops a partial street match once the exact input street shows up (קרן היסוד ≠ היסוד)', async () => {
    // live, fuzzy "קרן היסוד 3 תל אביב": the real street has no no. 3 in GovMap
    const results: GovmapResult[] = [
      { id: 'address|ADDR|53890299|קרן-היסוד|3|תל חנן', text: 'קרן-היסוד 3 תל חנן', originalText: 'קרן היסוד 3 נשר', type: 'address', centroid: 'POINT (203800 739700)' },
      { id: 'address|ADDR|64836778|קרן היסוד|14|תל אביב', text: 'קרן היסוד 14 תל אביב', originalText: 'קרן היסוד 14 תל אביב-יפו', type: 'address', centroid: 'POINT (181000 670000)' },
      { id: 'address|ADDR|64837790|היסוד|3|תל אביב', text: 'היסוד 3 תל אביב', originalText: 'היסוד 3 תל אביב-יפו', type: 'address', centroid: 'POINT (178000 664000)' },
    ]
    expect(await pick('קרן היסוד 3', 'תל אביב', results)).toBeNull()
    // …while a partial match with no such evidence is still usable
    expect(await pick('קרן היסוד 3', 'תל אביב', [results[2]])).not.toBeNull()
  })

  it('prefers the best-scoring valid hit over GovMap order', async () => {
    const input = plan('מרכז תיירות', 'אילת')
    const loose: GovmapResult = {
      id: 'institutes|POI_BLDG|31199', text: 'מרכז מידע - מרכז תיירות אילת', type: 'institutes', centroid: 'POINT (195087.4 384915.37)',
    }
    const exact: GovmapResult = {
      id: 'poi|POI_MID_POINT|2', text: 'מרכז תיירות אילת', type: 'poi', centroid: 'POINT (195200 385100)',
    }
    expect(validateGovmapCandidate(input, loose)).not.toBeNull()
    expect((await pick('מרכז תיירות', 'אילת', [loose, exact]))?.displayName).toBe('מרכז תיירות אילת')
  })

  it('handles English results: city word anywhere in the text, exact house, matching street', () => {
    const en: GovmapResult = {
      id: 'address|ADDR|106247', text: 'Yafo 42 Yerushalayim (Jerusalem)', type: 'address',
      centroid: 'POINT (220915.5 632151.46)',
    }
    expect(validateGovmapCandidate(plan('Yafo 42', 'Jerusalem'), en)).not.toBeNull()
    expect(validateGovmapCandidate(plan('Yafo 43', 'Jerusalem'), en)).toBeNull()
    expect(validateGovmapCandidate(plan('Yafo 42', 'Haifa'), en)).toBeNull()
    // live junk for "Jaffa Road 42 Jerusalem"
    expect(validateGovmapCandidate(plan('Jaffa Road 42', 'Jerusalem'),
      { ...en, text: 'road 42' })).toBeNull()
  })

  it('accepts a named place without a house number only when the text ends with the city', () => {
    const touristCentre: GovmapResult = {
      id: 'institutes|POI_BLDG|31199', text: 'מרכז מידע - מרכז תיירות אילת', type: 'institutes',
      centroid: 'POINT (195087.4 384915.37)',
    }
    expect(validateGovmapCandidate(plan('מרכז תיירות', 'אילת'), touristCentre)?.point.addresstype).toBe('amenity')
    expect(validateGovmapCandidate(plan('בכניסה למירון', 'מירון'), {
      id: 'poi|POI_MID_POINT|61277', text: 'מקלט ציבורי נהלל מקלט בכניסה לביה"ס', type: 'poi',
      centroid: 'POINT (218661.07 732866.28)',
    })).toBeNull()
  })
})

// Every fixture below is a real GovMap response captured in the 2026-09 data
// evaluation of the live restaurant rows (ids, texts and centroids verbatim),
// except where a comment says the fixture is constructed.
describe('validation regressions from the live data evaluation', () => {
  it('rejects a one-word street inside a neighbourhood name (קרית חיים 25 ≠ חיים 25, 2 km off)', async () => {
    // "קרית חיים 25 האצטדיון | חיפה" → GovMap's "חיים 25" is משה חיים שפירא 25
    const results: GovmapResult[] = [
      { id: 'address|ADDR|53660531|חיים|25|חיפה( קרית חיים )', text: 'חיים 25 חיפה( קרית חיים )', originalText: 'משה חיים שפירא 25 חיפה', type: 'address', centroid: 'POINT (206709.08 749345.22)' },
      { id: 'address|ADDR|53841192|קרית ספר|25|חיפה\\קריית חיים', text: 'קרית ספר 25 חיפה\\קריית חיים', originalText: 'קריית ספר 25 חיפה', type: 'address', centroid: 'POINT (199375.24 743967.88)' },
      { id: 'address|ADDR|53667991|יפה נוף|25|חיפה(קרית חיים)', text: 'יפה נוף 25 חיפה(קרית חיים)', originalText: 'יפה נוף 25 חיפה', type: 'address', centroid: 'POINT (198598.55 746665.95)' },
      { id: 'address|ADDR|53669107|ארלוזרוב חיים|25|חיפה(קרית חיים)', text: 'ארלוזרוב חיים 25 חיפה(קרית חיים)', originalText: 'ארלוזורוב 25 חיפה', type: 'address', centroid: 'POINT (200345.95 745549.08)' },
      { id: 'address|ADDR|53667668|חיים-לסקוב|25|חיפה( קרית חיים )', text: 'חיים-לסקוב 25 חיפה( קרית חיים )', originalText: 'חיים לסקוב 25 חיפה', type: 'address', centroid: 'POINT (200768.83 742026.71)' },
    ]
    const input = plan('קרית חיים 25 האצטדיון', 'חיפה')
    expect(validateGovmapCandidate(input, results[0])).toBeNull()
    expect(await pick('קרית חיים 25 האצטדיון', 'חיפה', results)).toBeNull()
  })

  it('still accepts a surname-only street: the last word of the input, titles dropped', async () => {
    const kook: GovmapResult[] = [
      { id: 'address|ADDR|53900211', text: 'הרב קוק 2 בני ברק', type: 'address', centroid: 'POINT (183841.88 666109.30)' },
      { id: 'address|ADDR|53896606', text: 'יצחק מאיר הכהן 2 בני ברק', type: 'address', centroid: 'POINT (185170.10 665783.93)' },
      { id: 'address|ADDR|53896801', text: 'עלי הכהן 2 בני ברק', type: 'address', centroid: 'POINT (183653.50 666447.51)' },
    ]
    expect((await pick('הרב אברהם יצחק הכהן קוק 2', 'בני ברק', kook))?.displayName).toBe('הרב קוק 2 בני ברק')
    expect(validateGovmapCandidate(plan('פרופסור משה שור 34', 'חולון'), {
      id: 'address|ADDR|53689814|פרופסור שור|34|חולון', text: 'פרופסור שור 34 חולון', originalText: "פרופ' שור 34 חולון", type: 'address', centroid: 'POINT (180708.76 658657.90)',
    })).not.toBeNull()
    const jeremiah: GovmapResult[] = [
      { id: 'address|ADDR|53769461', text: 'ירמיהו 22 ראשון לציון', type: 'address', centroid: 'POINT (182727.93 650938.75)' },
      { id: 'address|ADDR|53649264|הנביא ירמיהו|22|ASHDOOD', text: 'הנביא ירמיהו 22 ASHDOOD', originalText: 'הנביא ירמיהו 22 אשדוד', type: 'address', centroid: 'POINT (166623.35 632029.95)' },
      { id: 'address|ADDR|65094459|ירמיהו הנביא|22|ב.שמש', text: 'ירמיהו הנביא 22 ב.שמש', originalText: 'ירמיהו הנביא 22 בית שמש', type: 'address', centroid: 'POINT (198558.63 623267.93)' },
    ]
    expect((await pick("רח' ירמיהו הנביא 22 ראשון לציון", 'ראשון לציון', jeremiah))?.displayName).toBe('ירמיהו 22 ראשון לציון')
    const strauss: GovmapResult[] = [
      { id: 'address|ADDR|65665267', text: 'שטראוס 3 ירושלים', type: 'address', centroid: 'POINT (220749.40 632335.26)' },
      { id: "address|ADDR|53921060|שטראוס|3|ת'איפו", text: "שטראוס 3 ת'איפו", originalText: 'שטראוס 3 תל אביב-יפו', type: 'address', centroid: 'POINT (178698.90 663903.21)' },
    ]
    expect((await pick('נתן שטראוס 3', 'ירושלים', strauss))?.displayName).toBe('שטראוס 3 ירושלים')
  })

  it('never reads a given name after a rabbinic title as a surname (רבי מאיר ≠ גולדה מאיר, constructed)', async () => {
    const rabbiMeir: GovmapResult = { id: 'address|ADDR|1|רבי מאיר|5|ירושלים', text: 'רבי מאיר 5 ירושלים', type: 'address', centroid: 'POINT (220915.5 632151.46)' }
    expect(validateGovmapCandidate(plan('גולדה מאיר 5', 'ירושלים'), rabbiMeir)).toBeNull()
    expect(await pick('גולדה מאיר 5', 'ירושלים', [rabbiMeir])).toBeNull()
    // …while the same street written with a title still matches
    expect(validateGovmapCandidate(plan("ר' מאיר 5", 'ירושלים'), rabbiMeir)?.exact).toBe(true)
    // a plain surname street is unaffected: "נתן שטראוס" → "שטראוס"
    expect(validateGovmapCandidate(plan('נתן שטראוס 3', 'ירושלים'), {
      id: 'address|ADDR|65665267', text: 'שטראוס 3 ירושלים', type: 'address', centroid: 'POINT (220749.40 632335.26)',
    })).not.toBeNull()
  })

  it('rejects a venue that shares one adjective (Sheba food court ≠ "מרכזי מסחרי", 5.6 km off)', async () => {
    const results: GovmapResult[] = [
      { id: 'neighborhood|LAYER_NEIGHBORHOODS_AREA|65867205|מתחם נגבה|רמת-גן', text: 'מתחם נגבה רמת-גן', originalText: 'מתחם נגבה רמת גן', type: 'neighborhood', centroid: 'POINT (183614.29 663807.00)' },
      { id: 'street|STREET_MID_POINT|50447', text: 'מתחם מסובים רמת גן', type: 'street', centroid: 'POINT (184102.30 660816.92)' },
      { id: 'institutes|POI_BLDG|52857', text: 'מרכזי מסחרי רמת גן', type: 'institutes', centroid: 'POINT (181700.77 665832.02)' },
      { id: 'institutes|BLDG|522649', text: 'בנין יהלום רמת גן', type: 'institutes', centroid: 'POINT (181472.45 665694.48)' },
      { id: 'poi|POI_MID_POINT|93518', text: 'מרכזי מסחרי רמת גן', type: 'poi', centroid: 'POINT (181700.77 665832.02)' },
    ]
    expect(await pick('בנין אישפוז מרכזי מתחם המסעדות', 'רמת גן', results)).toBeNull()
  })

  it('needs a venue name in order and unbroken: Ramot mall, not the building "מאיר רמות" 2.4 km away', async () => {
    // centroids: the live WGS84 points projected back to ITM (±1 m)
    const results: GovmapResult[] = [
      { id: 'street|STREET_MID_POINT|16495', text: 'גולדה מאיר שדרות', type: 'street', centroid: 'POINT (162594.23 604363.01)' },
      { id: 'institutes|BLDG|795403', text: 'מאיר רמות ירושלים', type: 'institutes', centroid: 'POINT (220049.64 634220.11)' },
      { id: 'poi|POI_MID_POINT|82171', text: 'קניון - רמות ירושלים', type: 'poi', centroid: 'POINT (218638.79 636033.40)' },
      { id: 'poi|POI_MID_POINT|76923', text: 'קניון פרץ סנטר שדרות', type: 'poi', centroid: 'POINT (161475.79 603324.98)' },
      { id: 'poi|POI_MID_POINT|56204', text: 'מאיר רמות ירושלים', type: 'poi', centroid: 'POINT (220048.69 634180.41)' },
    ]
    const input = plan('קניון רמות שדרות גולדה מאיר ירושלים', 'ירושלים')
    expect(validateGovmapCandidate(input, results[1])).toBeNull()
    expect(validateGovmapCandidate(input, results[4])).toBeNull()
    expect((await pick('קניון רמות שדרות גולדה מאיר ירושלים', 'ירושלים', results))?.displayName).toBe('קניון - רמות ירושלים')
  })

  it('prefers the mall POI to a street of the same name (קניון מלכת שבא, 2.5 km apart)', async () => {
    const results: GovmapResult[] = [
      { id: 'street|STREET_MID_POINT|24693', text: 'מלכת שבא אילת', type: 'street', centroid: 'POINT (193919.01 386275.35)' },
      { id: 'institutes|POI_BLDG|56308', text: 'קניון מלכת שבא אילת', type: 'institutes', centroid: 'POINT (195936.00 384782.18)' },
      { id: 'poi|POI_MID_POINT|95666', text: 'קניון מלכת שבא אילת', type: 'poi', centroid: 'POINT (195936.00 384782.18)' },
    ]
    const p = await pick('קניון מלכת שבא', 'אילת', results)
    expect(p).toMatchObject({ displayName: 'קניון מלכת שבא אילת', addresstype: 'amenity' })
    // without a venue word the street is still the answer
    expect((await pick('מלכת שבא', 'אילת', [results[0]]))?.addresstype).toBe('road')
  })

  it('returns nothing when GovMap holds the same address twice, far apart (פינסקר 16, 1.5 km)', async () => {
    const twice: GovmapResult[] = [
      { id: 'address|ADDR|64835785|פינסקר|16|ראשון לציון', text: 'פינסקר 16 ראשון לציון', originalText: 'המושבה 16 ראשון לציון', type: 'address', centroid: 'POINT (181375.30 653997.03)' },
      { id: 'address|ADDR|53801132|פינסקר|16|ראשון לציון', text: 'פינסקר 16 ראשון לציון', originalText: 'יהודה לייב 16 ראשון לציון', type: 'address', centroid: 'POINT (181933.85 652642.22)' },
    ]
    const pinsker = (results: GovmapResult[]) => pick("רח' פינסקר 16 ראשון לציון", 'ראשון לציון', results)
    expect(await pinsker(twice)).toBeNull()
    expect(await pinsker([...twice].reverse())).toBeNull()
    expect(await pinsker([twice[1]])).not.toBeNull()
    // the same address twice a few metres apart (entrances, POI + building) is fine (constructed)
    expect(await pinsker([twice[1], { ...twice[1], id: 'address|ADDR|1', centroid: 'POINT (181960.00 652660.00)' }])).not.toBeNull()
  })

  it('remembers the tie across calls: a later response listing one duplicate settles nothing (constructed פינסקר 16)', async () => {
    // live 2026-09, "דרך בן גוריון 2 רמת גן": the accurate search and one fuzzy
    // search listed both houses 4.5 km apart, the last fuzzy search only one
    const twice: GovmapResult[] = [
      { id: 'address|ADDR|64835785|פינסקר|16|ראשון לציון', text: 'פינסקר 16 ראשון לציון', type: 'address', centroid: 'POINT (181375.30 653997.03)' },
      { id: 'address|ADDR|53801132|פינסקר|16|ראשון לציון', text: 'פינסקר 16 ראשון לציון', type: 'address', centroid: 'POINT (181933.85 652642.22)' },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { results: twice }))        // accurate
      .mockResolvedValueOnce(jsonResponse(200, { results: [twice[0]] }))   // fuzzy
    expect(await geocodeGovmapAddressDetailed('פינסקר 16', 'ראשון לציון')).toEqual({ point: null, transient: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^govmap:addr:v3:/), 86_400, 'null')
  })

  it('reads "ככר" as the type word כיכר (ככר העצמאות 13 = GovMap כיכר העצמאות 13)', () => {
    const v = validateGovmapCandidate(plan('ככר העצמאות 13', 'נתניה'), {
      id: 'address|ADDR|72725921|כיכר העצמאות|13|נתניה', text: 'כיכר העצמאות 13 נתניה', originalText: 'העצמאות 13 נתניה', type: 'address', centroid: 'POINT (186316.15 693014.27)',
    })
    expect(v?.exact).toBe(true)
  })
})

describe('street spelling variants (matres lectionis, ≥ 6 letters)', () => {
  it.each([
    ['הרב ניסנבאום 7', 'בת ים', { id: 'address|ADDR|53932901|הרב ניסנבוים|7|בת ים', text: 'הרב ניסנבוים 7 בת ים', originalText: 'הרב יצחק ניסנבוים 7 בת ים', type: 'address', centroid: 'POINT (176405.53 657113.91)' }],
    ['לילנבלום 9', 'נתניה', { id: 'address|ADDR|72718151', text: 'לילינבלום 9 נתניה', type: 'address', centroid: 'POINT (186898.00 692454.14)' }],
    ['מקס נורדואו 34', 'בת ים', { id: 'address|ADDR|53821790', text: 'מקס נורדאו 34 בת ים', type: 'address', centroid: 'POINT (175807.92 658007.34)' }],
    ['7 אבוחצירה', 'בני ברק', { id: 'address|ADDR|53833644|אבוחצירא|7|בני-ברק', text: 'אבוחצירא 7 בני-ברק', originalText: 'ישראל אבוחצירא 7 בני ברק', type: 'address', centroid: 'POINT (184264.53 666791.14)' }],
  ] as Array<[string, string, GovmapResult]>)('accepts "%s" (%s), but never as an exact match', async (address, city, r) => {
    const v = validateGovmapCandidate(plan(address, city), r)
    expect(v).toMatchObject({ exact: false, spelled: true })
    expect(await pick(address, city, [r])).not.toBeNull()
  })

  it('never for short words, where different streets collide (רמון ≠ רימון, הרתום → הרותם/הרטום)', async () => {
    // constructed
    expect(validateGovmapCandidate(plan('רמון 5', 'ירושלים'), {
      id: 'address|ADDR|1', text: 'רימון 5 ירושלים', type: 'address', centroid: 'POINT (220915.5 632151.46)',
    })).toBeNull()
    // live: "רח' הרתום 9 הר חוצבים ירושלים" — GovMap has both, 2 km apart
    expect(await pick("רח' הרתום 9 הר חוצבים ירושלים", 'ירושלים', [
      { id: 'address|ADDR|53568062', text: 'הרטום 9 ירושלים', type: 'address', centroid: 'POINT (220274.24 634398.75)' },
      { id: 'address|ADDR|53566009', text: 'הרותם 9 ירושלים', type: 'address', centroid: 'POINT (218404.57 635268.21)' },
    ])).toBeNull()
  })

  it('not when the response also holds a street one letter away from the input (constructed)', async () => {
    const spelled: GovmapResult = { id: 'address|ADDR|1', text: 'פלוטיצקי 10 ראשון לציון', type: 'address', centroid: 'POINT (180600 654700)' }
    const oneOff: GovmapResult = { id: 'address|ADDR|2', text: 'פלוצקי 4 ראשון לציון', type: 'address', centroid: 'POINT (181600 652700)' }
    expect(await pick('פלוטצקי 10', 'ראשון לציון', [spelled])).not.toBeNull()
    expect(await pick('פלוטצקי 10', 'ראשון לציון', [spelled, oneOff])).toBeNull()
  })

  it.each([
    ['18 הרב סרוצקין, בעלז', 'ירושלים', { id: 'address|ADDR|53577170|הרב סורוצקין|18|ירושלים', text: 'הרב סורוצקין 18 ירושלים', originalText: 'סורוצקין 18 ירושלים', type: 'address', centroid: 'POINT (219573.03 633558.67)' }],
    ["24 האומראים 'שד", 'בית שמש', { id: 'address|ADDR|72600388', text: 'שדרות האמוראים 24 בית שמש', type: 'address', centroid: 'POINT (197004.95 623915.19)' }],
  ] as Array<[string, string, GovmapResult]>)('long words: a ו/י after the first letter is spelling too — "%s" (%s)', async (address, city, r) => {
    expect(validateGovmapCandidate(plan(address, city), r)).toMatchObject({ exact: false, spelled: true })
    expect(await pick(address, city, [r])).not.toBeNull()
  })

  it.each([
    ['הכורמים', 'הכרמים'], ['החורשים', 'החרשים'], ['השומרים', 'השמרים'], ['הזורעים', 'הזרעים'],
    ['היוצרים', 'היצרים'], ['הגיבורים', 'הגברים'], ['הרימונים', 'הרמונים'], ['הפועלים', 'הפעלים'],
  ])('never takes "%s" for "%s" — another word, not a spelling (constructed)', async (input, other) => {
    const r: GovmapResult = { id: `address|ADDR|1|${other}|5|ראשון לציון`, text: `${other} 5 ראשון לציון`, type: 'address', centroid: 'POINT (181375.30 653997.03)' }
    expect(validateGovmapCandidate(plan(`${input} 5`, 'ראשון לציון'), r)).toBeNull()
    expect(await pick(`${input} 5`, 'ראשון לציון', [r])).toBeNull()
    // …either way round
    const back: GovmapResult = { ...r, id: `address|ADDR|1|${input}|5|ראשון לציון`, text: `${input} 5 ראשון לציון` }
    expect(validateGovmapCandidate(plan(`${other} 5`, 'ראשון לציון'), back)).toBeNull()
  })

  it('loses to the input spelling seen elsewhere in the city (constructed)', async () => {
    const results: GovmapResult[] = [
      { id: 'address|ADDR|1', text: 'לילינבלום 9 נתניה', type: 'address', centroid: 'POINT (186898.00 692454.14)' },
      { id: 'address|ADDR|2', text: 'לילנבלום 40 נתניה', type: 'address', centroid: 'POINT (187500.00 693000.00)' },
    ]
    expect(await pick('לילנבלום 9', 'נתניה', results)).toBeNull()
  })
})

describe('city comparison', () => {
  // Pairs from our DB (left) and what OSM / GovMap call the place (right), 2026-09.
  it.each([
    ['נהריה', 'נהרייה'],
    ['הרצליה', 'הרצלייה'],
    ['זכרון יעקב', 'זיכרון יעקב'],
    ['זכרון יעקב', 'זיכרוןיעקב'],
    ['יוקנעם עילית', 'יקנעם עילית'],
    ['ביתר עלית', 'ביתר עילית'],
    ['טירת הכרמל', 'טירת כרמל'],
    ['ראשון', 'ראשון לציון'],
    ['מבשרת', 'מבשרת ציון'],
    ['חצור', 'חצור הגלילית'],
    ['רמת בית שמש', 'בית שמש'],
    ['קריית שמואל', 'חיפה'],
    ['מודיעין עלית קריית ספר', 'מודיעין עילית'],
    ['מישור אדומים', 'מעלה אדומים'],
    ['ספסופה', 'כפר חושן'],
    ['ב אר יעקב', 'באר יעקב'],
    ['פתח תקוה', 'פתח-תקווה'],
    ['תל אביב', 'תל־אביב–יפו'],
    ['כפר חב״ד', 'כפר חב"ד'],
    ['בת ים', 'בת -ים'],
  ])('input "%s" names the place "%s"', (a, b) => {
    expect(placeIsCity(a, b)).toBe(true)
  })

  it.each([
    ['ביתר עלית', 'ביתר עילית'], ['קרית אתא', 'קריית אתא'], ['פתח תקווה', 'פתח תקוה'],
    ['טירת כרמל', 'טירת הכרמל'], ['באר יעקב', 'ב אר יעקב'],
  ])('spelling folds both ways: "%s" = "%s"', (a, b) => {
    expect(placeIsCity(a, b)).toBe(true)
    expect(placeIsCity(b, a)).toBe(true)
  })

  it.each([
    // a lone ו/י is not optional: these are different towns
    ['צפת', 'צופית'],
    ['אופקים', 'אפיקים'],
    ['נהריה', 'נהורה'],
    ['עומר', 'עמיר'],
    ['אילת', 'אילות'],
    ['קריית שמואל', 'קריית שמונה'],
    // the article is optional on a later word only
    ['הרצליה', 'רצליה'],
  ])('"%s" ≠ "%s" (either way)', (a, b) => {
    expect(placeIsCity(a, b)).toBe(false)
    expect(placeIsCity(b, a)).toBe(false)
  })

  it('applies aliases to the input only: a place named like a Jerusalem neighbourhood is not Jerusalem', () => {
    expect(placeIsCity('רמות', 'ירושלים')).toBe(true)
    expect(placeIsCity('ירושלים', 'רמות')).toBe(false)
    expect(placeIsCity('קריית שמואל', 'חיפה')).toBe(true)
    expect(placeIsCity('חיפה', 'קריית שמואל')).toBe(false)
  })

  it.each([
    ['ראשון לציון', 'ראש העין'],
    ['בית שמש', 'בית שאן'],
    ['קריית שמואל', 'קריית שמונה'],
    ['חצור', 'חצור-אשדוד'],
    ['רמת גן', 'רמת השרון'],
    ['מעלה אדומים', 'מועצה אזורית גוש עציון'],
    ['גבעת שמואל', 'גבעת שאול'],
    ['טירת הכרמל', 'טירה'],
  ])('"%s" ≠ "%s"', (a, b) => {
    expect(placeIsCity(a, b)).toBe(false)
  })

  it('never accepts a GovMap hit in a town that differs by one ו/י (צפת ≠ צופית)', () => {
    const r: GovmapResult = { id: 'address|ADDR|1|הרצל|5|צופית', text: 'הרצל 5 צופית', type: 'address', centroid: 'POINT (192000 678000)' }
    expect(validateGovmapCandidate(plan('הרצל 5', 'צפת'), r)).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', 'צופית'), r)).not.toBeNull()
    expect(validateGovmapCandidate(plan('התמר 3', 'אילת'), { id: 'address|ADDR|2|התמר|3|אילות', text: 'התמר 3 אילות', type: 'address', centroid: 'POINT (196500 391500)' })).toBeNull()
  })

  it('finds a neighbourhood-city inside a city district name', () => {
    expect(cityNamedIn('קריית שמואל', 'רובע קריית חיים - קריית שמואל')).toBe(true)
    expect(cityNamedIn('קרית חיים', 'רובע קריית חיים - קריית שמואל')).toBe(true)
    expect(cityNamedIn('קריית ביאליק', 'רובע קריית חיים - קריית שמואל')).toBe(false)
    expect(cityNamedIn('ים', 'רובע ים')).toBe(false)   // too short to count
  })

  it('never finds a city as part of another locality name in a district', () => {
    expect(cityNamedIn('חצור', 'רובע חצור אשדוד')).toBe(false)          // an alias of חצור הגלילית, 150 km off
    expect(cityNamedIn('מודיעין', 'רובע מודיעין עילית')).toBe(false)
    expect(cityNamedIn('יבנה', 'רובע גן יבנה')).toBe(false)
    expect(cityNamedIn('נצרת', 'רובע נצרת עילית')).toBe(false)
    expect(cityNamedIn('רמות', 'שכונת רמות')).toBe(true)
  })

  it('resolves only GovMap\'s own alternate city names on a result, never the input aliases', () => {
    const house = (city: string, street = 'הזית'): GovmapResult => ({
      id: `address|ADDR|1|${street}|5|${city}`, text: `${street} 5 ${city}`, type: 'address', centroid: 'POINT (200000 650000)',
    })
    // a record in the Golan moshav רמות / a place called גילה is not in Jerusalem
    expect(validateGovmapCandidate(plan('הזית 5', 'ירושלים'), house('רמות'))).toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'ירושלים'), house('גילה'))).toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'חיפה'), house('קריית שמואל'))).toBeNull()   // Tiberias has one too
    // …while the names GovMap itself uses still count (live, 2026-09)
    expect(validateGovmapCandidate(plan('הזית 5', 'פתח תקווה'), house('פת'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'בני ברק'), house('ב"ב'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'ראשון לציון'), house('ראשון'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'מעלה אדומים'), house('מישור-אדומים'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('הזית 5', 'מודיעין עילית'), house('קריית ספר'))).not.toBeNull()
    // an input alias still resolves: "רמות" as the city means Jerusalem
    expect(validateGovmapCandidate(plan('הזית 5', 'רמות'), house('ירושלים'))).not.toBeNull()
  })

  it('never accepts another town whose name contains the input city (constructed)', () => {
    const C = 'POINT (190000 650000)'
    // municipal address layer: the whole rest of "מערך כתובות …" is the city
    const layer = (town: string): GovmapResult => ({
      id: 'layer|215337|entity|1', text: `מערך כתובות ${town} הרצל 5`, originalText: 'הרצל,  5', type: `215337|מערך כתובות ${town}|entity`, centroid: C,
    })
    expect(validateGovmapCandidate(plan('הרצל 5', 'יבנה'), layer('גן יבנה'))).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', 'נצרת'), layer('נצרת עילית'))).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', 'גת'), layer('קריית גת'))).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', 'יבנה'), layer('יבנה'))).not.toBeNull()
    // no house number: the text ends with the city, but as part of "גן יבנה"
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'יבנה'), { id: 'street|STREET_MID_POINT|1', text: 'הרצל גן יבנה', type: 'street', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('קניון הזהב', 'יבנה'), { id: 'poi|POI_MID_POINT|1', text: 'קניון הזהב גן יבנה', type: 'poi', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('קניון הזהב', 'אשדוד'), { id: 'poi|POI_MID_POINT|1', text: 'קניון הזהב חצור אשדוד', type: 'poi', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('קניון הזהב', 'יבנה'), { id: 'poi|POI_MID_POINT|1', text: 'קניון הזהב יבנה', type: 'poi', centroid: C })).not.toBeNull()
    // a street whose id names another city, whatever its text says
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'יבנה'), { id: 'street|STREET_MID_POINT|1|הרצל|גן יבנה', text: 'הרצל יבנה', type: 'street', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'יבנה'), { id: 'street|STREET_MID_POINT|1|הרצל|יבנה', text: 'הרצל יבנה', type: 'street', centroid: C })).not.toBeNull()
  })

  it('never takes a text in a longer town ending with the input city (טירת כרמל, בני ברק, אחוזת ברק; constructed)', async () => {
    const C = 'POINT (190000 650000)'
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'כרמל'), { id: 'street|STREET_MID_POINT|1', text: 'הרצל טירת כרמל', type: 'street', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'טירת כרמל'), { id: 'street|STREET_MID_POINT|1', text: 'הרצל טירת כרמל', type: 'street', centroid: C })).not.toBeNull()
    const mall = (town: string): GovmapResult => ({ id: 'poi|POI_MID_POINT|1', text: `קניון הזהב ${town}`, type: 'poi', centroid: C })
    expect(validateGovmapCandidate(plan('קניון הזהב', 'ברק'), mall('בני ברק'))).toBeNull()
    expect(validateGovmapCandidate(plan('קניון הזהב', 'ברק'), mall('אחוזת ברק'))).toBeNull()
    expect(await pick('קניון הזהב', 'כרמל', [mall('טירת כרמל'), { id: 'street|STREET_MID_POINT|1', text: 'הרצל טירת כרמל', type: 'street', centroid: C }])).toBeNull()
    expect(validateGovmapCandidate(plan('קניון הזהב', 'בני ברק'), mall('בני ברק'))).not.toBeNull()
    // English
    expect(validateGovmapCandidate(plan('Herzl Street', 'Carmel'), { id: 'street|STREET_MID_POINT|1', text: 'Herzl Tirat Carmel', type: 'street', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('Golden Mall', 'Carmel'), { id: 'poi|1', type: 'poi', text: 'Golden Mall Tirat Carmel', centroid: C })).toBeNull()
    // the fallback's city_district check
    expect(cityNamedIn('כרמל', 'רובע טירת כרמל')).toBe(false)
    expect(cityNamedIn('כרמל', 'טירת כרמל')).toBe(false)
    expect(cityNamedIn('טירת כרמל', 'רובע טירת כרמל')).toBe(true)
  })

  it('still takes a street of the input city whose own name ends like a town prefix (constructed)', () => {
    const C = 'POINT (190000 650000)'
    const street = (text: string): GovmapResult => ({ id: 'street|STREET_MID_POINT|1', text, type: 'street', centroid: C })
    expect(validateGovmapCandidate(plan('חצור', 'אשדוד'), street('חצור אשדוד'))?.point.addresstype).toBe('road')
    expect(validateGovmapCandidate(plan('שביל הר', 'חיפה'), street('שביל הר חיפה'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('מבוא גן', 'רעננה'), street('מבוא גן רעננה'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('שדרות יגאל אלון', 'תל אביב'), street('יגאל אלון תל אביב'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('Yigal Alon St', 'Tel Aviv'), street('Yigal Alon Tel Aviv'))).not.toBeNull()
    // …only when the name before the city is exactly the input's own
    expect(validateGovmapCandidate(plan('חצור', 'אשדוד'), street('הרצל חצור אשדוד'))).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'יבנה'), street('הרצל גן יבנה'))).toBeNull()
    // …and only for street records: a POI named just "מרכז מסחרי" in the kibbutz
    // חצור-אשדוד has no significant words of its own to compare
    const poi = (text: string, type = 'poi'): GovmapResult => ({ id: `${type}|1`, text, type, centroid: C })
    expect(validateGovmapCandidate(plan('רחוב חצור', 'אשדוד'), poi('מרכז מסחרי חצור אשדוד'))).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב חצור', 'אשדוד'), poi('מרכז מסחרי - חצור אשדוד', 'institutes'))).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב גן', 'יבנה'), poi('מרכז מסחרי גן יבנה'))).toBeNull()
  })

  it('knows more towns whose last word is another town (גבע כרמל, דאלית אל-כרמל, נוף איילון)', () => {
    const C = 'POINT (200000 740000)'
    const street = (text: string): GovmapResult => ({ id: 'street|STREET_MID_POINT|1', text, type: 'street', centroid: C })
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'כרמל'), street('הרצל גבע כרמל'))).toBeNull()
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'איילון'), street('הרצל נוף איילון'))).toBeNull()
    expect(cityNamedIn('כרמל', 'גבע כרמל')).toBe(false)
    expect(cityNamedIn('כרמל', 'רובע דאלית אל-כרמל')).toBe(false)
    expect(cityNamedIn('איילון', 'נוף איילון')).toBe(false)
    expect(validateGovmapCandidate(plan('Herzl Street', 'Carmel'), { id: 'street|STREET_MID_POINT|1', text: 'Herzl Geva Carmel', type: 'street', centroid: C })).toBeNull()
  })

  it('an aliased input city matches a settlement field only by its target (רמות is not the Golan moshav)', () => {
    expect(placeIsCity('רמות', 'רמות', true)).toBe(false)
    expect(placeIsCity('רמות', 'ירושלים', true)).toBe(true)
    expect(placeIsCity('רמות', 'רמות')).toBe(true)                 // a suburb field may name it
    expect(placeIsCity('ראשון', 'ראשון לציון', true)).toBe(true)
    expect(placeIsCity('ביתר עלית', 'ביתר עילית', true)).toBe(true)
  })

  it('reads a street id city that is a GovMap search alias through the originalText (live ids, 2026-09)', () => {
    const C = 'POINT (190000 650000)'
    expect(validateGovmapCandidate(plan('שדרות יצחק רבין', 'זכרון יעקב'), {
      id: 'street|STREET_MID_POINT|53711|שדרות יצחק רבין|הזכרוןיעקב', text: 'שדרות יצחק רבין הזכרוןיעקב', originalText: 'יצחק רבין זיכרון יעקב', type: 'street', centroid: C,
    })?.point.addresstype).toBe('road')
    expect(validateGovmapCandidate(plan('גיורא יוספטל', 'ירושלים'), {
      id: 'street|STREET_MID_POINT|30574|גיורא יוספטל|הבירהבירתישראל', text: 'גיורא יוספטל הבירהבירתישראל', originalText: 'גיורא יוספטל ירושלים', type: 'street', centroid: C,
    })).not.toBeNull()
    // the id city still vetoes when the originalText doesn't name the input city
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'יבנה'), {
      id: 'street|STREET_MID_POINT|1|הרצל|גן יבנה', text: 'הרצל יבנה', originalText: 'הרצל גן יבנה', type: 'street', centroid: C,
    })).toBeNull()
  })

  it('English city spellings: what people write = the official forms (constructed)', () => {
    const C = 'POINT (190000 650000)'
    const house = (text: string): GovmapResult => ({ id: 'address|ADDR|1', type: 'address', text, centroid: C })
    expect(validateGovmapCandidate(plan('Herzl 5', 'Rishon'), house('Herzl 5 Rishon LeZiyyon'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Rishon LeZion'), house('Herzl 5 Rishon LeZiyyon'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Modiin'), house("Herzl 5 Modi'in-Makkabbim-Re'ut"))).not.toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Bnei Brak'), house('Herzl 5 Bene Beraq'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('Golden Mall', 'Rishon'), { id: 'poi|1', type: 'poi', text: 'Golden Mall Rishon LeZiyyon', centroid: C })).not.toBeNull()
    // other towns stay other towns
    expect(validateGovmapCandidate(plan('Herzl 5', 'Modiin'), house("Herzl 5 Modi'in Illit"))).toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Rishon'), house('Herzl 5 Rosh HaAyin'))).toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Gat'), house('Herzl 5 Kiryat Gat'))).toBeNull()
  })

  it('keeps a geresh after ג/ז/צ/ח in place names: ג\'ת (Jatt) is not גת (Gat)', () => {
    const C = 'POINT (190000 650000)'
    expect(placeIsCity('גת', "ג'ת")).toBe(false)
    expect(placeIsCity("ג'ת", 'גת')).toBe(false)
    expect(placeIsCity("ג'ת", 'ג׳ת')).toBe(true)
    const house = (city: string): GovmapResult => ({ id: `address|ADDR|1|הרצל|5|${city}`, text: `הרצל 5 ${city}`, type: 'address', centroid: C })
    expect(validateGovmapCandidate(plan('הרצל 5', 'גת'), house("ג'ת"))).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', "ג'ת"), house('גת'))).toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', "ג'ת"), house('ג׳ת'))).not.toBeNull()
    expect(validateGovmapCandidate(plan('רחוב הרצל', 'גת'), { id: 'street|STREET_MID_POINT|1', text: "הרצל ג'ת", type: 'street', centroid: C })).toBeNull()
    // abbreviations with a geresh elsewhere still resolve, and streets still drop it
    expect(validateGovmapCandidate(plan('הרצל 5', 'תל אביב'), house("ת'א"))).not.toBeNull()
    expect(validateGovmapCandidate(plan('הרצל 5', 'מודיעין עילית'), house("ק'ספר"))).not.toBeNull()
    expect(validateGovmapCandidate(plan('זבוטינסקי 7', 'פתח תקוה'), { id: 'address|ADDR|1', text: "ז'בוטינסקי 7 פתח תקווה", type: 'address', centroid: 'POINT (188590 665400)' })).not.toBeNull()
  })

  it('English results: the text after the house number is the city as a whole', () => {
    const C = 'POINT (190000 650000)'
    // live English answer for "Avnei Nezer 18 Modiin" (2026-09): Modi'in Illit, not Modiin
    const illit: GovmapResult = { id: 'address|ADDR|358472', type: 'address', text: "Avne Nezer 18 Modi'in Illit", centroid: 'POINT (204112.87 649084.43)' }
    expect(validateGovmapCandidate(plan('Avne Nezer 18', 'Modiin'), illit)).toBeNull()
    expect(validateGovmapCandidate(plan('Avne Nezer 18', 'Modiin Illit'), illit)).not.toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Yavne'), { id: 'address|ADDR|1', type: 'address', text: 'Herzl 5 Gan Yavne', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('Herzl 5', 'Tel Aviv'), { id: 'address|ADDR|1', type: 'address', text: 'Herzl 5 Tel Aviv-Yafo', centroid: C })).not.toBeNull()
    // no house number: the city ends the text (or is its parenthetical)
    expect(validateGovmapCandidate(plan('Golden Mall', 'Yavne'), { id: 'poi|1', type: 'poi', text: 'Golden Mall Gan Yavne', centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('Golden Mall', 'Modiin'), { id: 'poi|1', type: 'poi', text: "Golden Mall Modi'in Illit", centroid: C })).toBeNull()
    expect(validateGovmapCandidate(plan('Golden Mall', 'Yavne'), { id: 'poi|1', type: 'poi', text: 'Golden Mall Yavne', centroid: C })).not.toBeNull()
    expect(validateGovmapCandidate(plan('Golden Mall', 'Jerusalem'), { id: 'poi|1', type: 'poi', text: 'Golden Mall Yerushalayim (Jerusalem)', centroid: C })).not.toBeNull()
  })

  it('validates GovMap hits with city aliases (מודיעין עלית קריית ספר, קריית שמואל)', async () => {
    const akiva: GovmapResult[] = [
      { id: 'address|ADDR|65665858|רבי עקיבא|3|ביתר עלית', text: 'רבי עקיבא 3 ביתר עלית', originalText: 'רבי עקיבא 3 ביתר עילית', type: 'address', centroid: 'POINT (211570.24 622771.14)' },
      { id: 'address|ADDR|53792141|רבי עקיבא|3|קריית ספר', text: 'רבי עקיבא 3 קריית ספר', originalText: 'רבי עקיבא 3 מודיעין עילית', type: 'address', centroid: 'POINT (203785.39 649667.33)' },
    ]
    const input = plan('רבי עקיבא 3', 'מודיעין עלית קריית ספר')
    expect(input.queries).toEqual(['רבי עקיבא 3 מודיעין עילית'])
    expect((await pick('רבי עקיבא 3', 'מודיעין עלית קריית ספר', akiva))?.displayName).toBe('רבי עקיבא 3 מודיעין עילית')
    expect((await pick('רבי עקיבא 3', 'ביתר עלית', akiva))?.displayName).toBe('רבי עקיבא 3 ביתר עילית')
    // GovMap's own city names include the former name "קריית ספר" (id city)
    expect(validateGovmapCandidate(input, { ...akiva[1], originalText: undefined })).not.toBeNull()

    const kiryatShmuel = plan('קדושי השואה 9', 'קריית שמואל')
    expect(kiryatShmuel.queries).toEqual(['קדושי השואה 9 חיפה'])
    expect(validateGovmapCandidate(kiryatShmuel, {
      id: 'address|ADDR|53544740|קדושי השואה|9|חיפה/קריית חיים', text: 'קדושי השואה 9 חיפה/קריית חיים', originalText: 'קדושי השואה 9 חיפה', type: 'address', centroid: 'POINT (206873.36 749616.61)',
    })).not.toBeNull()
    expect(validateGovmapCandidate(kiryatShmuel, {
      id: 'address|ADDR|53596052|קדושי השואה|9|זיכרוןיעקב', text: 'קדושי השואה 9 זיכרוןיעקב', originalText: 'קדושי השואה 9 זיכרון יעקב', type: 'address', centroid: 'POINT (196100 720300)',
    })).toBeNull()
  })
})

describe('searchGovmap transport', () => {
  it('POSTs the SDK request shape with Origin + a browser UA, token only in the body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { resultsCount: 1, results: [YAFO_42] }))

    const results = await searchGovmap('יפו 42 ירושלים', { isAccurate: true, maxResults: 5, language: 'he' })

    expect(results).toEqual([YAFO_42])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(SEARCH_URL)
    expect(url).not.toContain(TEST_KEY)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Origin).toBe('https://mykoshermap.com')
    expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0 /)
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      apiKey: TEST_KEY, searchText: 'יפו 42 ירושלים', language: 'he', maxResults: 5, isAccurate: true,
    })
  })

  it('falls back to the default Origin when GOVMAP_ORIGIN is blank (compose passes "")', async () => {
    for (const blank of ['', '   ']) {
      process.env.GOVMAP_ORIGIN = blank
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [] }))
      await searchGovmap('x', { isAccurate: false, maxResults: 5, language: 'he' })
      expect((fetchMock.mock.calls.at(-1)![1].headers as Record<string, string>).Origin).toBe('https://mykoshermap.com')
    }
  })

  it('never follows a redirect (it would re-POST the token elsewhere)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed: unexpected redirect'))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBe('error')
  })

  it('honours GOVMAP_ORIGIN', async () => {
    process.env.GOVMAP_ORIGIN = 'https://www.mykoshermap.com/'
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [] }))
    await searchGovmap('x', { isAccurate: false, maxResults: 5, language: 'he' })
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Origin).toBe('https://www.mykoshermap.com')
  })

  it('401 → null, warns once per process, never logs the token', async () => {
    const warn = jest.spyOn(logger, 'warn')
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid API token or unauthorized domain' }))

    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await searchGovmap('b', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('token rejected or domain not approved')
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TEST_KEY)
    warn.mockRestore()
  })

  it('flags a 401/403 as a config error (govmapAuthRejected) — a 429, 5xx or timeout is not', async () => {
    const ask = () => searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })
    for (const status of [401, 403]) {
      resetGovmapState()
      fetchMock.mockResolvedValueOnce(jsonResponse(status, {}))
      expect(await ask()).toBeNull()
      expect(govmapAuthRejected()).toBe(true)
    }
    resetGovmapState()
    expect(govmapAuthRejected()).toBe(false)
    for (const failure of [jsonResponse(429, {}), jsonResponse(503, {})]) {
      resetGovmapState()
      fetchMock.mockResolvedValueOnce(failure)
      expect(await ask()).toBeNull()
      expect(govmapAuthRejected()).toBe(false)
    }
    resetGovmapState()
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect(await ask()).toBeNull()
    expect(govmapAuthRejected()).toBe(false)
  })

  it('429 → null and backs off for Retry-After without calling again', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '5' }))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await searchGovmap('b', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('timeout / network error / 5xx / malformed body → null', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    resetGovmapState()
    fetchMock.mockResolvedValueOnce(jsonResponse(503, {}))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    resetGovmapState()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'nope' }))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
  })

  it.each([
    ['timeout', () => fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))],
    ['401', () => fetchMock.mockResolvedValueOnce(jsonResponse(401, {}))],
    ['403', () => fetchMock.mockResolvedValueOnce(jsonResponse(403, 'blocked'))],
  ])('%s → cools down: the next calls skip GovMap', async (_name, fail) => {
    fail()
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await searchGovmap('b', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await geocodePoint('יפו 42', 'ירושלים')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a lone 5xx is not an outage; three accurate-search 5xx within 30 s are', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(502, {}))
    const accurate = { isAccurate: true, maxResults: 5, language: 'he' as const }
    expect(await searchGovmap('a', accurate)).toBeNull()
    expect(await searchGovmap('b', accurate)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)   // no cooldown after one or two
    expect(await searchGovmap('c', accurate)).toBeNull()
    expect(await searchGovmap('d', accurate)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)   // the third tripped it
  })

  it('fuzzy-search 5xx never trip the breaker (GovMap 500s on some texts every time)', async () => {
    // live 2026-09, every call: fuzzy "תחנת דלק מנטה גבעת זאב" → 500, accurate → 200 []
    fetchMock.mockImplementation(async () => jsonResponse(500, {}))
    const fuzzy = { isAccurate: false, maxResults: 5, language: 'he' as const }
    for (let i = 0; i < 5; i++) expect(await searchGovmap(`q${i}`, fuzzy)).toBeNull()
    fetchMock.mockImplementation(async () => jsonResponse(200, { results: [YAFO_42] }))
    expect(await searchGovmap('יפו 42 ירושלים', { ...fuzzy, isAccurate: true })).toEqual([YAFO_42])
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('paces calls to ≤ 8/s after a burst of 8 (GovMap answered 429 past ~10/s)', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { results: [] }))
    const t0 = Date.now()
    for (let i = 0; i < 12; i++) await searchGovmap(`q${i}`, { isAccurate: true, maxResults: 5, language: 'he' })
    expect(fetchMock).toHaveBeenCalledTimes(12)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(4 * 125 - 30)
  })

  it('gives up (no call) rather than wait past its time budget for a rate slot', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { results: [] }))
    const opts = { isAccurate: true, maxResults: 5, language: 'he' as const, timeoutMs: 400 }
    const all = await Promise.all(Array.from({ length: 12 }, (_, i) => searchGovmap(`q${i}`, opts)))
    expect(all.filter(r => r === null).length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.length).toBeLessThan(12)
  })

  it('a plain 4xx (e.g. 400) is about that request only — no cooldown', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {})).mockResolvedValueOnce(jsonResponse(200, { results: [] }))
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await searchGovmap('b', { isAccurate: true, maxResults: 5, language: 'he' })).toEqual([])
  })

  it('keeps at most 8 GovMap calls in flight (GovMap allows 10 per IP)', async () => {
    let inFlight = 0
    let peak = 0
    fetchMock.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise(r => setTimeout(r, 20))
      inFlight--
      return jsonResponse(200, { results: [] })
    })
    const all = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      searchGovmap(`q${i}`, { isAccurate: true, maxResults: 5, language: 'he' })))
    expect(all.every(r => Array.isArray(r))).toBe(true)
    expect(peak).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  it('does nothing when GOVMAP_API_KEY is unset', async () => {
    delete process.env.GOVMAP_API_KEY
    expect(govmapConfigured()).toBe(false)
    expect(await searchGovmap('a', { isAccurate: true, maxResults: 5, language: 'he' })).toBeNull()
    expect(await geocodePoint('יפו 42', 'ירושלים')).toBeNull()
    expect(await searchGovmapPlaces('יפו', 'he')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('geocodeGovmapAddressDetailed', () => {
  it('returns and caches the first validated hit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [YAFO_42] }))

    const p = await geocodePoint("רח' יפו 42", 'ירושלים')

    expect(p).toMatchObject({ addresstype: 'house', provider: 'govmap' })
    expect(metersBetween(p!, { lat: 31.782057, lng: 35.219840 })).toBeLessThan(20)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('govmap:addr:v3:he:יפו 42 ירושלים', 86_400, JSON.stringify(p))
  })

  it('serves a cache hit (including a cached miss) without calling GovMap', async () => {
    mockedRedis.get.mockResolvedValueOnce('null')
    expect(await geocodePoint('יפו 42', 'ירושלים')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tries accurate then fuzzy and caches a definitive miss', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { results: [] }))

    expect(await geocodePoint('2 דרך ירושלים', 'רחובות')).toBeNull()

    const sent = fetchMock.mock.calls.map(c => JSON.parse(c[1].body as string))
    expect(sent.map(b => [b.searchText, b.isAccurate])).toEqual([
      ['דרך ירושלים 2 רחובות', true], ['ירושלים 2 רחובות', true],
      ['דרך ירושלים 2 רחובות', false], ['ירושלים 2 רחובות', false],
    ])
    expect(mockedRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^govmap:addr:/), 86_400, 'null')
  })

  it('does not cache a miss when a call failed transiently, and stops calling', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockImplementation(async () => jsonResponse(200, { results: [] }))
    expect(await geocodePoint('יפו 42', 'ירושלים')).toBeNull()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a hanging GovMap costs one bounded timeout, then the next address skips it', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
    }))
    const t0 = Date.now()
    expect(await geocodePoint('דרך מצדה 6א', 'באר שבע')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(Date.now() - t0).toBeLessThan(4_000)

    const t1 = Date.now()
    expect(await geocodePoint('יפו 42', 'ירושלים')).toBeNull()
    expect(Date.now() - t1).toBeLessThan(100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  }, 10_000)

  it('keeps looking past a partial street match and rejects it when the real street appears', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { results: [
        { id: 'address|ADDR|64837790|היסוד|3|תל אביב', text: 'היסוד 3 תל אביב', type: 'address', centroid: 'POINT (178000 664000)' },
      ] }))
      .mockResolvedValueOnce(jsonResponse(200, { results: [
        { id: 'address|ADDR|64836778|קרן היסוד|14|תל אביב', text: 'קרן היסוד 14 תל אביב', type: 'address', centroid: 'POINT (181000 670000)' },
      ] }))
    expect(await geocodePoint('קרן היסוד 3', 'תל אביב')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^govmap:addr:v3:/), 86_400, 'null')
  })

  it('skips a fuzzy variant that 500s after its accurate twin answered, and still caches the answer', async () => {
    // live 2026-09, every time: accurate "תחנת דלק מנטה גבעת זאב" → 200 [], fuzzy → 500
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      (JSON.parse(init.body as string).isAccurate ? jsonResponse(200, { results: [] }) : jsonResponse(500, {})))
    expect(await geocodeGovmapAddressDetailed('תחנת דלק מנטה', 'גבעת זאב')).toEqual({ point: null, transient: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).toHaveBeenCalledWith(expect.stringMatching(/^govmap:addr:v3:/), 86_400, 'null')
    // …and a real outage (accurate search failing) is still transient
    resetGovmapState()
    mockedRedis.setex.mockClear()
    fetchMock.mockImplementation(async () => jsonResponse(503, {}))
    expect(await geocodeGovmapAddressDetailed('יפו 42', 'ירושלים')).toEqual({ point: null, transient: true })
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('a partial match is no answer when a later call failed: transient, never settled (and not cached)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { results: [
        { id: 'address|ADDR|64837790|היסוד|3|תל אביב', text: 'היסוד 3 תל אביב', type: 'address', centroid: 'POINT (178000 664000)' },
      ] }))
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect(await geocodeGovmapAddressDetailed('קרן היסוד 3', 'תל אביב')).toEqual({ point: null, transient: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).not.toHaveBeenCalled()
    // an exact hit before the failure still counts
    resetGovmapState()
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [YAFO_42] }))
    expect(await geocodeGovmapAddressDetailed('יפו 42', 'ירושלים')).toMatchObject({ point: { addresstype: 'house' }, transient: false })
  })

  it('searches a Hebrew address with a Latin Israeli city under the Hebrew city name', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [YAFO_42] }))
    expect(await geocodePoint('יפו 42', 'Jerusalem')).toMatchObject({ addresstype: 'house', provider: 'govmap' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ searchText: 'יפו 42 ירושלים', language: 'he' })
    expect(plan('יפו 42', 'Jerusalem').cityWords).toEqual(['ירושלים'])
    expect(plan('הרצל 10', 'Tel Aviv-Yafo').queries).toEqual(['הרצל 10 תל אביב'])
    expect(plan("ז'בוטינסקי 7", "Petah Tikva").cityWords).toEqual(['פתח', 'תקוה'])
    // Latin address + Latin city stays on the English index; unknown Latin cities are left alone
    expect(plan('Yafo 42', 'Jerusalem')).toMatchObject({ latin: true, city: 'Jerusalem' })
    expect(hebrewCityForAddress('יפו 42', 'Springfield')).toBe('Springfield')
    expect(hebrewCityForAddress('יפו 42', 'ירושלים')).toBe('ירושלים')
    expect(hebrewCityForAddress('Jaffa Road 42', 'Jerusalem')).toBe('Jerusalem')
    expect(hebrewCityForAddress('רוטשילד 1', "Be'er Sheva")).toBe('באר שבע')
  })

  it('caps GovMap calls per address at 6', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { results: [] }))
    // 4 query variants (דרך / no דרך × letter / no letter) × accurate + fuzzy = 8
    await geocodePoint('דרך מצדה 6א', 'באר שבע')
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('works without Redis', async () => {
    mockedRedis.get.mockRejectedValue(new Error('redis down'))
    mockedRedis.setex.mockRejectedValue(new Error('redis down'))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [YAFO_42] }))
    expect(await geocodePoint('יפו 42', 'ירושלים')).not.toBeNull()
  })
})

describe('searchGovmapPlaces', () => {
  it('maps results, drops cadastral/unparseable ones and duplicates, and caches', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      results: [
        { id: 'institutes|POI_BLDG|55347', text: 'קניון מלחה ירושלים', type: 'institutes', centroid: 'POINT (215500 628400)' },
        { id: 'poi|POI_MID_POINT|95026', text: 'קניון מלחה ירושלים', type: 'poi', centroid: 'POINT (215500 628400)' },
        { id: 'block|1', text: 'גוש 30000', type: 'block', centroid: 'POINT (215500 628400)' },
        { id: 'address|ADDR|9', text: 'x', type: 'address', centroid: 'nope' },
        { ...YAFO_42, originalText: 'יפו 42 ירושלים (מקור)', subTypeText: 'כתובת ראשית' },
      ],
    }))

    const places = await searchGovmapPlaces('  קניון   מלחה ', 'ru')

    expect(places).toEqual([
      expect.objectContaining({ id: 'institutes|POI_BLDG|55347', label: 'קניון מלחה ירושלים', detail: 'Учреждение' }),
      expect.objectContaining({ id: YAFO_42.id, label: 'יפו 42 ירושלים (מקור)', detail: 'כתובת ראשית' }),
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ searchText: 'קניון מלחה', language: 'he', isAccurate: false, maxResults: 5 })
    expect(mockedRedis.setex).toHaveBeenCalledWith('govmap:places:ru:קניון מלחה', 86_400, JSON.stringify(places))
  })

  it('searches in English for Latin text, caching an empty answer only briefly', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [] }))
    expect(await searchGovmapPlaces('Yafo', 'en')).toEqual([])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).language).toBe('en')
    expect(mockedRedis.setex).toHaveBeenCalledWith('govmap:places:en:yafo', 3_600, '[]')
  })

  it('returns null (uncached) on a transient failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}))
    expect(await searchGovmapPlaces('יפו', 'he')).toBeNull()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })
})
