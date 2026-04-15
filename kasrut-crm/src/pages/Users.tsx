import { useUsersController } from '@/controllers/useUsersController'
import { useLang } from '@/i18n/useLang'
import { Button, Badge } from '@/components/ui'
import { UserForm } from '@/components/users/UserForm'
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
          <Button onClick={ctrl.openForm}>{t.users?.add ?? '+ Add User'}</Button>
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
      ) : ctrl.users.length === 0 ? (
        <div className="empty-state">—</div>
      ) : (
        <div className="users-list">
          {ctrl.users.map(u => {
            const rc = ROLE_COLOR[u.role]
            return (
              <div key={u.id} className="user-row">
                <div className="user-row-avatar" style={{ background: `${rc}22`, color: rc }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-row-info">
                  <div className="user-row-name">{u.name}</div>
                  <div className="user-row-email">{u.email}</div>
                </div>
                <Badge label={t.roles[u.role]} color={rc} small />
                {u.twoFactorEnabled && (
                  <span title="2FA enabled" style={{ fontSize: 14, opacity: 0.7 }}>🔒</span>
                )}
                <button
                  className="btn-ghost btn-ghost--danger"
                  onClick={() => ctrl.deleteUser(u.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {ctrl.showForm && (
        <UserForm
          rabbanutOptions={ctrl.rabbanutOptions}
          onSave={ctrl.createUser}
          onClose={ctrl.closeForm}
        />
      )}
    </div>
  )
}
