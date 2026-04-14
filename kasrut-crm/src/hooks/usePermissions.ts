// hooks/usePermissions.ts
import { useAuthStore } from '../store/useAuthStore'
import { PERMISSIONS } from '../lib/permissions'

export const usePermissions = () => {
  const role = useAuthStore(s => s.role)
  return PERMISSIONS[role]
}