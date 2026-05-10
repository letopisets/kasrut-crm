import pino from 'pino'
import { isProd, isTest } from './runtime'

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
