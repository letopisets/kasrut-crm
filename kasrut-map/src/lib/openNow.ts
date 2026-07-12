import { HebrewCalendar, Location } from '@hebcal/core'
import type { WeeklyHours } from '@/types'

export type OpenStatus = 'open' | 'closed' | 'shabbat' | 'unknown'

// Shabbat/Yom Tov times vary by only a few minutes across Israel, so one
// representative location is accurate enough for a nationwide "closed now" flag.
const IL_LOCATION = Location.lookup('Jerusalem')

// True when `now` falls inside a candle-lighting → havdalah window (Shabbat or a
// Yom Tov) on the Israeli schedule — when kosher establishments are closed.
export function isShabbatOrChagNow(now: Date): boolean {
  if (!IL_LOCATION) return false
  const dayMs = 86_400_000
  let events
  try {
    events = HebrewCalendar.calendar({
      start: new Date(now.getTime() - 2 * dayMs),
      end:   new Date(now.getTime() + 2 * dayMs),
      location: IL_LOCATION,
      il: true,
      candlelighting: true,
    })
  } catch {
    return false
  }

  let windowStart: Date | null = null
  for (const ev of events) {
    const t = (ev as { eventTime?: Date }).eventTime
    if (!t) continue
    const desc = ev.getDesc()
    if (desc === 'Candle lighting') {
      windowStart = t
    } else if (desc === 'Havdalah') {
      if (windowStart && now >= windowStart && now < t) return true
      windowStart = null
    }
  }
  return false
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Current open/closed status from structured weekly hours, with a Shabbat/chag
 *  override. 'unknown' when no structured hours are on file. */
export function computeOpenStatus(hours: WeeklyHours | null | undefined, now: Date = new Date()): OpenStatus {
  if (isShabbatOrChagNow(now)) return 'shabbat'
  if (!hours) return 'unknown'

  const today = hours[String(now.getDay()) as keyof WeeklyHours]
  if (!today) return 'closed'

  const open  = toMinutes(today.open)
  const close = toMinutes(today.close)
  if (open === null || close === null) return 'unknown'

  const cur = now.getHours() * 60 + now.getMinutes()
  // close <= open means the interval runs past midnight (e.g. 20:00–02:00).
  const isOpen = close > open ? (cur >= open && cur < close) : (cur >= open || cur < close)
  return isOpen ? 'open' : 'closed'
}
