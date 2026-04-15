import { useRabbanutController } from '@/controllers/useRabbanutController'
import { useLang } from '@/i18n/useLang'
import { Button, Badge } from '@/components/ui'
import { RabbanutForm } from '@/components/rabbanuts/RabbanutForm'
import type { Rabbanut } from '@/types'

export default function Rabbanuts() {
  const t    = useLang()
  const ctrl = useRabbanutController()

  const handleSave = (data: Omit<Rabbanut, 'id'>) => {
    if (ctrl.editTarget) {
      void ctrl.updateRabbanut(ctrl.editTarget.id, data)
    } else {
      void ctrl.createRabbanut(data)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.rabbanuts?.title ?? 'Rabbanuts'}</div>
          <div className="page-sub">{ctrl.rabbanuts.length} {t.rabbanuts?.count ?? 'organizations'}</div>
        </div>
        <div className="page-actions">
          <Button onClick={ctrl.openForm}>{t.rabbanuts?.add ?? '+ Add'}</Button>
        </div>
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : ctrl.rabbanuts.length === 0 ? (
        <div className="empty-state">—</div>
      ) : (
        <div className="rabbanuts-list">
          {ctrl.rabbanuts.map(r => {
            const stats = ctrl.getStats(r)
            return (
              <div
                key={r.id}
                className="rabbanut-row"
                style={{ '--c': r.color } as React.CSSProperties}
              >
                <div className="rabbanut-row-accent" />

                <div className="rabbanut-row-info">
                  <div className="rabbanut-row-name">{r.name}</div>
                  <div className="rabbanut-row-city">{r.city} · {r.contact}</div>
                  <div className="rabbanut-row-contacts">{r.phone} · {r.email}</div>
                </div>

                <div className="rabbanut-row-stats">
                  <div className="rabbanut-stat">
                    <span className="rabbanut-stat-value">{stats.restaurants}</span>
                    <span className="rabbanut-stat-label">{t.rabbanuts?.restaurants ?? 'restaurants'}</span>
                  </div>
                  <div className="rabbanut-stat">
                    <span className="rabbanut-stat-value">{stats.mashgichim}</span>
                    <span className="rabbanut-stat-label">{t.rabbanuts?.mashgichim ?? 'mashgichim'}</span>
                  </div>
                  {stats.critical > 0 && (
                    <Badge label={`${stats.critical} critical`} color="var(--status-crit)" small />
                  )}
                </div>

                <div className="rabbanut-row-actions">
                  <Badge
                    label={r.active ? (t.rabbanuts?.active ?? 'Active') : (t.rabbanuts?.inactive ?? 'Inactive')}
                    color={r.active ? 'var(--status-ok)' : 'var(--text-muted)'}
                    small
                  />
                  <button
                    className="btn-ghost"
                    onClick={() => ctrl.openEdit(r)}
                    title="Edit"
                  >
                    ✏
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => ctrl.toggleRabbanut(r.id)}
                    title={r.active ? 'Deactivate' : 'Activate'}
                  >
                    {r.active ? '⏸' : '▶'}
                  </button>
                  <button
                    className="btn-ghost btn-ghost--danger"
                    onClick={() => ctrl.deleteRabbanut(r.id)}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ctrl.showForm && (
        <RabbanutForm
          initial={ctrl.editTarget ?? undefined}
          onSave={handleSave}
          onClose={ctrl.closeForm}
        />
      )}
    </div>
  )
}
