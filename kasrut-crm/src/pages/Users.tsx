import { useUsersController } from '@/controllers/useUsersController'
import { useLang } from '@/i18n/useLang'
import { Button, Badge } from '@/components/ui'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'

const ROLE_FILTERS: Array<Role | 'all'> = ['all', 'owner', 'rabbanut', 'mashgiach']

export default function Users() {
  const t    = useLang()
  const ctrl = useUsersController()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.users?.title ?? 'Users'}</div>
          <div className="page-sub">{ctrl.users.length} {t.users?.count ?? 'users'}</div>
        </div>
        <div className="page-actions">
          <Button onClick={ctrl.openForm}>{t.users?.add ?? '+ Add'}</Button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          {ROLE_FILTERS.map(role => (
            <button
              key={role}
              onClick={() => ctrl.setRoleFilter(role)}
              className={ctrl.roleFilter === role ? 'filter-btn filter-btn--active' : 'filter-btn'}
              style={ctrl.roleFilter === role ? {
                '--c': role === 'all' ? 'var(--gold)' : ROLE_COLOR[role as Role],
              } as React.CSSProperties : undefined}
            >
              {role === 'all' ? (t.users?.all ?? 'All') : (t.roles[role as Role] ?? role)}
            </button>
          ))}
        </div>
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div className="users-list">
          {ctrl.users.map(u => (
            <div key={u.id} className="user-row">
              <div className="user-row-info">
                <div className="user-row-name">{u.name}</div>
                <div className="user-row-email">{u.email}</div>
              </div>
              <Badge label={t.roles[u.role]} color={ROLE_COLOR[u.role]} small />
              <button
                className="btn-ghost"
                onClick={() => ctrl.deleteUser(u.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
