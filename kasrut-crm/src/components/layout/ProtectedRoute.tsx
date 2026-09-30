import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { useAppSelector } from '@/store'

interface Props {
  page: string
  children: ReactNode
}

export default function ProtectedRoute({ page, children }: Props) {
  const perm = usePermissions()
  return perm.tabs.includes(page) ? <>{children}</> : <Navigate to="/dashboard" replace />
}

// REQUIRE_OWNER_2FA: while the API confines the session to 2FA setup, the rest
// of the app is unreachable; every route leads to the forced setup screen.
export function TwoFactorSetupGate({ children }: { children: ReactNode }) {
  const setupRequired = useAppSelector(s => s.auth.twoFactorSetupRequired)
  return setupRequired ? <Navigate to="/setup-2fa" replace /> : <>{children}</>
}
