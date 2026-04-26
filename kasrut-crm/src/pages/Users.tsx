import { useUsersController } from '@/controllers/useUsersController'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { UserForm } from '@/components/users/UserForm'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'

const ROLE_FILTERS: Array<Role | 'all'> = ['all', 'owner', 'rabbanut', 'mashgiach']

export default function Users() {
  const t    = useLang()
  const ctrl = useUsersController()

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.users?.title ?? 'Users'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {ctrl.users.length} {t.users?.count ?? 'users'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={ctrl.openForm} size="small" disableElevation>
          {t.users?.add ?? '+ Add User'}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
        {ROLE_FILTERS.map(role => {
          const active = ctrl.roleFilter === role
          const color  = role === 'all' ? '#E8C96D' : ROLE_COLOR[role as Role]
          return (
            <Button
              key={role}
              size="small"
              onClick={() => ctrl.setRoleFilter(role)}
              sx={{
                borderRadius: '20px', px: 1.75, py: 0.5,
                fontSize: 12, fontWeight: active ? 600 : 400,
                color:      active ? color : 'text.secondary',
                background: active ? alpha(color, 0.12) : 'transparent',
                border:    `1px solid ${active ? alpha(color, 0.4) : 'transparent'}`,
                '&:hover':  { background: alpha(color, 0.08), color },
                transition: 'all 0.15s',
                textTransform: 'none',
              }}
            >
              {role === 'all' ? (t.users?.all ?? 'All') : (t.roles[role as Role] ?? role)}
            </Button>
          )
        })}
      </Box>

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.users.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {t.users?.empty ?? 'No users'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {ctrl.users.map(u => {
            const rc = ROLE_COLOR[u.role]
            return (
              <Box key={u.id} sx={{
                background: '#161929', border: '1px solid #252840', borderRadius: 2.5,
                px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.75,
                transition: 'background 0.18s', '&:hover': { background: '#1E2235' },
              }}>
                <Box sx={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: alpha(rc, 0.12), color: rc,
                  border: `1px solid ${alpha(rc, 0.25)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700,
                }}>
                  {u.name.charAt(0).toUpperCase()}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
                    {u.email}
                  </Typography>
                </Box>
                <Badge label={t.roles[u.role]} color={rc} small />
                {u.twoFactorEnabled && (
                  <Tooltip title="2FA enabled">
                    <Box component="span" sx={{ fontSize: 14, opacity: 0.7, display: 'flex' }}>🔒</Box>
                  </Tooltip>
                )}
                <Tooltip title="Delete">
                  <IconButton size="small" onClick={() => ctrl.deleteUser(u.id)}
                    sx={{ color: alpha('#E74C3C', 0.6), '&:hover': { color: '#E74C3C' }, flexShrink: 0 }}>
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )
          })}
        </Box>
      )}

      {ctrl.showForm && (
        <UserForm
          rabbanutOptions={ctrl.rabbanutOptions}
          onSave={ctrl.createUser}
          onClose={ctrl.closeForm}
        />
      )}
    </Box>
  )
}
