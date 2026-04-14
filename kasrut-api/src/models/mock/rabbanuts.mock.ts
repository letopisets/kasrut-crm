import type { Rabbanut } from '../types'
import { seedRabbanuts } from './seed'

let data: Rabbanut[] = [...seedRabbanuts]

export const rabbanutsMock = {
  findAll(filter?: { active?: boolean }): Rabbanut[] {
    let result = [...data]
    if (filter?.active !== undefined) result = result.filter(r => r.active === filter.active)
    return result
  },

  findById(id: string): Rabbanut | null {
    return data.find(r => r.id === id) ?? null
  },

  create(input: Omit<Rabbanut, 'id'>): Rabbanut {
    const record: Rabbanut = { ...input, id: `rb${Date.now()}` }
    data.push(record)
    return record
  },

  update(id: string, patch: Partial<Omit<Rabbanut, 'id'>>): Rabbanut | null {
    const idx = data.findIndex(r => r.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    return data[idx]
  },

  toggle(id: string): Rabbanut | null {
    const idx = data.findIndex(r => r.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], active: !data[idx].active }
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(r => r.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedRabbanuts] },
}
