import type { ZodSchema, ZodError } from 'zod'

export class ValidationError extends Error {
  readonly issues: ZodError['issues']
  constructor(issues: ZodError['issues']) {
    super('Validation failed')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new ValidationError(result.error.issues)
  return result.data
}
