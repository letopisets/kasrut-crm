import type { CertStatus, HechsherType, DocumentCategory, Role, InspectionType, InspectionResult } from '@/types'

export const STATUS_COLOR: Record<CertStatus, string> = {
  ok:       '#2ECC71',
  warning:  '#F39C12',
  critical: '#E74C3C',
}

export const ROLE_COLOR: Record<Role, string> = {
  owner:     '#E8C96D',
  rabbanut:  '#3498DB',
  mashgiach: '#2ECC71',
}

export const TYPE_COLOR: Record<InspectionType, string> = {
  urgent:  '#E74C3C',
  planned: '#3498DB',
}

export const RESULT_COLOR: Record<InspectionResult, string> = {
  pending: '#888888',
  open:    '#F39C12',
  pass:    '#2ECC71',
  fail:    '#E74C3C',
}

export const HECHSHER_TYPE_COLOR: Record<HechsherType, string> = {
  Rabbanut: '#3498DB',
  Badatz:   '#E74C3C',
  Mehadrin: '#9B59B6',
  Private:  '#95A5A6',
}

export const DOC_CAT_COLOR: Record<DocumentCategory, string> = {
  Instructions: '#3498DB',
  Forms:        '#9B59B6',
  Regulations:  '#E67E22',
  Pesach:       '#E8C96D',
}
