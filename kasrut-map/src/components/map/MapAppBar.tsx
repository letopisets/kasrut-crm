import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Typography, Box, Button, InputBase,
  IconButton, Badge, ToggleButtonGroup, ToggleButton,
  Tooltip, Avatar, Menu, MenuItem, ListItemIcon, ListItemText,
  useMediaQuery, useTheme,
} from '@mui/material'
import TuneIcon             from '@mui/icons-material/Tune'
import MapIcon              from '@mui/icons-material/Map'
import ListIcon             from '@mui/icons-material/List'
import MenuBookIcon         from '@mui/icons-material/MenuBook'
import AddBusinessIcon      from '@mui/icons-material/AddBusiness'
import PersonIcon           from '@mui/icons-material/Person'
import LogoutIcon           from '@mui/icons-material/Logout'
import DarkModeIcon         from '@mui/icons-material/DarkMode'
import LightModeIcon        from '@mui/icons-material/LightMode'
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism'
import SearchIcon           from '@mui/icons-material/Search'
import ClearIcon            from '@mui/icons-material/Clear'
import MoreVertIcon         from '@mui/icons-material/MoreVert'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearCredentials } from '@/store/mapAuthSlice'
import { setMapLang, type MapLang } from '@/store/mapLangSlice'
import { useMapLang } from '@/i18n/useMapLang'
import type { ThemeMode } from '@/theme'

const LANGS: MapLang[] = ['en', 'ru', 'he']

interface Props {
  themeMode: ThemeMode
  onToggleThemeMode: () => void
  activeFilterCount: number
  onOpenFilters: () => void
  view: 'map' | 'list'
  onSetView: (v: 'map' | 'list') => void
  onOpenAuth: () => void
  onOpenAddSuggestion: () => void
  search: string
  onSearchChange: (value: string) => void
}

function LangSwitch({ lang, onPick }: { lang: MapLang; onPick: (l: MapLang) => void }) {
  return (
    <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {LANGS.map(l => (
        <Button
          key={l}
          onClick={() => onPick(l)}
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
  )
}

export function MapAppBar({
  themeMode, onToggleThemeMode,
  activeFilterCount, onOpenFilters,
  view, onSetView,
  onOpenAuth, onOpenAddSuggestion,
  search, onSearchChange,
}: Props) {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const t         = useMapLang()
  const theme     = useTheme()
  const compact   = useMediaQuery(theme.breakpoints.down('sm'))
  const user      = useAppSelector(state => state.mapAuth.user)
  const lang      = useAppSelector(state => state.mapLang.lang)
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null)
  const [moreAnchor, setMoreAnchor]       = useState<HTMLElement | null>(null)

  const logout = () => {
    dispatch(clearCredentials())
    setAccountAnchor(null)
  }

  // Secondary actions: inline on desktop, collapsed into an overflow menu on
  // phones so the toolbar never overflows (previously the login button and
  // language switch were pushed off a 375px screen).
  const secondaryActions = [
    { key: 'suggest', icon: <AddBusinessIcon />, label: t.suggestBusiness, onClick: onOpenAddSuggestion },
    { key: 'donate',  icon: <VolunteerActivismIcon />, label: t.donate, onClick: () => navigate('/donate') },
    {
      key: 'theme',
      icon: themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />,
      label: themeMode === 'light' ? t.darkTheme : t.lightTheme,
      onClick: onToggleThemeMode,
    },
  ]

  const themeIcon = themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />

  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1200 }}>
      <Toolbar sx={{ gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 } }}>
        <MenuBookIcon sx={{ color: 'primary.main', mr: 0.5, flexShrink: 0 }} />
        <Typography
          variant="h6"
          color="primary.main"
          noWrap
          sx={{ letterSpacing: 0, fontWeight: 800, display: { xs: 'none', md: 'block' }, flexShrink: 0 }}
        >
          {t.appName}
        </Typography>

        {/* Search — the primary control, always visible and grows to fill space */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', flexGrow: 1, minWidth: 0,
            mx: { xs: 0.5, sm: 1.5 },
            px: 1, height: 38,
            bgcolor: 'action.hover',
            border: '1px solid', borderColor: 'divider', borderRadius: 2,
            '&:focus-within': { borderColor: 'primary.main' },
          }}
        >
          <SearchIcon sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }} />
          <InputBase
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.searchPlaceholder}
            inputProps={{ 'aria-label': t.searchPlaceholder, enterKeyHint: 'search' }}
            sx={{ ml: 1, flex: 1, fontSize: '0.9rem', minWidth: 0, '& input': { p: 0 } }}
          />
          {search && (
            <IconButton size="small" onClick={() => onSearchChange('')} aria-label={t.searchClear} sx={{ flexShrink: 0 }}>
              <ClearIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>

        {/* Desktop-only secondary actions */}
        {!compact && (
          <>
            <LangSwitch lang={lang} onPick={(l) => dispatch(setMapLang(l))} />
            {secondaryActions.map(a => (
              <Tooltip key={a.key} title={a.label}>
                <IconButton onClick={a.onClick} sx={{ color: 'text.secondary' }}>{a.icon}</IconButton>
              </Tooltip>
            ))}
          </>
        )}

        {/* Always-visible primary controls */}
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_e, v) => { if (v) onSetView(v) }}
          size="small"
          sx={{
            flexShrink: 0,
            '& .MuiToggleButton-root': { px: 1.25, borderColor: 'divider', color: 'text.secondary' },
            '& .Mui-selected': { color: 'primary.main !important', bgcolor: 'rgba(232,165,7,0.1) !important' },
          }}
        >
          <ToggleButton value="map"  aria-label="map"><MapIcon  fontSize="small" /></ToggleButton>
          <ToggleButton value="list" aria-label="list"><ListIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={t.filtersTooltip}>
          <IconButton onClick={onOpenFilters} sx={{ flexShrink: 0, color: activeFilterCount ? 'primary.main' : 'text.secondary' }}>
            <Badge badgeContent={activeFilterCount || null} color="primary">
              <TuneIcon />
            </Badge>
          </IconButton>
        </Tooltip>

        {user ? (
          <>
            <Tooltip title={user.name}>
              <IconButton onClick={(e) => setAccountAnchor(e.currentTarget)} sx={{ p: 0.5, flexShrink: 0 }}>
                <Avatar src={user.avatarUrl ?? undefined} sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 14 }}>
                  {user.name.slice(0, 1).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}>
              <MenuItem disabled>{user.name}</MenuItem>
              <MenuItem onClick={logout}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t.logout}</ListItemText>
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Tooltip title={t.loginTooltip}>
            <IconButton onClick={onOpenAuth} sx={{ flexShrink: 0, color: 'text.secondary' }}>
              <PersonIcon />
            </IconButton>
          </Tooltip>
        )}

        {/* Mobile overflow menu for the secondary actions */}
        {compact && (
          <>
            <Tooltip title={t.moreActions}>
              <IconButton onClick={(e) => setMoreAnchor(e.currentTarget)} sx={{ flexShrink: 0, color: 'text.secondary' }} aria-label={t.moreActions}>
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
              <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'center' }}>
                <LangSwitch lang={lang} onPick={(l) => { dispatch(setMapLang(l)); }} />
              </Box>
              {secondaryActions.map(a => (
                <MenuItem key={a.key} onClick={() => { a.onClick(); setMoreAnchor(null) }}>
                  <ListItemIcon>{a.key === 'theme' ? themeIcon : a.icon}</ListItemIcon>
                  <ListItemText>{a.label}</ListItemText>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
      </Toolbar>
    </AppBar>
  )
}
