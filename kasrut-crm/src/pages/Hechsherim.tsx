import { useHechsherimController } from '@/controllers/useHechsherimController'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { HechsherGrid } from '@/components/hechsherim/HechsherGrid'
import { HechsherForm } from '@/components/hechsherim/HechsherForm'

export default function Hechsherim() {
  const t    = useLang()
  const ctrl = useHechsherimController()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.hechsherim?.title ?? 'Hechsherim'}</div>
          <div className="page-sub">{ctrl.hechsherim.length} {t.hechsherim?.count ?? 'hechsherim'}</div>
        </div>
        {ctrl.canEdit && (
          <div className="page-actions">
            <Button onClick={ctrl.openForm}>{t.hechsherim?.add ?? '+ Add'}</Button>
          </div>
        )}
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : ctrl.hechsherim.length === 0 ? (
        <div className="empty-state">{t.hechsherim?.empty ?? 'No hechsherim'}</div>
      ) : (
        <HechsherGrid
          hechsherim={ctrl.hechsherim}
          expandedId={ctrl.expandedId}
          canEdit={ctrl.canEdit}
          getStats={ctrl.getStats}
          getMashgichimForHechsher={ctrl.getMashgichimForHechsher}
          onToggle={ctrl.toggleExpand}
          onDelete={ctrl.deleteHechsher}
        />
      )}

      {ctrl.showForm && (
        <HechsherForm
          rabbanutOptions={ctrl.rabbanutOptions}
          onSave={ctrl.createHechsher}
          onClose={ctrl.closeForm}
        />
      )}
    </div>
  )
}
