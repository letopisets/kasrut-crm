import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { usePermissions } from '@/hooks/usePermissions'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'
import { ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Backdrop from '@mui/material/Backdrop'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import LockIcon from '@mui/icons-material/Lock'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import type { Lang } from '@/store/useLangStore'

const LANGS: Lang[] = ['en', 'ru', 'he']

export function Header() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const activeTab    = pathname.split('/')[1] || 'dashboard'

  const role   = useAuthStore(s => s.role)
  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const lang   = useLangStore(s => s.lang)
  const setLang= useLangStore(s => s.setLang)
  const t      = useLang()
  const perm   = usePermissions()
  const rc     = ROLE_COLORS[role]

  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [show2faPanel, setShow2faPanel] = useState(false)

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const NAV_KEYS = (Object.keys(t.nav) as Array<keyof typeof t.nav>)
    .filter(id => perm.tabs.includes(id))

  return (
    <>
      <AppBar position="sticky" sx={{ zIndex: 100 }}>
        <Toolbar
          sx={{
            height: 58,
            minHeight: '58px !important',
            px: { xs: '14px', md: '18px', lg: '28px' },
            gap: 2,
          }}
        >
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: 1,
              background: `linear-gradient(135deg, #C9A84C, #E8C96D)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 900, color: '#161929',
              boxShadow: '0 2px 8px rgba(232,201,109,0.25)', flexShrink: 0,
            }}>
              כ
            </Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#E8C96D', letterSpacing: '-0.2px', lineHeight: 1.2 }}>
                {t.appName}
              </Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled', letterSpacing: '0.2px', lineHeight: 1.2 }}>
                {t.appSub}
              </Typography>
            </Box>
          </Box>

          {/* Desktop Nav */}
          <Box
            component="nav"
            sx={{
              display: { xs: 'none', md: 'flex' },
              flex: 1, justifyContent: 'center', alignItems: 'center',
              gap: 0.25, overflow: 'hidden',
            }}
          >
            {NAV_KEYS.map(id => {
              const active = activeTab === id
              return (
                <Button
                  key={id}
                  onClick={() => navigate(`/${id}`)}
                  sx={{
                    color: active ? rc : 'text.disabled',
                    fontWeight: active ? 600 : 500,
                    fontSize: { md: '0.75rem', lg: '0.8125rem' },
                    px: { md: '10px', lg: '14px' },
                    py: '6px',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: active ? alpha(rc, 0.22) : 'transparent',
                    background: active ? alpha(rc, 0.08) : 'transparent',
                    whiteSpace: 'nowrap',
                    minWidth: 'auto',
                    '&:hover': {
                      background: active ? alpha(rc, 0.12) : alpha('#fff', 0.05),
                      color: active ? rc : 'text.secondary',
                    },
                  }}
                >
                  {t.nav[id]}
                </Button>
              )
            })}
          </Box>

          {/* Right side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, ml: 'auto' }}>
            {/* User info */}
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{user?.name}</Typography>
                <Typography sx={{ fontSize: 10, color: 'text.disabled', lineHeight: 1.3 }}>{user?.email}</Typography>
              </Box>
              <Chip
                label={t.roles[role]}
                size="small"
                sx={{
                  background: alpha(rc, 0.1),
                  color: rc,
                  border: `1px solid ${alpha(rc, 0.25)}`,
                  fontWeight: 700,
                  fontSize: '0.625rem',
                }}
              />
            </Box>

            <Divider orientation="vertical" flexItem sx={{ borderColor: 'divider', display: { xs: 'none', sm: 'block' } }} />

            {/* Language switcher */}
            <Box sx={{
              display: { xs: 'none', sm: 'flex' },
              background: '#1E2235',
              borderRadius: 1,
              border: '1px solid #252840',
              overflow: 'hidden',
            }}>
              {LANGS.map(l => (
                <Button
                  key={l}
                  onClick={() => setLang(l)}
                  sx={{
                    minWidth: 0,
                    px: 1.25, py: '5px',
                    fontSize: '0.625rem',
                    fontWeight: lang === l ? 700 : 500,
                    color: lang === l ? '#E8C96D' : '#50526A',
                    background: lang === l ? alpha('#E8C96D', 0.07) : 'transparent',
                    borderRadius: 0,
                    letterSpacing: '0.5px',
                    '&:hover': { color: '#9A9AB0' },
                  }}
                >
                  {l.toUpperCase()}
                </Button>
              ))}
            </Box>

            {/* 2FA Button */}
            <Tooltip title={t.twoFactor?.settingsTitle ?? '2FA'}>
              <IconButton
                onClick={() => setShow2faPanel(v => !v)}
                size="small"
                sx={{
                  color: show2faPanel
                    ? '#E8C96D'
                    : user?.twoFactorEnabled
                      ? '#2ECC71'
                      : '#50526A',
                }}
              >
                <LockIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Logout */}
            <Tooltip title={t.logout}>
              <IconButton onClick={handleLogout} size="small">
                <PowerSettingsNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Hamburger — mobile only */}
            <IconButton
              sx={{ display: { xs: 'flex', md: 'none' }, color: '#9A9AB0' }}
              onClick={() => setDrawerOpen(v => !v)}
              aria-label="Menu"
            >
              {drawerOpen ? <CloseIcon /> : <MenuIcon />}
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* 2FA Panel */}
      {show2faPanel && (
        <>
          <Backdrop open sx={{ zIndex: 110 }} onClick={() => setShow2faPanel(false)} />
          <Box sx={{
            position: 'fixed', top: 68, right: 16, zIndex: 120,
            width: 340, animation: 'fadeInDown 0.15s ease',
            '@keyframes fadeInDown': {
              from: { opacity: 0, transform: 'translateY(-8px)' },
              to:   { opacity: 1, transform: 'translateY(0)' },
            },
          }}>
            <TwoFactorSettings onClose={() => setShow2faPanel(false)} />
          </Box>
        </>
      )}

      {/* Mobile Drawer */}
      <Drawer
        anchor="top"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            top: 58,
            background: '#161929',
            border: 'none',
            borderBottom: '1px solid #252840',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          },
        }}
        hideBackdrop={false}
        ModalProps={{ keepMounted: true }}
      >
        <List sx={{ py: 0.75 }}>
          {NAV_KEYS.map(id => {
            const active = activeTab === id
            return (
              <ListItemButton
                key={id}
                onClick={() => { navigate(`/${id}`); setDrawerOpen(false) }}
                sx={{
                  borderInlineStart: `3px solid ${active ? rc : 'transparent'}`,
                  background: active ? alpha(rc, 0.06) : 'transparent',
                  py: 1.625, px: 2.75,
                  '&:hover': { background: '#1E2235' },
                }}
              >
                <ListItemText
                  primary={t.nav[id]}
                  primaryTypographyProps={{
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? rc : '#9A9AB0',
                  }}
                />
              </ListItemButton>
            )
          })}

          {/* Mobile: language + user */}
          <Box sx={{ px: 2.75, py: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 11, color: '#50526A', mr: 0.5 }}>Lang:</Typography>
            {LANGS.map(l => (
              <Button
                key={l}
                onClick={() => setLang(l)}
                size="small"
                sx={{
                  minWidth: 0, px: 1, py: 0.25,
                  fontSize: '0.625rem',
                  color: lang === l ? '#E8C96D' : '#50526A',
                  fontWeight: lang === l ? 700 : 500,
                  background: lang === l ? alpha('#E8C96D', 0.07) : 'transparent',
                  border: '1px solid',
                  borderColor: lang === l ? alpha('#E8C96D', 0.2) : 'transparent',
                  borderRadius: 1,
                }}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </Box>
        </List>
      </Drawer>
    </>
  )
}
