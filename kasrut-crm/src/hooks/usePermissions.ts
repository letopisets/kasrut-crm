import { useAppSelector } from '@/store'
import { PERMISSIONS } from '@/lib/permissions'

export const usePermissions = () => {
  const role = useAppSelector(s => s.auth.role)
  return PERMISSIONS[role]
}
