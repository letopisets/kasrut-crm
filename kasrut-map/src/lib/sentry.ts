import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent, Event } from '@sentry/react'

function withoutQuery(url: string): string {
  return url.split('?')[0]
}

// Strip query-strings from breadcrumb URLs — they may contain search terms,
// city filters, or hechsher names the user hasn't consented to share, and the
// token of an emailed ?verifyEmail= link. Navigation crumbs carry the old and
// new URL in from/to: removing that token with history.replaceState records
// one whose `from` still holds it.
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const data = crumb.data
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = withoutQuery(data[key])
    }
  }
  return crumb
}

// The page URL goes out with every event, transactions included.
export function scrubRequestUrl<T extends Event>(event: T): T {
  if (typeof event.request?.url === 'string') event.request.url = withoutQuery(event.request.url)
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  return event
}

export function scrubPii(event: ErrorEvent): ErrorEvent {
  // Public app — no account required for map view. Replace any captured user
  // context with an opaque anonymous marker so emails/phones never leave the
  // browser via Sentry.
  event.user = { id: 'anonymous' }
  return scrubRequestUrl(event)
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
    // Scrubbed when recorded, and again on the way out.
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubPii,
    beforeSendTransaction: scrubRequestUrl,
  })
}

export { Sentry }
