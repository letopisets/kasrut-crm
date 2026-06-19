import { useAppDispatch, useAppSelector } from '@/store'
import { setRabbanutFilter as setRabbanutFilterAction } from '@/store/authSlice'
import { useGetRabbanutsQuery } from '@/store/api/rabbanutApi'
import { useGetMashgichimQuery } from '@/store/api/mashgichimApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

export function RoleBanner() {
  const dispatch          = useAppDispatch()
  const perm              = usePermissions()
  const role              = useAppSelector(s => s.auth.role)
  const user              = useAppSelector(s => s.auth.user)
  const rabbanutFilter    = useAppSelector(s => s.auth.rabbanutFilter)
  const setRabbanutFilter = (id: string) => dispatch(setRabbanutFilterAction(id))

  const { data: rabbanuts   = [] } = useGetRabbanutsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const t  = useLang()
  const rc = ROLE_COLORS[role]

  const myRabbanut  = rabbanuts.find(rb => rb.id === user?.rabbanutId)
  const myMashgiach = mashgichim.find(m => m.id === user?.id)
  const myRestCount = myMashgiach
    ? restaurants.filter(r => r.mashgiachId === myMashgiach.id).length
    : 0

  return (
    <Box
      sx={{
        px: { xs: '14px', md: '18px', lg: '32px' },
        py: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 0.75,
        minHeight: 34,
        flexShrink: 0,
        background: alpha(rc, 0.03),
        borderBottom: `1px solid ${alpha(rc, 0.09)}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11, color: rc }}>
        <Typography component="span" sx={{ fontWeight: 700, fontSize: 11, color: rc }}>{t.roles[role]}</Typography>
        <Typography component="span" sx={{ color: 'text.disabled', fontSize: 11 }}>·</Typography>
        <Typography component="span" sx={{ color: 'text.secondary', fontSize: 11 }}>{t.roleDesc[role]}</Typography>

        {role === 'rabbanut' && myRabbanut && (
          <>
            <Typography component="span" sx={{ color: 'text.disabled', fontSize: 11 }}>·</Typography>
            <Typography component="span" sx={{ fontSize: 11, color: rc }}>{myRabbanut.name}</Typography>
          </>
        )}

        {role === 'mashgiach' && myMashgiach && (
          <>
            <Typography component="span" sx={{ color: 'text.disabled', fontSize: 11 }}>·</Typography>
            <Typography component="span" sx={{ fontSize: 11, color: rc }}>
              {myMashgiach.name} · {t.myEstablishments}: {myRestCount}
            </Typography>
          </>
        )}
      </Box>

      {perm.isOwner && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', mr: 0.5 }}>{t.allRabbanuts}:</Typography>
          <FilterTab
            active={rabbanutFilter === ''}
            color={rc}
            onClick={() => setRabbanutFilter('')}
          >
            All
          </FilterTab>
          {rabbanuts.map(rb => (
            <FilterTab
              key={rb.id}
              active={rabbanutFilter === rb.id}
              color={rb.color}
              onClick={() => setRabbanutFilter(rb.id)}
            >
              {rb.city}
            </FilterTab>
          ))}
        </Box>
      )}
    </Box>
  )
}

function FilterTab({ children, active, color, onClick }: {
  children: React.ReactNode
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      sx={{
        minWidth: 0,
        px: 1.25, py: '3px',
        fontSize: '0.6875rem',
        fontWeight: active ? 700 : 500,
        color: active ? color : '#50526A',
        background: active ? alpha(color, 0.09) : 'transparent',
        border: '1px solid',
        borderColor: active ? alpha(color, 0.25) : 'transparent',
        borderRadius: '5px',
        textTransform: 'none',
        lineHeight: 1.5,
        '&:hover': { color: '#9A9AB0' },
      }}
    >
      {children}
    </Button>
  )
}
