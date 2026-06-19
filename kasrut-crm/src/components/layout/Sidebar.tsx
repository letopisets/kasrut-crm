import { useLocation, useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/store'
import { useLang } from '@/i18n/useLang'
import { usePermissions } from '@/hooks/usePermissions'
import { ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import DashboardIcon from '@mui/icons-material/Dashboard'
import StorefrontIcon from '@mui/icons-material/Storefront'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import GroupsIcon from '@mui/icons-material/Groups'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DescriptionIcon from '@mui/icons-material/Description'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import TroubleshootIcon from '@mui/icons-material/Troubleshoot'

const SIDEBAR_WIDTH = 232

const ICONS: Record<string, typeof DashboardIcon> = {
  dashboard: DashboardIcon,
  restaurants: StorefrontIcon,
  inspections: AssignmentTurnedInIcon,
  mashgichim: GroupsIcon,
  hechsherim: CheckCircleIcon,
  documents: DescriptionIcon,
  rabbanuts: AccountBalanceIcon,
  users: ManageAccountsIcon,
  suggestions: FactCheckIcon,
  logs: TroubleshootIcon,
}

export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeTab = pathname.split('/')[1] || 'dashboard'
  const t = useLang()
  const perm = usePermissions()
  const role = useAppSelector(s => s.auth.role)
  const user = useAppSelector(s => s.auth.user)
  const rc = ROLE_COLORS[role]
  const labels = t.nav as Record<string, string>

  return (
    <Box
      component="aside"
      sx={{
        width: SIDEBAR_WIDTH,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        flexShrink: 0,
        minHeight: '100vh',
        bgcolor: '#111421',
        borderInlineEnd: '1px solid #252840',
        p: 1.5,
        gap: 1.5,
        position: 'sticky',
        top: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, py: 1 }}>
        <Box sx={{
          width: 34, height: 34, borderRadius: 1,
          background: 'linear-gradient(135deg, #C9A84C, #E8C96D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 900, color: '#161929',
          boxShadow: '0 2px 8px rgba(232,201,109,0.22)',
        }}>
          כ
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#E8C96D', lineHeight: 1.2 }}>
            {t.appName}
          </Typography>
          <Typography sx={{ fontSize: 10, color: 'text.disabled', lineHeight: 1.2 }}>
            {t.appSub}
          </Typography>
        </Box>
      </Box>

      <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: 0.375 }}>
        {perm.tabs.map(id => {
          const active = activeTab === id
          const Icon = ICONS[id] ?? DashboardIcon
          return (
            <ButtonBase
              key={id}
              onClick={() => navigate(`/${id}`)}
              sx={{
                width: '100%',
                justifyContent: 'flex-start',
                gap: 1,
                px: 1.25,
                py: 1,
                borderRadius: 1,
                color: active ? rc : 'text.secondary',
                bgcolor: active ? alpha(rc, 0.1) : 'transparent',
                border: '1px solid',
                borderColor: active ? alpha(rc, 0.24) : 'transparent',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                '&:hover': {
                  bgcolor: active ? alpha(rc, 0.14) : alpha('#fff', 0.04),
                  color: active ? rc : '#EAEAF2',
                },
              }}
            >
              <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 13, fontWeight: active ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {labels[id] ?? id}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>

      <Box sx={{ mt: 'auto', borderTop: '1px solid #252840', pt: 1.5, px: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: rc, mb: 0.375 }}>
          {t.roles[role]}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </Typography>
      </Box>
    </Box>
  )
}
