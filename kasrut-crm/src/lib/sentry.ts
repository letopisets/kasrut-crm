import * as Sentry from '@sentry/react'
import type { ErrorEvent } from '@sentry/react'

function scrubPii(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    event.user = { id: event.user.id }
  }
  // Strip query-strings from breadcrumb URLs — they may contain restaurant
  // names or filter values the user hasn't agreed to send to a third party.
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(crumb => {
      if (typeof crumb.data?.url === 'string') {
        crumb.data.url = crumb.data.url.split('?')[0]
      }
      return crumb
    })
  }
  return event
}

/**
 * Initialise Sentry once at startup.
 * Activates only when VITE_SENTRY_DSN is provided.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend: scrubPii,
  })
}

export { Sentry }
