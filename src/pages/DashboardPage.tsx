import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Cake, LogIn, LogOut, Sparkles, Wrench } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, fetchActorNames } from '@/lib/audit'
import { useAuth } from '@/lib/auth-context'
import { compareRoomNumbers, formatCurrency, toLocalIsoDate } from '@/lib/format'
import { ROOM_STATUS_DOT, ROOM_TILE_CLASSES } from '@/lib/status'
import { supabase } from '@/lib/supabase'
import {
  listPaymentsWithReservation,
  listProfiles,
  listReservationsWithRelations,
  listRoomsWithType,
} from '@/offline/queries'
import { ROLES, ROLE_LABELS, type Role } from '@/types/auth'
import { nightsBetween, type ReservationStatus } from '@/types/reservation'
import { ROOM_STATUS_LABELS, type RoomStatus } from '@/types/room'

const FINANCE_ROLES: Role[] = ['admin', 'gerente', 'financeiro']
const TODAY_PANEL_ROLES: Role[] = ['admin', 'gerente', 'recepcao']
const REMINDER_WINDOW_DAYS = 7

/** Ordem da legenda e da barra de ocupação. */
const ROOM_STATUS_ORDER: RoomStatus[] = ['ocupado', 'limpeza', 'manutencao', 'disponivel', 'inativo']

const ROOM_LEGEND_LABELS: Record<RoomStatus, string> = {
  disponivel: 'Livre',
  ocupado: 'Ocupado',
  limpeza: 'Limpeza',
  manutencao: 'Manutenção',
  inativo: 'Inativo',
}

interface TodayReservation {
  id: string
  guest_id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  guests: { full_name: string; birth_date: string | null } | null
  rooms: { number: string } | null
}

interface DashboardRoom {
  id: string
  number: string
  floor: string | null
  status: RoomStatus
}

const toIsoDate = toLocalIsoDate

function addDaysToDate(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

/** Quantos dias faltam pro próximo aniversário (0 = hoje), comparando só mês/dia, ignorando o ano de nascimento. */
function daysUntilNextBirthday(birthDateIso: string, from: Date): number {
  const birth = new Date(`${birthDateIso}T00:00:00`)
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let next = new Date(fromMidnight.getFullYear(), birth.getMonth(), birth.getDate())
  if (next < fromMidnight) next = new Date(fromMidnight.getFullYear() + 1, birth.getMonth(), birth.getDate())
  return Math.round((next.getTime() - fromMidnight.getTime()) / (1000 * 60 * 60 * 24))
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function longDateLabel(now: Date): string {
  const label = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

interface AuditEntry {
  id: number
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  created_at: string
}

async function fetchUserStats(): Promise<{ role: Role; active: boolean }[]> {
  return (await listProfiles()).map(({ role, active }) => ({ role, active }))
}

async function fetchRoomStats(): Promise<DashboardRoom[]> {
  return (await listRoomsWithType()).map(({ id, number, floor, status }) => ({ id, number, floor, status }))
}

async function fetchRevenueStats(): Promise<{
  reservations: { daily_rate: number; check_in: string; check_out: string }[]
  payments: { amount: number }[]
}> {
  const [reservations, payments] = await Promise.all([listReservationsWithRelations(), listPaymentsWithReservation()])
  return {
    reservations: reservations
      .filter((r) => r.status !== 'cancelada')
      .map(({ daily_rate, check_in, check_out }) => ({ daily_rate, check_in, check_out })),
    payments: payments.map(({ amount }) => ({ amount })),
  }
}

async function fetchTodayReservations(): Promise<TodayReservation[]> {
  return (await listReservationsWithRelations())
    .filter((r) => r.status === 'confirmada' || r.status === 'em_andamento')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .map((r) => ({
      id: r.id,
      guest_id: r.guest_id,
      check_in: r.check_in,
      check_out: r.check_out,
      status: r.status,
      guests: r.guests ? { full_name: r.guests.full_name, birth_date: r.guests.birth_date ?? null } : null,
      rooms: r.rooms ? { number: r.rooms.number } : null,
    }))
}

/** Lê o audit_log no servidor (só admin): este card precisa de internet. */

async function fetchAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}

/* ---------- Peças visuais ---------- */

function StatCell({
  label,
  value,
  detail,
  detailTone = 'muted',
  children,
}: {
  label: string
  value: string
  detail?: React.ReactNode
  detailTone?: 'muted' | 'alert'
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0 bg-card px-5 py-4 md:px-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[34px] font-semibold leading-none text-foreground">{value}</p>
      {detail && (
        <p
          className={cn(
            'mt-2 text-xs',
            detailTone === 'alert' ? 'font-medium text-destructive' : 'text-muted-foreground'
          )}
        >
          {detail}
        </p>
      )}
      {children}
    </div>
  )
}

function RoomChip({ number, tone = 'neutral' }: { number: string; tone?: 'neutral' | 'alert' }) {
  return (
    <span
      className={cn(
        'flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center rounded-md px-1.5 font-display text-sm font-semibold',
        tone === 'alert' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-pine'
      )}
    >
      {number}
    </span>
  )
}

function MovementList({
  icon: Icon,
  title,
  items,
  emptyText,
  tone = 'neutral',
  meta,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  items: TodayReservation[]
  emptyText?: string
  tone?: 'neutral' | 'alert'
  meta?: (r: TodayReservation) => string
}) {
  if (items.length === 0 && !emptyText) return null
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-sans text-sm font-semibold">
        <Icon className={cn('h-4 w-4', tone === 'alert' ? 'text-destructive' : 'text-mint-strong')} />
        {title}
        <span className="ml-auto font-display text-sm text-muted-foreground">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <RoomChip number={r.rooms?.number ?? '—'} tone={tone} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.guests?.full_name ?? '—'}</p>
                {meta && <p className="text-xs text-muted-foreground">{meta(r)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CardLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex text-sm font-medium text-mint-strong underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  )
}

/* ---------- Página ---------- */

export function DashboardPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canSeeFinance = !!profile && FINANCE_ROLES.includes(profile.role)
  const canSeeTodayPanel = !!profile && TODAY_PANEL_ROLES.includes(profile.role)
  const now = React.useMemo(() => new Date(), [])

  const { data: userStats } = useQuery({
    queryKey: ['dashboard-user-stats'],
    queryFn: fetchUserStats,
    enabled: isAdmin,
  })

  const { data: roomStats, isLoading: loadingRooms } = useQuery({
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

  const { data: auditLog, isError: auditError } = useQuery({
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
    const rooms = roomStats ?? []
    const byStatus = {} as Record<RoomStatus, number>
    for (const status of ROOM_STATUS_ORDER) byStatus[status] = 0
    for (const room of rooms) byStatus[room.status] = (byStatus[room.status] ?? 0) + 1
    const total = rooms.length
    const rate = total > 0 ? Math.round((byStatus.ocupado / total) * 100) : 0
    return {
      total,
      byStatus,
      occupied: byStatus.ocupado,
      available: byStatus.disponivel,
      cleaning: byStatus.limpeza,
      maintenance: byStatus.manutencao,
      rate,
    }
  }, [roomStats])

  // Quadro de quartos: agrupa por andar quando o cadastro tem andar preenchido.
  const roomBoard = React.useMemo(() => {
    const rooms = [...(roomStats ?? [])].sort((a, b) => compareRoomNumbers(a.number, b.number))
    const hasFloors = rooms.some((room) => room.floor && room.floor.trim() !== '')
    if (!hasFloors) return [{ floor: null as string | null, rooms }]
    const groups = new Map<string, DashboardRoom[]>()
    for (const room of rooms) {
      const key = room.floor?.trim() || 'Sem andar'
      const list = groups.get(key) ?? []
      list.push(room)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a === 'Sem andar' ? 1 : b === 'Sem andar' ? -1 : compareRoomNumbers(a, b)))
      .map(([floor, list]) => ({ floor, rooms: list }))
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

  const reminders = React.useMemo(() => {
    const reservations = todayReservations ?? []
    const now = new Date()
    const todayStr = toIsoDate(now)
    const tomorrowStr = toIsoDate(addDaysToDate(now, 1))
    const windowEndStr = toIsoDate(addDaysToDate(now, REMINDER_WINDOW_DAYS))

    const tomorrowArrivals = reservations.filter((r) => r.status === 'confirmada' && r.check_in === tomorrowStr)

    // Hóspedes hospedados agora ou que chegam nos próximos dias — só esses fazem sentido pra parabenizar.
    const hostedSoon = reservations.filter(
      (r) =>
        r.status === 'em_andamento' ||
        (r.status === 'confirmada' && r.check_in >= todayStr && r.check_in <= windowEndStr)
    )

    const seenGuests = new Set<string>()
    const birthdays: { guestId: string; name: string; daysUntil: number }[] = []
    for (const r of hostedSoon) {
      const birthDate = r.guests?.birth_date
      if (!birthDate || seenGuests.has(r.guest_id)) continue
      seenGuests.add(r.guest_id)
      const daysUntil = daysUntilNextBirthday(birthDate, now)
      if (daysUntil <= REMINDER_WINDOW_DAYS) {
        birthdays.push({ guestId: r.guest_id, name: r.guests?.full_name ?? '—', daysUntil })
      }
    }
    birthdays.sort((a, b) => a.daysUntil - b.daysUntil)

    return { tomorrowArrivals, birthdays }
  }, [todayReservations])

  const hasReminders = reminders.tomorrowArrivals.length > 0 || reminders.birthdays.length > 0
  const hasSideColumn = canSeeTodayPanel || canSeeFinance
  const receivedShare = revenue.faturado > 0 ? Math.min(100, Math.round((revenue.recebido / revenue.faturado) * 100)) : 0

  const firstName = profile?.full_name.split(' ')[0]

  return (
    <div className="page">
      <PageHeader
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}
        description={longDateLabel(now)}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/mapa">Mapa de ocupação</Link>
            </Button>
            <Button asChild>
              <Link to="/reservas">Ir para reservas</Link>
            </Button>
          </>
        }
      />

      {/* Faixa de indicadores */}
      {occupancy.total > 0 && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border/70 lg:grid-cols-4">
          <StatCell
            label="Ocupação agora"
            value={`${occupancy.rate}%`}
            detail={`${occupancy.occupied} de ${occupancy.total} quartos ocupados`}
          >
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {ROOM_STATUS_ORDER.map((status) =>
                occupancy.byStatus[status] > 0 ? (
                  <span
                    key={status}
                    className={ROOM_STATUS_DOT[status]}
                    style={{ width: `${(occupancy.byStatus[status] / occupancy.total) * 100}%` }}
                  />
                ) : null
              )}
            </div>
          </StatCell>
          {canSeeTodayPanel ? (
            <>
              <StatCell
                label="Chegadas hoje"
                value={String(today.arrivals.length)}
                detail={
                  today.overdue.length > 0
                    ? `${today.overdue.length} check-in${today.overdue.length > 1 ? 's' : ''} em atraso`
                    : 'Nenhum check-in em atraso'
                }
                detailTone={today.overdue.length > 0 ? 'alert' : 'muted'}
              />
              <StatCell
                label="Saídas hoje"
                value={String(today.departures.length)}
                detail="Check-outs previstos para hoje"
              />
            </>
          ) : (
            <>
              <StatCell label="Aguardando limpeza" value={String(occupancy.cleaning)} detail="Liberados após a limpeza" />
              <StatCell label="Em manutenção" value={String(occupancy.maintenance)} detail="Fora de uso no momento" />
            </>
          )}
          <StatCell
            label="Livres para hospedar"
            value={String(occupancy.available)}
            detail={
              occupancy.cleaning > 0 ? `Mais ${occupancy.cleaning} depois da limpeza` : 'Limpos e disponíveis'
            }
          />
        </Card>
      )}

      <div className={cn('grid grid-cols-1 gap-6', hasSideColumn && 'lg:grid-cols-3')}>
        {/* Quadro de quartos */}
        <Card className={cn('self-start', hasSideColumn && 'lg:col-span-2')}>
          <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Quadro de quartos</CardTitle>
              <CardDescription>Situação atual de cada quarto. Clique num quarto para ver os detalhes.</CardDescription>
            </div>
            {occupancy.total > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:max-w-[45%] sm:justify-end">
                {ROOM_STATUS_ORDER.filter(
                  (status) => occupancy.byStatus[status] > 0 || status === 'disponivel' || status === 'ocupado'
                ).map((status) => (
                  <li key={status} className="flex items-center gap-1.5">
                    <span className={cn('h-2.5 w-2.5 rounded-[3px]', ROOM_STATUS_DOT[status])} />
                    {ROOM_LEGEND_LABELS[status]}
                    <span className="font-display font-semibold text-foreground">{occupancy.byStatus[status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingRooms && <p className="text-sm text-muted-foreground">Carregando quartos...</p>}
            {!loadingRooms && occupancy.total === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">Nenhum quarto cadastrado ainda.</p>
                <div className="mt-3">
                  <CardLink to="/quartos">Cadastrar quartos</CardLink>
                </div>
              </div>
            )}
            {roomBoard.map((group) => (
              <div key={group.floor ?? 'todos'} className="space-y-2">
                {group.floor && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    {group.floor === 'Sem andar' ? 'Sem andar cadastrado' : `Andar ${group.floor}`}
                  </p>
                )}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
                  {group.rooms.map((room) => (
                    <li key={room.id}>
                      <Link
                        to={`/quartos?q=${encodeURIComponent(room.number)}`}
                        title={`Quarto ${room.number}: ${ROOM_STATUS_LABELS[room.status]}`}
                        aria-label={`Quarto ${room.number}, ${ROOM_STATUS_LABELS[room.status]}`}
                        className={cn(
                          'relative flex h-12 items-center justify-center rounded-md border font-display text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          ROOM_TILE_CLASSES[room.status]
                        )}
                      >
                        {room.number}
                        {room.status === 'limpeza' && (
                          <Sparkles className="absolute right-1 top-1 h-3 w-3 opacity-70" aria-hidden="true" />
                        )}
                        {room.status === 'manutencao' && (
                          <Wrench className="absolute right-1 top-1 h-3 w-3 opacity-70" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        {hasSideColumn && (
          <div className="space-y-6">
            {canSeeTodayPanel && (
              <Card>
                <CardHeader>
                  <CardTitle>Movimento de hoje</CardTitle>
                  <CardDescription>Quem chega, quem sai e quem ainda não apareceu.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <MovementList
                    icon={AlertTriangle}
                    title="Check-in em atraso"
                    items={today.overdue}
                    tone="alert"
                    meta={(r) => `Previsto para ${new Date(`${r.check_in}T00:00:00`).toLocaleDateString('pt-BR')}`}
                  />
                  <MovementList icon={LogIn} title="Chegadas" items={today.arrivals} emptyText="Nenhuma chegada prevista." />
                  <MovementList
                    icon={LogOut}
                    title="Saídas"
                    items={today.departures}
                    emptyText="Nenhuma saída prevista."
                  />
                  <CardLink to="/reservas">Ver todas as reservas</CardLink>
                </CardContent>
              </Card>
            )}

            {canSeeTodayPanel && hasReminders && (
              <Card>
                <CardHeader>
                  <CardTitle>Próximos dias</CardTitle>
                  <CardDescription>Chegadas de amanhã e aniversários nos próximos {REMINDER_WINDOW_DAYS} dias.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <MovementList icon={LogIn} title="Chegam amanhã" items={reminders.tomorrowArrivals} />
                  {reminders.birthdays.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-2 font-sans text-sm font-semibold">
                        <Cake className="h-4 w-4 text-mint-strong" />
                        Aniversários
                        <span className="ml-auto font-display text-sm text-muted-foreground">
                          {reminders.birthdays.length}
                        </span>
                      </h3>
                      <ul className="space-y-1.5">
                        {reminders.birthdays.map((b) => (
                          <li key={b.guestId} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-medium">{b.name}</span>
                            <Badge variant={b.daysUntil === 0 ? 'success' : 'secondary'}>
                              {b.daysUntil === 0 ? 'Hoje' : b.daysUntil === 1 ? 'Amanhã' : `Em ${b.daysUntil} dias`}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </CardContent>
              </Card>
            )}

            {canSeeFinance && (
              <Card>
                <CardHeader>
                  <CardTitle>Financeiro</CardTitle>
                  <CardDescription>Total acumulado desde o início do sistema.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Faturado</dt>
                      <dd className="font-display text-base font-semibold">{formatCurrency(revenue.faturado)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Recebido</dt>
                      <dd className="font-display text-base font-semibold text-mint-strong">
                        {formatCurrency(revenue.recebido)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Pendente</dt>
                      <dd className="font-display text-base font-semibold">{formatCurrency(revenue.pendente)}</dd>
                    </div>
                  </dl>
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-mint" style={{ width: `${receivedShare}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{receivedShare}% do faturado já foi recebido</p>
                  </div>
                  <CardLink to="/financeiro">Abrir financeiro</CardLink>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Atividade recente</CardTitle>
              <CardDescription>Últimas alterações em usuários, reservas e pagamentos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {auditError && (
                <p className="text-sm text-muted-foreground">Precisa de internet para mostrar a atividade recente.</p>
              )}
              {!auditError && (auditLog ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
              )}
              <ol className="relative space-y-3 border-l border-border pl-5">
                {(auditLog ?? []).map((entry) => (
                  <li key={entry.id} className="relative text-sm">
                    <span
                      className={cn(
                        'absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-card',
                        entry.action === 'delete' ? 'bg-destructive' : entry.action === 'create' ? 'bg-mint' : 'bg-pine/40'
                      )}
                      aria-hidden="true"
                    />
                    <p>
                      <span className="font-medium">
                        {entry.actor_id ? actorNames?.[entry.actor_id] ?? 'Alguém' : 'Sistema'}
                      </span>{' '}
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}{' '}
                      {AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </li>
                ))}
              </ol>
              <CardLink to="/auditoria">Ver histórico completo</CardLink>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipe</CardTitle>
              <CardDescription>
                {roleCounts.total} usuário{roleCounts.total !== 1 ? 's' : ''}, {roleCounts.activeCount} ativo
                {roleCounts.activeCount !== 1 ? 's' : ''}
                {roleCounts.inactiveCount > 0 ? ` e ${roleCounts.inactiveCount} inativo${roleCounts.inactiveCount !== 1 ? 's' : ''}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="space-y-2">
                {ROLES.map((role) => (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">{ROLE_LABELS[role]}</dt>
                    <dd className="font-display font-semibold">{roleCounts.counts.get(role) ?? 0}</dd>
                  </div>
                ))}
              </dl>
              <CardLink to="/usuarios">Gerenciar usuários</CardLink>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
