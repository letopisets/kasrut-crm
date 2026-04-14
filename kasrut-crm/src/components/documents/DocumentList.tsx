import type { KashrutDocument } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { DOCUMENT_CATEGORY_COLOR } from '@/lib/statusColor'

interface Props {
  documents: KashrutDocument[]
  canEdit:   boolean
  onDelete:  (id: string) => void
}

const EXT_COLOR: Record<string, string> = {
  PDF:  '#E74C3C',
  DOCX: '#3498DB',
  XLSX: '#2ECC71',
}

export function DocumentList({ documents, canEdit, onDelete }: Props) {
  const t = useLang()

  if (!documents.length) {
    return <div className="empty-state">{t.documents?.empty ?? 'No documents'}</div>
  }

  return (
    <div className="document-list">
      {documents.map(d => (
        <div key={d.id} className="document-row">
          <div className="document-ext" style={{ '--c': EXT_COLOR[d.ext] ?? '#888' } as React.CSSProperties}>
            {d.ext}
          </div>

          <div className="document-info">
            <div className="document-name">{d.name}</div>
            <div className="document-meta">
              <span>{d.date}</span>
              <span className="document-size">{d.size}</span>
            </div>
          </div>

          <Badge
            label={d.category}
            color={DOCUMENT_CATEGORY_COLOR[d.category]}
            small
          />

          {canEdit && (
            <button
              className="document-delete"
              onClick={() => onDelete(d.id)}
              title={t.documents?.delete ?? 'Delete'}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
