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
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'

export function createApp() {
  const app = express()

  // Required for accurate req.ip behind nginx / any reverse-proxy
  app.set('trust proxy', 1)

  // Security headers
  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }))

  // Body parsing with explicit size limits.
  // 2 MB headroom is needed for community suggestions that include a base64
  // attachment image (we cap such payloads in the schema, but the parser must
  // accept them before validation runs).
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: false, limit: '2mb' }))

  // Structured console logging for warnings/errors. Platform audit events are stored by serviceLogger.
  app.use(pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'silent'
    },
    autoLogging: { ignore: req => req.url === '/health' || req.url?.startsWith('/api/docs') === true },
    serializers: {
      req: req => ({ method: req.method, url: req.url }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }))

  app.use(serviceLogger)

  // Liveness probe — checks DB + Redis so orchestrators get a real signal
  app.get('/health', async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {}
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.db = 'ok'
    } catch {
      checks.db = 'error'
    }
    try {
      await redis.ping()
      checks.redis = 'ok'
    } catch {
      checks.redis = 'error'
    }
    const healthy = checks.db === 'ok' && checks.redis === 'ok'
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks })
  })

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
