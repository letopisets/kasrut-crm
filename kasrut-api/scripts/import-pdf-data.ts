import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { PDFParse } from 'pdf-parse'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

type FoodType = 'meat' | 'dairy' | 'pareve' | 'takeaway'
type CertStatus = 'ok' | 'warning' | 'critical'
type HechsherType = 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'
type DocumentCategory = 'Instructions' | 'Forms' | 'Regulations' | 'Pesach'

interface PdfText {
  name: string
  fullPath: string
  size: number
  text: string
  tables: string[][][]
}

interface AuthorityDraft {
  id: string
  name: string
  city: string
  contact: string
  phone: string
  email: string
  active: boolean
  color: string
}

interface HechsherDraft {
  id: string
  name: string
  shortName: string
  city: string
  contact: string
  phone: string
  email: string
  type: HechsherType
  color: string
  rabbanutId: string
}

interface MashgiachDraft {
  id: string
  name: string
  phone: string
  email: string
  area: string
  active: boolean
  rabbanutId: string
  hechsherIds: Set<string>
}

interface RestaurantDraft {
  name: string
  address: string
  city: string
  level: 'Regular' | 'Mehadrin'
  hechsherId: string
  mashgiachId: string
  kitniyot: string
  expires: Date
  status: CertStatus
  rabbanutId: string
  notes: string
  lastInspection: Date
  lat: number | null
  lng: number | null
  foodType: FoodType
  phone: string | null
  hours: string | null
}

interface RawRestaurant {
  source: string
  name: string
  address: string
  city: string
  authorityName: string
  hechsherName: string
  hechsherType?: HechsherType
  foodHint?: string
  level?: 'Regular' | 'Mehadrin'
  phone?: string
  mashgiachName?: string
  mashgiachPhone?: string
  expires?: Date
  notes?: string
}

interface DocumentDraft {
  id: string
  name: string
  category: DocumentCategory
  date: Date
  size: string
  ext: 'PDF'
  url: string
}

const DEFAULT_SOURCE_DIR = 'C:\\Users\\Admin\\OneDrive\\IT\\crm-kashrut'
const IMPORT_DATE = new Date()
const DEFAULT_EXPIRES = new Date('2026-12-31T00:00:00.000Z')
const DEFAULT_LAST_INSPECTION = new Date('2026-04-17T00:00:00.000Z')
const JERUSALEM_RABBANUT_ID = 'rb_jerusalem'

const COLORS = [
  '#3498DB',
  '#2ECC71',
  '#E74C3C',
  '#E8C96D',
  '#9B59B6',
  '#1ABC9C',
  '#F39C12',
  '#E67E22',
]

const PHONE_RE = /(?:\d{1}-\d{3}-\d{6}|1-800-\d{6}|0\d{1,2}[- ]?\d{3}[- ]?\d{4}|0\d{8,9}|1700\d{6,7}|\d{3,5}\s*\*|\*\s*\d{3,5})/g

const CITY_COORDS: Record<string, [number, number]> = {
  'אופקים': [31.3141, 34.6203],
  'אור יהודה': [32.0311, 34.8458],
  'אלעד': [32.0523, 34.9519],
  'אשקלון': [31.6688, 34.5743],
  'אשדוד': [31.8044, 34.6553],
  'בית אל': [31.9410, 35.2227],
  'בית שמש': [31.7514, 34.9885],
  'בית חלקיה': [31.7905, 34.8124],
  'ביתר': [31.6976, 35.1156],
  'ביתר עילית': [31.6976, 35.1156],
  'ביתר עלית': [31.6976, 35.1156],
  'באר שבע': [31.2520, 34.7915],
  'באר יעקב': [31.9430, 34.8390],
  'ב אר יעקב': [31.9430, 34.8390],
  'בני ברק': [32.0809, 34.8338],
  'גבעת שמואל': [32.0782, 34.8486],
  'חדרה': [32.4340, 34.9196],
  'חולון': [32.0158, 34.7874],
  'חיפה': [32.7940, 34.9896],
  'חצור': [32.9809, 35.5426],
  'חצור הגלילית': [32.9809, 35.5426],
  'ירושלים': [31.7683, 35.2137],
  'כפר חב"ד': [31.9877, 34.8519],
  'כפר חב״ד': [31.9877, 34.8519],
  'כפר סבא': [32.1782, 34.9076],
  'לוד': [31.9510, 34.8881],
  'מודיעין עלית קריית ספר': [31.9321, 35.0416],
  'מודיעין': [31.8980, 35.0100],
  'מעלה אדומים': [31.7774, 35.2986],
  'מירון': [32.9874, 35.4408],
  'מישור אדומים': [31.7820, 35.3352],
  'מגדל העמק': [32.6753, 35.2396],
  'נהריה': [33.0085, 35.0981],
  'נוף הגליל': [32.7019, 35.3033],
  'נתיבות': [31.4231, 34.5891],
  'נתניה': [32.3215, 34.8532],
  'עפולה': [32.6091, 35.2891],
  'עמנואל': [32.1620, 35.1370],
  'ערד': [31.2588, 35.2128],
  'פסגת זאב': [31.8306, 35.2403],
  'פתח תקוה': [32.0840, 34.8878],
  'פתח תקווה': [32.0840, 34.8878],
  'צפת': [32.9650, 35.4956],
  'קריית אתא': [32.8115, 35.1132],
  'קריית ביאליק': [32.8275, 35.0858],
  'קריית גת': [31.6090, 34.7642],
  'קריית ים': [32.8497, 35.0696],
  'קריית מלאכי': [31.7318, 34.7466],
  'קריית מוצקין': [32.8371, 35.0795],
  'קריית שמואל': [32.8387, 35.0710],
  'ראש העין': [32.0958, 34.9566],
  'ראשון לציון': [31.9730, 34.7925],
  'רעננה': [32.1848, 34.8713],
  'רחובות': [31.8948, 34.8113],
  'רמלה': [31.9292, 34.8656],
  'רמת גן': [32.0684, 34.8248],
  'שדרות': [31.5250, 34.5969],
  'שער בנימין': [31.8550, 35.2660],
  'שילת': [31.9193, 35.0143],
  'ספסופה': [33.0110, 35.4437],
  'הרצליה': [32.1663, 34.8433],
  'תל אביב': [32.0853, 34.7818],
  'אילת': [29.5577, 34.9519],
  'בת ים': [32.0171, 34.7454],
  'דלתון': [33.0167, 35.4882],
  'טבריה': [32.7959, 35.5310],
  'חריש': [32.4586, 35.0439],
  'כרמיאל': [32.9199, 35.2901],
}

class ImportBuilder {
  authorities = new Map<string, AuthorityDraft>()
  hechsherim = new Map<string, HechsherDraft>()
  mashgichim = new Map<string, MashgiachDraft>()
  restaurants = new Map<string, RestaurantDraft>()
  documents = new Map<string, DocumentDraft>()
  demoMashgiachId = 'm_import_default'

  ensureAuthority(input: {
    id?: string
    name: string
    city?: string
    contact?: string
    phone?: string
    email?: string
    color?: string
  }): AuthorityDraft {
    const id = input.id ?? idFor('rb', input.name)
    const existing = this.authorities.get(id)
    if (existing) return existing

    const authority: AuthorityDraft = {
      id,
      name: cleanText(input.name),
      city: cleanText(input.city ?? cityForAuthority(input.name)),
      contact: cleanText(input.contact ?? input.name),
      phone: cleanText(input.phone ?? ''),
      email: cleanText(input.email ?? `${id}@import.local`),
      active: true,
      color: input.color ?? COLORS[this.authorities.size % COLORS.length],
    }

    this.authorities.set(id, authority)
    return authority
  }

  ensureHechsher(input: {
    name: string
    authorityName: string
    city?: string
    type?: HechsherType
    color?: string
  }): HechsherDraft {
    const authority = this.ensureAuthority({
      name: input.authorityName,
      city: input.city ?? cityForAuthority(input.authorityName),
    })
    const id = idFor('h', `${authority.id}|${input.name}`)
    const existing = this.hechsherim.get(id)
    if (existing) return existing

    const hechsher: HechsherDraft = {
      id,
      name: cleanText(input.name),
      shortName: shortName(input.name),
      city: cleanText(input.city ?? authority.city),
      contact: authority.contact,
      phone: authority.phone,
      email: authority.email,
      type: input.type ?? inferHechsherType(input.name),
      color: input.color ?? authority.color,
      rabbanutId: authority.id,
    }

    this.hechsherim.set(id, hechsher)
    return hechsher
  }

  ensureMashgiach(input: {
    id?: string
    name?: string
    phone?: string
    area: string
    rabbanutId: string
    hechsherId: string
  }): MashgiachDraft {
    const phone = normalizePhone(input.phone ?? '')
    const name = cleanText(input.name || (phone ? `משגיח ${phone}` : 'משגיח יבוא'))
    const id = input.id ?? (phone ? idFor('m', phone) : idFor('m', `${input.rabbanutId}|${name}`))
    const existing = this.mashgichim.get(id)
    if (existing) {
      existing.hechsherIds.add(input.hechsherId)
      return existing
    }

    const mashgiach: MashgiachDraft = {
      id,
      name,
      phone,
      email: `${id}@import.local`,
      area: cleanText(input.area),
      active: true,
      rabbanutId: input.rabbanutId,
      hechsherIds: new Set([input.hechsherId]),
    }

    this.mashgichim.set(id, mashgiach)
    return mashgiach
  }

  addDocument(file: PdfText) {
    this.documents.set(idFor('d', file.name), {
      id: idFor('d', file.name),
      name: file.name.replace(/\.pdf$/i, ''),
      category: documentCategory(file.name),
      date: documentDate(file.name),
      size: formatSize(file.size),
      ext: 'PDF',
      url: file.fullPath,
    })
  }

  addRestaurant(raw: RawRestaurant) {
    const name = cleanText(raw.name)
    const city = normalizeCity(raw.city)
    const address = cleanText(raw.address)
    if (!isUsefulRestaurant(name, address, city)) return

    const authorityName = canonicalAuthority(raw.authorityName || raw.hechsherName)
    const hechsherName = canonicalHechsher(raw.hechsherName || authorityName)
    const hechsher = this.ensureHechsher({
      name: hechsherName,
      authorityName,
      city,
      type: raw.hechsherType ?? inferHechsherType(hechsherName),
    })
    const mashgiach = this.ensureMashgiach({
      name: raw.mashgiachName,
      phone: raw.mashgiachPhone,
      area: city,
      rabbanutId: hechsher.rabbanutId,
      hechsherId: hechsher.id,
      id: raw.mashgiachName || raw.mashgiachPhone ? undefined : this.demoMashgiachId,
    })
    const expires = raw.expires ?? DEFAULT_EXPIRES
    const coords = coordsFor(city, `${name}|${address}`)
    const notes = [
      `מקור: ${raw.source}`,
      raw.notes ? cleanText(raw.notes) : '',
      coords ? 'מיקום משוער לפי עיר; ניתן לתקן במפה.' : '',
    ].filter(Boolean).join(' | ')
    const key = normalizeKey(`${city}|${name}|${address}`)

    if (this.restaurants.has(key)) {
      const existing = this.restaurants.get(key)!
      existing.notes = mergeNotes(existing.notes, notes)
      if (!existing.phone && raw.phone) existing.phone = normalizePhone(raw.phone)
      return
    }

    this.restaurants.set(key, {
      name,
      address,
      city,
      level: raw.level ?? inferLevel(hechsherName, raw.foodHint),
      hechsherId: hechsher.id,
      mashgiachId: mashgiach.id,
      kitniyot: 'לא צוין',
      expires,
      status: calcStatus(expires),
      rabbanutId: hechsher.rabbanutId,
      notes,
      lastInspection: DEFAULT_LAST_INSPECTION,
      lat: coords?.[0] ?? null,
      lng: coords?.[1] ?? null,
      foodType: inferFoodType(raw.foodHint ?? `${name} ${raw.notes ?? ''}`),
      phone: raw.phone ? normalizePhone(raw.phone) : null,
      hours: null,
    })
  }
}

function parseArgs() {
  const sourceFlagIndex = process.argv.findIndex(arg => arg === '--source')
  const sourceFromFlag = sourceFlagIndex >= 0 ? process.argv[sourceFlagIndex + 1] : undefined
  const outFlagIndex = process.argv.findIndex(arg => arg === '--out')
  const outFromFlag = outFlagIndex >= 0 ? process.argv[outFlagIndex + 1] : undefined
  return {
    sourceDir: path.resolve(sourceFromFlag ?? process.env.PDF_SOURCE_DIR ?? DEFAULT_SOURCE_DIR),
    outDir: path.resolve(outFromFlag ?? process.env.PDF_EXPORT_DIR ?? path.join(process.cwd(), '..', 'docs', 'kashrut-export')),
    dryRun: process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true',
    exportFiles: process.argv.includes('--export') || process.env.npm_config_export === 'true',
  }
}

async function extractPdfs(sourceDir: string): Promise<PdfText[]> {
  const entries = fs.readdirSync(sourceDir)
    .filter(name => name.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b, 'he'))

  const pdfs: PdfText[] = []
  for (const name of entries) {
    const fullPath = path.join(sourceDir, name)
    const data = fs.readFileSync(fullPath)
    const parser = new PDFParse({ data })
    const textResult = await parser.getText()
    let tables: string[][][] = []
    try {
      const tableResult = await parser.getTable()
      tables = tableResult.pages.flatMap(page => page.tables ?? [])
    } catch {
      tables = []
    } finally {
      await parser.destroy()
    }
    pdfs.push({ name, fullPath, size: fs.statSync(fullPath).size, text: textResult.text, tables })
  }

  return pdfs
}

function parsePdfs(pdfs: PdfText[], builder: ImportBuilder) {
  for (const pdf of pdfs) {
    builder.addDocument(pdf)
    const before = builder.restaurants.size
    let parser = 'document-only'
    if (pdf.name.includes('עסקים בכשרות')) { parser = 'eilat'; parseEilat(pdf, builder) }
    else if (pdf.name.includes('מסעדות-7')) { parser = 'rubin'; parseRubin(pdf, builder) }
    else if (pdf.name.includes('נתניה')) { parser = 'netanya'; parseNetanya(pdf, builder) }
    else if (pdf.name.includes('מסעדות כשרות')) { parser = 'bat-yam'; parseBatYam(pdf, builder) }
    else if (pdf.name.includes('מאגר_מסעדות')) { parser = 'chabad'; parseChabad(pdf, builder) }
    if (process.env.DEBUG_IMPORT) {
      console.log(`${parser}: ${pdf.name} -> +${builder.restaurants.size - before}`)
    }
  }
}

function parseRubin(pdf: PdfText, builder: ImportBuilder) {
  for (const line of lines(pdf.text)) {
    if (!line.includes('\t')) continue
    const cols = splitColumns(line)
    if (cols.length < 5) continue
    if (cols[0] === 'עיר' || cols[0].includes('בס') || cols[0].includes('--')) continue

    const [city, name, foodHint, street, area, phone] = cols
    builder.addRestaurant({
      source: pdf.name,
      name,
      address: [street, area && area !== city ? area : ''].filter(Boolean).join(', '),
      city,
      authorityName: 'בד"ץ מהדרין הרב רובין',
      hechsherName: 'בד"ץ מהדרין הרב רובין',
      hechsherType: 'Badatz',
      level: 'Mehadrin',
      foodHint,
      phone,
      expires: DEFAULT_EXPIRES,
      notes: `סיווג: ${foodHint}`,
    })
  }
}

function parseEilat(pdf: PdfText, builder: ImportBuilder) {
  const inspectorByPhone = new Map<string, string>([
    ['0548018722', 'אופיר בר'],
    ['0536206782', 'איתן רגב'],
    ['0528751588', 'אליהו שיינבין'],
    ['0532834332', 'בר איפרגן'],
    ['0527205585', 'טל משה'],
    ['0546553346', 'מרדכי ביטון'],
    ['0534227362', 'עובדיה אליאס'],
    ['0533389062', 'עידו מזרחי'],
    ['0542888508', 'אהרון חי'],
    ['0509392012', 'ירחמיאל שניאור'],
  ])
  const inspectorStarts = ['אופיר', 'איתן', 'אליהו', 'א', 'בר', 'טל', 'מרדכי', 'עובדיה', 'עידו', 'אהרון', 'ירחמיאל']
  const pendingName: string[] = []

  for (const rawLine of lines(pdf.text)) {
    if (isNoiseLine(rawLine) || rawLine.includes('מפקחים')) continue
    const cols = splitColumns(rawLine)
    const phone = lastPhone(rawLine)
    const hasFood = cols.some(isFoodColumn)
    const hasKashrut = cols.some(col => col.includes('כשר') || col.includes('למהדרין'))

    if (phone && hasFood && hasKashrut) {
      const foodIdx = cols.findIndex(isFoodColumn)
      const nameFromLine = cols.slice(0, Math.max(foodIdx, 0)).join(' ')
      const name = cleanText([...pendingName, nameFromLine].filter(Boolean).join(' '))
      const kashrutIdx = cols.findIndex((col, idx) => idx >= foodIdx && (col.includes('כשר') || col.includes('למהדרין')))
      const tail = cols
        .slice(kashrutIdx + 1)
        .filter(col => col !== '-' && !extractPhones(col).length)
      const inspectorIndex = tail.findIndex(col => inspectorStarts.some(start => cleanText(col).startsWith(start)))
      const addressTokens = inspectorIndex >= 0 ? tail.slice(0, inspectorIndex) : tail.slice(0, Math.max(1, tail.length - 1))
      const normalizedPhone = digitsOnly(phone)

      builder.addRestaurant({
        source: pdf.name,
        name,
        address: addressTokens.join(' '),
        city: 'אילת',
        authorityName: 'רבנות אילת',
        hechsherName: 'רבנות אילת מהדרין',
        hechsherType: 'Mehadrin',
        level: 'Mehadrin',
        foodHint: cols[foodIdx],
        phone: undefined,
        mashgiachName: inspectorByPhone.get(normalizedPhone),
        mashgiachPhone: phone,
        expires: new Date('2026-07-01T00:00:00.000Z'),
        notes: `כשרות: כשר למהדרין`,
      })
      pendingName.length = 0
      continue
    }

    if (!hasKashrut && !extractPhones(rawLine).length && cols.length <= 3) {
      pendingName.push(cols.join(' '))
    }
  }
}

function parseNetanya(pdf: PdfText, builder: ImportBuilder) {
  let foodHint = ''
  let hechsherName = 'בד"ץ בהידור הכשרות - רבנות נתניה'

  for (const line of lines(pdf.text)) {
    const clean = cleanText(line)
    if (clean.includes("'מהדרין'") || clean.includes('מהדרין')) hechsherName = 'מהדרין - רבנות נתניה'
    if (isNetanyaCategory(clean)) foodHint = clean
    if (isNoiseLine(clean) || !line.includes('\t')) continue

    const phoneMatches = extractPhoneMatches(line)
    if (!phoneMatches.length) continue
    const firstPhone = phoneMatches[0].normalized
    const beforePhone = line.slice(0, phoneMatches[0].index).trim()
    const cols = splitColumns(beforePhone)
      .filter(col => col !== '-' && col !== '/' && !isHeaderToken(col))
    if (cols.length < 3) continue

    const rowFood = cols.find(isFoodColumn)
    const usable = cols.filter(col => !isFoodColumn(col))
    const address = usable.slice(-2).join(' ')
    const name = usable.slice(0, -2).join(' ')

    builder.addRestaurant({
      source: pdf.name,
      name,
      address,
      city: 'נתניה',
      authorityName: 'רבנות נתניה',
      hechsherName,
      hechsherType: hechsherName.includes('בד"ץ') ? 'Badatz' : 'Mehadrin',
      level: 'Mehadrin',
      foodHint: rowFood ?? foodHint,
      phone: firstPhone,
      mashgiachPhone: phoneMatches[1]?.normalized ?? firstPhone,
      expires: DEFAULT_EXPIRES,
      notes: foodHint ? `ענף: ${foodHint}` : undefined,
    })
  }
}

function parseBatYam(pdf: PdfText, builder: ImportBuilder) {
  for (const table of pdf.tables) {
    for (const row of table.slice(1)) {
      if (row.length < 7) continue
      const [mashgiachPhone, mashgiachName, foodHint, extraKashrut, levelText, address, name] = row.map(cleanText)
      if (!name || !address || name === 'שם העסק') continue
      const hechsherName = extraKashrut || 'רבנות בת ים'

      builder.addRestaurant({
        source: pdf.name,
        name,
        address,
        city: 'בת ים',
        authorityName: hechsherName.includes('בית') ? 'בד"ץ בית יוסף' : 'רבנות בת ים',
        hechsherName,
        hechsherType: inferHechsherType(hechsherName),
        level: levelText.includes('מהדרין') ? 'Mehadrin' : 'Regular',
        foodHint,
        mashgiachName,
        mashgiachPhone,
        expires: DEFAULT_EXPIRES,
        notes: levelText,
      })
    }
  }
}

function parseChabad(pdf: PdfText, builder: ImportBuilder) {
  let city = ''
  let buffer = ''

  const flush = () => {
    if (!buffer) return
    const item = cleanText(buffer.replace(/^•\s*/, ''))
    buffer = ''
    const separator = item.search(/\s[-–]\s/)
    if (separator < 1 || !city) return

    const name = item.slice(0, separator)
    const rest = item.slice(separator + 3)
    const phones = extractPhones(rest)
    const parts = rest.split(',').map(cleanText).filter(Boolean)
    const address = parts[0] ?? ''
    const hechsherName = inferChabadHechsher(item)
    const foodHint = parts.find(part => isFoodColumn(part)) ?? item

    builder.addRestaurant({
      source: pdf.name,
      name,
      address,
      city,
      authorityName: canonicalAuthority(hechsherName),
      hechsherName,
      hechsherType: inferHechsherType(hechsherName),
      level: 'Mehadrin',
      foodHint,
      phone: phones[0],
      expires: new Date('2026-04-30T00:00:00.000Z'),
      notes: item,
    })
  }

  for (const line of lines(pdf.text)) {
    if (isNoiseLine(line) || line === 'בס"ד') continue
    if (line.startsWith('•')) {
      flush()
      buffer = line
      continue
    }
    if (isCityHeading(line)) {
      flush()
      city = normalizeCity(line.replace(/:$/, ''))
      continue
    }
    if (buffer) buffer += ` ${line}`
  }
  flush()
}

async function loadIntoDatabase(builder: ImportBuilder) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing in kasrut-api/.env')
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

  try {
    const demoUser = await prisma.user.findUnique({
      where: { email: 'cohen@jer.il' },
      select: { id: true, name: true },
    })
    if (demoUser) {
      const demo = builder.mashgichim.get(builder.demoMashgiachId)
      if (demo) {
        builder.mashgichim.delete(builder.demoMashgiachId)
        demo.id = demoUser.id
        demo.name = demoUser.name || demo.name
        demo.email = `${demoUser.id}@import.local`
        builder.demoMashgiachId = demoUser.id
        builder.mashgichim.set(demo.id, demo)
        for (const restaurant of builder.restaurants.values()) {
          if (restaurant.mashgiachId === 'm_import_default') restaurant.mashgiachId = demo.id
        }
      }
    }

    await prisma.$transaction(async tx => {
      await tx.inspection.deleteMany()
      await tx.mashgiachHechsher.deleteMany()
      await tx.restaurant.deleteMany()
      await tx.mashgiach.deleteMany()
      await tx.hechsher.deleteMany()
      await tx.kashrutDocument.deleteMany()
      await tx.rabbanut.deleteMany()

      await tx.rabbanut.createMany({ data: [...builder.authorities.values()] })
      await tx.user.updateMany({
        where: { email: { in: ['admin@jer.il', 'cohen@jer.il'] } },
        data: { rabbanutId: JERUSALEM_RABBANUT_ID },
      })
      await tx.hechsher.createMany({
        data: [...builder.hechsherim.values()].map(h => ({
          id: h.id,
          name: h.name,
          shortName: h.shortName,
          city: h.city,
          contact: h.contact,
          phone: h.phone,
          email: h.email,
          type: h.type,
          color: h.color,
          rabbanutId: h.rabbanutId,
        })),
      })
      await tx.mashgiach.createMany({
        data: [...builder.mashgichim.values()].map(m => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          area: m.area,
          active: m.active,
          rabbanutId: m.rabbanutId,
        })),
      })

      const joins = [...builder.mashgichim.values()].flatMap(m =>
        [...m.hechsherIds].map(hechsherId => ({ mashgiachId: m.id, hechsherId })),
      )
      if (joins.length) await tx.mashgiachHechsher.createMany({ data: joins, skipDuplicates: true })

      await tx.restaurant.createMany({
        data: [...builder.restaurants.values()].map(r => ({
          name: r.name,
          address: r.address,
          city: r.city,
          level: r.level,
          hechsherId: r.hechsherId,
          mashgiachId: r.mashgiachId,
          kitniyot: r.kitniyot,
          expires: r.expires,
          status: r.status,
          rabbanutId: r.rabbanutId,
          notes: r.notes,
          lat: r.lat,
          lng: r.lng,
          foodType: r.foodType,
          phone: r.phone,
          hours: r.hours,
        })),
      })

      await tx.kashrutDocument.createMany({ data: [...builder.documents.values()] })
    }, { timeout: 60_000 })
  } finally {
    await prisma.$disconnect()
  }
}

function exportParsedData(builder: ImportBuilder, sourceDir: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  const authorities = [...builder.authorities.values()].map(row => ({
    id: row.id,
    name: row.name,
    city: row.city,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    active: String(row.active),
    color: row.color,
  }))
  const hechsherim = [...builder.hechsherim.values()].map(row => ({
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    city: row.city,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    type: row.type,
    color: row.color,
    rabbanutId: row.rabbanutId,
  }))
  const mashgichim = [...builder.mashgichim.values()].map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    area: row.area,
    active: String(row.active),
    rabbanutId: row.rabbanutId,
  }))
  const mashgiachHechsher = [...builder.mashgichim.values()].flatMap(row =>
    [...row.hechsherIds].map(hechsherId => ({
      mashgiachId: row.id,
      hechsherId,
    })),
  )
  const restaurants = [...builder.restaurants.entries()].map(([key, row]) => ({
    id: idFor('r', key),
    name: row.name,
    address: row.address,
    city: row.city,
    level: row.level,
    hechsherId: row.hechsherId,
    mashgiachId: row.mashgiachId,
    kitniyot: row.kitniyot,
    expires: row.expires.toISOString(),
    status: row.status,
    rabbanutId: row.rabbanutId,
    notes: row.notes,
    lastInspection: row.lastInspection.toISOString(),
    lat: row.lat,
    lng: row.lng,
    foodType: row.foodType,
    phone: row.phone,
    hours: row.hours,
  }))
  const documents = [...builder.documents.values()].map(row => ({
    id: row.id,
    name: row.name,
    category: row.category,
    date: row.date.toISOString(),
    size: row.size,
    ext: row.ext,
    url: row.url,
  }))

  const exports = [
    ['rabbanuts', authorities],
    ['hechsherim', hechsherim],
    ['mashgichim', mashgichim],
    ['mashgiach_hechsher', mashgiachHechsher],
    ['restaurants', restaurants],
    ['documents', documents],
  ] as const

  for (const [name, rows] of exports) {
    fs.writeFileSync(path.join(outDir, `${name}.csv`), csv(rows), 'utf8')
    fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  }
  fs.writeFileSync(path.join(outDir, 'import.sql'), buildImportSql({
    authorities,
    hechsherim,
    mashgichim,
    mashgiachHechsher,
    restaurants,
    documents,
  }), 'utf8')

  const byCity = groupCount(restaurants, row => row.city)
  const bySource = groupCount(restaurants, row => {
    const match = row.notes.match(/מקור: ([^|]+)/)
    return match?.[1]?.trim() || 'unknown'
  })
  const byFoodType = groupCount(restaurants, row => row.foodType)

  const summary = [
    '# Kashrut PDF Export',
    '',
    `Source directory: \`${sourceDir}\``,
    `Generated at: \`${new Date().toISOString()}\``,
    '',
    '## Tables',
    '',
    markdownTable([
      { table: 'rabbanuts', rows: authorities.length },
      { table: 'hechsherim', rows: hechsherim.length },
      { table: 'mashgichim', rows: mashgichim.length },
      { table: 'mashgiach_hechsher', rows: mashgiachHechsher.length },
      { table: 'restaurants', rows: restaurants.length },
      { table: 'documents', rows: documents.length },
    ]),
    '',
    '## Restaurants by Source',
    '',
    markdownTable(bySource.slice(0, 50).map(([source, rows]) => ({ source, rows }))),
    '',
    '## Top Cities',
    '',
    markdownTable(byCity.slice(0, 50).map(([city, rows]) => ({ city, rows }))),
    '',
    '## Food Types',
    '',
    markdownTable(byFoodType.map(([foodType, rows]) => ({ foodType, rows }))),
    '',
    '## Exported Files',
    '',
    ...exports.flatMap(([name]) => [`- \`${name}.csv\``, `- \`${name}.json\``]),
    '- `import.sql`',
    '',
  ].join('\n')

  fs.writeFileSync(path.join(outDir, 'README.md'), summary, 'utf8')
  console.log(`Exported parsed data to ${outDir}`)
}

function buildImportSql(data: {
  authorities: Array<Record<string, unknown>>
  hechsherim: Array<Record<string, unknown>>
  mashgichim: Array<Record<string, unknown>>
  mashgiachHechsher: Array<Record<string, unknown>>
  restaurants: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
}) {
  return [
    '-- Generated by kasrut-api/scripts/import-pdf-data.ts',
    `-- Generated at ${new Date().toISOString()}`,
    'BEGIN;',
    'SET CONSTRAINTS ALL DEFERRED;',
    'DELETE FROM "inspections";',
    'DELETE FROM "mashgiach_hechsher";',
    'DELETE FROM "restaurants";',
    'DELETE FROM "mashgichim";',
    'DELETE FROM "hechsherim";',
    'DELETE FROM "documents";',
    'DELETE FROM "rabbanuts";',
    insertSql('rabbanuts', ['id', 'name', 'city', 'contact', 'phone', 'email', 'active', 'color'], data.authorities),
    `UPDATE "users" SET "rabbanutId" = ${sqlValue(JERUSALEM_RABBANUT_ID)} WHERE "email" IN ('admin@jer.il', 'cohen@jer.il');`,
    insertSql('hechsherim', ['id', 'name', 'shortName', 'city', 'contact', 'phone', 'email', 'type', 'color', 'rabbanutId'], data.hechsherim),
    insertSql('mashgichim', ['id', 'name', 'phone', 'email', 'area', 'active', 'rabbanutId'], data.mashgichim),
    insertSql('mashgiach_hechsher', ['mashgiachId', 'hechsherId'], data.mashgiachHechsher),
    insertSql('restaurants', [
      'id',
      'name',
      'address',
      'city',
      'level',
      'hechsherId',
      'mashgiachId',
      'kitniyot',
      'expires',
      'status',
      'rabbanutId',
      'notes',
      'lastInspection',
      'lat',
      'lng',
      'foodType',
      'phone',
      'hours',
    ], data.restaurants),
    insertSql('documents', ['id', 'name', 'category', 'date', 'size', 'ext', 'url'], data.documents),
    'COMMIT;',
    '',
  ].filter(Boolean).join('\n')
}

function insertSql(table: string, columns: string[], rows: Array<Record<string, unknown>>) {
  if (!rows.length) return ''
  const values = rows.map(row => `(${columns.map(column => sqlValue(row[column])).join(', ')})`)
  return [
    `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES`,
    `${values.join(',\n')};`,
  ].join('\n')
}

function sqlValue(value: unknown) {
  if (value == null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  const text = String(value)
  if (text === 'true' || text === 'false') return text.toUpperCase()
  return `'${text.replace(/'/g, "''")}'`
}

function csv<T extends Record<string, unknown>>(rows: T[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const body = rows.map(row => headers.map(header => csvCell(row[header])).join(','))
  return `\ufeff${headers.join(',')}\n${body.join('\n')}\n`
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function markdownTable<T extends Record<string, unknown>>(rows: T[]) {
  if (!rows.length) return '_No rows._'
  const headers = Object.keys(rows[0])
  const header = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map(row => `| ${headers.map(key => markdownCell(row[key])).join(' | ')} |`)
  return [header, separator, ...body].join('\n')
}

function markdownCell(value: unknown) {
  return String(value ?? '').replace(/\|/g, '\\|')
}

function groupCount<T>(rows: T[], keyFor: (row: T) => string) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyFor(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))
}

function bootstrapStaticData(builder: ImportBuilder) {
  builder.ensureAuthority({
    id: JERUSALEM_RABBANUT_ID,
    name: 'רבנות ירושלים',
    city: 'ירושלים',
    contact: 'מחלקת כשרות ירושלים',
    phone: '02-0000000',
    email: 'jerusalem@import.local',
    color: '#3498DB',
  })
  builder.ensureHechsher({
    name: 'רבנות ירושלים',
    authorityName: 'רבנות ירושלים',
    city: 'ירושלים',
    type: 'Rabbanut',
  })
}

function printSummary(builder: ImportBuilder, dryRun: boolean) {
  const byCity = new Map<string, number>()
  const bySource = new Map<string, number>()
  for (const r of builder.restaurants.values()) {
    byCity.set(r.city, (byCity.get(r.city) ?? 0) + 1)
    const source = r.notes.match(/מקור: ([^|]+)/)?.[1]?.trim() ?? 'unknown'
    bySource.set(source, (bySource.get(source) ?? 0) + 1)
  }
  const topCities = [...byCity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([city, count]) => `${city}: ${count}`)
    .join(', ')
  const sources = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `${source}: ${count}`)
    .join(', ')

  console.log(`${dryRun ? 'Dry run' : 'Import'} summary`)
  console.log(`Rabbanuts: ${builder.authorities.size}`)
  console.log(`Hechsherim: ${builder.hechsherim.size}`)
  console.log(`Mashgichim: ${builder.mashgichim.size}`)
  console.log(`Restaurants: ${builder.restaurants.size}`)
  console.log(`Documents: ${builder.documents.size}`)
  console.log(`Top cities: ${topCities}`)
  console.log(`Sources: ${sources}`)
}

function lines(text: string) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
}

function splitColumns(line: string) {
  return line.split('\t').map(cleanText).filter(Boolean)
}

function cleanLine(value: string | undefined) {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u00f0/g, 'נ')
    .trim()
}

function cleanText(value: string | undefined) {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u00f0/g, 'נ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .trim()
}

function normalizeCity(value: string) {
  const city = cleanText(value)
  const aliases: Record<string, string> = {
    'י ברקנב': 'בני ברק',
    'תיבותנ': 'נתיבות',
    'ביתר': 'ביתר עילית',
  }
  return aliases[city] ?? city
}

function normalizeKey(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/["'״׳]/g, '')
    .replace(/\s+/g, ' ')
}

function idFor(prefix: string, key: string) {
  return `${prefix}_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 14)}`
}

function shortName(name: string) {
  const clean = cleanText(name)
  return clean.length > 24 ? clean.slice(0, 24) : clean
}

function calcStatus(expires: Date): CertStatus {
  const days = Math.floor((expires.getTime() - IMPORT_DATE.getTime()) / 86_400_000)
  if (days < 0) return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

function isUsefulRestaurant(name: string, address: string, city: string) {
  if (name.length < 2 || city.length < 2) return false
  if (name.includes('שם העסק') || city.includes('עמוד')) return false
  const garbageChars = (name.match(/[ֈ�]/g) ?? []).length
  if (garbageChars > 0 && garbageChars / name.length > 0.25) return false
  return address.length >= 1
}

function isNoiseLine(line: string) {
  return !line
    || line.startsWith('-- ')
    || line.includes('עמוד')
    || line.includes('שם העסק')
    || line.includes('טלפון')
    || line.includes('נייד משגיח')
    || line.includes('בית העסק')
    || line.includes('בס"ד')
    || line.includes('רשימה זו מתעדכנת')
}

function isHeaderToken(value: string) {
  return ['ענף', 'מחלקה', 'פירוט', 'כתובת', 'שם', 'בית', 'העסק'].includes(value)
}

function isFoodColumn(value: string) {
  return /(בשרי|חלבי|פרווה|פרוה|פיצה|גליד|מאפייה|מאפיה|סושי|דגים|פלאפל|חומוס|קייטרינג|אוכל מוכן|קצביה)/.test(value)
}

function inferFoodType(hint: string): FoodType {
  const text = cleanText(hint)
  if (/קייטרינג|אוכל מוכן|שבת/.test(text)) return 'takeaway'
  if (/בשר|שווארמה|גריל|סטייק|המבורג|בורגר|שניצל|קצב/.test(text)) return 'meat'
  if (/חלבי|פיצה|גליד|קפה|בייגל|מאפה|מאפייה|מאפיה|חלב/.test(text)) return 'dairy'
  return 'pareve'
}

function inferLevel(hechsher: string, hint?: string): 'Regular' | 'Mehadrin' {
  const text = `${hechsher} ${hint ?? ''}`
  return /מהדרין|בד"?ץ|העדה|לנדא|חב"ד|חב״ד/.test(text) ? 'Mehadrin' : 'Regular'
}

function inferHechsherType(name: string): HechsherType {
  if (/בד"?ץ|העדה|לנדא|בית יוסף|רובין|הרבנים/.test(name)) return 'Badatz'
  if (/מהדרין|חב"ד|חב״ד/.test(name)) return 'Mehadrin'
  if (/פרטי|Private/i.test(name)) return 'Private'
  return 'Rabbanut'
}

function canonicalHechsher(name: string) {
  const clean = cleanText(name)
  if (/העדה/.test(clean)) return 'בד"ץ העדה החרדית'
  if (/לנדא/.test(clean)) return 'בד"ץ לנדא'
  if (/חב"ד|חב״ד/.test(clean)) return 'כשרות חב"ד'
  if (/הרבנים/.test(clean)) return 'בד"ץ הרבנים'
  if (/בית\s*יוסף/.test(clean)) return 'בד"ץ בית יוסף'
  return clean
}

function canonicalAuthority(name: string) {
  const hechsher = canonicalHechsher(name)
  if (hechsher === 'בד"ץ העדה החרדית') return 'בד"ץ העדה החרדית'
  if (hechsher === 'בד"ץ לנדא') return 'בד"ץ לנדא'
  if (hechsher === 'כשרות חב"ד') return 'כשרות חב"ד'
  if (hechsher === 'בד"ץ הרבנים') return 'בד"ץ הרבנים'
  if (hechsher === 'בד"ץ בית יוסף') return 'בד"ץ בית יוסף'
  if (/רובין/.test(hechsher)) return 'בד"ץ מהדרין הרב רובין'
  return cleanText(name)
}

function cityForAuthority(name: string) {
  if (/אילת/.test(name)) return 'אילת'
  if (/נתניה/.test(name)) return 'נתניה'
  if (/בת ים/.test(name)) return 'בת ים'
  if (/ירושלים|העדה/.test(name)) return 'ירושלים'
  if (/לנדא|רובין/.test(name)) return 'בני ברק'
  return 'ישראל'
}

function inferChabadHechsher(item: string) {
  if (/העדה/.test(item)) return 'בד"ץ העדה החרדית'
  if (/לנדא/.test(item)) return 'בד"ץ לנדא'
  if (/חב"ד|חב״ד/.test(item)) return 'כשרות חב"ד'
  if (/הרבנים/.test(item)) return 'בד"ץ הרבנים'
  if (/רובין/.test(item)) return 'בד"ץ מהדרין הרב רובין'
  return 'כשרות חב"ד'
}

function isNetanyaCategory(line: string) {
  return [
    'מאפיות',
    'קונדיטוריות',
    'בשרי',
    'חלבי',
    'פיצריות',
    'פלאפל',
    'מזון מהיר',
    'מפעלים',
    'קצביה',
  ].some(token => line === token || line.includes(token))
}

function isCityHeading(line: string) {
  if (!line.endsWith(':')) return false
  if (line.includes('אזור') || line.length > 32) return false
  return /^[\u0590-\u05FF\s'"״׳-]+:$/.test(line)
}

function extractPhones(value: string) {
  return extractPhoneMatches(value).map(match => match.normalized)
}

function extractPhoneMatches(value: string) {
  return [...value.matchAll(PHONE_RE)].map(match => ({
    raw: match[0],
    normalized: normalizePhone(match[0]),
    index: match.index ?? 0,
  }))
}

function lastPhone(value: string) {
  const phones = extractPhones(value)
  return phones[phones.length - 1]
}

function normalizePhone(value: string) {
  const clean = cleanText(value).replace(/\s+/g, '')
  if (!clean) return ''
  if (clean.endsWith('*')) return `*${clean.replace('*', '')}`
  if (clean.startsWith('*')) return clean
  return clean
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function coordsFor(city: string, key: string): [number, number] | null {
  const base = CITY_COORDS[normalizeCity(city)]
  if (!base) return null
  const hash = crypto.createHash('sha1').update(key).digest('hex')
  const a = parseInt(hash.slice(0, 8), 16) / 0xffffffff
  const b = parseInt(hash.slice(8, 16), 16) / 0xffffffff
  const lat = base[0] + (a - 0.5) * 0.035
  const lng = base[1] + (b - 0.5) * 0.035
  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
}

function mergeNotes(a: string, b: string) {
  const parts = new Set([...a.split(' | '), ...b.split(' | ')].map(cleanText).filter(Boolean))
  return [...parts].join(' | ')
}

function documentCategory(name: string): DocumentCategory {
  if (name.includes('פסח')) return 'Pesach'
  if (name.includes('רבנים')) return 'Regulations'
  if (name.includes('עסקים') || name.includes('מסעדות')) return 'Instructions'
  return 'Instructions'
}

function documentDate(name: string) {
  if (name.includes('17.03.24')) return new Date('2024-03-17T00:00:00.000Z')
  if (name.includes('פסח תשפו')) return new Date('2026-01-08T00:00:00.000Z')
  if (name.includes('כסלו תשפו') || name.includes('נתניה')) return new Date('2025-11-21T00:00:00.000Z')
  if (name.includes("תשפ''ה") || name.includes('תשפה')) return new Date('2025-07-01T00:00:00.000Z')
  return DEFAULT_LAST_INSPECTION
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function main() {
  const { sourceDir, outDir, dryRun, exportFiles } = parseArgs()
  const builder = new ImportBuilder()
  bootstrapStaticData(builder)

  const pdfs = await extractPdfs(sourceDir)
  parsePdfs(pdfs, builder)
  printSummary(builder, dryRun)

  if (exportFiles) {
    exportParsedData(builder, sourceDir, outDir)
  }

  if (!dryRun) {
    await loadIntoDatabase(builder)
    console.log('PDF import complete')
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
