// Shared domain types — mirrors kasrut-crm/src/types/

export type Role          = 'owner' | 'rabbanut' | 'mashgiach'
export type CertStatus    = 'ok' | 'warning' | 'critical'
export type HechsherType  = 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'
export type InspectionResult = 'pending' | 'open' | 'pass' | 'fail'
export type InspectionType   = 'planned' | 'urgent'
export type DocumentCategory = 'Instructions' | 'Forms' | 'Regulations' | 'Pesach'
export type DocExt = 'PDF' | 'DOCX' | 'XLSX'

export interface User {
  id:               string
  name:             string
  email:            string
  passwordHash:     string
  role:             Role
  rabbanutId?:      string
  twoFactorSecret?: string
  twoFactorEnabled: boolean
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
  city:       string
  contact:    string
  phone:      string
  email:      string
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
  id:            string
  name:          string
  address:       string
  city:          string
  level:         'Regular' | 'Mehadrin'
  hechsherId:    string
  mashgiachId:   string
  kitniyot:      string
  expires:       string
  status:        CertStatus
  rabbanutId:    string
  notes?:        string
  lastInspection?:string
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
  iat:        number
  exp:        number
}
