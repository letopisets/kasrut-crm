import type { KashrutDocument } from '../types'
import { seedDocuments } from './seed'

let data: KashrutDocument[] = [...seedDocuments]

export const documentsMock = {
  findAll(filter?: { category?: string }): KashrutDocument[] {
    let result = [...data]
    if (filter?.category) result = result.filter(d => d.category === filter.category)
    return result.sort((a, b) => b.date.localeCompare(a.date))
  },

  findById(id: string): KashrutDocument | null {
    return data.find(d => d.id === id) ?? null
  },

  create(input: Omit<KashrutDocument, 'id'>): KashrutDocument {
    const record: KashrutDocument = { ...input, id: `d${Date.now()}` }
    data.push(record)
    return record
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(d => d.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedDocuments] },
}
