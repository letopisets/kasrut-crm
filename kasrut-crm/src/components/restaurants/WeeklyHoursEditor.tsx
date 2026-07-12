import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { useAppSelector } from '@/store'
import type { WeeklyHours, DayHours } from '@/types'

const LOCALE: Record<string, string> = { en: 'en-US', ru: 'ru-RU', he: 'he-IL' }
const DAYS = ['0', '1', '2', '3', '4', '5', '6'] as const

interface Props {
  value: WeeklyHours | null | undefined
  onChange: (v: WeeklyHours) => void
}

const timeInputStyle: React.CSSProperties = {
  background: '#1E2235', color: '#E8E8EE', border: '1px solid #252840',
  borderRadius: 4, padding: '4px 6px', fontSize: 13,
}

export function WeeklyHoursEditor({ value, onChange }: Props) {
  const lang = useAppSelector(s => s.lang.lang)

  // Localized weekday names via Intl (no i18n array to maintain). 2024-01-07 is
  // a Sunday, so day index 0..6 maps to Sun..Sat, matching Date.getDay().
  const dayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(LOCALE[lang] ?? 'en-US', { weekday: 'long' })
    return DAYS.map((_, i) => fmt.format(new Date(2024, 0, 7 + i)))
  }, [lang])

  const hours = value ?? {}
  const setDay = (day: string, dh: DayHours | null) => onChange({ ...hours, [day]: dh })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {DAYS.map((day, i) => {
        const dh = hours[day] ?? null
        return (
          <Box key={day} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 34 }}>
            <Typography sx={{ width: 104, fontSize: 13, color: 'text.secondary', textTransform: 'capitalize' }}>
              {dayNames[i]}
            </Typography>
            <Switch
              size="small"
              checked={!!dh}
              onChange={e => setDay(day, e.target.checked ? { open: '09:00', close: '22:00' } : null)}
            />
            {dh && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <input type="time" value={dh.open}  aria-label={`${dayNames[i]} open`}
                  onChange={e => setDay(day, { ...dh, open: e.target.value })} style={timeInputStyle} />
                <input type="time" value={dh.close} aria-label={`${dayNames[i]} close`}
                  onChange={e => setDay(day, { ...dh, close: e.target.value })} style={timeInputStyle} />
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
