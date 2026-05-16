/**
 * Seed Country + Settlement tables from GeoNames IL.txt dump.
 *
 * Download: https://download.geonames.org/export/dump/IL.zip
 * Extract IL.txt to kasrut-api/prisma/IL.txt before running.
 *
 * Usage:
 *   npm run seed:settlements
 *
 * GeoNames tab-separated columns:
 * 0  geonameid   1  name        2  asciiname   3  alternatenames
 * 4  latitude    5  longitude   6  feature_class  7  feature_code
 * 8  country_code 9 cc2        10 admin1_code  11 admin2_code
 * 12 admin3_code 13 admin4_code 14 population  15 elevation
 * 16 dem        17 timezone    18 modification_date
 */

import 'dotenv/config'
import fs   from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

// GeoNames feature codes we treat as settlements
const PLACE_CODES = new Set([
  'PPL',   // populated place
  'PPLA',  // seat of first-order admin division
  'PPLA2', // seat of second-order admin div
  'PPLA3',
  'PPLC',  // capital
  'PPLX',  // section of populated place
  'PPLG',  // seat of government
])

function guessType(code: string): string {
  if (code === 'PPLC')  return 'city'
  if (code.startsWith('PPLA')) return 'city'
  if (code === 'PPL')   return 'village'
  return 'city'
}

interface SettlementRow {
  id:          string
  nameHe:      string | null
  nameEn:      string
  nameRu:      string | null
  lat:         number
  lng:         number
  type:        string
  countryCode: string
}

async function parseLine(line: string): Promise<SettlementRow | null> {
  const cols = line.split('\t')
  if (cols.length < 19) return null

  const featureCode = cols[7].trim()
  if (!PLACE_CODES.has(featureCode)) return null

  const id          = cols[0].trim()
  const nameEn      = cols[1].trim()
  const lat         = parseFloat(cols[4])
  const lng         = parseFloat(cols[5])
  const countryCode = cols[8].trim().toUpperCase()
  const alternates  = cols[3].trim()

  let nameHe: string | null = null
  let nameRu: string | null = null

  // Alternate names is a comma-separated list; some entries look like "he:ירושלים"
  // but in practice the raw IL.txt just lists names without language tags.
  // We look for Hebrew script (Unicode block 0590–05FF) and Cyrillic.
  for (const alt of alternates.split(',')) {
    const trimmed = alt.trim()
    if (!trimmed) continue
    if (!nameHe && /[֐-׿]/.test(trimmed)) nameHe = trimmed
    if (!nameRu && /[Ѐ-ӿ]/.test(trimmed)) nameRu = trimmed
  }

  return {
    id,
    nameHe: nameHe ?? nameEn,
    nameEn,
    nameRu,
    lat,
    lng,
    type:        guessType(featureCode),
    countryCode,
  }
}

async function main() {
  const txtPath = path.join(__dirname, 'IL.txt')
  if (!fs.existsSync(txtPath)) {
    console.error('IL.txt not found. Download from https://download.geonames.org/export/dump/IL.zip and extract here.')
    process.exit(1)
  }

  // Upsert country
  await prisma.country.upsert({
    where:  { code: 'IL' },
    update: { nameEn: 'Israel' },
    create: { code: 'IL', nameEn: 'Israel' },
  })

  const rl = readline.createInterface({ input: fs.createReadStream(txtPath), crlfDelay: Infinity })

  let count   = 0
  let skipped = 0
  const batch: SettlementRow[] = []

  const flush = async () => {
    if (!batch.length) return
    await prisma.$transaction(
      batch.map(row =>
        prisma.settlement.upsert({
          where:  { id: row.id },
          update: { nameHe: row.nameHe ?? row.nameEn, nameEn: row.nameEn, nameRu: row.nameRu, lat: row.lat, lng: row.lng, type: row.type },
          create: { ...row },
        }),
      ),
    )
    count += batch.length
    batch.length = 0
    process.stdout.write(`\rSeeded ${count} settlements…`)
  }

  for await (const line of rl) {
    const row = await parseLine(line)
    if (!row) { skipped++; continue }
    batch.push(row)
    if (batch.length >= 200) await flush()
  }
  await flush()

  console.log(`\nDone. Seeded ${count} settlements, skipped ${skipped} non-place rows.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
