import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Box, Fab, Tooltip, CircularProgress, Typography,
  Snackbar, Alert,
} from '@mui/material'
import MyLocationIcon   from '@mui/icons-material/MyLocation'
import EditLocationIcon from '@mui/icons-material/EditLocation'
import GpsFixedIcon     from '@mui/icons-material/GpsFixed'

import { LegalNotice }       from '@/components/community/LegalNotice'
import { MapAppBar }         from '@/components/map/MapAppBar'
import { useMapController }  from '@/controllers/useMapController'
import { useIpCenter }       from '@/hooks/useIpCenter'
import { useGetMapMeQuery }  from '@/store/api/mapCommunityApi'
import { clearCredentials, setUser } from '@/store/mapAuthSlice'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { useMapLang }        from '@/i18n/useMapLang'
import type { ThemeMode } from '@/theme'
import type { MapRestaurant, MapViewport } from '@/types'

interface Props {
  themeMode: ThemeMode
  onToggleThemeMode: () => void
}

const AuthDialog = lazy(() =>
  import('@/components/auth/AuthDialog').then(module => ({ default: module.AuthDialog })),
)
const SuggestionDialog = lazy(() =>
  import('@/components/community/SuggestionDialog').then(module => ({ default: module.SuggestionDialog })),
)
const MapView = lazy(() =>
  import('@/components/map/MapView').then(module => ({ default: module.MapView })),
)
const RestaurantListView = lazy(() =>
  import('@/components/list/RestaurantListView').then(module => ({ default: module.RestaurantListView })),
)
const FilterPanel = lazy(() =>
  import('@/components/filters/FilterPanel').then(module => ({ default: module.FilterPanel })),
)
const RestaurantDetailSheet = lazy(() =>
  import('@/components/filters/RestaurantDetailSheet').then(module => ({ default: module.RestaurantDetailSheet })),
)
const RoutePanel = lazy(() =>
  import('@/components/filters/RoutePanel').then(module => ({ default: module.RoutePanel })),
)
const NavigationBanner = lazy(() =>
  import('@/components/map/NavigationBanner').then(module => ({ default: module.NavigationBanner })),
)
const LocationCorrector = lazy(() =>
  import('@/components/location/LocationCorrector').then(module => ({ default: module.LocationCorrector })),
)

function MapSkeleton() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress size={28} />
    </Box>
  )
}

function PanelFallback() {
  return null
}

function getViewportCenter(viewport: MapViewport | null): [number, number] | null {
  if (!viewport) return null
  const { north, south, east, west } = viewport.bounds
  return [(north + south) / 2, (east + west) / 2]
}

export default function MapPage({ themeMode, onToggleThemeMode }: Props) {
  const ipCenter = useIpCenter()
  const ctrl = useMapController({
    fallbackPosition: ipCenter.value,
    fallbackReady: ipCenter.ready,
  })
  const dispatch = useAppDispatch()
  const t = useMapLang()
  const user  = useAppSelector(state => state.mapAuth.user)
  const token = useAppSelector(state => state.mapAuth.token)
  const { data: freshUser, isError: authExpired } = useGetMapMeQuery(undefined, { skip: !token })
  const [authOpen, setAuthOpen] = useState(false)
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false)
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

  useEffect(() => {
    if (freshUser) dispatch(setUser(freshUser))
  }, [dispatch, freshUser])

  useEffect(() => {
    if (!authExpired) return
    dispatch(clearCredentials())
    setSessionExpiredOpen(true)
  }, [authExpired, dispatch])

  const [showMapFetching, setShowMapFetching] = useState(false)

  useEffect(() => {
    if (!ctrl.isFetching) {
      setShowMapFetching(false)
      return
    }

    const timer = window.setTimeout(() => setShowMapFetching(true), 700)
    return () => window.clearTimeout(timer)
  }, [ctrl.isFetching])

  // Markers only appear once the map is zoomed in enough — the list (opened
  // via the count badge) is the primary entry point at the default/overview
  // zoom, and markers reveal themselves when the user zooms in to inspect a
  // specific area.
  const MARKER_VISIBILITY_ZOOM = 14
  const mapRestaurants: MapRestaurant[] =
    ctrl.viewport && ctrl.viewport.zoom >= MARKER_VISIBILITY_ZOOM
      ? ctrl.restaurants
      : []
  const suggestionDefaultPosition = getViewportCenter(ctrl.viewport) ?? ctrl.geo.position ?? ipCenter.value
  const restaurantCountLabel = ctrl.restaurantResultLimited
    ? t.establishmentCountLimited
      .replace('{shown}', String(ctrl.restaurants.length))
      .replace('{total}', String(ctrl.restaurantTotal))
    : t.establishmentCount.replace('{n}', String(ctrl.restaurants.length))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      <MapAppBar
        themeMode={themeMode}
        onToggleThemeMode={onToggleThemeMode}
        activeFilterCount={ctrl.activeFilterCount}
        onOpenFilters={() => ctrl.setFilterOpen(true)}
        view={ctrl.view}
        onSetView={ctrl.setView}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenAddSuggestion={openAddSuggestion}
      />

      <LegalNotice />

      {/* ── Content ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Map view */}
        <Box sx={{
          position: 'absolute', inset: 0,
          visibility: ctrl.view === 'map' ? 'visible' : 'hidden',
        }}>
          <Suspense fallback={<MapSkeleton />}>
            <MapView
              userPosition={ctrl.geo.position}
              gpsAccuracy={ctrl.geo.accuracy}
              userHeading={ctrl.geo.heading}
              initialCenter={ipCenter.value}
              panToUser={ctrl.panToUser}
              followUser={ctrl.followUser}
              navigating={ctrl.routeMode === 'navigate'}
              correcting={ctrl.correcting}
              restaurants={mapRestaurants}
              selected={ctrl.selected}
              viewport={ctrl.viewport}
              radius={ctrl.filters.radius}
              route={ctrl.route}
              onSelect={ctrl.setSelected}
              onPanHandled={ctrl.onPanHandled}
              onFollowHandled={ctrl.onFollowUserHandled}
              onMapClick={ctrl.applyPosition}
              onViewportChange={ctrl.setViewport}
            />
          </Suspense>

          {showMapFetching && !ctrl.correcting && (
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
            <Suspense fallback={<PanelFallback />}>
              <LocationCorrector
                onApply={ctrl.applyPosition}
                onCancel={ctrl.stopCorrection}
              />
            </Suspense>
          )}

          {/* FABs */}
          <Box sx={{ position: 'absolute', bottom: { xs: '10vh', sm: 18 }, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {ctrl.routeMode === 'navigate' && (
              <Tooltip title={t.recenter} placement="left">
                <Fab
                  size="small"
                  color="primary"
                  onClick={ctrl.recenterOnUser}
                  sx={{ boxShadow: 4 }}
                >
                  <GpsFixedIcon fontSize="small" />
                </Fab>
              </Tooltip>
            )}
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

          {ctrl.restaurants.length > 0 && !ctrl.correcting && (
            <Box
              onClick={() => ctrl.setView('list')}
              sx={{
                position: 'absolute',
                bottom: { xs: '10vh', sm: 18 },
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: 99,
                px: 2,
                py: 1,
                boxShadow: 4,
                cursor: 'pointer',
                userSelect: 'none',
                maxWidth: 'calc(100% - 112px)',
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="primary.main" noWrap sx={{ fontWeight: 800 }}>
                {restaurantCountLabel}
              </Typography>
            </Box>
          )}

        </Box>

        {/* List view */}
        {ctrl.view === 'list' && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Suspense fallback={<PanelFallback />}>
              <RestaurantListView
                restaurants={ctrl.restaurants}
                onSelect={(r: MapRestaurant) => { ctrl.setSelected(r); ctrl.setView('map') }}
                onStartRoute={ctrl.startRoute}
                formatDist={ctrl.formatDist}
              />
            </Suspense>
          </Box>
        )}

        {/* Route panel — only in steps mode */}
        {ctrl.routePanelOpen && ctrl.routeMode === 'steps' && (
          <Suspense fallback={<PanelFallback />}>
            <RoutePanel
              open={ctrl.routePanelOpen}
              destination={ctrl.selected}
              route={ctrl.route}
              loading={ctrl.routeLoading}
              error={ctrl.routeError}
              mode={ctrl.routeMode}
              onClose={ctrl.stopRoute}
              onStartNavigation={ctrl.enterNavigation}
              formatDist={ctrl.formatDist}
              formatTime={ctrl.formatTime}
            />
          </Suspense>
        )}

        {/* Navigation banner — overlays the map in navigate mode */}
        {ctrl.routePanelOpen && ctrl.routeMode === 'navigate' && (
          <Suspense fallback={<PanelFallback />}>
            <NavigationBanner
              active={ctrl.activeStep}
              onShowSteps={ctrl.exitNavigation}
              onStop={ctrl.stopRoute}
              formatDist={ctrl.formatDist}
              formatTime={ctrl.formatTime}
            />
          </Suspense>
        )}
      </Box>

      {/* ── Bottom sheet ── */}
      {!ctrl.routePanelOpen && ctrl.selected && (
        <Suspense fallback={<PanelFallback />}>
          <RestaurantDetailSheet
            restaurant={ctrl.selected}
            hasLocation={!!ctrl.geo.position}
            onClose={() => ctrl.setSelected(null)}
            onStartRoute={ctrl.startRoute}
            onSuggestEdit={openEditSuggestion}
            onRequireAuth={() => setAuthOpen(true)}
            formatDist={ctrl.formatDist}
            user={user}
          />
        </Suspense>
      )}

      {/* ── Filter drawer ── */}
      {ctrl.filterOpen && (
        <Suspense fallback={<PanelFallback />}>
          <FilterPanel
            open={ctrl.filterOpen}
            onClose={() => ctrl.setFilterOpen(false)}
            filters={ctrl.filters}
            activeFilterCount={ctrl.activeFilterCount}
            availableHechshers={ctrl.availableHechshers}
            availableCities={ctrl.availableCities}
            availableCategories={ctrl.availableCategories}
            onToggleHechsher={ctrl.toggleHechsher}
            onToggleFoodType={ctrl.toggleFoodType}
            onToggleCategory={ctrl.toggleCategory}
            onSetCity={ctrl.setCity}
            onSetRadius={ctrl.setRadius}
            onReset={ctrl.resetFilters}
          />
        </Suspense>
      )}

      {authOpen && (
        <Suspense fallback={<PanelFallback />}>
          <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
        </Suspense>
      )}
      {suggestionOpen && (
        <Suspense fallback={<PanelFallback />}>
          <SuggestionDialog
            open={suggestionOpen}
            restaurant={suggestionRestaurant}
            defaultPosition={suggestionDefaultPosition}
            isAuthenticated={Boolean(user)}
            onClose={() => setSuggestionOpen(false)}
            onRequireAuth={() => setAuthOpen(true)}
          />
        </Suspense>
      )}

      <Snackbar
        open={sessionExpiredOpen}
        autoHideDuration={6000}
        onClose={() => setSessionExpiredOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setSessionExpiredOpen(false)} sx={{ width: '100%' }}>
          {t.sessionExpired}
        </Alert>
      </Snackbar>
    </Box>
  )
}
