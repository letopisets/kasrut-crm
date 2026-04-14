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
    <div className="hechsher-block" style={{ '--c': h.color } as React.CSSProperties}>
      <div className="hechsher-title">🏛 {t.restaurants.cols.hechsher}</div>

      <div className="hechsher-header">
        <span className="hechsher-name">{h.name}</span>
        <Badge label={h.type} color={h.color} small />
      </div>

      {rows.map(([k, v]) => (
        <div key={k} className="info-row">
          <span className="info-label">{k}</span>
          <span className="info-value">{v}</span>
        </div>
      ))}
    </div>
  )
}
