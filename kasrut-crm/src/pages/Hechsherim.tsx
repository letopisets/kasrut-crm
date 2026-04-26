import { useHechsherimController } from '@/controllers/useHechsherimController'
import { useLang } from '@/i18n/useLang'
import { HechsherGrid } from '@/components/hechsherim/HechsherGrid'
import { HechsherForm } from '@/components/hechsherim/HechsherForm'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import AddIcon from '@mui/icons-material/Add'

export default function Hechsherim() {
  const t    = useLang()
  const ctrl = useHechsherimController()

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.hechsherim?.title ?? 'Hechsherim'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {ctrl.hechsherim.length} {t.hechsherim?.count ?? 'hechsherim'}
          </Typography>
        </Box>
        {ctrl.canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={ctrl.openForm} size="small" disableElevation>
            {t.hechsherim?.add ?? '+ Add'}
          </Button>
        )}
      </Box>

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.hechsherim.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {t.hechsherim?.empty ?? 'No hechsherim'}
        </Typography>
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
    </Box>
  )
}
