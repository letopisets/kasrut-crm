import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg }     from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const HASH = bcrypt.hashSync('password', 8)

async function main() {
  // ── Wipe in dependency order ───────────────────────────────────────────────
  await prisma.inspection.deleteMany()
  await prisma.mashgiachHechsher.deleteMany()
  await prisma.restaurant.deleteMany()
  await prisma.mashgiach.deleteMany()
  await prisma.hechsher.deleteMany()
  await prisma.user.deleteMany()
  await prisma.kashrutDocument.deleteMany()
  await prisma.rabbanut.deleteMany()

  // ── Rabbanuts ──────────────────────────────────────────────────────────────
  const rb1 = await prisma.rabbanut.create({ data: { id: 'rb1', name: 'Rabbanut Jerusalem', city: 'Jerusalem', contact: 'Rav Goldberg', phone: '02-6700100', email: 'kashrut@jer.il',   active: true,  color: '#3498DB' } })
  const rb2 = await prisma.rabbanut.create({ data: { id: 'rb2', name: 'Rabbanut Haifa',     city: 'Haifa',     contact: 'Rav Cohen',    phone: '04-8867000', email: 'kashrut@haifa.il', active: true,  color: '#2ECC71' } })
  await       prisma.rabbanut.create({ data: { id: 'rb3', name: 'Rabbanut Tel Aviv',  city: 'Tel Aviv',  contact: 'Rav Levi',     phone: '03-5551234', email: 'kashrut@tlv.il',   active: false, color: '#9B59B6' } })

  // ── Users ──────────────────────────────────────────────────────────────────
  await prisma.user.createMany({ data: [
    { id: 'u1', name: 'System Owner',    email: 'owner@kashrut.il', passwordHash: HASH, role: 'owner' },
    { id: 'u2', name: 'Admin Jerusalem', email: 'admin@jer.il',     passwordHash: HASH, role: 'rabbanut',  rabbanutId: rb1.id },
    { id: 'u3', name: 'Р. Коэн',         email: 'cohen@jer.il',     passwordHash: HASH, role: 'mashgiach', rabbanutId: rb1.id },
  ] })

  // ── Hechsherim ─────────────────────────────────────────────────────────────
  await prisma.hechsher.createMany({ data: [
    { id: 'h1', name: 'Rabbanut Jerusalem',    shortName: 'רבנות י-ם',  city: 'Jerusalem', contact: 'Rav Goldberg', phone: '02-6700100', email: 'kashrut@jer.il',    type: 'Rabbanut', color: '#3498DB', rabbanutId: rb1.id },
    { id: 'h2', name: 'Badatz Eda Hacharedit', shortName: 'בד"ץ העדה',  city: 'Jerusalem', contact: 'Rav Weiss',    phone: '02-6700200', email: 'vaad@edah.il',       type: 'Badatz',   color: '#E74C3C', rabbanutId: rb1.id },
    { id: 'h3', name: 'Rabbanut Haifa',        shortName: 'רבנות חיפה', city: 'Haifa',     contact: 'Rav Cohen',    phone: '04-8867000', email: 'kashrut@haifa.il',   type: 'Rabbanut', color: '#2ECC71', rabbanutId: rb2.id },
    { id: 'h4', name: 'Badatz Beit Yosef',     shortName: 'בד"ץ ב"י',  city: 'Jerusalem', contact: 'Rav Yosef',    phone: '02-5382832', email: 'info@beityosef.il',  type: 'Badatz',   color: '#9B59B6', rabbanutId: rb1.id },
    { id: 'h5', name: 'Chief Rabbinate',       shortName: 'הרה"ר',      city: 'Jerusalem', contact: 'Rav Adiriya', phone: '02-9705149', email: 'adiryap@rab.gov.il', type: 'Rabbanut', color: '#E8C96D', rabbanutId: rb1.id },
  ] })

  // ── Mashgichim ─────────────────────────────────────────────────────────────
  const [m1, m2, m3, m4] = await Promise.all([
    prisma.mashgiach.create({ data: { id: 'm1', name: 'Р. Коэн',    phone: '050-1234567', email: 'cohen@rabbanut.il', area: 'Jerusalem Center', active: true,  rabbanutId: rb1.id, hechsherim: { create: [{ hechsherId: 'h1' }, { hechsherId: 'h5' }] } } }),
    prisma.mashgiach.create({ data: { id: 'm2', name: 'Р. Леви',    phone: '052-9876543', email: 'levi@rabbanut.il',  area: 'Jerusalem North',  active: true,  rabbanutId: rb1.id, hechsherim: { create: [{ hechsherId: 'h1' }] } } }),
    prisma.mashgiach.create({ data: { id: 'm3', name: 'Р. Фридман', phone: '054-5551234', email: 'fridman@haifa.il',  area: 'Haifa',            active: true,  rabbanutId: rb2.id, hechsherim: { create: [{ hechsherId: 'h3' }, { hechsherId: 'h4' }] } } }),
    prisma.mashgiach.create({ data: { id: 'm4', name: 'Р. Берг',    phone: '058-7774321', email: 'berg@jer.il',       area: 'North District',   active: false, rabbanutId: rb1.id, hechsherim: { create: [{ hechsherId: 'h2' }] } } }),
  ])

  // ── Restaurants ────────────────────────────────────────────────────────────
  await prisma.restaurant.createMany({ data: [
    { id: 'r1', name: 'מסעדת הגורמה',     address: "רח' יפו 42",      city: 'Jerusalem', level: 'Mehadrin', hechsherId: 'h1', mashgiachId: m1.id, kitniyot: 'ללא חשש קטניות', expires: new Date('2026-03-15'), status: 'warning',  lastInspection: new Date('2026-01-20'), notes: '',                   rabbanutId: rb1.id },
    { id: 'r2', name: 'בית האוכל המרכזי', address: "רח' בן יהודה 18", city: 'Jerusalem', level: 'Regular',  hechsherId: 'h2', mashgiachId: m2.id, kitniyot: 'מכיל קטניות',     expires: new Date('2026-06-30'), status: 'ok',       lastInspection: new Date('2026-02-01'), notes: '',                   rabbanutId: rb1.id },
    { id: 'r3', name: 'מסעדת צפון',       address: "שד' הרצל 55",     city: 'Haifa',     level: 'Mehadrin', hechsherId: 'h4', mashgiachId: m3.id, kitniyot: 'ללא חשש קטניות', expires: new Date('2026-02-28'), status: 'critical', lastInspection: new Date('2025-12-15'), notes: 'Requires attention', rabbanutId: rb2.id },
    { id: 'r4', name: 'פיצה שמש',         address: "רח' גאולה 31",    city: 'Haifa',     level: 'Regular',  hechsherId: 'h3', mashgiachId: m1.id, kitniyot: 'מכיל קטניות',     expires: new Date('2026-08-10'), status: 'ok',       lastInspection: new Date('2026-01-30'), notes: '',                   rabbanutId: rb2.id },
    { id: 'r5', name: 'המאפייה העתיקה',   address: "רח' ירושלים 17",  city: 'Tzfat',     level: 'Mehadrin', hechsherId: 'h5', mashgiachId: m4.id, kitniyot: 'ללא חשש קטניות', expires: new Date('2026-04-01'), status: 'warning',  lastInspection: new Date('2026-01-10'), notes: '',                   rabbanutId: rb1.id },
    { id: 'r6', name: 'מלון כנרות',       address: "רח' זיידל 9",     city: 'Tiberias',  level: 'Mehadrin', hechsherId: 'h1', mashgiachId: m2.id, kitniyot: 'ללא חשש קטניות', expires: new Date('2026-09-20'), status: 'ok',       lastInspection: new Date('2026-02-05'), notes: '',                   rabbanutId: rb1.id },
  ] })

  // ── Inspections ────────────────────────────────────────────────────────────
  await prisma.inspection.createMany({ data: [
    { id: 'i1', restaurantId: 'r1', mashgiachId: m1.id, date: new Date('2026-03-08'), type: 'planned', result: 'pending', notes: '' },
    { id: 'i2', restaurantId: 'r3', mashgiachId: m3.id, date: new Date('2026-03-06'), type: 'urgent',  result: 'pending', notes: 'Previous issues' },
    { id: 'i3', restaurantId: 'r2', mashgiachId: m2.id, date: new Date('2026-03-10'), type: 'planned', result: 'pending', notes: '' },
    { id: 'i4', restaurantId: 'r5', mashgiachId: m4.id, date: new Date('2026-03-12'), type: 'planned', result: 'open',    notes: '' },
  ] })

  // ── Documents ──────────────────────────────────────────────────────────────
  await prisma.kashrutDocument.createMany({ data: [
    { id: 'd1', name: 'Kashrut Inspection Guidelines 5786', category: 'Instructions', date: new Date('2026-01-08'), size: '2.4 MB', ext: 'PDF' },
    { id: 'd2', name: 'כתב התחייבות – פסח תשפ"ו',         category: 'Pesach',       date: new Date('2026-01-08'), size: '0.8 MB', ext: 'PDF' },
    { id: 'd3', name: 'Mashgiach Daily Checklist',          category: 'Forms',        date: new Date('2026-01-15'), size: '0.3 MB', ext: 'PDF' },
    { id: 'd4', name: 'Bishul Yisrael Regulations',         category: 'Regulations',  date: new Date('2025-12-01'), size: '1.1 MB', ext: 'PDF' },
    { id: 'd5', name: 'טופס המתנה מעת לעת',                 category: 'Pesach',       date: new Date('2026-01-08'), size: '0.2 MB', ext: 'PDF' },
    { id: 'd6', name: 'Hechsher Certificate Template',      category: 'Forms',        date: new Date('2026-02-01'), size: '0.5 MB', ext: 'DOCX' },
    { id: 'd7', name: 'היערכות מסעדות לפסח תשפ"ו',         category: 'Pesach',       date: new Date('2026-01-08'), size: '1.8 MB', ext: 'PDF' },
    { id: 'd8', name: 'Mehadrin Standards Reference',       category: 'Regulations',  date: new Date('2025-11-20'), size: '3.2 MB', ext: 'PDF' },
  ] })

  console.log('✅  Seed complete')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
