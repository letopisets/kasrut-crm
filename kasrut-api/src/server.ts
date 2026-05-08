import { createApp } from './app'
import { env } from './config/env'
import { serviceLogsRepo } from './db/serviceLogs.repo'
import { logger } from './lib/logger'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`KashrutCRM API running on http://localhost:${env.PORT}`)
  console.log(`Health: http://localhost:${env.PORT}/health`)
})

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
