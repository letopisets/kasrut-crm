import { documentsRepo } from '../db/documents.repo'
import { prisma } from '../lib/prisma'

// The controller tests mock the whole repo, so this file pins the Prisma
// predicate that actually keeps tenants apart in GET /documents: a tenant
// gets global rows (rabbanutId NULL) plus its own, the owner gets everything.
jest.mock('../lib/prisma', () => ({
  prisma: { kashrutDocument: { findMany: jest.fn() } },
}))

const findMany = (prisma as unknown as { kashrutDocument: { findMany: jest.Mock } }).kashrutDocument.findMany

const row = (id: string, rabbanutId: string | null) => ({
  id, name: id, category: 'Forms', date: new Date('2026-09-30T00:00:00Z'), size: BigInt(0), ext: 'PDF',
  url: null, rabbanutId, createdAt: new Date(), updatedAt: new Date(),
})

const whereOf = () => findMany.mock.calls[0][0].where

describe('documentsRepo.findAll tenant predicate', () => {
  beforeEach(() => {
    findMany.mockResolvedValue([row('g', null), row('a', 'rb_a')])
  })

  it('narrows a tenant to global + own documents', async () => {
    const docs = await documentsRepo.findAll({ rabbanutId: 'rb_a' })

    expect(whereOf()).toEqual({ OR: [{ rabbanutId: null }, { rabbanutId: 'rb_a' }] })
    expect(docs.map(d => d.rabbanutId)).toEqual([null, 'rb_a'])
  })

  it('combines the category filter with the tenant OR, never replacing it', async () => {
    await documentsRepo.findAll({ category: 'Pesach', rabbanutId: 'rb_a' })

    expect(whereOf()).toEqual({
      category: 'Pesach',
      OR: [{ rabbanutId: null }, { rabbanutId: 'rb_a' }],
    })
  })

  it('keeps the predicate for an empty-string tenant id (matches global only)', async () => {
    await documentsRepo.findAll({ rabbanutId: '' })

    expect(whereOf()).toEqual({ OR: [{ rabbanutId: null }, { rabbanutId: '' }] })
  })

  it.each([
    ['no filter', undefined],
    ['an empty filter', {}],
    ['rabbanutId undefined', { rabbanutId: undefined }],
  ])('owner (%s) gets every document', async (_label, filter) => {
    await documentsRepo.findAll(filter)

    expect(whereOf()).toEqual({})
  })

  it('owner category filter adds no tenant condition', async () => {
    await documentsRepo.findAll({ category: 'Forms' })

    expect(whereOf()).toEqual({ category: 'Forms' })
  })
})
