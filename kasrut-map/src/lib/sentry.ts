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
  })
}

export { Sentry }
