import type { Hechsher } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'

interface Props { hechsher: Hechsher }

export function HechsherBlock({ hechsher: h }: Props) {
  const t = useLang()

  const rows = [
    [t.hechsherim.contact, h.contact],
    [t.hechsherim.phone,   h.phone],
    [t.hechsherim.email,   h.email],
  ]

  return (
    <div style={{
      background:   'var(--bg-card)',
      border:       `1px solid ${h.color}30`,
      borderRadius: 12,
      padding:      20,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: h.color, marginBottom: 10 }}>
        🏛 {t.restaurants.cols.hechsher}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{h.name}</span>
        <Badge label={h.type} color={h.color} small />
      </div>

      {rows.map(([k, v]) => (
        <div key={k} style={{
          display:        'flex',
          justifyContent: 'space-between',
          padding:        '5px 0',
          borderBottom:   '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{k}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
