import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/store'
import { PERMISSIONS } from '@/lib/permissions'

interface Props {
  page: string
  children: ReactNode
}

export default function ProtectedRoute({ page, children }: Props) {
  const role = useAppSelector(s => s.auth.role)
  return PERMISSIONS[role].tabs.includes(page) ? <>{children}</> : <Navigate to="/dashboard" replace />
}
