import {
  Box, AppBar, Toolbar, Typography,
  IconButton, Badge, ToggleButtonGroup, ToggleButton,
  Fab, Tooltip,
} from '@mui/material'
import TuneIcon        from '@mui/icons-material/Tune'
import MapIcon         from '@mui/icons-material/Map'
import ListIcon        from '@mui/icons-material/List'
import MyLocationIcon  from '@mui/icons-material/MyLocation'
import EditLocationIcon from '@mui/icons-material/EditLocation'
import MenuBookIcon    from '@mui/icons-material/MenuBook'

import { MapView }               from '@/components/map/MapView'
import { RestaurantListView }    from '@/components/list/RestaurantListView'
import { FilterPanel }           from '@/components/filters/FilterPanel'
import { RestaurantDetailSheet } from '@/components/filters/RestaurantDetailSheet'
import { RoutePanel }            from '@/components/filters/RoutePanel'
import { LocationCorrector }     from '@/components/location/LocationCorrector'
import { useMapController }      from '@/controllers/useMapController'

export default function MapPage() {
  const ctrl = useMapController()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── AppBar ── */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1200 }}>
        <Toolbar sx={{ gap: 1 }}>
          <MenuBookIcon sx={{ color: 'primary.main', mr: 0.5 }} />
          <Typography variant="h6" fontWeight={800} color="primary.main" sx={{ flexGrow: 1, letterSpacing: -0.5 }}>
            KashrutMap
          </Typography>

          {/* Map / List toggle */}
          <ToggleButtonGroup
            value={ctrl.view}
            exclusive
            onChange={(_e, v) => { if (v) ctrl.setView(v) }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': { px: 1.5, borderColor: 'divider', color: 'text.secondary' },
              '& .Mui-selected': { color: 'primary.main !important', bgcolor: 'rgba(232,165,7,0.1) !important' },
            }}
          >
            <ToggleButton value="map"  aria-label="map"><MapIcon  fontSize="small" /></ToggleButton>
            <ToggleButton value="list" aria-label="list"><ListIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>

          {/* Filters */}
          <Tooltip title="Фильтры">
            <IconButton onClick={() => ctrl.setFilterOpen(true)} sx={{ color: ctrl.activeFilterCount ? 'primary.main' : 'text.secondary' }}>
              <Badge badgeContent={ctrl.activeFilterCount || null} color="primary">
                <TuneIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* ── Content ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Map view */}
        <Box sx={{
          position: 'absolute', inset: 0,
          visibility: ctrl.view === 'map' ? 'visible' : 'hidden',
        }}>
          <MapView
            userPosition={ctrl.geo.position}
            panToUser={ctrl.panToUser}
            correcting={ctrl.correcting}
            restaurants={ctrl.restaurants}
            selected={ctrl.selected}
            radius={ctrl.filters.radius}
            route={ctrl.route}
            onSelect={r => ctrl.setSelected(r)}
            onPanHandled={ctrl.onPanHandled}
            onMapClick={ctrl.applyPosition}
          />

          {/* Location correction overlay */}
          {ctrl.correcting && (
            <LocationCorrector
              onApply={ctrl.applyPosition}
              onCancel={ctrl.stopCorrection}
            />
          )}

          {/* FAB row: My Location + Уточнить */}
          <Box sx={{ position: 'absolute', bottom: 24, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Tooltip title="Уточнить моё местоположение" placement="left">
              <Fab
                size="small"
                onClick={ctrl.startCorrection}
                sx={{
                  bgcolor: ctrl.correcting ? 'primary.main' : 'background.paper',
                  color:   ctrl.correcting ? 'background.paper' : 'primary.main',
                  border: '1px solid',
                  borderColor: 'primary.main',
                  boxShadow: 3,
                  '&:hover': { bgcolor: 'rgba(232,165,7,0.15)' },
                }}
              >
                <EditLocationIcon fontSize="small" />
              </Fab>
            </Tooltip>
            <Fab
              size="small"
              color="primary"
              onClick={ctrl.goToMyLocation}
              title="Моё местоположение"
              sx={{ boxShadow: 4 }}
            >
              <MyLocationIcon />
            </Fab>
          </Box>

          {/* Results count bubble — click to open list */}
          {ctrl.restaurants.length > 0 && !ctrl.correcting && (
            <Box
              onClick={() => ctrl.setView('list')}
              sx={{
                position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'primary.main',
                borderRadius: 99, px: 2, py: 0.75, zIndex: 1000,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                cursor: 'pointer', userSelect: 'none',
                transition: 'background 0.15s',
                '&:hover': { bgcolor: 'rgba(232,165,7,0.12)' },
              }}
            >
              <Typography variant="caption" color="primary.main" fontWeight={700}>
                {ctrl.restaurants.length} заведений ›
              </Typography>
            </Box>
          )}
        </Box>

        {/* List view */}
        {ctrl.view === 'list' && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <RestaurantListView
              restaurants={ctrl.restaurants}
              onSelect={r => { ctrl.setSelected(r); ctrl.setView('map') }}
              onStartRoute={ctrl.startRoute}
              formatDist={ctrl.formatDist}
            />
          </Box>
        )}

        {/* Route panel (right side) */}
        <RoutePanel
          open={ctrl.routePanelOpen}
          destination={ctrl.selected}
          route={ctrl.route}
          loading={ctrl.routeLoading}
          error={ctrl.routeError}
          onClose={ctrl.stopRoute}
          formatDist={ctrl.formatDist}
          formatTime={ctrl.formatTime}
        />
      </Box>

      {/* ── Bottom sheet: restaurant detail ── */}
      <RestaurantDetailSheet
        restaurant={ctrl.routePanelOpen ? null : ctrl.selected}
        hasLocation={!!ctrl.geo.position}
        onClose={() => ctrl.setSelected(null)}
        onStartRoute={ctrl.startRoute}
        formatDist={ctrl.formatDist}
      />

      {/* ── Filter drawer ── */}
      <FilterPanel
        open={ctrl.filterOpen}
        onClose={() => ctrl.setFilterOpen(false)}
        filters={ctrl.filters}
        activeFilterCount={ctrl.activeFilterCount}
        onToggleKashrut={ctrl.toggleKashrutLevel}
        onToggleFoodType={ctrl.toggleFoodType}
        onSetCity={ctrl.setCity}
        onSetRadius={ctrl.setRadius}
        onReset={ctrl.resetFilters}
      />
    </Box>
  )
}
