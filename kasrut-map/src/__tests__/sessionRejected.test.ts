import { describe, expect, it } from 'vitest'
import { isSessionRejected } from '@/store/api/baseApi'

// MapPage signs the visitor out only when /me says the session is gone.
describe('isSessionRejected', () => {
  it('is true for a 401', () => {
    expect(isSessionRejected({ status: 401, data: { error: 'Session has been revoked' } })).toBe(true)
  })

  it.each([
    ['a server error', { status: 500, data: { error: 'Internal server error' } }],
    ['a rate limit', { status: 429, data: { error: 'Too many requests' } }],
    ['a network failure', { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }],
    ['a serialized error', { name: 'Error', message: 'boom' }],
    ['no error', undefined],
  ])('is false for %s', (_label, error) => {
    expect(isSessionRejected(error)).toBe(false)
  })
})
