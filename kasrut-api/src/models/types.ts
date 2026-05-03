// Shared domain types — re-exported from @kasrut/shared (single source of truth)
export type {
  Role,
  CertStatus,
  HechsherType,
  InspectionResult,
  InspectionType,
  DocumentCategory,
  DocExt,
  MapAuthProvider,
  MapSuggestionType,
  MapSuggestionStatus,
  MapPasswordResetChannel,
  Page,
  PaginationParams,
} from '../../../packages/shared/types'

import type {
  Role,
  CertStatus,
  HechsherType,
  InspectionResult,
  InspectionType,
  DocumentCategory,
  DocExt,
} from '../../../packages/shared/types'

export interface User {
  id:                   string
  name:                 string
  email:                string
  passwordHash:         string
  role:                 Role
  rabbanutId?:          string
  twoFactorSecret?:     string
  twoFactorEnabled:     boolean
  twoFactorBackupCodes: string[]
}

export interface Rabbanut {
  id:      string
  name:    string
  city:    string
  contact: string
  phone:   string
  email:   string
  active:  boolean
  color:   string
}

export interface Hechsher {
  id:         string
  name:       string
  shortName:  string
  city?:      string
  contact?:   string
  phone?:     string
  email?:     string
  type:       HechsherType
  color:      string
  rabbanutId: string
}

export interface Mashgiach {
  id:                    string
  name:                  string
  phone:                 string
  email:                 string
  area:                  string
  hechsherimIds:         string[]
  assignedRestaurantIds: string[]
  active:                boolean
  rabbanutId:            string
}

export interface Restaurant {
  id:              string
  name:            string
  address:         string
  city:            string
  level:           'Regular' | 'Mehadrin'
  hechsherId:      string
  mashgiachId?:    string
  kitniyot:        string
  expires:         string
  status:          CertStatus
  rabbanutId:      string
  notes?:          string
  lastInspection?: string
}

export interface Inspection {
  id:           string
  restaurantId: string
  mashgiachId:  string
  date:         string
  type:         InspectionType
  result:       InspectionResult
  notes?:       string
}

export interface KashrutDocument {
  id:       string
  name:     string
  category: DocumentCategory
  date:     string
  size:     string
  ext:      DocExt
  url?:     string
}

// JWT payload stored in token
export interface JWTPayload {
  sub:        string   // user.id
  role:       Role
  name:       string
  email:      string
  rabbanutId?:string
  jti?:       string   // unique token ID — used for blacklisting on logout
  iat:        number
  exp:        number
}

export interface MapJWTPayload {
  sub:   string   // map_users.id
  typ:   'map_user'
  name:  string
  email: string
  iat:   number
  exp:   number
}
