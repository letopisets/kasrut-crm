import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'

interface Props {
  page: string
  children: ReactNode
}

export default function ProtectedRoute({ page, children }: Props) {
  const perm = usePermissions()
  return perm.tabs.includes(page) ? <>{children}</> : <Navigate to="/dashboard" replace />
}
