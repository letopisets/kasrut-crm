import * as Sentry from '@sentry/react'

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
  })
}

export { Sentry }
