import type { Server } from 'http'
import { createApp } from './app'
import { env } from './config/env'
import { serviceLogsRepo } from './db/serviceLogs.repo'
import { logger } from './lib/logger'
import { installProcessErrorHandlers } from './lib/processErrorHandlers'
import { purgeExpiredTokens } from './lib/tokenPurge'
import './jobs/expiryNotifier'

// Assigned once listening. The handlers are installed before that so they also
// cover startup; stopAccepting does nothing until the server exists.
let server: Server | undefined

// Log stray promise rejections and keep serving; on an uncaught exception log,
// stop accepting connections, flush the buffered service logs and exit(1) so
// Docker restarts the API. nginx opens a new upstream connection per request,
// so closing the listener stops new requests from reaching this process.
installProcessErrorHandlers({
  logger,
  stopAccepting: () => { server?.close() },
  flush: () => serviceLogsRepo.flush(),
  exit: code => process.exit(code),
})

const app = createApp()

server = app.listen(env.PORT, () => {
  console.log(`KashrutCRM API running on http://localhost:${env.PORT}`)
  console.log(`Health: http://localhost:${env.PORT}/health`)
})

// Rotate service_logs once at startup and then every 24 h.
// Keeps the table bounded without requiring pg_cron or an external scheduler.
const RETAIN_DAYS = Number(process.env.SERVICE_LOG_RETAIN_DAYS ?? 90)
const MS_PER_DAY = 86_400_000
async function rotateLogs(): Promise<void> {
  try {
    const deleted = await serviceLogsRepo.rotate(RETAIN_DAYS)
    if (deleted > 0) logger.info({ deleted, retainDays: RETAIN_DAYS }, 'service_logs rotated')
  } catch (err) {
    logger.error({ err }, 'service_logs rotation failed')
  }
}
// Expired refresh tokens and map email-verification / password-reset links go
// on the same schedule.
async function purgeTokens(): Promise<void> {
  try {
    const { deleted, failed } = await purgeExpiredTokens()
    const total = Object.values(deleted).reduce((sum, n) => sum + (n ?? 0), 0)
    if (total > 0) logger.info({ deleted }, 'expired auth tokens purged')
    for (const [purge, err] of Object.entries(failed)) logger.error({ err, purge }, 'token purge failed')
  } catch (err) {
    logger.error({ err }, 'token purge failed')
  }
}
void rotateLogs()
void purgeTokens()
const rotationTimer = setInterval(() => { void rotateLogs(); void purgeTokens() }, MS_PER_DAY)
if (typeof rotationTimer.unref === 'function') rotationTimer.unref()

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'shutting down')
  server?.close()
  // Flush any buffered service-log rows before the process exits — otherwise
  // we'd lose the last batch under SIGTERM rolling deploys.
  try { await serviceLogsRepo.flush() } catch { /* already logged */ }
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
