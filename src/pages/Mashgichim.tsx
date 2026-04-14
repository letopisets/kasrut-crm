import { useMashgichimController } from '@/controllers/useMashgichimController'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { MashgiachGrid } from '@/components/mashgichim/MashgiachGrid'
import { MashgiachForm } from '@/components/mashgichim/MashgiachForm'

export default function Mashgichim() {
  const t    = useLang()
  const ctrl = useMashgichimController()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.mashgichim?.title ?? 'Mashgichim'}</div>
          <div className="page-sub">{ctrl.mashgichim.length} {t.mashgichim?.count ?? 'mashgichim'}</div>
        </div>
        {ctrl.canEdit && (
          <div className="page-actions">
            <Button onClick={ctrl.openForm}>{t.mashgichim?.add ?? '+ Add'}</Button>
          </div>
        )}
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : ctrl.mashgichim.length === 0 ? (
        <div className="empty-state">{t.mashgichim?.empty ?? 'No mashgichim'}</div>
      ) : (
        <MashgiachGrid
          mashgichim={ctrl.mashgichim}
          hechsherim={ctrl.hechsherim}
          canEdit={ctrl.canEdit}
          onToggle={ctrl.toggleMashgiach}
          onDelete={ctrl.deleteMashgiach}
        />
      )}

      {ctrl.showForm && (
        <MashgiachForm
          hechsherOptions={ctrl.hechsherOptions}
          onSave={ctrl.createMashgiach}
          onClose={ctrl.closeForm}
        />
      )}
    </div>
  )
}
