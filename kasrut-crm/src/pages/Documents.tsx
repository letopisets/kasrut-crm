import { useDocumentsController } from '@/controllers/useDocumentsController'
import { useLang } from '@/i18n/useLang'
import { DocumentList } from '@/components/documents/DocumentList'
import { DocumentUpload } from '@/components/documents/DocumentUpload'
import { DOCUMENT_CATEGORY_COLOR } from '@/lib/statusColor'
import type { DocumentCategory } from '@/types'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import AddIcon from '@mui/icons-material/Add'

const CATEGORIES: Array<DocumentCategory | 'all'> = ['all', 'Instructions', 'Forms', 'Regulations', 'Pesach']

export default function Documents() {
  const t    = useLang()
  const ctrl = useDocumentsController()

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.documents?.title ?? 'Documents'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {ctrl.documents.length} {t.documents?.count ?? 'documents'}
          </Typography>
        </Box>
        {ctrl.canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={ctrl.openUpload} size="small" disableElevation>
            {t.documents?.upload ?? '+ Upload'}
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
        {CATEGORIES.map(cat => {
          const active = ctrl.category === cat
          const color  = cat === 'all' ? '#E8C96D' : DOCUMENT_CATEGORY_COLOR[cat as DocumentCategory]
          return (
            <Button
              key={cat}
              size="small"
              onClick={() => ctrl.setCategory(cat)}
              sx={{
                borderRadius: '20px', px: 1.75, py: 0.5,
                fontSize: 12, fontWeight: active ? 600 : 400,
                color:      active ? color : 'text.secondary',
                background: active ? alpha(color, 0.12) : 'transparent',
                border:    `1px solid ${active ? alpha(color, 0.4) : 'transparent'}`,
                '&:hover':  { background: alpha(color, 0.08), color },
                transition: 'all 0.15s',
                textTransform: 'none',
              }}
            >
              {cat === 'all' ? (t.documents?.all ?? 'All') : cat}
            </Button>
          )
        })}
      </Box>

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
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
    </Box>
  )
}
