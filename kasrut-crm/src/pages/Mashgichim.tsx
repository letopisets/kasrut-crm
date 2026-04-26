import { useMashgichimController } from '@/controllers/useMashgichimController'
import { useLang } from '@/i18n/useLang'
import { MashgiachGrid } from '@/components/mashgichim/MashgiachGrid'
import { MashgiachForm } from '@/components/mashgichim/MashgiachForm'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import AddIcon from '@mui/icons-material/Add'

export default function Mashgichim() {
  const t    = useLang()
  const ctrl = useMashgichimController()

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.mashgichim?.title ?? 'Mashgichim'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {ctrl.mashgichim.length} {t.mashgichim?.count ?? 'mashgichim'}
          </Typography>
        </Box>
        {ctrl.canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={ctrl.openForm} size="small" disableElevation>
            {t.mashgichim?.add ?? '+ Add'}
          </Button>
        )}
      </Box>

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.mashgichim.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {t.mashgichim?.empty ?? 'No mashgichim'}
        </Typography>
      ) : (
        <MashgiachGrid
          mashgichim={ctrl.mashgichim}
          hechsherim={ctrl.hechsherim}
          canEdit={ctrl.canEdit}
          onToggle={ctrl.toggleMashgiach}
          onDelete={ctrl.deleteMashgiach}
          onEdit={ctrl.openEdit}
        />
      )}

      {ctrl.showForm && (
        <MashgiachForm
          hechsherOptions={ctrl.hechsherOptions}
          onSave={ctrl.createMashgiach}
          onClose={ctrl.closeForm}
        />
      )}
      {ctrl.editTarget && (
        <MashgiachForm
          hechsherOptions={ctrl.hechsherOptions}
          initial={ctrl.editTarget}
          onSave={ctrl.updateMashgiach}
          onClose={ctrl.closeEdit}
        />
      )}
    </Box>
  )
}
