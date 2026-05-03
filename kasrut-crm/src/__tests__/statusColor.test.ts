import { describe, it, expect } from 'vitest'
import {
  STATUS_COLOR,
  ROLE_COLOR,
  TYPE_COLOR,
  RESULT_COLOR,
  HECHSHER_TYPE_COLOR,
  DOC_CAT_COLOR,
  DOCUMENT_CATEGORY_COLOR,
} from '@/lib/statusColor'

const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s)

describe('color tables', () => {
  it('STATUS_COLOR maps every CertStatus to a hex value', () => {
    expect(isHex(STATUS_COLOR.ok)).toBe(true)
    expect(isHex(STATUS_COLOR.warning)).toBe(true)
    expect(isHex(STATUS_COLOR.critical)).toBe(true)
  })

  it('ROLE_COLOR has owner gold, rabbanut blue, mashgiach green', () => {
    expect(ROLE_COLOR.owner).toBe('#E8C96D')
    expect(ROLE_COLOR.rabbanut).toBe('#3498DB')
    expect(ROLE_COLOR.mashgiach).toBe('#2ECC71')
  })

  it('TYPE_COLOR distinguishes urgent (red) from planned (blue)', () => {
    expect(TYPE_COLOR.urgent).not.toBe(TYPE_COLOR.planned)
  })

  it('RESULT_COLOR covers all four inspection results', () => {
    expect(Object.keys(RESULT_COLOR).sort()).toEqual(['fail', 'open', 'pass', 'pending'])
  })

  it('HECHSHER_TYPE_COLOR covers all four hechsher types', () => {
    expect(Object.keys(HECHSHER_TYPE_COLOR).sort()).toEqual(['Badatz', 'Mehadrin', 'Private', 'Rabbanut'])
  })

  it('DOC_CAT_COLOR equals DOCUMENT_CATEGORY_COLOR (alias)', () => {
    expect(DOC_CAT_COLOR).toBe(DOCUMENT_CATEGORY_COLOR)
  })
})
