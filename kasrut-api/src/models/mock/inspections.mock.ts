import type { Inspection, InspectionResult } from '../types'
import { seedInspections } from './seed'

let data: Inspection[] = [...seedInspections]

export const inspectionsMock = {
  findAll(filter?: { restaurantId?: string; mashgiachId?: string; result?: string; type?: string }): Inspection[] {
    let result = [...data]
    if (filter?.restaurantId) result = result.filter(i => i.restaurantId === filter.restaurantId)
    if (filter?.mashgiachId)  result = result.filter(i => i.mashgiachId  === filter.mashgiachId)
    if (filter?.result)       result = result.filter(i => i.result === filter.result)
    if (filter?.type)         result = result.filter(i => i.type   === filter.type)
    return result.sort((a, b) => b.date.localeCompare(a.date))
  },

  findById(id: string): Inspection | null {
    return data.find(i => i.id === id) ?? null
  },

  create(input: Omit<Inspection, 'id' | 'result'>): Inspection {
    const record: Inspection = { ...input, id: `i${Date.now()}`, result: 'pending' }
    data.push(record)
    return record
  },

  setResult(id: string, result: InspectionResult): Inspection | null {
    const idx = data.findIndex(i => i.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], result }
    return data[idx]
  },

  update(id: string, patch: Partial<Omit<Inspection, 'id'>>): Inspection | null {
    const idx = data.findIndex(i => i.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(i => i.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedInspections] },
}
