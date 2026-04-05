import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { PERMISSIONS } from '@/lib/permissions'

interface Props {
  page: string
  children: ReactNode
}

export default function ProtectedRoute({ page, children }: Props) {
  const role = useAuthStore(s => s.role)
  return PERMISSIONS[role].tabs.includes(page) ? <>{children}</> : <Navigate to="/dashboard" replace />
}
