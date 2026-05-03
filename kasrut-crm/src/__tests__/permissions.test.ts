import { describe, it, expect } from 'vitest'
import { PERMISSIONS } from '@/lib/permissions'

describe('PERMISSIONS', () => {
  it('owner has access to all tabs and can edit', () => {
    const p = PERMISSIONS.owner
    expect(p.canEdit).toBe(true)
    expect(p.seeAll).toBe(true)
    expect(p.isOwner).toBe(true)
    expect(p.tabs).toContain('users')
    expect(p.tabs).toContain('rabbanuts')
    expect(p.tabs).toContain('logs')
  })

  it('rabbanut can edit but does not see all data', () => {
    const p = PERMISSIONS.rabbanut
    expect(p.canEdit).toBe(true)
    expect(p.seeAll).toBe(false)
    expect(p.isOwner).toBe(false)
    expect(p.tabs).toContain('restaurants')
    expect(p.tabs).not.toContain('users')
    expect(p.tabs).not.toContain('rabbanuts')
    expect(p.tabs).not.toContain('logs')
  })

  it('mashgiach is read-only and limited to assigned scope', () => {
    const p = PERMISSIONS.mashgiach
    expect(p.canEdit).toBe(false)
    expect(p.seeAll).toBe(false)
    expect(p.isOwner).toBe(false)
    expect(p.tabs).toEqual(['dashboard', 'restaurants', 'inspections', 'documents'])
  })

  it('all roles have dashboard, restaurants and inspections tabs', () => {
    for (const role of ['owner', 'rabbanut', 'mashgiach'] as const) {
      expect(PERMISSIONS[role].tabs).toContain('dashboard')
      expect(PERMISSIONS[role].tabs).toContain('restaurants')
    }
  })
})
