import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { formatCurrency } from '@/lib/format'
import { fetchHotel } from '@/lib/hotel'
import { supabase } from '@/lib/supabase'
import { ROLES, ROLE_LABELS, type Role } from '@/types/auth'
import { nightsBetween, type ReservationStatus } from '@/types/reservation'

const FINANCE_ROLES: Role[] = ['admin', 'gerente', 'financeiro']
const TODAY_PANEL_ROLES: Role[] = ['admin', 'gerente', 'recepcao']

interface TodayReservation {
  id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  guests: { full_name: string } | null
  rooms: { number: string } | null
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

interface AuditEntry {
  id: number
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  create: 'criou',
  update: 'atualizou',
  delete: 'removeu',
}

const ENTITY_LABELS: Record<string, string> = {
  profile: 'um usuário',
  hotel: 'os dados do hotel',
}

async function fetchUserStats(): Promise<{ role: Role; active: boolean }[]> {
  const { data, error } = await supabase.from('profiles').select('role, active')
  if (error) throw error
  return (data ?? []) as { role: Role; active: boolean }[]
}

async function fetchRoomStats(): Promise<{ status: string }[]> {
  const { data, error } = await supabase.from('rooms').select('status')
  if (error) throw error
  return (data ?? []) as { status: string }[]
}

async function fetchRevenueStats(): Promise<{
  reservations: { daily_rate: number; check_in: string; check_out: string }[]
  payments: { amount: number }[]
}> {
  const [reservationsRes, paymentsRes] = await Promise.all([
    supabase.from('reservations').select('daily_rate, check_in, check_out').neq('status', 'cancelada'),
    supabase.from('payments').select('amount'),
  ])
  if (reservationsRes.error) throw reservationsRes.error
  if (paymentsRes.error) throw paymentsRes.error
  return { reservations: reservationsRes.data ?? [], payments: paymentsRes.data ?? [] }
}

async function fetchTodayReservations(): Promise<TodayReservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, check_in, check_out, status, guests(full_name), rooms(number)')
    .in('status', ['confirmada', 'em_andamento'])
    .order('check_in', { ascending: true })
  if (error) throw error
  return (data as unknown as TodayReservation[]) ?? []
}

async function fetchAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}

async function fetchActorNames(actorIds: string[]): Promise<Record<string, string>> {
  if (actorIds.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', actorIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))
}

export function DashboardPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canSeeFinance = !!profile && FINANCE_ROLES.includes(profile.role)
  const canSeeTodayPanel = !!profile && TODAY_PANEL_ROLES.includes(profile.role)

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  const { data: userStats } = useQuery({
    queryKey: ['dashboard-user-stats'],
    queryFn: fetchUserStats,
    enabled: isAdmin,
  })

  const { data: roomStats } = useQuery({
    queryKey: ['dashboard-room-stats'],
    queryFn: fetchRoomStats,
  })

  const { data: revenueStats } = useQuery({
    queryKey: ['dashboard-revenue'],
    queryFn: fetchRevenueStats,
    enabled: canSeeFinance,
  })

  const { data: todayReservations } = useQuery({
    queryKey: ['dashboard-today-reservations'],
    queryFn: fetchTodayReservations,
    enabled: canSeeTodayPanel,
  })

  const { data: auditLog } = useQuery({
    queryKey: ['dashboard-audit-log'],
    queryFn: fetchAuditLog,
    enabled: isAdmin,
  })

  const actorIds = React.useMemo(
    () =>
      Array.from(
        new Set((auditLog ?? []).map((entry) => entry.actor_id).filter((id): id is string => !!id))
      ),
    [auditLog]
  )

  const { data: actorNames } = useQuery({
    queryKey: ['dashboard-actor-names', actorIds],
    queryFn: () => fetchActorNames(actorIds),
    enabled: isAdmin && actorIds.length > 0,
  })

  const roleCounts = React.useMemo(() => {
    const counts = new Map<Role, number>()
    for (const role of ROLES) counts.set(role, 0)
    let activeCount = 0
    let inactiveCount = 0
    for (const user of userStats ?? []) {
      counts.set(user.role, (counts.get(user.role) ?? 0) + 1)
      if (user.active) activeCount++
      else inactiveCount++
    }
    return { counts, activeCount, inactiveCount, total: (userStats ?? []).length }
  }, [userStats])

  const occupancy = React.useMemo(() => {
    const total = (roomStats ?? []).length
    const occupied = (roomStats ?? []).filter((r) => r.status === 'ocupado').length
    const available = (roomStats ?? []).filter((r) => r.status === 'disponivel').length
    const cleaning = (roomStats ?? []).filter((r) => r.status === 'limpeza').length
    const maintenance = (roomStats ?? []).filter((r) => r.status === 'manutencao').length
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0
    return { total, occupied, available, cleaning, maintenance, rate }
  }, [roomStats])

  const revenue = React.useMemo(() => {
    const faturado = (revenueStats?.reservations ?? []).reduce(
      (sum, r) => sum + r.daily_rate * nightsBetween(r.check_in, r.check_out),
      0
    )
    const recebido = (revenueStats?.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
    return { faturado, recebido, pendente: faturado - recebido }
  }, [revenueStats])

  const today = React.useMemo(() => {
    const todayStr = toIsoDate(new Date())
    const reservations = todayReservations ?? []
    return {
      arrivals: reservations.filter((r) => r.status === 'confirmada' && r.check_in === todayStr),
      departures: reservations.filter((r) => r.status === 'em_andamento' && r.check_out === todayStr),
      overdue: reservations.filter((r) => r.status === 'confirmada' && r.check_in < todayStr),
    }
  }, [todayReservations])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bem-vindo(a){profile ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile ? ROLE_LABELS[profile.role] : 'Carregando seu perfil...'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{hotel ? hotel.name : 'Hotel'}</CardTitle>
          <CardDescription>
            {hotel?.address
              ? `${hotel.address.city} - ${hotel.address.state}`
              : 'Nenhum hotel cadastrado ainda.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/hotel" className="text-sm text-primary underline-offset-4 hover:underline">
            Ver configurações do hotel
          </Link>
        </CardContent>
      </Card>

      {canSeeTodayPanel &&
        (today.arrivals.length > 0 || today.departures.length > 0 || today.overdue.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle>Hoje</CardTitle>
              <CardDescription>Chegadas e saídas esperadas hoje, e atrasos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {today.overdue.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">Atrasadas</span>
                    <Badge variant="destructive">{today.overdue.length}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {today.overdue.map((r) => (
                      <li key={r.id} className="text-sm text-muted-foreground">
                        {r.guests?.full_name ?? '—'} — quarto {r.rooms?.number ?? '—'} (check-in previsto{' '}
                        {new Date(`${r.check_in}T00:00:00`).toLocaleDateString('pt-BR')})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {today.arrivals.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">Chegadas de hoje</span>
                    <Badge>{today.arrivals.length}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {today.arrivals.map((r) => (
                      <li key={r.id} className="text-sm text-muted-foreground">
                        {r.guests?.full_name ?? '—'} — quarto {r.rooms?.number ?? '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {today.departures.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium">Saídas de hoje</span>
                    <Badge variant="secondary">{today.departures.length}</Badge>
                  </div>
                  <ul className="space-y-1">
                    {today.departures.map((r) => (
                      <li key={r.id} className="text-sm text-muted-foreground">
                        {r.guests?.full_name ?? '—'} — quarto {r.rooms?.number ?? '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link to="/reservas" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
                Ver reservas
              </Link>
            </CardContent>
          </Card>
        )}

      {occupancy.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ocupação atual</CardTitle>
            <CardDescription>
              {occupancy.occupied} de {occupancy.total} quartos ocupados ({occupancy.rate}%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Disponíveis</span>
              <span>{occupancy.available}</span>
            </div>
            {occupancy.cleaning > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Aguardando limpeza</span>
                <span>{occupancy.cleaning}</span>
              </div>
            )}
            {occupancy.maintenance > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Em manutenção</span>
                <span>{occupancy.maintenance}</span>
              </div>
            )}
            <Link to="/reservas" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Ver reservas
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                {roleCounts.total} no total · {roleCounts.activeCount} ativos · {roleCounts.inactiveCount}{' '}
                inativos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ROLE_LABELS[role]}</span>
                  <span>{roleCounts.counts.get(role) ?? 0}</span>
                </div>
              ))}
              <Link
                to="/usuarios"
                className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
              >
                Gerenciar usuários
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Últimas ações registradas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(auditLog ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
              )}
              {(auditLog ?? []).map((entry) => (
                <div key={entry.id} className="text-sm">
                  <span className="font-medium">
                    {entry.actor_id ? actorNames?.[entry.actor_id] ?? 'Alguém' : 'Sistema'}
                  </span>{' '}
                  {ACTION_LABELS[entry.action] ?? entry.action} {ENTITY_LABELS[entry.entity] ?? entry.entity}
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {canSeeFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Financeiro</CardTitle>
            <CardDescription>Faturado, recebido e pendente (total desde o início do sistema)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Faturado</span>
              <span>{formatCurrency(revenue.faturado)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recebido</span>
              <span>{formatCurrency(revenue.recebido)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pendente</span>
              <span>{formatCurrency(revenue.pendente)}</span>
            </div>
            <Link to="/financeiro" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Ver financeiro
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
