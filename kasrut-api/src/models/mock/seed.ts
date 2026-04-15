import type { Rabbanut, Hechsher, Mashgiach, Restaurant, Inspection, KashrutDocument, User } from '../types'
import bcrypt from 'bcryptjs'

const HASH = bcrypt.hashSync('password', 8)

export const seedUsers: User[] = [
  { id: 'u1', name: 'System Owner',    email: 'owner@kashrut.il', passwordHash: HASH, role: 'owner',     twoFactorEnabled: false },
  { id: 'u4', name: 'Авнер',           email: 'avner@kashrut.il', passwordHash: HASH, role: 'owner',     twoFactorEnabled: false },
  { id: 'u2', name: 'Admin Jerusalem', email: 'admin@jer.il',     passwordHash: HASH, role: 'rabbanut',  twoFactorEnabled: false, rabbanutId: 'rb1' },
  { id: 'm1', name: 'Р. Коэн',         email: 'cohen@jer.il',     passwordHash: HASH, role: 'mashgiach', twoFactorEnabled: false, rabbanutId: 'rb1' },
]

export const seedRabbanuts: Rabbanut[] = [
  { id: 'rb1', name: 'Rabbanut Jerusalem', city: 'Jerusalem', contact: 'Rav Goldberg', phone: '02-6700100', email: 'kashrut@jer.il',   active: true,  color: '#3498DB' },
  { id: 'rb2', name: 'Rabbanut Haifa',     city: 'Haifa',     contact: 'Rav Cohen',    phone: '04-8867000', email: 'kashrut@haifa.il', active: true,  color: '#2ECC71' },
  { id: 'rb3', name: 'Rabbanut Tel Aviv',  city: 'Tel Aviv',  contact: 'Rav Levi',     phone: '03-5551234', email: 'kashrut@tlv.il',   active: false, color: '#9B59B6' },
]

export const seedHechsherim: Hechsher[] = [
  { id: 'h1', name: 'Rabbanut Jerusalem',    shortName: 'רבנות י-ם',   city: 'Jerusalem', contact: 'Rav Goldberg', phone: '02-6700100', email: 'kashrut@jer.il',    type: 'Rabbanut', color: '#3498DB', rabbanutId: 'rb1' },
  { id: 'h2', name: 'Badatz Eda Hacharedit', shortName: 'בד"ץ העדה',   city: 'Jerusalem', contact: 'Rav Weiss',    phone: '02-6700200', email: 'vaad@edah.il',       type: 'Badatz',   color: '#E74C3C', rabbanutId: 'rb1' },
  { id: 'h3', name: 'Rabbanut Haifa',        shortName: 'רבנות חיפה',  city: 'Haifa',     contact: 'Rav Cohen',    phone: '04-8867000', email: 'kashrut@haifa.il',   type: 'Rabbanut', color: '#2ECC71', rabbanutId: 'rb2' },
  { id: 'h4', name: 'Badatz Beit Yosef',     shortName: 'בד"ץ ב"י',   city: 'Jerusalem', contact: 'Rav Yosef',    phone: '02-5382832', email: 'info@beityosef.il',  type: 'Badatz',   color: '#9B59B6', rabbanutId: 'rb1' },
  { id: 'h5', name: 'Chief Rabbinate',       shortName: 'הרה"ר',       city: 'Jerusalem', contact: 'Rav Adiriya', phone: '02-9705149', email: 'adiryap@rab.gov.il', type: 'Rabbanut', color: '#E8C96D', rabbanutId: 'rb1' },
]

export const seedMashgichim: Mashgiach[] = [
  { id: 'm1', name: 'Р. Коэн',    phone: '050-1234567', email: 'cohen@rabbanut.il', area: 'Jerusalem Center', hechsherimIds: ['h1','h5'], assignedRestaurantIds: ['r1','r4'], active: true,  rabbanutId: 'rb1' },
  { id: 'm2', name: 'Р. Леви',    phone: '052-9876543', email: 'levi@rabbanut.il',  area: 'Jerusalem North',  hechsherimIds: ['h1'],      assignedRestaurantIds: ['r2','r6'], active: true,  rabbanutId: 'rb1' },
  { id: 'm3', name: 'Р. Фридман', phone: '054-5551234', email: 'fridman@haifa.il',  area: 'Haifa',            hechsherimIds: ['h3','h4'], assignedRestaurantIds: ['r3'],      active: true,  rabbanutId: 'rb2' },
  { id: 'm4', name: 'Р. Берг',    phone: '058-7774321', email: 'berg@jer.il',       area: 'North District',   hechsherimIds: ['h2'],      assignedRestaurantIds: ['r5'],      active: false, rabbanutId: 'rb1' },
]

export const seedRestaurants: Restaurant[] = [
  { id: 'r1', name: 'מסעדת הגורמה',     address: "רח' יפו 42",      city: 'Jerusalem', level: 'Mehadrin', hechsherId: 'h1', mashgiachId: 'm1', kitniyot: 'ללא חשש קטניות', expires: '2026-03-15', status: 'warning',  lastInspection: '2026-01-20', notes: '',                   rabbanutId: 'rb1' },
  { id: 'r2', name: 'בית האוכל המרכזי', address: "רח' בן יהודה 18", city: 'Jerusalem', level: 'Regular',  hechsherId: 'h2', mashgiachId: 'm2', kitniyot: 'מכיל קטניות',     expires: '2026-06-30', status: 'ok',       lastInspection: '2026-02-01', notes: '',                   rabbanutId: 'rb1' },
  { id: 'r3', name: 'מסעדת צפון',       address: "שד' הרצל 55",     city: 'Haifa',     level: 'Mehadrin', hechsherId: 'h4', mashgiachId: 'm3', kitniyot: 'ללא חשש קטניות', expires: '2026-02-28', status: 'critical', lastInspection: '2025-12-15', notes: 'Requires attention', rabbanutId: 'rb2' },
  { id: 'r4', name: 'פיצה שמש',         address: "רח' גאולה 31",    city: 'Haifa',     level: 'Regular',  hechsherId: 'h3', mashgiachId: 'm1', kitniyot: 'מכיל קטניות',     expires: '2026-08-10', status: 'ok',       lastInspection: '2026-01-30', notes: '',                   rabbanutId: 'rb2' },
  { id: 'r5', name: 'המאפייה העתיקה',   address: "רח' ירושלים 17",  city: 'Tzfat',     level: 'Mehadrin', hechsherId: 'h5', mashgiachId: 'm4', kitniyot: 'ללא חשש קטניות', expires: '2026-04-01', status: 'warning',  lastInspection: '2026-01-10', notes: '',                   rabbanutId: 'rb1' },
  { id: 'r6', name: 'מלון כנרות',       address: "רח' זיידל 9",     city: 'Tiberias',  level: 'Mehadrin', hechsherId: 'h1', mashgiachId: 'm2', kitniyot: 'ללא חשש קטניות', expires: '2026-09-20', status: 'ok',       lastInspection: '2026-02-05', notes: '',                   rabbanutId: 'rb1' },
]

export const seedInspections: Inspection[] = [
  { id: 'i1', restaurantId: 'r1', mashgiachId: 'm1', date: '2026-03-08', type: 'planned', result: 'pending', notes: '' },
  { id: 'i2', restaurantId: 'r3', mashgiachId: 'm3', date: '2026-03-06', type: 'urgent',  result: 'pending', notes: 'Previous issues' },
  { id: 'i3', restaurantId: 'r2', mashgiachId: 'm2', date: '2026-03-10', type: 'planned', result: 'pending', notes: '' },
  { id: 'i4', restaurantId: 'r5', mashgiachId: 'm4', date: '2026-03-12', type: 'planned', result: 'open',    notes: '' },
]

export const seedDocuments: KashrutDocument[] = [
  { id: 'd1', name: 'Kashrut Inspection Guidelines 5786', category: 'Instructions', date: '2026-01-08', size: '2.4 MB', ext: 'PDF' },
  { id: 'd2', name: 'כתב התחייבות – פסח תשפ"ו',         category: 'Pesach',       date: '2026-01-08', size: '0.8 MB', ext: 'PDF' },
  { id: 'd3', name: 'Mashgiach Daily Checklist',          category: 'Forms',        date: '2026-01-15', size: '0.3 MB', ext: 'PDF' },
  { id: 'd4', name: 'Bishul Yisrael Regulations',         category: 'Regulations',  date: '2025-12-01', size: '1.1 MB', ext: 'PDF' },
  { id: 'd5', name: 'טופס המתנה מעת לעת',                 category: 'Pesach',       date: '2026-01-08', size: '0.2 MB', ext: 'PDF' },
  { id: 'd6', name: 'Hechsher Certificate Template',      category: 'Forms',        date: '2026-02-01', size: '0.5 MB', ext: 'DOCX' },
  { id: 'd7', name: 'היערכות מסעדות לפסח תשפ"ו',         category: 'Pesach',       date: '2026-01-08', size: '1.8 MB', ext: 'PDF' },
  { id: 'd8', name: 'Mehadrin Standards Reference',       category: 'Regulations',  date: '2025-11-20', size: '3.2 MB', ext: 'PDF' },
]
