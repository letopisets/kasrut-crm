import { z } from 'zod'

// Shared primitives
const id       = z.string().uuid()
const email    = z.string().email().max(254).trim().toLowerCase()
const phone    = z.string().max(32).trim()
const color    = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
const dateStr  = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

// Enums
const role             = z.enum(['owner', 'rabbanut', 'mashgiach'])
const certStatus       = z.enum(['ok', 'warning', 'critical'])
const hechsherType     = z.enum(['Rabbanut', 'Badatz', 'Mehadrin', 'Private'])
const inspectionResult = z.enum(['pending', 'open', 'pass', 'fail'])
const inspectionType   = z.enum(['planned', 'urgent'])
const documentCategory = z.enum(['Instructions', 'Forms', 'Regulations', 'Pesach'])
const docExt           = z.enum(['PDF', 'DOCX', 'XLSX'])

// Auth
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
})

// User
export const createUserSchema = z.object({
  name:       z.string().min(1).max(100).trim(),
  email,
  password:   z.string().min(8).max(128),
  role,
  rabbanutId: id.optional(),
})
export const updateUserSchema = createUserSchema.omit({ password: true }).partial()

// Restaurant
export const createRestaurantSchema = z.object({
  name:        z.string().min(1).max(200).trim(),
  address:     z.string().min(1).max(500).trim(),
  city:        z.string().min(1).max(100).trim(),
  level:       z.enum(['Regular', 'Mehadrin']),
  hechsherId:  id,
  mashgiachId: id.optional(),
  kitniyot:    z.string().max(100).trim(),
  expires:     dateStr,
  status:      certStatus,
  rabbanutId:  id,
  notes:       z.string().max(2000).trim().optional(),
})
export const updateRestaurantSchema = createRestaurantSchema.partial()

// Inspection
export const createInspectionSchema = z.object({
  restaurantId: id,
  mashgiachId:  id,
  date:         dateStr,
  type:         inspectionType,
  result:       inspectionResult,
  notes:        z.string().max(2000).trim().optional(),
})
export const updateInspectionSchema = createInspectionSchema.partial()

// Hechsher
export const createHechsherSchema = z.object({
  name:       z.string().min(1).max(200).trim(),
  shortName:  z.string().min(1).max(20).trim(),
  city:       z.string().max(100).trim().default(''),
  contact:    z.string().max(100).trim().default(''),
  phone:      z.string().max(32).trim().default(''),
  email:      z.string().max(254).trim().default(''),
  type:       hechsherType,
  color,
  rabbanutId: id,
})
export const updateHechsherSchema = createHechsherSchema.partial()

// Mashgiach
export const createMashgiachSchema = z.object({
  name:          z.string().min(1).max(100).trim(),
  phone,
  email,
  area:          z.string().max(100).trim(),
  hechsherimIds: z.array(id),
  active:        z.boolean(),
  rabbanutId:    id,
})
export const updateMashgiachSchema  = createMashgiachSchema.partial()
export const assignMashgiachSchema  = z.object({ restaurantId: id })

// Document
export const createDocumentSchema = z.object({
  name:     z.string().min(1).max(500).trim(),
  category: documentCategory,
  date:     dateStr,
  size:     z.string().max(20).trim(),
  ext:      docExt,
  url:      z.string().url().max(2000).optional(),
})

// Rabbanut
export const createRabbanutSchema = z.object({
  name:    z.string().min(1).max(200).trim(),
  city:    z.string().min(1).max(100).trim(),
  contact: z.string().max(100).trim(),
  phone,
  email,
  active:  z.boolean(),
  color,
})
export const updateRabbanutSchema = createRabbanutSchema.partial()
