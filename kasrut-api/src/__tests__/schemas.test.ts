import {
  paginationSchema,
  loginSchema,
  createRestaurantSchema,
  createInspectionSchema,
  createRabbanutSchema,
} from '../schemas'

describe('paginationSchema', () => {
  it('coerces string limit to number', () => {
    const r = paginationSchema.parse({ limit: '25' })
    expect(r.limit).toBe(25)
  })

  it('rejects limit > 200', () => {
    expect(paginationSchema.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('rejects non-numeric limit', () => {
    expect(paginationSchema.safeParse({ limit: 'abc' }).success).toBe(false)
  })

  it('rejects limit < 1', () => {
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false)
  })

  it('accepts limit and cursor together', () => {
    const r = paginationSchema.parse({ limit: '10', cursor: 'abc' })
    expect(r).toEqual({ limit: 10, cursor: 'abc' })
  })

  it('accepts empty input (both fields optional)', () => {
    expect(paginationSchema.parse({})).toEqual({})
  })
})

describe('loginSchema', () => {
  it('lowercases email', () => {
    const r = loginSchema.parse({ email: 'Owner@KASHRUT.IL', password: 'pw' })
    expect(r.email).toBe('owner@kashrut.il')
  })

  it('rejects missing password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.il' }).success).toBe(false)
  })

  it('rejects invalid email format', () => {
    expect(loginSchema.safeParse({ email: 'not-email', password: 'x' }).success).toBe(false)
  })
})

describe('createRestaurantSchema', () => {
  const valid = {
    name: 'A', address: 'addr', city: 'TLV',
    levelId: '33333333-3333-3333-3333-333333333333',
    hechsherId: '11111111-1111-1111-1111-111111111111',
    kitniyot: false, expires: '2030-01-01', status: 'ok',
    rabbanutId: '22222222-2222-2222-2222-222222222222',
  }

  it('accepts minimal valid payload', () => {
    expect(createRestaurantSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects malformed expires date', () => {
    expect(createRestaurantSchema.safeParse({ ...valid, expires: '2030/01/01' }).success).toBe(false)
  })

  it('rejects bad UUID for hechsherId', () => {
    expect(createRestaurantSchema.safeParse({ ...valid, hechsherId: 'not-uuid' }).success).toBe(false)
  })

  it('rejects non-UUID levelId', () => {
    expect(createRestaurantSchema.safeParse({ ...valid, levelId: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects unknown status', () => {
    expect(createRestaurantSchema.safeParse({ ...valid, status: 'fine' }).success).toBe(false)
  })
})

describe('createInspectionSchema', () => {
  const valid = {
    restaurantId: '11111111-1111-1111-1111-111111111111',
    mashgiachId:  '22222222-2222-2222-2222-222222222222',
    date: '2026-04-01', type: 'planned', result: 'pass',
  }

  it('accepts valid payload', () => {
    expect(createInspectionSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects unknown result enum', () => {
    expect(createInspectionSchema.safeParse({ ...valid, result: 'bad' }).success).toBe(false)
  })

  it('rejects malformed date', () => {
    expect(createInspectionSchema.safeParse({ ...valid, date: 'today' }).success).toBe(false)
  })

  it('rejects oversized notes', () => {
    expect(createInspectionSchema.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('createRabbanutSchema', () => {
  const valid = {
    name: 'Rabbanut Test',
    city: 'Jerusalem',
    contact: '',
    phone: '',
    email: '',
    active: true,
    color: '#E8C96D',
  }

  it('accepts an empty contact email', () => {
    expect(createRabbanutSchema.parse(valid).email).toBe('')
  })

  it('lowercases a valid contact email', () => {
    const r = createRabbanutSchema.parse({ ...valid, email: 'Info@Test.IL' })
    expect(r.email).toBe('info@test.il')
  })

  it('rejects malformed contact email when provided', () => {
    expect(createRabbanutSchema.safeParse({ ...valid, email: 'not-email' }).success).toBe(false)
  })
})
