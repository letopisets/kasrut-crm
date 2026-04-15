import type { Mashgiach, Hechsher } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'

interface Props {
  mashgiach:  Mashgiach
  hechsherim: Hechsher[]
  canEdit:    boolean
  onToggle:   (id: string) => void
  onDelete:   (id: string) => void
  onEdit:     (m: Mashgiach) => void
}

export function MashgiachCard({ mashgiach: m, hechsherim, canEdit, onToggle, onDelete, onEdit }: Props) {
  const t = useLang()

  return (
    <div className="mashgiach-card">
      <div className="mashgiach-card-header">
        <div>
          <div className="mashgiach-card-name">{m.name}</div>
          <div className="mashgiach-card-area">{m.area}</div>
        </div>
        {canEdit && (
          <div className="mashgiach-card-actions">
            <button
              className={m.active ? 'mashgiach-toggle mashgiach-toggle--active' : 'mashgiach-toggle'}
              onClick={() => onToggle(m.id)}
              title={m.active ? 'Deactivate' : 'Activate'}
            >
              {m.active ? '●' : '○'}
            </button>
            <button
              className="mashgiach-edit"
              onClick={() => onEdit(m)}
              title="Edit"
            >
              ✎
            </button>
            <button
              className="mashgiach-delete"
              onClick={() => onDelete(m.id)}
              title="Delete"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="mashgiach-contacts">
        <div className="mashgiach-contact-row">
          <span className="info-label">{t.mashgichim?.phone ?? 'Phone'}</span>
          <span className="info-value">{m.phone}</span>
        </div>
        <div className="mashgiach-contact-row">
          <span className="info-label">{t.mashgichim?.email ?? 'Email'}</span>
          <span className="info-value">{m.email}</span>
        </div>
        <div className="mashgiach-contact-row">
          <span className="info-label">{t.mashgichim?.assigned ?? 'Assigned'}</span>
          <span className="info-value">{m.assignedRestaurantIds.length}</span>
        </div>
      </div>

      <div className="mashgiach-hechsherim">
        {hechsherim.length > 0
          ? hechsherim.map(h => (
              <Badge key={h.id} label={h.shortName} color={h.color} small />
            ))
          : <span className="card-empty">{t.mashgichim?.noHechsher ?? '—'}</span>
        }
      </div>

      {!m.active && (
        <Badge label={t.mashgichim?.inactive ?? 'Inactive'} color="var(--text-disabled)" small />
      )}
    </div>
  )
}
