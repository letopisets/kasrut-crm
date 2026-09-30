import { randomUUID } from 'crypto'
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
import { asyncHandler } from './lib/asyncHandler'

export function createApp() {
  const app = express()

  // Required for accurate req.ip behind nginx / any reverse-proxy
  app.set('trust proxy', 1)

  // Request id + service_logs audit hook. Mounted first so responses produced
  // by the middleware below (CORS preflights, malformed or oversized bodies)
  // also carry x-request-id. The audit row is written on 'finish', after the
  // body has been parsed.
  app.use(serviceLogger)

  // Structured console logging for warnings/errors. Platform audit events are
  // stored by serviceLogger. Mounted before the body parsers, so a request
  // they reject (malformed JSON, oversized or badly encoded body) still gets
  // a console line under the id the client saw in x-request-id.
  app.use(pinoHttp({
    logger,
    // The id serviceLogger resolved and echoed in x-request-id (it runs
    // first), so a console line and its service_logs row share one id.
    genReqId: (_req, res) => {
      const id = res.getHeader('x-request-id')
      return typeof id === 'string' && id ? id : randomUUID()
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'silent'
    },
    autoLogging: { ignore: req => req.url === '/health' || req.url?.startsWith('/api/docs') === true },
    serializers: {
      req: req => ({ id: req.id, method: req.method, url: req.url }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }))

  // Security headers
  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }))

  // Body parsing with explicit size limits.
  // 2 MB headroom is needed for community suggestions that include a base64
  // attachment image (we cap such payloads in the schema, but the parser must
  // accept them before validation runs).
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: false, limit: '2mb' }))

  // Liveness probe — checks DB + Redis so orchestrators get a real signal
  app.get('/health', asyncHandler(async (_req, res) => {
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
  }))

  // OpenAPI / Swagger UI — exposed in non-production only
  if (env.NODE_ENV !== 'production') {
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
