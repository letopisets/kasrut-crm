import pino from 'pino'

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tempToken',
      '*.twoFactorSecret',
      '*.twoFactorBackupCodes',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd ? {} : {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  }),
})
