import type { Hechsher } from '../types'
import { seedHechsherim } from './seed'

let data: Hechsher[] = [...seedHechsherim]

export const hechsherimMock = {
  findAll(filter?: { rabbanutId?: string; type?: string }): Hechsher[] {
    let result = [...data]
    if (filter?.rabbanutId) result = result.filter(h => h.rabbanutId === filter.rabbanutId)
    if (filter?.type)       result = result.filter(h => h.type === filter.type)
    return result
  },

  findById(id: string): Hechsher | null {
    return data.find(h => h.id === id) ?? null
  },

  create(input: Omit<Hechsher, 'id'>): Hechsher {
    const record: Hechsher = { ...input, id: `h${Date.now()}` }
    data.push(record)
    return record
  },

  update(id: string, patch: Partial<Omit<Hechsher, 'id'>>): Hechsher | null {
    const idx = data.findIndex(h => h.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(h => h.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedHechsherim] },
}
