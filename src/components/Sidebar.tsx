import {
  BedDouble,
  CalendarRange,
  ClipboardList,
  History,
  Hotel as HotelIcon,
  LayoutGrid,
  Settings,
  Sparkles,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

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

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Visão Geral', icon: LayoutGrid, end: true },
  { to: '/mapa', label: 'Mapa de Ocupação', icon: CalendarRange },
  { to: '/quartos', label: 'Quartos', icon: BedDouble },
  { to: '/hospedes', label: 'Hóspedes', icon: Users },
  { to: '/reservas', label: 'Reservas', icon: ClipboardList },
  { to: '/governanca', label: 'Governança', icon: Sparkles, roles: ['admin', 'gerente', 'governanca'] },
  {
    to: '/manutencao',
    label: 'Manutenção',
    icon: Wrench,
    roles: ['admin', 'gerente', 'recepcao', 'governanca', 'manutencao'],
  },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, roles: ['admin', 'gerente', 'recepcao', 'financeiro'] },
  { to: '/hotel', label: 'Configurações', icon: Settings },
  { to: '/usuarios', label: 'Usuários', icon: UserCog, roles: ['admin'] },
  { to: '/auditoria', label: 'Auditoria', icon: History, roles: ['admin'] },
  { to: '/minha-conta', label: 'Minha conta', icon: UserCircle },
]

interface SidebarProps {
  role: Role | undefined
  hotel: Hotel | null | undefined
  mobileOpen: boolean
  onClose: () => void
}

function SidebarContent({ hotel, role, onNavigate }: { hotel: Hotel | null | undefined; role: Role | undefined; onNavigate: () => void }) {
  const items = NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)))

  return (
    <div className="flex h-full w-64 flex-col bg-primary text-primary-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
          <HotelIcon className="h-5 w-5" />
        </div>
        <span className="font-semibold tracking-tight">PMS Hoteleiro</span>
      </div>

      <div className="border-t border-primary-foreground/10 px-5 py-4">
        <p className="truncate text-sm font-medium">{hotel?.name ?? 'Hotel'}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-primary-foreground/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary-foreground/15 font-medium text-primary-foreground'
                  : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function Sidebar({ role, hotel, mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden shrink-0 md:block">
        <SidebarContent hotel={hotel} role={role} onNavigate={() => {}} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 shadow-xl">
            <SidebarContent hotel={hotel} role={role} onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  )
}
