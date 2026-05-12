import { useInspectionsController } from '@/controllers/useInspectionsController'
import { useLang }                  from '@/i18n/useLang'
import { useAppSelector }           from '@/store'
import { InspectionList }           from '@/components/inspections/InspectionList'
import { InspectionForm }           from '@/components/inspections/InspectionForm'
import { ROLE_COLORS, TYPE_COLORS, RESULT_COLORS } from '@/theme'
import { alpha }     from '@mui/material/styles'
import Box           from '@mui/material/Box'
import Typography    from '@mui/material/Typography'
import Button        from '@mui/material/Button'
import Divider       from '@mui/material/Divider'
import AddIcon       from '@mui/icons-material/Add'
import type { InspectionType, InspectionResult } from '@/types'

function FilterBtn({ active, color, onClick, label }: {
  active: boolean; color: string; onClick: () => void; label: string
}) {
  return (
    <Button
      onClick={onClick}
      size="small"
      sx={{
        minWidth: 0, px: 1.5, py: '5px',
        fontSize: '0.75rem', fontWeight: active ? 700 : 500,
        color: active ? color : '#50526A',
        background: active ? alpha(color, 0.06) : 'transparent',
        border: '1px solid',
        borderColor: active ? alpha(color, 0.25) : '#252840',
        borderRadius: 1, textTransform: 'none',
        '&:hover': { borderColor: '#50526A', color: '#9A9AB0' },
      }}
    >
      {label}
    </Button>
  )
}

export default function Inspections() {
  const {
    inspections,
    typeFilter,   setTypeFilter,
    resultFilter, setResultFilter,
    showForm, openForm, closeForm,
    canEdit,
    TYPE_FILTERS, RESULT_FILTERS,
  } = useInspectionsController()

  const t    = useLang()
  const role = useAppSelector(s => s.auth.role)
  const rc   = ROLE_COLORS[role]

  const typeLabel = (key: typeof TYPE_FILTERS[number]): string => {
    if (key === 'all')     return t.restaurants.filters[0]
    if (key === 'planned') return t.inspections.planned
    return t.inspections.urgent
  }

  const resultLabel = (key: typeof RESULT_FILTERS[number]): string =>
    key === 'all' ? t.restaurants.filters[0] : t.inspections.result[key as InspectionResult]

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.inspections.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>{t.inspections.sub}</Typography>
        </Box>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openForm} size="small" disableElevation>
            {t.inspections.add}
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 0.375, flexWrap: 'wrap' }}>
          {TYPE_FILTERS.map(key => (
            <FilterBtn
              key={key}
              active={typeFilter === key}
              color={key === 'all' ? rc : TYPE_COLORS[key as InspectionType]}
              onClick={() => setTypeFilter(key)}
              label={typeLabel(key)}
            />
          ))}
        </Box>
        <Divider orientation="vertical" flexItem sx={{ borderColor: 'divider', display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ display: 'flex', gap: 0.375, flexWrap: 'wrap' }}>
          {RESULT_FILTERS.map(key => (
            <FilterBtn
              key={key}
              active={resultFilter === key}
              color={key === 'all' ? rc : RESULT_COLORS[key as InspectionResult]}
              onClick={() => setResultFilter(key)}
              label={resultLabel(key)}
            />
          ))}
        </Box>
      </Box>

      {inspections.length === 0
        ? <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>—</Typography>
        : <InspectionList inspections={inspections} />
      }

      {showForm && <InspectionForm onClose={closeForm} />}
    </Box>
  )
}
