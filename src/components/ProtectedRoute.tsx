import { Navigate, Outlet, useLocation } from 'react-router-dom'

import simboloUrl from '@/assets/brand/millenium-simbolo.png'
import { useAuth } from '@/lib/auth-context'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
        <img src={simboloUrl} alt="" className="h-10 w-10 animate-pulse" />
        Carregando...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
