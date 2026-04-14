import 'dotenv/config'

export const env = {
  PORT:          parseInt(process.env.PORT ?? '3000', 10),
  JWT_SECRET:    process.env.JWT_SECRET ?? 'kashrut-dev-secret',
  JWT_EXPIRES_IN:process.env.JWT_EXPIRES_IN ?? '7d',
  CORS_ORIGIN:   process.env.CORS_ORIGIN ?? 'http://localhost:5173',
} as const
