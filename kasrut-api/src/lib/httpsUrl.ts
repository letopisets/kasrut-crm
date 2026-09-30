/** True only for an absolute URL whose scheme is https:. Shared by the create
 *  schema and the document serializer, so rows written around the API
 *  (import scripts, raw SQL) are held to the same rule when they are read. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
