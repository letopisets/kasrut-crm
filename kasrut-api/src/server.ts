import { createApp } from './app'
import { env } from './config/env'
import { serviceLogsRepo } from './db/serviceLogs.repo'
import { logger } from './lib/logger'

const app = createApp()

const server = app.listen(env.PORT, () => {
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
void rotateLogs()
const rotationTimer = setInterval(() => { void rotateLogs() }, MS_PER_DAY)
if (typeof rotationTimer.unref === 'function') rotationTimer.unref()

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'shutting down')
  server.close()
  // Flush any buffered service-log rows before the process exits — otherwise
  // we'd lose the last batch under SIGTERM rolling deploys.
  try { await serviceLogsRepo.flush() } catch { /* already logged */ }
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
