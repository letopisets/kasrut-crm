import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'
import { serviceLogger } from './middleware/serviceLogger'
import { swaggerSpec } from './lib/swagger'
import { logger } from './lib/logger'

export function createApp() {
  const app = express()

  // Security headers
  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }))

  // Body parsing with explicit size limits
  app.use(express.json({ limit: '512kb' }))
  app.use(express.urlencoded({ extended: false, limit: '512kb' }))

  // Structured request logging — pino-http (silent in tests via logger config)
  app.use(pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    autoLogging: { ignore: req => req.url === '/health' || req.url?.startsWith('/api/docs') === true },
    serializers: {
      req: req => ({ method: req.method, url: req.url }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }))

  app.use(serviceLogger)

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // OpenAPI / Swagger UI — exposed in non-production only
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/openapi.json', (_req, res) => res.json(swaggerSpec))
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
  }

  // API routes
  app.use('/api', routes)

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
