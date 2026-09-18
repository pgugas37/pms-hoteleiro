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
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { paymentSchema, type PaymentInput } from '@/lib/validations'
import type { Role } from '@/types/auth'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentWithReservation } from '@/types/payment'
import { nightsBetween, type ReservationWithRelations } from '@/types/reservation'

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

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
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
        </TabsList>

        <TabsContent value="faturamento">
          <Card>
            <CardHeader>
              <CardTitle>Faturamento por reserva</CardTitle>
              <CardDescription>
                Reservas não canceladas com check-in no período selecionado ({PERIOD_MODE_LABELS[periodMode]}), com
                total (diária × noites), valor já pago (em qualquer data) e saldo pendente.
              </CardDescription>
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
            <CardHeader>
              <CardTitle>Pagamentos recebidos</CardTitle>
              <CardDescription>
                Histórico de todos os pagamentos registrados, mais recentes primeiro — não é afetado pelo filtro de
                período acima.
                {isAdmin && ' Pagamentos lançados errado podem ser editados ou excluídos aqui.'}
              </CardDescription>
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
                      {isAdmin && <TableHead className="text-right">Ações</TableHead>}
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
                        {isAdmin && (
                          <TableCell className="space-x-2 text-right">
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
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
