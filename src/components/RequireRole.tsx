import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'
import type { Role } from '@/types/auth'

export function RequireRole({ roles }: { roles: Role[] }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    )
  }

  if (!profile || !profile.active || !roles.includes(profile.role)) {
    return <Navigate to="/acesso-negado" replace />
  }

  return <Outlet />
}
