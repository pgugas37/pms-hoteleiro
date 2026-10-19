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

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), [])

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={profile?.role} hotel={hotel} mobileOpen={mobileNavOpen} onClose={closeMobileNav} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <GlobalSearchDialog />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {profile && (
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-mint font-display text-sm font-semibold text-pine"
                >
                  {initials(profile.full_name)}
                </span>
                <div className="hidden leading-tight lg:block">
                  <p className="text-sm font-medium">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
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
