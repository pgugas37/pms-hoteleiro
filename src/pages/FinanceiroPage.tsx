import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth-context'
import { downloadCsv } from '@/lib/csv'
import { formatCurrency } from '@/lib/format'
import { fetchHotel } from '@/lib/hotel'
import { generateMonthlyReportPdf } from '@/lib/monthlyReport'
import { generatePaymentReceiptPdf } from '@/lib/receipt'
import { supabase } from '@/lib/supabase'
import { paymentSchema, type PaymentInput } from '@/lib/validations'
import type { Role } from '@/types/auth'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentWithReservation } from '@/types/payment'
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  nightsBetween,
  type CancellationReason,
  type ReservationStatus,
  type ReservationWithRelations,
} from '@/types/reservation'

const PAGE_ROLES: Role[] = ['admin', 'gerente', 'recepcao', 'financeiro']

type PeriodMode = 'tudo' | 'mes_atual' | 'mes_anterior' | 'personalizado'

const PERIOD_MODE_LABELS: Record<PeriodMode, string> = {
  tudo: 'Tudo (sem filtro)',
  mes_atual: 'Este mês',
  mes_anterior: 'Mês passado',
  personalizado: 'Personalizado',
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(isoDate: string, amount: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return toIsoDate(date)
}

/** Quantidade de dias entre duas datas ISO, incluindo o dia inicial e o final. */
function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

/**
 * Quantas noites de uma reserva (check_in/check_out, intervalo [check_in, check_out)) caem
 * dentro do período [periodStart, periodEnd] (datas inclusive).
 */
function clipNightsToPeriod(
  checkIn: string,
  checkOut: string,
  periodStart: string,
  periodEnd: string
): number {
  const windowEnd = addDays(periodEnd, 1)
  const clipStart = checkIn > periodStart ? checkIn : periodStart
  const clipEnd = checkOut < windowEnd ? checkOut : windowEnd
  const nights = Math.round(
    (new Date(`${clipEnd}T00:00:00`).getTime() - new Date(`${clipStart}T00:00:00`).getTime()) / 86400000
  )
  return nights > 0 ? nights : 0
}

/** Intervalo [início, fim] (datas ISO, inclusive) pro filtro de período. null/null = sem filtro. */
function getPeriodRange(
  mode: PeriodMode,
  customStart: string,
  customEnd: string
): { start: string | null; end: string | null } {
  const now = new Date()
  if (mode === 'mes_atual') {
    return {
      start: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
  }
  if (mode === 'mes_anterior') {
    return {
      start: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  if (mode === 'personalizado') {
    return { start: customStart || null, end: customEnd || null }
  }
  return { start: null, end: null }
}

async function fetchBillableReservations(): Promise<ReservationWithRelations[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*, guests(id, full_name), rooms(id, number, room_types(id, name))')
    .neq('status', 'cancelada')
    .order('check_in', { ascending: false })
  if (error) throw error
  return (data as unknown as ReservationWithRelations[]) ?? []
}

async function fetchPayments(): Promise<PaymentWithReservation[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, reservations(id, check_in, check_out, guests(id, full_name), rooms(id, number))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as PaymentWithReservation[]) ?? []
}

interface KpiReservation {
  check_in: string
  check_out: string
  daily_rate: number
}

/** Reservas (não canceladas) cuja estadia toca o período [start, end] (inclusive), pra calcular indicadores. */
async function fetchKpiReservations(start: string, end: string): Promise<KpiReservation[]> {
  const windowEnd = addDays(end, 1)
  const { data, error } = await supabase
    .from('reservations')
    .select('check_in, check_out, daily_rate')
    .neq('status', 'cancelada')
    .lt('check_in', windowEnd)
    .gt('check_out', start)
  if (error) throw error
  return (data ?? []) as KpiReservation[]
}

async function fetchTotalRooms(): Promise<number> {
  const { count, error } = await supabase.from('rooms').select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/** Primeiro e último dia (ISO, inclusive) do mês de um valor "AAAA-MM" (o que o input type="month" devolve). */
function monthRange(monthStr: string): { start: string; end: string; label: string } {
  const [yearStr, monthNumStr] = monthStr.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthNumStr) - 1
  const start = toIsoDate(new Date(year, monthIndex, 1))
  const end = toIsoDate(new Date(year, monthIndex + 1, 0))
  const label = new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

interface ReservationStatusRow {
  status: ReservationStatus
  cancellation_reason: CancellationReason | null
}

/** Reservas com check-in dentro do mês (qualquer status, inclusive canceladas — pra contar no-show). */
async function fetchReservationsForMonth(start: string, end: string): Promise<ReservationStatusRow[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('status, cancellation_reason')
    .gte('check_in', start)
    .lte('check_in', end)
  if (error) throw error
  return (data ?? []) as ReservationStatusRow[]
}

/** Quantidade de hóspedes cadastrados dentro do mês. */
async function fetchNewGuestsCount(start: string, end: string): Promise<number> {
  const windowEnd = addDays(end, 1)
  const { count, error } = await supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${start}T00:00:00`)
    .lt('created_at', `${windowEnd}T00:00:00`)
  if (error) throw error
  return count ?? 0
}

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

/** Números em CSV pt-BR (separador ";") usam vírgula como separador decimal. */
function toCsvAmount(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

export function FinanceiroPage() {
  const { profile } = useAuth()
  const canManage = !!profile && PAGE_ROLES.includes(profile.role)
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()

  const [periodMode, setPeriodMode] = React.useState<PeriodMode>('tudo')
  const [customStart, setCustomStart] = React.useState('')
  const [customEnd, setCustomEnd] = React.useState('')
  const period = React.useMemo(
    () => getPeriodRange(periodMode, customStart, customEnd),
    [periodMode, customStart, customEnd]
  )

  const { data: reservations, isLoading: loadingReservations } = useQuery({
    queryKey: ['billing-reservations'],
    queryFn: fetchBillableReservations,
  })

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['payments'],
    queryFn: fetchPayments,
  })

  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  const hasBoundedPeriod = !!period.start && !!period.end

  const { data: kpiReservations, isLoading: loadingKpi } = useQuery({
    queryKey: ['kpi-reservations', period.start, period.end],
    queryFn: () => fetchKpiReservations(period.start as string, period.end as string),
    enabled: hasBoundedPeriod,
  })

  const { data: totalRooms } = useQuery({
    queryKey: ['kpi-total-rooms'],
    queryFn: fetchTotalRooms,
  })

  const kpi = React.useMemo(() => {
    if (!hasBoundedPeriod || !totalRooms) return null
    const start = period.start as string
    const end = period.end as string
    const periodDays = daysBetweenInclusive(start, end)
    const roomNightsAvailable = totalRooms * periodDays
    let roomNightsOccupied = 0
    let roomRevenue = 0
    for (const reservation of kpiReservations ?? []) {
      const nights = clipNightsToPeriod(reservation.check_in, reservation.check_out, start, end)
      roomNightsOccupied += nights
      roomRevenue += nights * reservation.daily_rate
    }
    const occupancyRate = roomNightsAvailable > 0 ? roomNightsOccupied / roomNightsAvailable : 0
    const adr = roomNightsOccupied > 0 ? roomRevenue / roomNightsOccupied : 0
    const revPar = roomNightsAvailable > 0 ? roomRevenue / roomNightsAvailable : 0
    return { periodDays, roomNightsAvailable, roomNightsOccupied, roomRevenue, occupancyRate, adr, revPar }
  }, [hasBoundedPeriod, totalRooms, kpiReservations, period])

  const paidByReservation = React.useMemo(() => {
    const totals = new Map<string, number>()
    for (const payment of payments ?? []) {
      totals.set(payment.reservation_id, (totals.get(payment.reservation_id) ?? 0) + Number(payment.amount))
    }
    return totals
  }, [payments])

  const billing = React.useMemo(() => {
    return (reservations ?? [])
      .filter((reservation) => {
        if (period.start && reservation.check_in < period.start) return false
        if (period.end && reservation.check_in > period.end) return false
        return true
      })
      .map((reservation) => {
        const nights = nightsBetween(reservation.check_in, reservation.check_out)
        const total = reservation.daily_rate * nights
        const paid = paidByReservation.get(reservation.id) ?? 0
        const balance = total - paid
        return { reservation, total, paid, balance }
      })
  }, [reservations, paidByReservation, period])

  const summary = React.useMemo(() => {
    const faturado = billing.reduce((sum, b) => sum + b.total, 0)
    const recebido = billing.reduce((sum, b) => sum + b.paid, 0)
    return { faturado, recebido, pendente: faturado - recebido }
  }, [billing])

  // Relatório mensal — mês escolhido independente do filtro de período acima, pra sempre poder
  // olhar "como foi o mês X" sem precisar trocar o filtro que também afeta Faturamento/Indicadores.
  const [reportMonth, setReportMonth] = React.useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const reportRange = React.useMemo(() => monthRange(reportMonth), [reportMonth])

  const { data: monthReservations, isLoading: loadingMonthReservations } = useQuery({
    queryKey: ['monthly-report-reservations', reportRange.start, reportRange.end],
    queryFn: () => fetchReservationsForMonth(reportRange.start, reportRange.end),
  })

  const { data: newGuestsCount, isLoading: loadingNewGuests } = useQuery({
    queryKey: ['monthly-report-new-guests', reportRange.start, reportRange.end],
    queryFn: () => fetchNewGuestsCount(reportRange.start, reportRange.end),
  })

  const monthlySummary = React.useMemo(() => {
    const monthBilling = (reservations ?? [])
      .filter((r) => r.check_in >= reportRange.start && r.check_in <= reportRange.end)
      .map((r) => {
        const total = r.daily_rate * nightsBetween(r.check_in, r.check_out)
        const paid = paidByReservation.get(r.id) ?? 0
        return { total, paid }
      })
    const faturado = monthBilling.reduce((sum, b) => sum + b.total, 0)
    const recebido = monthBilling.reduce((sum, b) => sum + b.paid, 0)
    return { faturado, recebido, pendente: faturado - recebido }
  }, [reservations, paidByReservation, reportRange])

  const monthlyKpi = React.useMemo(() => {
    if (!totalRooms) return null
    const periodDays = daysBetweenInclusive(reportRange.start, reportRange.end)
    const roomNightsAvailable = totalRooms * periodDays
    let roomNightsOccupied = 0
    let roomRevenue = 0
    for (const r of reservations ?? []) {
      const nights = clipNightsToPeriod(r.check_in, r.check_out, reportRange.start, reportRange.end)
      roomNightsOccupied += nights
      roomRevenue += nights * r.daily_rate
    }
    const occupancyRate = roomNightsAvailable > 0 ? roomNightsOccupied / roomNightsAvailable : 0
    const adr = roomNightsOccupied > 0 ? roomRevenue / roomNightsOccupied : 0
    const revPar = roomNightsAvailable > 0 ? roomRevenue / roomNightsAvailable : 0
    return { occupancyRate, adr, revPar }
  }, [reservations, totalRooms, reportRange])

  const monthlyStatusCounts = React.useMemo(() => {
    const counts = RESERVATION_STATUSES.reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<ReservationStatus, number>
    )
    let noShowCount = 0
    for (const r of monthReservations ?? []) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
      if (r.status === 'cancelada' && r.cancellation_reason === 'no_show') noShowCount++
    }
    return { counts, noShowCount, total: (monthReservations ?? []).length }
  }, [monthReservations])

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['billing-reservations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-revenue'] })
      toast.success('Pagamento excluído.')
    },
    onError: () => toast.error('Não foi possível excluir o pagamento.'),
  })

  const exportBillingCsv = () => {
    const rows = billing.map(({ reservation, total, paid, balance }) => [
      reservation.guests?.full_name ?? '—',
      reservation.rooms?.number ?? '—',
      new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR'),
      new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR'),
      toCsvAmount(total),
      toCsvAmount(paid),
      toCsvAmount(balance > 0 ? balance : 0),
    ])
    downloadCsv(
      `faturamento_${periodMode}_${toIsoDate(new Date())}.csv`,
      ['Hóspede', 'Quarto', 'Check-in', 'Check-out', 'Total (R$)', 'Pago (R$)', 'Saldo (R$)'],
      rows
    )
  }

  const exportMonthlyReportPdf = () => {
    generateMonthlyReportPdf({
      hotel: hotel ?? null,
      monthLabel: reportRange.label,
      summary: monthlySummary,
      kpi: monthlyKpi,
      statusCounts: monthlyStatusCounts.counts,
      noShowCount: monthlyStatusCounts.noShowCount,
      totalReservations: monthlyStatusCounts.total,
      newGuestsCount: newGuestsCount ?? 0,
    })
  }

  const exportPaymentsCsv = () => {
    const rows = (payments ?? []).map((payment) => [
      new Date(payment.created_at).toLocaleString('pt-BR'),
      payment.reservations?.guests?.full_name ?? '—',
      payment.reservations?.rooms?.number ?? '—',
      toCsvAmount(Number(payment.amount)),
      PAYMENT_METHOD_LABELS[payment.method],
      payment.notes ?? '',
    ])
    downloadCsv(
      `pagamentos_${toIsoDate(new Date())}.csv`,
      ['Data', 'Hóspede', 'Quarto', 'Valor (R$)', 'Forma', 'Observações'],
      rows
    )
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Você não tem acesso a esta página.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Faturamento das reservas e pagamentos recebidos.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as PeriodMode)}>
          <SelectTrigger className="sm:max-w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_MODE_LABELS) as PeriodMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {PERIOD_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {periodMode === 'personalizado' && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardDescription>Faturado</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.faturado)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardDescription>Recebido</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.recebido)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardDescription>Pendente</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(summary.pendente)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="faturamento">
        <TabsList>
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          <TabsTrigger value="pagamentos">Histórico de pagamentos</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          <TabsTrigger value="relatorio-mensal">Relatório mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="faturamento">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Faturamento por reserva</CardTitle>
                <CardDescription>
                  Reservas não canceladas com check-in no período selecionado ({PERIOD_MODE_LABELS[periodMode]}), com
                  total (diária × noites), valor já pago (em qualquer data) e saldo pendente.
                </CardDescription>
              </div>
              {billing.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportBillingCsv}>
                  Exportar CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingReservations && <p className="text-sm text-muted-foreground">Carregando...</p>}

              {!loadingReservations && (reservations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma reserva faturável ainda.</p>
              )}
              {!loadingReservations && (reservations ?? []).length > 0 && billing.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma reserva com check-in nesse período.</p>
              )}

              {billing.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Saldo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billing.map(({ reservation, total, paid, balance }) => (
                      <TableRow key={reservation.id}>
                        <TableCell>{reservation.guests?.full_name ?? '—'}</TableCell>
                        <TableCell>{reservation.rooms?.number ?? '—'}</TableCell>
                        <TableCell>
                          {new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                          {new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>{formatCurrency(total)}</TableCell>
                        <TableCell>{formatCurrency(paid)}</TableCell>
                        <TableCell>
                          {balance <= 0 ? (
                            <Badge>Quitado</Badge>
                          ) : (
                            <Badge variant={paid > 0 ? 'secondary' : 'outline'}>{formatCurrency(balance)}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <RegisterPaymentDialog
                            reservationId={reservation.id}
                            guestName={reservation.guests?.full_name ?? 'hóspede'}
                            defaultAmount={balance > 0 ? balance : total}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamentos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Pagamentos recebidos</CardTitle>
                <CardDescription>
                  Histórico de todos os pagamentos registrados, mais recentes primeiro — não é afetado pelo filtro de
                  período acima.
                  {isAdmin && ' Pagamentos lançados errado podem ser editados ou excluídos aqui.'}
                </CardDescription>
              </div>
              {(payments ?? []).length > 0 && (
                <Button variant="outline" size="sm" onClick={exportPaymentsCsv}>
                  Exportar CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingPayments && <p className="text-sm text-muted-foreground">Carregando...</p>}

              {!loadingPayments && (payments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
              )}

              {(payments ?? []).length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Observações</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payments ?? []).map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.created_at).toLocaleString('pt-BR')}</TableCell>
                        <TableCell>{payment.reservations?.guests?.full_name ?? '—'}</TableCell>
                        <TableCell>{payment.reservations?.rooms?.number ?? '—'}</TableCell>
                        <TableCell>{formatCurrency(Number(payment.amount))}</TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.notes ?? '—'}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generatePaymentReceiptPdf(payment, hotel ?? null)}
                          >
                            Recibo (PDF)
                          </Button>
                          {isAdmin && (
                            <>
                              <EditPaymentDialog payment={payment} />
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm('Excluir este pagamento? Essa ação não pode ser desfeita.')) {
                                    deletePayment.mutate(payment.id)
                                  }
                                }}
                              >
                                Excluir
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indicadores">
          <Card>
            <CardHeader>
              <CardTitle>Indicadores de desempenho</CardTitle>
              <CardDescription>
                Taxa de ocupação, diária média (ADR) e RevPAR no período selecionado acima ({PERIOD_MODE_LABELS[periodMode]}
                ). Considera as noites de cada reserva não cancelada que caem dentro do período, mesmo quando a estadia
                começa ou termina fora dele.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasBoundedPeriod && (
                <p className="text-sm text-muted-foreground">
                  Selecione um período específico (não "Tudo") no filtro acima pra calcular os indicadores — eles
                  precisam de datas de início e fim.
                </p>
              )}

              {hasBoundedPeriod && loadingKpi && <p className="text-sm text-muted-foreground">Carregando...</p>}

              {hasBoundedPeriod && !loadingKpi && kpi && (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>Taxa de ocupação</CardDescription>
                        <CardTitle className="text-xl">{Math.round(kpi.occupancyRate * 100)}%</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>Diária média (ADR)</CardDescription>
                        <CardTitle className="text-xl">{formatCurrency(kpi.adr)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>RevPAR</CardDescription>
                        <CardTitle className="text-xl">{formatCurrency(kpi.revPar)}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Período: {kpi.periodDays} dia(s) · {totalRooms} quarto(s) cadastrado(s) ·{' '}
                      {kpi.roomNightsOccupied} de {kpi.roomNightsAvailable} quartos-noite ocupados
                    </p>
                    <p>Receita de diárias no período: {formatCurrency(kpi.roomRevenue)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relatorio-mensal">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Relatório mensal consolidado</CardTitle>
                <CardDescription>
                  Fechamento do mês escolhido — financeiro, indicadores de ocupação, reservas por status
                  (incluindo no-shows) e hóspedes novos. Independente do filtro de período lá em cima.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportMonthlyReportPdf}>
                Exportar PDF
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="sm:max-w-[200px]"
              />

              {(loadingMonthReservations || loadingNewGuests) && (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">Financeiro (reservas com check-in no mês)</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="space-y-0 pb-2">
                      <CardDescription>Faturado</CardDescription>
                      <CardTitle className="text-xl">{formatCurrency(monthlySummary.faturado)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="space-y-0 pb-2">
                      <CardDescription>Recebido</CardDescription>
                      <CardTitle className="text-xl">{formatCurrency(monthlySummary.recebido)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="space-y-0 pb-2">
                      <CardDescription>Pendente</CardDescription>
                      <CardTitle className="text-xl">{formatCurrency(monthlySummary.pendente)}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Indicadores de ocupação</p>
                {monthlyKpi ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>Taxa de ocupação</CardDescription>
                        <CardTitle className="text-xl">{Math.round(monthlyKpi.occupancyRate * 100)}%</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>Diária média (ADR)</CardDescription>
                        <CardTitle className="text-xl">{formatCurrency(monthlyKpi.adr)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-0 pb-2">
                        <CardDescription>RevPAR</CardDescription>
                        <CardTitle className="text-xl">{formatCurrency(monthlyKpi.revPar)}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem quartos cadastrados pra calcular indicadores.</p>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  Reservas no mês (por check-in) — {monthlyStatusCounts.total} no total
                </p>
                <ul className="space-y-1">
                  {RESERVATION_STATUSES.map((status) => (
                    <li key={status} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{RESERVATION_STATUS_LABELS[status]}</span>
                      <span>{monthlyStatusCounts.counts[status] ?? 0}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Das canceladas, {monthlyStatusCounts.noShowCount} foram registradas como no-show.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Hóspedes</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Novos hóspedes cadastrados no mês</span>
                  <span>{newGuestsCount ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RegisterPaymentDialog({
  reservationId,
  guestName,
  defaultAmount,
}: {
  reservationId: string
  guestName: string
  defaultAmount: number
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: Math.max(0, Number(defaultAmount.toFixed(2))), method: 'pix', notes: '' },
  })

  React.useEffect(() => {
    if (open) reset({ amount: Math.max(0, Number(defaultAmount.toFixed(2))), method: 'pix', notes: '' })
  }, [open, defaultAmount, reset])

  const registerPayment = useMutation({
    mutationFn: async (values: PaymentInput) => {
      const { error } = await supabase.rpc('register_payment', {
        p_reservation_id: reservationId,
        p_amount: values.amount,
        p_method: values.method,
        p_notes: values.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['billing-reservations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-revenue'] })
      toast.success('Pagamento registrado.')
      setOpen(false)
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível registrar o pagamento.')),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Registrar pagamento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>Pagamento recebido de {guestName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => registerPayment.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input id="amount" type="number" step="0.01" min={0.01} {...register('amount')} />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={watch('method')} onValueChange={(value) => setValue('method', value as PaymentInput['method'])}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.method && <p className="text-sm text-destructive">{errors.method.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={registerPayment.isPending}>
              {registerPayment.isPending ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditPaymentDialog({ payment }: { payment: PaymentWithReservation }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: Number(payment.amount), method: payment.method, notes: payment.notes ?? '' },
  })

  React.useEffect(() => {
    if (open) reset({ amount: Number(payment.amount), method: payment.method, notes: payment.notes ?? '' })
  }, [open, payment, reset])

  const editPayment = useMutation({
    mutationFn: async (values: PaymentInput) => {
      const { error } = await supabase
        .from('payments')
        .update({ amount: values.amount, method: values.method, notes: values.notes || null })
        .eq('id', payment.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['billing-reservations'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-revenue'] })
      toast.success('Pagamento atualizado.')
      setOpen(false)
    },
    onError: () => toast.error('Não foi possível atualizar o pagamento.'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
          <DialogDescription>
            Corrige um pagamento lançado errado — de {payment.reservations?.guests?.full_name ?? 'hóspede'}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => editPayment.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Valor (R$)</Label>
            <Input id="edit-amount" type="number" step="0.01" min={0.01} {...register('amount')} />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={watch('method')} onValueChange={(value) => setValue('method', value as PaymentInput['method'])}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.method && <p className="text-sm text-destructive">{errors.method.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Observações (opcional)</Label>
            <Input id="edit-notes" {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={editPayment.isPending}>
              {editPayment.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
