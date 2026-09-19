import { useQuery } from '@tanstack/react-query'
import { LogOut, Menu } from 'lucide-react'
import * as React from 'react'
import { Outlet } from 'react-router-dom'

import { GlobalSearchDialog } from '@/components/GlobalSearchDialog'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { fetchHotel } from '@/lib/hotel'
import { ROLE_LABELS } from '@/types/auth'

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar role={profile?.role} hotel={hotel} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <GlobalSearchDialog />
          </div>

          <div className="flex items-center gap-4 text-sm">
            {profile && (
              <span className="hidden text-muted-foreground sm:inline">
                {profile.full_name} · {ROLE_LABELS[profile.role]}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
