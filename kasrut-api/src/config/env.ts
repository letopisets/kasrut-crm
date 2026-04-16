import 'dotenv/config'

export const env = {
  PORT:          parseInt(process.env.PORT ?? '3000', 10),
  JWT_SECRET:    process.env.JWT_SECRET ?? 'kashrut-dev-secret',
  JWT_EXPIRES_IN:process.env.JWT_EXPIRES_IN ?? '7d',
  // Comma-separated origins, e.g. "http://localhost:5173,http://localhost:5174"
  CORS_ORIGINS:  (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim()),
  REDIS_URL:     process.env.REDIS_URL ?? 'redis://localhost:6379',
} as const
