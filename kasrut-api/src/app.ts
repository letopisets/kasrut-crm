import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'

export function createApp() {
  const app = express()

  // Security
  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }))

  // Body parsing
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  app.use('/api', routes)

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
