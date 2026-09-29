// The importer script is loaded only for its builder / SQL export; the PDF
// parser and .env loading are not needed for that.
jest.mock('pdf-parse', () => ({ PDFParse: class {} }))
jest.mock('dotenv/config', () => ({}))

import { tenantMashgiachId, resolveTenantMashgiachIds } from '../lib/mashgiachTenancy'
import { ImportBuilder, buildImportSql, exportRows } from '../../scripts/import-pdf-data'

describe('tenantMashgiachId', () => {
  it('matches the ids migration 20260714095000 generates in PostgreSQL', () => {
    // `'m_dc_E' || '__' || left(md5('rb_F'), 10)`, as returned by PostgreSQL 16.
    expect(tenantMashgiachId('m_dc_E', 'rb_F')).toBe('m_dc_E__2e0abacf40')
    expect(tenantMashgiachId('m_import_default', 'rb_288e8a3c167cd5')).toMatch(/^m_import_default__[0-9a-f]{10}$/)
  })
})

describe('resolveTenantMashgiachIds', () => {
  const drafts = [
    { baseId: 'm_x', rabbanutId: 'rb_A' },
    { baseId: 'm_x', rabbanutId: 'rb_B' },
    { baseId: 'm_y', rabbanutId: 'rb_B' },
  ]

  it('lets the first rabbanut seen keep a new base id', () => {
    const ids = resolveTenantMashgiachIds(drafts)
    expect(ids.get(drafts[0])).toBe('m_x')
    expect(ids.get(drafts[1])).toBe(tenantMashgiachId('m_x', 'rb_B'))
    expect(ids.get(drafts[2])).toBe('m_y')
  })

  it('lets the database owner of an existing base id keep it', () => {
    const ids = resolveTenantMashgiachIds(drafts, new Map([['m_x', 'rb_B'], ['m_y', 'rb_C']]))
    expect(ids.get(drafts[0])).toBe(tenantMashgiachId('m_x', 'rb_A'))
    expect(ids.get(drafts[1])).toBe('m_x')
    expect(ids.get(drafts[2])).toBe(tenantMashgiachId('m_y', 'rb_B'))
  })
})

describe('PDF importer: one mashgiach profile per rabbanut', () => {
  function build() {
    const builder = new ImportBuilder()
    const row = (authority: string, name: string, extra: Record<string, string> = {}) => builder.addRestaurant({
      source: 'test.pdf', name, address: 'רחוב 1', city: 'אילת',
      authorityName: authority, hechsherName: authority, ...extra,
    })
    // No mashgiach in the PDF -> placeholder, in three rabbanuts.
    row('רבנות א', 'מסעדה א1')
    row('רבנות א', 'מסעדה א2')
    row('רבנות ב', 'מסעדה ב1')
    row('רבנות ג', 'מסעדה ג1')
    // One real person (same phone) working for two rabbanuts.
    row('רבנות ב', 'מסעדה ב2', { mashgiachName: 'יוסי', mashgiachPhone: '0501234567' })
    row('רבנות ג', 'מסעדה ג2', { mashgiachName: 'יוסי', mashgiachPhone: '0501234567' })
    return builder
  }

  function invariants(builder: ImportBuilder) {
    const data = exportRows(builder)
    const mTenant = new Map(data.mashgichim.map(m => [m.id, m.rabbanutId]))
    const hTenant = new Map(data.hechsherim.map(h => [h.id, h.rabbanutId]))
    return {
      data,
      crossRestaurants: data.restaurants.filter(r => mTenant.get(r.mashgiachId) !== r.rabbanutId),
      crossLinks: data.mashgiachHechsher.filter(l => mTenant.get(l.mashgiachId) !== hTenant.get(l.hechsherId)),
    }
  }

  it('never links a restaurant or hechsher to a mashgiach of another rabbanut', () => {
    const { data, crossRestaurants, crossLinks } = invariants(build())

    expect(crossRestaurants).toEqual([])
    expect(crossLinks).toEqual([])
    // Placeholder: original id in the first rabbanut, split-migration ids elsewhere.
    const placeholders = data.mashgichim.filter(m => m.id.startsWith('m_import_default'))
    expect(placeholders).toHaveLength(3)
    const [first, ...others] = placeholders
    expect(first.id).toBe('m_import_default')
    for (const p of others) expect(p.id).toBe(tenantMashgiachId('m_import_default', p.rabbanutId))
    // Same email on every copy, like the migration's clones.
    expect(new Set(placeholders.map(p => p.email))).toEqual(new Set(['m_import_default@import.local']))
  })

  it('re-resolves against the database owner and keeps restaurants on their own copy', () => {
    const builder = build()
    const before = exportRows(builder)
    const tenantB = before.restaurants.find(r => r.name === 'מסעדה ב1')!.rabbanutId

    // The database says m_import_default belongs to rabbanut B.
    builder.resolveMashgiachIds(new Map([['m_import_default', tenantB]]))
    const { data, crossRestaurants, crossLinks } = invariants(builder)

    expect(crossRestaurants).toEqual([])
    expect(crossLinks).toEqual([])
    expect(data.restaurants.find(r => r.name === 'מסעדה ב1')!.mashgiachId).toBe('m_import_default')
    const tenantA = data.restaurants.find(r => r.name === 'מסעדה א1')!.rabbanutId
    expect(data.restaurants.find(r => r.name === 'מסעדה א1')!.mashgiachId)
      .toBe(tenantMashgiachId('m_import_default', tenantA))
  })

  it('writes the tenancy marker, owner guard and a user update that skips linked mashgichim', () => {
    const sql = buildImportSql(exportRows(build()))

    expect(sql).toMatch(/^-- mashgiach-ids: per-rabbanut/m)
    expect(sql).toContain('WHERE m."rabbanutId" IS DISTINCT FROM v."rabbanutId"')
    expect(sql).toContain(`WHERE "email" IN ('admin@jer.il', 'cohen@jer.il') AND "mashgiachId" IS NULL;`)
    expect(sql.indexOf('DO $$')).toBeLessThan(sql.indexOf('INSERT INTO "mashgichim"'))
  })
})
