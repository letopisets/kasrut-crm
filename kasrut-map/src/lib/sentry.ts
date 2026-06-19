import * as Sentry from '@sentry/react'
import type { ErrorEvent } from '@sentry/react'

function scrubPii(event: ErrorEvent): ErrorEvent {
  // Public app — no account required for map view. Replace any captured user
  // context with an opaque anonymous marker so emails/phones never leave the
  // browser via Sentry.
  event.user = { id: 'anonymous' }

  // Strip query-strings from breadcrumb URLs — they may contain search terms,
  // city filters, or hechsher names the user hasn't consented to share.
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
    // Browser extensions inject their own scripts that throw freely; they
    // surface as our errors but we cannot fix them. Filter the common ones
    // so they don't drown out real issues.
    ignoreErrors: [
      'Could not establish connection. Receiving end does not exist.',
      "Cannot read properties of undefined (reading 'useCache')",
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],
    denyUrls: [
      /content[-_]script/i,
      /\bpolyfill\.js/,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-extension:\/\//,
      /^webkit-masked-url:\/\//,
    ],
    beforeSend: scrubPii,
  })
}

export { Sentry }
