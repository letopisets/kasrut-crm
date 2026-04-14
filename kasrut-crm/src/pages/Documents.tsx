import { useDocumentsController } from '@/controllers/useDocumentsController'
import { useLang } from '@/i18n/useLang'
import { Button, Badge } from '@/components/ui'
import { DocumentList }   from '@/components/documents/DocumentList'
import { DocumentUpload } from '@/components/documents/DocumentUpload'
import { DOCUMENT_CATEGORY_COLOR } from '@/lib/statusColor'
import type { DocumentCategory } from '@/types'

const CATEGORIES: Array<DocumentCategory | 'all'> = ['all', 'Instructions', 'Forms', 'Regulations', 'Pesach']

export default function Documents() {
  const t    = useLang()
  const ctrl = useDocumentsController()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.documents?.title ?? 'Documents'}</div>
          <div className="page-sub">{ctrl.documents.length} {t.documents?.count ?? 'documents'}</div>
        </div>
        {ctrl.canEdit && (
          <div className="page-actions">
            <Button onClick={ctrl.openUpload}>{t.documents?.upload ?? '+ Upload'}</Button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => ctrl.setCategory(cat)}
              className={ctrl.category === cat ? 'filter-btn filter-btn--active' : 'filter-btn'}
              style={ctrl.category === cat ? {
                '--c': cat === 'all' ? 'var(--gold)' : DOCUMENT_CATEGORY_COLOR[cat as DocumentCategory],
              } as React.CSSProperties : undefined}
            >
              {cat === 'all' ? (t.documents?.all ?? 'All') : cat}
            </button>
          ))}
        </div>
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <DocumentList
          documents={ctrl.documents}
          canEdit={ctrl.canEdit}
          onDelete={ctrl.deleteDocument}
        />
      )}

      {ctrl.showUpload && (
        <DocumentUpload
          onSave={ctrl.uploadDocument}
          onClose={ctrl.closeUpload}
        />
      )}
    </div>
  )
}
