import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Typography, Box, Button,
  IconButton, Badge, ToggleButtonGroup, ToggleButton,
  Tooltip, Avatar, Menu, MenuItem,
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
}

export function MapAppBar({
  themeMode, onToggleThemeMode,
  activeFilterCount, onOpenFilters,
  view, onSetView,
  onOpenAuth, onOpenAddSuggestion,
}: Props) {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const t         = useMapLang()
  const user      = useAppSelector(state => state.mapAuth.user)
  const lang      = useAppSelector(state => state.mapLang.lang)
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null)

  const logout = () => {
    dispatch(clearCredentials())
    setAccountAnchor(null)
  }

  return (
    <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider', zIndex: 1200 }}>
      <Toolbar sx={{ gap: 1 }}>
        <MenuBookIcon sx={{ color: 'primary.main', mr: 0.5 }} />
        <Typography variant="h6" color="primary.main" noWrap sx={{ flexGrow: 1, minWidth: 0, letterSpacing: 0, fontWeight: 800 }}>
          {t.appName}
        </Typography>

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
          <IconButton onClick={onOpenAddSuggestion} sx={{ color: 'text.secondary' }}>
            <AddBusinessIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t.donate}>
          <IconButton onClick={() => navigate('/donate')} sx={{ color: 'text.secondary' }}>
            <VolunteerActivismIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={themeMode === 'light' ? t.darkTheme : t.lightTheme}>
          <IconButton onClick={onToggleThemeMode} sx={{ color: 'text.secondary' }}>
            {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>

        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_e, v) => { if (v) onSetView(v) }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': { px: 1.5, borderColor: 'divider', color: 'text.secondary' },
            '& .Mui-selected': { color: 'primary.main !important', bgcolor: 'rgba(232,165,7,0.1) !important' },
          }}
        >
          <ToggleButton value="map"  aria-label="map"><MapIcon  fontSize="small" /></ToggleButton>
          <ToggleButton value="list" aria-label="list"><ListIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={t.filtersTooltip}>
          <IconButton onClick={onOpenFilters} sx={{ color: activeFilterCount ? 'primary.main' : 'text.secondary' }}>
            <Badge badgeContent={activeFilterCount || null} color="primary">
              <TuneIcon />
            </Badge>
          </IconButton>
        </Tooltip>

        {user ? (
          <>
            <Tooltip title={user.name}>
              <IconButton onClick={(e) => setAccountAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
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
            <IconButton onClick={onOpenAuth} sx={{ color: 'text.secondary' }}>
              <PersonIcon />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
    </AppBar>
  )
}
