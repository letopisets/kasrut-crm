import type { KashrutDocument } from '@/types'
import { Badge } from '@/components/ui'
import { DOCUMENT_CATEGORY_COLOR } from '@/lib/statusColor'
import { httpsHref } from '@/lib/safeUrl'
import { documentCategoryLabel } from '@/lib/documents'
import { useLang } from '@/i18n/useLang'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import DeleteIcon from '@mui/icons-material/Delete'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

interface Props {
  documents:  KashrutDocument[]
  canDelete:  (d: KashrutDocument) => boolean
  scopeLabel: (d: KashrutDocument) => string
  onDelete:   (id: string) => void
}

const EXT_COLOR: Record<string, string> = {
  PDF:  '#E74C3C',
  DOCX: '#3498DB',
  XLSX: '#2ECC71',
}

const GLOBAL_COLOR = '#E8C96D'
const TENANT_COLOR = '#9B8FD9'

export function DocumentList({ documents, canDelete, scopeLabel, onDelete }: Props) {
  const t = useLang()

  if (!documents.length) {
    return (
      <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
        {t.documents.empty}
      </Typography>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {documents.map(d => {
        const ec   = EXT_COLOR[d.ext] ?? '#888'
        // Only absolute https links are clickable; anything else (javascript:,
        // data:, http:) stays plain text.
        const href = httpsHref(d.url)
        return (
          <Box key={d.id} sx={{
            background: '#161929', border: '1px solid #252840', borderRadius: 2.5,
            px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.75,
            transition: 'background 0.18s', '&:hover': { background: '#1E2235' },
          }}>
            <Box sx={{
              width: 40, height: 40, borderRadius: 0.75, flexShrink: 0,
              background: alpha(ec, 0.09), border: `1px solid ${alpha(ec, 0.22)}`,
              color: ec, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
            }}>
              {d.ext}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.name}
              </Typography>
              <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25 }}>
                {d.date} · {d.size}
              </Typography>
            </Box>

            <Badge label={scopeLabel(d)} color={d.rabbanutId ? TENANT_COLOR : GLOBAL_COLOR} small />
            <Badge label={documentCategoryLabel(t, d.category)} color={DOCUMENT_CATEGORY_COLOR[d.category]} small />

            {href && (
              <Tooltip title={t.documents.view}>
                <IconButton
                  size="small"
                  component="a"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.documents.view}
                  sx={{ color: 'text.secondary', '&:hover': { color: GLOBAL_COLOR }, flexShrink: 0 }}
                >
                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}

            {canDelete(d) && (
              <Tooltip title={t.documents.delete}>
                <IconButton
                  size="small"
                  onClick={() => onDelete(d.id)}
                  aria-label={t.documents.delete}
                  sx={{ color: alpha('#E74C3C', 0.6), '&:hover': { color: '#E74C3C' }, flexShrink: 0 }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
