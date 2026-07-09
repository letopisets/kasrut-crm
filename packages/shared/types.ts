// Shared cross-project types. No runtime dependencies.

// ── Pagination ─────────────────────────────────────────────────────────────
export interface Page<T> {
  items:      T[]
  nextCursor: string | null
}

export interface PaginationParams {
  limit:   number
  cursor?: string
}

// ── Domain enums (single source of truth) ──────────────────────────────────
export type Role               = 'owner' | 'rabbanut' | 'mashgiach'
export type CertStatus         = 'ok' | 'warning' | 'critical'
export type HechsherType       = 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'
export type InspectionResult   = 'pending' | 'open' | 'pass' | 'fail'
export type InspectionType     = 'planned' | 'urgent'
export type DocumentCategory   = 'Instructions' | 'Forms' | 'Regulations' | 'Pesach'
export type DocExt             = 'PDF' | 'DOCX' | 'XLSX'
export type FoodType           = 'meat' | 'dairy' | 'pareve' | 'takeaway'
export type GeoAccuracy         = 'exact' | 'approximate'

export interface KashrutLevel {
  id:           string
  name:         string
  description?: string
  sortOrder:    number
}

export interface EstablishmentCategory {
  id:      string
  slug:    string
  nameHe:  string
  nameEn?: string
  nameRu?: string
}

// ── Map / community module ─────────────────────────────────────────────────
export type MapAuthProvider         = 'google' | 'apple'
export type MapSuggestionType       = 'add' | 'update'
export type MapSuggestionStatus     = 'pending' | 'approved' | 'rejected'
export type MapPasswordResetChannel = 'email' | 'phone'
