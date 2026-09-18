import { LogOut } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { ROLE_LABELS } from '@/types/auth'

export function AppLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          PMS Hoteleiro
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/quartos" className="text-muted-foreground hover:text-foreground">
            Quartos
          </Link>
          <Link to="/hospedes" className="text-muted-foreground hover:text-foreground">
            Hóspedes
          </Link>
          <Link to="/reservas" className="text-muted-foreground hover:text-foreground">
            Reservas
          </Link>
          <Link to="/hotel" className="text-muted-foreground hover:text-foreground">
            Configurações
          </Link>
          {profile?.role === 'admin' && (
            <Link to="/usuarios" className="text-muted-foreground hover:text-foreground">
              Usuários
            </Link>
          )}
          <Link to="/minha-conta" className="text-muted-foreground hover:text-foreground">
            Minha conta
          </Link>
          {profile && (
            <span className="text-muted-foreground">
              {profile.full_name} · {ROLE_LABELS[profile.role]}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="mr-1 h-4 w-4" />
            Sair
          </Button>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
