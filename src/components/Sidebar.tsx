import {
  BedDouble,
  CalendarRange,
  ClipboardList,
  History,
  LayoutGrid,
  Settings,
  Sparkles,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'
import { NavLink } from 'react-router-dom'

import simboloUrl from '@/assets/brand/millenium-simbolo.png'
import wordmarkUrl from '@/assets/brand/millenium-wordmark-branco.png'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/auth'
import type { Hotel } from '@/types/hotel'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: Role[]
  end?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Mesmas regras de visibilidade por papel de antes; só a organização em grupos é nova.
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Visão geral', icon: LayoutGrid, end: true },
      { to: '/mapa', label: 'Mapa de ocupação', icon: CalendarRange },
      { to: '/reservas', label: 'Reservas', icon: ClipboardList },
      { to: '/hospedes', label: 'Hóspedes', icon: Users },
      { to: '/quartos', label: 'Quartos', icon: BedDouble },
    ],
  },
  {
    label: 'Serviços',
    items: [
      { to: '/governanca', label: 'Governança', icon: Sparkles, roles: ['admin', 'gerente', 'governanca'] },
      {
        to: '/manutencao',
        label: 'Manutenção',
        icon: Wrench,
        roles: ['admin', 'gerente', 'recepcao', 'governanca', 'manutencao'],
      },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/financeiro', label: 'Financeiro', icon: Wallet, roles: ['admin', 'gerente', 'recepcao', 'financeiro'] },
      { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] },
      { to: '/auditoria', label: 'Auditoria', icon: History, roles: ['admin'] },
      { to: '/hotel', label: 'Configurações', icon: Settings },
    ],
  },
]

const ACCOUNT_ITEM: NavItem = { to: '/minha-conta', label: 'Minha conta', icon: UserCircle }

interface SidebarProps {
  role: Role | undefined
  hotel: Hotel | null | undefined
  mobileOpen: boolean
  onClose: () => void
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }: { isActive: boolean }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint',
          isActive
            ? 'bg-white/[0.09] font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-mint'
            : 'text-sidebar-foreground/70 hover:bg-white/[0.05] hover:text-white'
        )
      }
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <item.icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-mint' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'
            )}
          />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({
  hotel,
  role,
  onNavigate,
  onClose,
}: {
  hotel: Hotel | null | undefined
  role: Role | undefined
  onNavigate: () => void
  onClose?: () => void
}) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex h-full w-[260px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src={simboloUrl} alt="" className="h-10 w-10 shrink-0" />
          <img src={wordmarkUrl} alt={hotel?.name ?? 'Millenium Hotel'} className="h-[26px] w-auto" />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Menu principal">
        {groups.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="px-3 pb-1.5 text-xs font-medium text-sidebar-foreground/40">{group.label}</p>
            {group.items.map((item) => (
              <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-white/[0.08] px-3 py-4">
        <NavItemLink item={ACCOUNT_ITEM} onNavigate={onNavigate} />
        <p className="px-3 text-[11px] text-sidebar-foreground/35">HotelFlow, gestão hoteleira</p>
      </div>
    </div>
  )
}

export function Sidebar({ role, hotel, mobileOpen, onClose }: SidebarProps) {
  React.useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onClose])

  return (
    <>
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <SidebarContent hotel={hotel} role={role} onNavigate={() => {}} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-pine/60 backdrop-blur-[2px] animate-in fade-in-0" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 shadow-2xl animate-in slide-in-from-left duration-200">
            <SidebarContent hotel={hotel} role={role} onNavigate={onClose} onClose={onClose} />
          </div>
        </div>
      )}
    </>
  )
}
