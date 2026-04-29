import { useEffect, useState } from 'react'
import {
  Box, AppBar, Toolbar, Typography,
  IconButton, Badge, ToggleButtonGroup, ToggleButton,
  Fab, Tooltip, Avatar, Menu, MenuItem, CircularProgress, Button,
} from '@mui/material'
import TuneIcon        from '@mui/icons-material/Tune'
import MapIcon         from '@mui/icons-material/Map'
import ListIcon        from '@mui/icons-material/List'
import MyLocationIcon  from '@mui/icons-material/MyLocation'
import EditLocationIcon from '@mui/icons-material/EditLocation'
import MenuBookIcon    from '@mui/icons-material/MenuBook'
import AddBusinessIcon from '@mui/icons-material/AddBusiness'
import PersonIcon      from '@mui/icons-material/Person'
import LogoutIcon      from '@mui/icons-material/Logout'
import DarkModeIcon    from '@mui/icons-material/DarkMode'
import LightModeIcon   from '@mui/icons-material/LightMode'

import { AuthDialog }             from '@/components/auth/AuthDialog'
import { LegalNotice }            from '@/components/community/LegalNotice'
import { SuggestionDialog }       from '@/components/community/SuggestionDialog'
import { MapView }               from '@/components/map/MapView'
import { RestaurantListView }    from '@/components/list/RestaurantListView'
import { FilterPanel }           from '@/components/filters/FilterPanel'
import { RestaurantDetailSheet } from '@/components/filters/RestaurantDetailSheet'
import { RoutePanel }            from '@/components/filters/RoutePanel'
import { LocationCorrector }     from '@/components/location/LocationCorrector'
import { useMapController }      from '@/controllers/useMapController'
import { useIpCenter }           from '@/hooks/useIpCenter'
import { useGetMapMeQuery }      from '@/store/api/mapCommunityApi'
import { clearCredentials, setUser } from '@/store/mapAuthSlice'
import { setMapLang, type MapLang } from '@/store/mapLangSlice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useMapLang }            from '@/i18n/useMapLang'
import type { ThemeMode } from '@/theme'
import type { MapRestaurant } from '@/types'

interface Props {
  themeMode: ThemeMode
  onToggleThemeMode: () => void
}

const LANGS: MapLang[] = ['en', 'ru', 'he']

export default function MapPage({ themeMode, onToggleThemeMode }: Props) {
  const ctrl = useMapController()
  const ipCenter = useIpCenter()
  const dispatch = useAppDispatch()
  const t = useMapLang()
  const user = useAppSelector(state => state.mapAuth.user)
  const token = useAppSelector(state => state.mapAuth.token)
  const lang = useAppSelector(state => state.mapLang.lang)
  const { data: freshUser, isError: authExpired } = useGetMapMeQuery(undefined, { skip: !token })
  const [authOpen, setAuthOpen] = useState(false)
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null)
  const [suggestionOpen, setSuggestionOpen] = useState(false)
  const [suggestionRestaurant, setSuggestionRestaurant] = useState<MapRestaurant | null>(null)

  const openAddSuggestion = () => {
    setSuggestionRestaurant(null)
    setSuggestionOpen(true)
  }

  const openEditSuggestion = (restaurant: MapRestaurant) => {
    setSuggestionRestaurant(restaurant)
    setSuggestionOpen(true)
  }

  const logout = () => {
    dispatch(clearCredentials())
    setAccountAnchor(null)
  }

  useEffect(() => {
    if (freshUser) dispatch(setUser(freshUser))
  }, [dispatch, freshUser])

  useEffect(() => {
    if (authExpired) dispatch(clearCredentials())
  }, [authExpired, dispatch])

  const mapRestaurants = ctrl.view === 'map' ? ctrl.restaurants : []
  const restaurantCountLabel = ctrl.restaurantResultLimited
    ? t.establishmentCountLimited
      .replace('{shown}', String(ctrl.restaurants.length))
      .replace('{total}', String(ctrl.restaurantTotal))
    : t.establishmentCount.replace('{n}', String(ctrl.restaurants.length))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── AppBar ── */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1200 }}>
        <Toolbar sx={{ gap: 1 }}>
          <MenuBookIcon sx={{ color: 'primary.main', mr: 0.5 }} />
          <Typography variant="h6" fontWeight={800} color="primary.main" noWrap sx={{ flexGrow: 1, minWidth: 0, letterSpacing: 0 }}>
            {t.appName}
          </Typography>

          {/* Language switcher */}
          <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            {LANGS.map(l => (
              <Button
                key={l}
                onClick={() => dispatch(setMapLang(l))}
                size="small"
                sx={{
                  minWidth: 0,
                  px: 1.25, py: '4px',
                  fontSize: '0.625rem',
                  fontWeight: lang === l ? 700 : 500,
                  color: lang === l ? 'primary.main' : 'text.disabled',
                  bgcolor: lang === l ? 'rgba(232,165,7,0.08)' : 'transparent',
                  borderRadius: 0,
                  letterSpacing: '0.5px',
                  '&:hover': { color: 'text.secondary' },
                }}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </Box>

          <Tooltip title={t.suggestBusiness}>
            <IconButton onClick={openAddSuggestion} sx={{ color: 'text.secondary' }}>
              <AddBusinessIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={themeMode === 'light' ? t.darkTheme : t.lightTheme}>
            <IconButton onClick={onToggleThemeMode} sx={{ color: 'text.secondary' }}>
              {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

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
          <Tooltip title={t.filtersTooltip}>
            <IconButton onClick={() => ctrl.setFilterOpen(true)} sx={{ color: ctrl.activeFilterCount ? 'primary.main' : 'text.secondary' }}>
              <Badge badgeContent={ctrl.activeFilterCount || null} color="primary">
                <TuneIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {user ? (
            <>
              <Tooltip title={user.name}>
                <IconButton onClick={(event) => setAccountAnchor(event.currentTarget)} sx={{ p: 0.5 }}>
                  <Avatar src={user.avatarUrl ?? undefined} sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 14 }}>
                    {user.name.slice(0, 1).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={accountAnchor}
                open={Boolean(accountAnchor)}
                onClose={() => setAccountAnchor(null)}
              >
                <MenuItem disabled>{user.name}</MenuItem>
                <MenuItem onClick={logout}>
                  <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
                  {t.logout}
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Tooltip title={t.loginTooltip}>
              <IconButton onClick={() => setAuthOpen(true)} sx={{ color: 'text.secondary' }}>
                <PersonIcon />
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>

      <LegalNotice />

      {/* ── Content ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Map view */}
        <Box sx={{
          position: 'absolute', inset: 0,
          visibility: ctrl.view === 'map' ? 'visible' : 'hidden',
        }}>
          <MapView
            userPosition={ctrl.geo.position}
            gpsAccuracy={ctrl.geo.accuracy}
            initialCenter={ipCenter}
            panToUser={ctrl.panToUser}
            correcting={ctrl.correcting}
            restaurants={mapRestaurants}
            selected={ctrl.selected}
            viewport={ctrl.viewport}
            radius={ctrl.filters.radius}
            route={ctrl.route}
            onSelect={ctrl.setSelected}
            onPanHandled={ctrl.onPanHandled}
            onMapClick={ctrl.applyPosition}
            onViewportChange={ctrl.setViewport}
          />

          {ctrl.isFetching && !ctrl.correcting && (
            <Box
              sx={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                borderRadius: 99, px: 1.5, py: 0.75, zIndex: 1000,
                boxShadow: '0 2px 12px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 1,
              }}
            >
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">{t.updatingMap}</Typography>
            </Box>
          )}

          {ctrl.correcting && (
            <LocationCorrector
              onApply={ctrl.applyPosition}
              onCancel={ctrl.stopCorrection}
            />
          )}

          {/* FABs */}
          <Box sx={{ position: 'absolute', bottom: 24, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Tooltip title={t.correctLocation} placement="left">
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
            <Tooltip
              title={ctrl.geo.loading ? t.detectingLocation : t.myLocation}
              placement="left"
            >
              <Fab
                size="small"
                color="primary"
                onClick={ctrl.goToMyLocation}
                sx={{ boxShadow: 4, position: 'relative' }}
              >
                {ctrl.geo.loading
                  ? <CircularProgress size={20} sx={{ color: 'inherit' }} />
                  : <MyLocationIcon />}
              </Fab>
            </Tooltip>
          </Box>

          {/* Results count bubble */}
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
                {restaurantCountLabel}
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

        {/* Route panel */}
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

      {/* ── Bottom sheet ── */}
      <RestaurantDetailSheet
        restaurant={ctrl.routePanelOpen ? null : ctrl.selected}
        hasLocation={!!ctrl.geo.position}
        onClose={() => ctrl.setSelected(null)}
        onStartRoute={ctrl.startRoute}
        onSuggestEdit={openEditSuggestion}
        onRequireAuth={() => setAuthOpen(true)}
        formatDist={ctrl.formatDist}
        user={user}
      />

      {/* ── Filter drawer ── */}
      <FilterPanel
        open={ctrl.filterOpen}
        onClose={() => ctrl.setFilterOpen(false)}
        filters={ctrl.filters}
        activeFilterCount={ctrl.activeFilterCount}
        availableHechshers={ctrl.availableHechshers}
        availableCities={ctrl.availableCities}
        onToggleHechsher={ctrl.toggleHechsher}
        onToggleFoodType={ctrl.toggleFoodType}
        onSetCity={ctrl.setCity}
        onSetRadius={ctrl.setRadius}
        onReset={ctrl.resetFilters}
      />

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <SuggestionDialog
        open={suggestionOpen}
        restaurant={suggestionRestaurant}
        isAuthenticated={Boolean(user)}
        onClose={() => setSuggestionOpen(false)}
        onRequireAuth={() => setAuthOpen(true)}
      />
    </Box>
  )
}
