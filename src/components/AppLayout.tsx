import { useQuery } from '@tanstack/react-query'
import { LogOut, Menu } from 'lucide-react'
import * as React from 'react'
import { Outlet } from 'react-router-dom'

import { useConfirm } from '@/components/ConfirmDialog'
import { GlobalSearchDialog } from '@/components/GlobalSearchDialog'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { fetchHotel } from '@/lib/hotel'
import { useSync } from '@/offline/sync-context'
import { ROLE_LABELS } from '@/types/auth'

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { state } = useSync()
  const confirm = useConfirm()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), [])

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  async function handleSignOut() {
    const unsent = state.pending + state.rejected
    if (unsent > 0) {
      const ok = await confirm({
        title: 'Sair e perder o que não foi enviado?',
        description: `${unsent === 1 ? '1 ação ainda não foi enviada' : `${unsent} ações ainda não foram enviadas`} ao banco e ${unsent === 1 ? 'será apagada' : 'serão apagadas'} deste aparelho. Se puder, conecte-se à internet e espere o envio antes de sair.`,
        confirmLabel: 'Sair mesmo assim',
        destructive: true,
      })
      if (!ok) return
    }
    await signOut()
  }

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
              onClick={() => void handleSignOut()}
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
