import type {
  Page,
  Role,
  CertStatus,
  HechsherType,
  InspectionResult,
  InspectionType,
  DocumentCategory,
  DocExt,
  FoodType,
  MapAuthProvider,
  MapSuggestionType,
  MapSuggestionStatus,
  MapPasswordResetChannel,
} from '../types'

// Compile-time assertions — these tests fail to compile if shared types
// drift away from their expected literal sets.

describe('@kasrut/shared types', () => {
  it('Page<T> shape carries items + nextCursor', () => {
    const p: Page<{ id: string }> = { items: [{ id: 'a' }], nextCursor: null }
    expect(p.items).toHaveLength(1)
    expect(p.nextCursor).toBeNull()
  })

  it('Role enum covers owner / rabbanut / mashgiach', () => {
    const roles: Role[] = ['owner', 'rabbanut', 'mashgiach']
    expect(roles).toHaveLength(3)
  })

  it('CertStatus covers ok / warning / critical', () => {
    const statuses: CertStatus[] = ['ok', 'warning', 'critical']
    expect(statuses).toHaveLength(3)
  })

  it('HechsherType covers all four kinds', () => {
    const types: HechsherType[] = ['Rabbanut', 'Badatz', 'Mehadrin', 'Private']
    expect(types).toHaveLength(4)
  })

  it('InspectionResult and InspectionType cover expected literals', () => {
    const res: InspectionResult[] = ['pending', 'open', 'pass', 'fail']
    const typ: InspectionType[]   = ['planned', 'urgent']
    expect(res).toHaveLength(4)
    expect(typ).toHaveLength(2)
  })

  it('DocumentCategory and DocExt cover expected literals', () => {
    const cats: DocumentCategory[] = ['Instructions', 'Forms', 'Regulations', 'Pesach']
    const exts: DocExt[]           = ['PDF', 'DOCX', 'XLSX']
    expect(cats).toHaveLength(4)
    expect(exts).toHaveLength(3)
  })

  it('FoodType matches map domain', () => {
    const ft: FoodType[] = ['meat', 'dairy', 'pareve', 'takeaway']
    expect(ft).toHaveLength(4)
  })

  it('MapAuthProvider and MapSuggestion enums match expected literals', () => {
    const p: MapAuthProvider[]      = ['google', 'apple']
    const t: MapSuggestionType[]    = ['add', 'update']
    const s: MapSuggestionStatus[]  = ['pending', 'approved', 'rejected']
    const c: MapPasswordResetChannel[] = ['email', 'phone']
    expect([p, t, s, c].map(a => a.length)).toEqual([2, 2, 3, 2])
  })
})
