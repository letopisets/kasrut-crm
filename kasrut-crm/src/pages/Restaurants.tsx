import { useRestaurantsController } from '@/controllers/useRestaurantsController'
import { useLang } from '@/i18n/useLang'
import { RestaurantList } from '@/components/restaurants/RestaurantList'
import { RestaurantForm } from '@/components/restaurants/RestaurantForm'
import { STATUS_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import InputAdornment from '@mui/material/InputAdornment'
import type { CertStatus } from '@/types'

type Filter = 'all' | CertStatus
const FILTER_KEYS: Filter[] = ['all', 'ok', 'warning', 'critical']

const selectSx = {
  minWidth: 130,
  '& .MuiInputBase-root': { fontSize: '0.8rem', height: 32 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#252840' },
  '& .MuiSelect-select': { py: '5px' },
}

export default function Restaurants() {
  const t    = useLang()
  const ctrl = useRestaurantsController()

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.restaurants.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>{t.restaurants.sub}</Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 0.375 }}>
            {FILTER_KEYS.map((key, i) => {
              const color  = key === 'all' ? '#E8C96D' : STATUS_COLORS[key as CertStatus]
              const active = ctrl.statusFilter === key
              return (
                <Button
                  key={key}
                  onClick={() => ctrl.setStatusFilter(key)}
                  size="small"
                  sx={{
                    minWidth: 0, px: 1.5, py: '5px',
                    fontSize: '0.75rem', fontWeight: active ? 700 : 500,
                    color: active ? color : '#50526A',
                    background: active ? alpha(color, 0.06) : 'transparent',
                    border: '1px solid',
                    borderColor: active ? alpha(color, 0.25) : '#252840',
                    borderRadius: 1,
                    textTransform: 'none',
                    '&:hover': { borderColor: '#50526A', color: '#9A9AB0' },
                  }}
                >
                  {t.restaurants.filters[i]}
                </Button>
              )
            })}
          </Box>

          {ctrl.canEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={ctrl.openForm}
              size="small"
              disableElevation
            >
              {t.restaurants.add}
            </Button>
          )}
        </Box>
      </Box>
      {/* Search + filters row */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.75, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder={t.addRest.name}
          value={ctrl.nameSearch}
          onChange={e => ctrl.setNameSearch(e.target.value)}
          sx={{
            minWidth: 180,
            '& .MuiInputBase-root': { fontSize: '0.8rem', height: 32 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#252840' },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }
          }}
        />

        <TextField
          select
          size="small"
          value={ctrl.hechsherFilter}
          onChange={e => ctrl.setHechsherFilter(e.target.value)}
          sx={selectSx}
        >
          <MenuItem value=""><em>{t.addRest.hechsher}</em></MenuItem>
          {ctrl.hechsherOptions.map(o => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>

        {ctrl.isOwner && (
          <TextField
            select
            size="small"
            value={ctrl.rabbanutFilter}
            onChange={e => ctrl.setRabbanutFilter(e.target.value)}
            sx={selectSx}
          >
            <MenuItem value=""><em>{t.nav.rabbanuts}</em></MenuItem>
            {ctrl.rabbanutOptions.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.restaurants.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>—</Typography>
      ) : (
        <RestaurantList
          restaurants={ctrl.restaurants}
          hechsherim={ctrl.hechsherim}
          mashgichim={ctrl.mashgichim}
          rabbanuts={ctrl.rabbanuts}
          canEdit={ctrl.canEdit}
          onEdit={ctrl.openEdit}
          onDelete={ctrl.deleteRestaurant}
        />
      )}
      {ctrl.showForm   && <RestaurantForm onClose={ctrl.closeForm} />}
      {ctrl.editTarget && <RestaurantForm initial={ctrl.editTarget} onClose={ctrl.closeEdit} />}
    </Box>
  );
}
