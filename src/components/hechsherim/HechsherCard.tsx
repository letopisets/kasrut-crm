import type { Hechsher, Mashgiach } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge, Button } from '@/components/ui'

interface Props {
  hechsher:   Hechsher
  stats:      { restaurants: number; mashgichim: number }
  mashgichim: Mashgiach[]
  expanded:   boolean
  canEdit:    boolean
  onToggle:   (id: string) => void
  onDelete:   (id: string) => void
}

export function HechsherCard({ hechsher: h, stats, mashgichim, expanded, canEdit, onToggle, onDelete }: Props) {
  const t = useLang()

  return (
    <div
      className="hechsher-card"
      style={{ '--c': h.color } as React.CSSProperties}
      onClick={() => onToggle(h.id)}
    >
      <div className="hechsher-card-header">
        <div className="hechsher-card-top">
          <span className="hechsher-card-name">{h.name}</span>
          <Badge label={h.type} color={h.color} small />
        </div>
        <div className="hechsher-card-city">{h.city}</div>
      </div>

      <div className="hechsher-stats">
        <div className="hechsher-stat">
          <div className="hechsher-stat-value">{stats.restaurants}</div>
          <div className="hechsher-stat-label">{t.hechsherim?.restaurants ?? 'Restaurants'}</div>
        </div>
        <div className="hechsher-stat">
          <div className="hechsher-stat-value">{stats.mashgichim}</div>
          <div className="hechsher-stat-label">{t.hechsherim?.mashgichim ?? 'Mashgichim'}</div>
        </div>
        <div className="hechsher-stat">
          <div className="hechsher-stat-value">{h.shortName}</div>
          <div className="hechsher-stat-label">{t.hechsherim?.abbrev ?? 'Abbrev'}</div>
        </div>
      </div>

      {expanded && (
        <div className="hechsher-detail" onClick={e => e.stopPropagation()}>
          <div className="info-row">
            <span className="info-label">{t.hechsherim?.contact ?? 'Contact'}</span>
            <span className="info-value">{h.contact}</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t.hechsherim?.phone ?? 'Phone'}</span>
            <span className="info-value">{h.phone}</span>
          </div>
          <div className="info-row">
            <span className="info-label">{t.hechsherim?.email ?? 'Email'}</span>
            <span className="info-value">{h.email}</span>
          </div>
          {mashgichim.length > 0 && (
            <div className="hechsher-mashgichim-list">
              <div className="card-section-title">{t.hechsherim?.mashgichimList ?? 'Mashgichim'}</div>
              {mashgichim.map(m => (
                <div key={m.id} className="hechsher-mashgiach-row">
                  <span>{m.name}</span>
                  <span className="info-label">{m.area}</span>
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="hechsher-card-actions">
              <Button variant="danger" onClick={() => onDelete(h.id)}>
                {t.hechsherim?.delete ?? 'Delete'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
