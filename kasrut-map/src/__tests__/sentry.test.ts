import { describe, expect, it } from 'vitest'
import type { ErrorEvent, Event } from '@sentry/react'
import { scrubBreadcrumb, scrubPii, scrubRequestUrl } from '@/lib/sentry'

describe('Sentry scrubbing', () => {
  it('drops the query from the old and new URL of a navigation breadcrumb', () => {
    // What history.replaceState records when the ?verifyEmail= token is removed.
    const crumb = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/?lang=he&verifyEmail=tok-123', to: '/?lang=he' },
    })
    expect(crumb.data).toEqual({ from: '/', to: '/' })
  })

  it('drops the query from request breadcrumb URLs and leaves other data alone', () => {
    const crumb = scrubBreadcrumb({ category: 'fetch', data: { url: '/api/map/restaurants?city=x', status_code: 200 } })
    expect(crumb.data).toEqual({ url: '/api/map/restaurants', status_code: 200 })
  })

  it('scrubs error events: user, page URL and breadcrumbs', () => {
    const event = scrubPii({
      type: undefined,
      user: { email: 'a@example.com' },
      request: { url: 'https://mykoshermap.com/?verifyEmail=tok-123' },
      breadcrumbs: [{ category: 'navigation', data: { from: '/?verifyEmail=tok-123', to: '/' } }],
    } as ErrorEvent)

    expect(event.user).toEqual({ id: 'anonymous' })
    expect(JSON.stringify(event)).not.toContain('tok-123')
  })

  it('scrubs transactions too', () => {
    const event = scrubRequestUrl<Event>({
      type: 'transaction',
      request: { url: 'https://mykoshermap.com/?verifyEmail=tok-123' },
    })
    expect(event.request?.url).toBe('https://mykoshermap.com/')
  })
})
