// 429 from the API: the IP rate limiter, or the per-account lockout after
// repeated failed sign-in attempts.
export function isTooManyAttempts(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err &&
    (err as { status: unknown }).status === 429
}
