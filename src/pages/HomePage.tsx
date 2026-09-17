import { useAuth } from '@/lib/auth-context'
import { ROLE_LABELS } from '@/types/auth'

export function HomePage() {
  const { profile } = useAuth()

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">PMS Hoteleiro</h1>
      <p className="max-w-md text-muted-foreground">
        {profile
          ? `Bem-vindo(a), ${profile.full_name} (${ROLE_LABELS[profile.role]}).`
          : 'Carregando seu perfil...'}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        Módulo 02 — Autenticação, usuários e permissões. O Dashboard de verdade chega no Módulo
        04.
      </p>
    </div>
  )
}
