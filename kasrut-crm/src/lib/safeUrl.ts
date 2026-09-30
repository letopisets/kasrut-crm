/** Returns the URL only when it is an absolute https link, so stored document
 *  URLs such as `javascript:` / `data:` (or plain http) are never rendered as
 *  clickable links. The API rejects them on create; older rows may predate it. */
export function httpsHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}
