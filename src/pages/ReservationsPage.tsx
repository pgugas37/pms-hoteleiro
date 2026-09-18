import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { GuestDialog } from '@/components/GuestDialog'
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
import { fetchHotel } from '@/lib/hotel'
import { generateGuestRegistrationPdf } from '@/lib/registration'
import { supabase } from '@/lib/supabase'
import { groupReservationSchema, reservationSchema, type GroupReservationInput, type ReservationInput } from '@/lib/validations'
import type { Role } from '@/types/auth'
import type { Guest } from '@/types/guest'
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  nightsBetween,
  type ReservationStatus,
  type ReservationWithRelations,
} from '@/types/reservation'
import type { Room } from '@/types/room'

const STAFF_ROLES: Role[] = ['admin', 'gerente', 'recepcao']
const ACTIVE_STATUSES: ReservationStatus[] = ['confirmada', 'em_andamento']

interface RoomOption extends Room {
  room_types: { id: string; name: string; base_price: number } | null
}

async function fetchReservations(): Promise<ReservationWithRelations[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      '*, guests(id, full_name, document_type, document_number, nationality, birth_date), rooms(id, number, room_types(id, name))'
    )
    .order('check_in', { ascending: false })
  if (error) throw error
  return (data as unknown as ReservationWithRelations[]) ?? []
}

async function fetchGuestsForSelect(): Promise<Pick<Guest, 'id' | 'full_name'>[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function fetchRoomsForSelect(): Promise<RoomOption[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_types(id, name, base_price)')
    .order('number', { ascending: true })
  if (error) throw error
  return (data as unknown as RoomOption[]) ?? []
}

/** IDs de quartos com alguma reserva ativa cujo período cruza com [checkIn, checkOut). */
async function fetchOverlappingRoomIds(checkIn: string, checkOut: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('reservations')
    .select('room_id')
    .neq('status', 'cancelada')
    .lt('check_in', checkOut)
    .gt('check_out', checkIn)
  if (error) throw error
  return new Set((data ?? []).map((row) => row.room_id))
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code
  }
  return undefined
}

/** Mensagens de erro lançadas com `raise exception` nas funções RPC (checkin/checkout/cancel) chegam em `error.message`. */
function rpcErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

function statusBadgeVariant(status: ReservationStatus) {
  if (status === 'confirmada') return 'default'
  if (status === 'em_andamento') return 'secondary'
  if (status === 'cancelada') return 'destructive'
  return 'outline'
}

export function ReservationsPage() {
  const { profile } = useAuth()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isAdmin = profile?.role === 'admin'
  const queryClient = useQueryClient()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<ReservationStatus | 'todas'>('todas')

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: fetchReservations,
  })
  const { data: guests } = useQuery({ queryKey: ['guests-select'], queryFn: fetchGuestsForSelect })
  const { data: rooms } = useQuery({ queryKey: ['rooms-select'], queryFn: fetchRoomsForSelect })
  const { data: hotel } = useQuery({ queryKey: ['hotel'], queryFn: fetchHotel })

  const cancelReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_reservation', { p_reservation_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Reserva cancelada.')
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível cancelar a reserva.')),
  })

  const deleteReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      toast.success('Reserva excluída.')
    },
    onError: () => toast.error('Não foi possível excluir a reserva.'),
  })

  const checkinReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('checkin_reservation', { p_reservation_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Check-in realizado.')
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível fazer o check-in.')),
  })

  const checkoutReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('checkout_reservation', { p_reservation_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      queryClient.invalidateQueries({ queryKey: ['rooms-select'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-room-stats'] })
      toast.success('Check-out realizado.')
    },
    onError: (error) => toast.error(rpcErrorMessage(error, 'Não foi possível fazer o check-out.')),
  })

  const toggleInvoiceIssued = useMutation({
    mutationFn: async ({ id, invoiceIssued }: { id: string; invoiceIssued: boolean }) => {
      const { error } = await supabase
        .from('reservations')
        .update({ invoice_issued: invoiceIssued, invoice_issued_at: invoiceIssued ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { invoiceIssued }) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      toast.success(invoiceIssued ? 'Nota fiscal marcada como emitida.' : 'Nota fiscal marcada como pendente.')
    },
    onError: () => toast.error('Não foi possível atualizar a nota fiscal.'),
  })

  const filteredReservations = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (reservations ?? []).filter((reservation) => {
      const statusMatch = statusFilter === 'todas' || reservation.status === statusFilter
      const nameMatch = !term || (reservation.guests?.full_name ?? '').toLowerCase().includes(term)
      return statusMatch && nameMatch
    })
  }, [reservations, search, statusFilter])

  const finalizedReservations = React.useMemo(() => {
    return (reservations ?? [])
      .filter((r) => r.status === 'finalizada')
      .sort((a, b) => Number(a.invoice_issued) - Number(b.invoice_issued))
  }, [reservations])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <p className="text-sm text-muted-foreground">Reservas de hóspedes em quartos.</p>
      </div>

      <Tabs defaultValue="reservas">
        <TabsList>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
          <TabsTrigger value="notas-fiscais">
            Notas fiscais
            {finalizedReservations.some((r) => !r.invoice_issued) && (
              <Badge variant="destructive" className="ml-2">
                {finalizedReservations.filter((r) => !r.invoice_issued).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reservas">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Reservas</CardTitle>
            <CardDescription>
              {(guests ?? []).length === 0
                ? 'Cadastre pelo menos um hóspede antes de criar uma reserva.'
                : (rooms ?? []).length === 0
                  ? 'Cadastre pelo menos um quarto antes de criar uma reserva.'
                  : 'Cadastro e acompanhamento de reservas.'}
            </CardDescription>
          </div>
          {isStaff && (
            <div className="flex gap-2">
              <GroupReservationDialog guests={guests ?? []} rooms={rooms ?? []} />
              <ReservationDialog guests={guests ?? []} rooms={rooms ?? []} />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {reservations && reservations.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Buscar por nome do hóspede..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:max-w-xs"
              />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ReservationStatus | 'todas')}>
                <SelectTrigger className="sm:max-w-[200px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos os status</SelectItem>
                  {RESERVATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {RESERVATION_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {filteredReservations.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hóspede</TableHead>
                  <TableHead>Quarto</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  {isStaff && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.map((reservation) => {
                  const nights = nightsBetween(reservation.check_in, reservation.check_out)
                  return (
                    <TableRow key={reservation.id}>
                      <TableCell>
                        {reservation.guests?.full_name ?? '—'}
                        {reservation.occupant_name && (
                          <div className="text-xs text-muted-foreground">Ocupante: {reservation.occupant_name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {reservation.rooms?.number ?? '—'}
                        {reservation.rooms?.room_types?.name && (
                          <span className="text-xs text-muted-foreground"> ({reservation.rooms.room_types.name})</span>
                        )}
                      </TableCell>
                      <TableCell>{new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>{new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(reservation.status)}>
                          {RESERVATION_STATUS_LABELS[reservation.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(reservation.daily_rate * nights)}</TableCell>
                      {isStaff && (
                        <TableCell className="space-x-2 text-right">
                          <ReservationDialog reservation={reservation} guests={guests ?? []} rooms={rooms ?? []} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateGuestRegistrationPdf(reservation, hotel ?? null)}
                          >
                            Ficha (PDF)
                          </Button>
                          {reservation.status === 'confirmada' && (
                            <Button
                              size="sm"
                              onClick={() => checkinReservation.mutate(reservation.id)}
                              disabled={checkinReservation.isPending}
                            >
                              Fazer check-in
                            </Button>
                          )}
                          {reservation.status === 'em_andamento' && (
                            <Button
                              size="sm"
                              onClick={() => checkoutReservation.mutate(reservation.id)}
                              disabled={checkoutReservation.isPending}
                            >
                              Fazer check-out
                            </Button>
                          )}
                          {ACTIVE_STATUSES.includes(reservation.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (window.confirm('Cancelar esta reserva?')) {
                                  cancelReservation.mutate(reservation.id)
                                }
                              }}
                            >
                              Cancelar
                            </Button>
                          )}
                          {isAdmin && (reservation.status === 'cancelada' || reservation.status === 'finalizada') && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Excluir definitivamente esta reserva? Essa ação não pode ser desfeita.'
                                  )
                                ) {
                                  deleteReservation.mutate(reservation.id)
                                }
                              }}
                            >
                              Excluir
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {!isLoading && reservations && reservations.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reserva cadastrada.</p>
          )}
          {!isLoading && reservations && reservations.length > 0 && filteredReservations.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reserva encontrada com esses filtros.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="notas-fiscais">
          <Card>
            <CardHeader>
              <CardTitle>Lembrete de nota fiscal</CardTitle>
              <CardDescription>
                Reservas finalizadas, com hóspede, valor e período, pra não esquecer de emitir a nota. Controle
                manual — não emite nem envia nada, só ajuda a lembrar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {finalizedReservations.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma reserva finalizada ainda.</p>
              )}

              {finalizedReservations.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Nota fiscal</TableHead>
                      {isStaff && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finalizedReservations.map((reservation) => {
                      const nights = nightsBetween(reservation.check_in, reservation.check_out)
                      return (
                        <TableRow key={reservation.id}>
                          <TableCell>{reservation.guests?.full_name ?? '—'}</TableCell>
                          <TableCell>
                            {new Date(`${reservation.check_in}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                            {new Date(`${reservation.check_out}T00:00:00`).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell>{formatCurrency(reservation.daily_rate * nights)}</TableCell>
                          <TableCell>
                            <Badge variant={reservation.invoice_issued ? 'default' : 'outline'}>
                              {reservation.invoice_issued ? 'Emitida' : 'Pendente'}
                            </Badge>
                          </TableCell>
                          {isStaff && (
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toggleInvoiceIssued.mutate({
                                    id: reservation.id,
                                    invoiceIssued: !reservation.invoice_issued,
                                  })
                                }
                                disabled={toggleInvoiceIssued.isPending}
                              >
                                {reservation.invoice_issued ? 'Marcar como pendente' : 'Marcar como emitida'}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
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

function ReservationDialog({
  reservation,
  guests,
  rooms,
}: {
  reservation?: ReservationWithRelations
  guests: Pick<Guest, 'id' | 'full_name'>[]
  rooms: RoomOption[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const isEdit = !!reservation

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ReservationInput>({
    resolver: zodResolver(reservationSchema),
    defaultValues: reservation
      ? {
          guest_id: reservation.guest_id,
          room_id: reservation.room_id,
          check_in: reservation.check_in,
          check_out: reservation.check_out,
          adults: reservation.adults,
          children: reservation.children,
          daily_rate: reservation.daily_rate,
          status: reservation.status,
          occupant_name: reservation.occupant_name ?? '',
          notes: reservation.notes ?? '',
        }
      : {
          guest_id: '',
          room_id: '',
          check_in: '',
          check_out: '',
          adults: 1,
          children: 0,
          daily_rate: 0,
          status: 'confirmada',
          occupant_name: '',
          notes: '',
        },
  })

  const saveReservation = useMutation({
    mutationFn: async (values: ReservationInput) => {
      const payload = {
        guest_id: values.guest_id,
        room_id: values.room_id,
        check_in: values.check_in,
        check_out: values.check_out,
        adults: values.adults,
        children: values.children,
        daily_rate: values.daily_rate,
        status: values.status,
        occupant_name: values.occupant_name || null,
        notes: values.notes || null,
      }
      const { error } = isEdit
        ? await supabase.from('reservations').update(payload).eq('id', reservation.id)
        : await supabase.from('reservations').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      toast.success(isEdit ? 'Reserva atualizada.' : 'Reserva criada.')
      reset()
      setOpen(false)
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === '23P01') {
        toast.error('Esse quarto já está reservado nesse período.')
      } else if (code === '23514') {
        toast.error('A data de saída precisa ser depois da entrada.')
      } else {
        toast.error('Não foi possível salvar a reserva.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isEdit ? 'outline' : 'default'}
          size={isEdit ? 'sm' : 'default'}
          disabled={!isEdit && (guests.length === 0 || rooms.length === 0)}
        >
          {isEdit ? 'Editar' : 'Nova reserva'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar reserva' : 'Nova reserva'}</DialogTitle>
          <DialogDescription>Vincula um hóspede a um quarto em um período.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => saveReservation.mutate(values))} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Hóspede</Label>
              <GuestDialog
                trigger={
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs">
                    + Novo hóspede
                  </Button>
                }
                onSaved={(newGuest) => {
                  queryClient.invalidateQueries({ queryKey: ['guests-select'] })
                  setValue('guest_id', newGuest.id)
                }}
              />
            </div>
            <Controller
              control={control}
              name="guest_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o hóspede" />
                  </SelectTrigger>
                  <SelectContent>
                    {guests.map((guest) => (
                      <SelectItem key={guest.id} value={guest.id}>
                        {guest.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.guest_id && <p className="text-sm text-destructive">{errors.guest_id.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Quarto</Label>
            <Controller
              control={control}
              name="room_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    const room = rooms.find((r) => r.id === value)
                    if (room?.room_types) {
                      setValue('daily_rate', room.room_types.base_price)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o quarto" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.number} {room.room_types?.name ? `(${room.room_types.name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.room_id && <p className="text-sm text-destructive">{errors.room_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="check_in">Check-in</Label>
              <Input id="check_in" type="date" {...register('check_in')} />
              {errors.check_in && <p className="text-sm text-destructive">{errors.check_in.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="check_out">Check-out</Label>
              <Input id="check_out" type="date" {...register('check_out')} />
              {errors.check_out && <p className="text-sm text-destructive">{errors.check_out.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adults">Adultos</Label>
              <Input id="adults" type="number" min={1} {...register('adults')} />
              {errors.adults && <p className="text-sm text-destructive">{errors.adults.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="children">Crianças</Label>
              <Input id="children" type="number" min={0} {...register('children')} />
              {errors.children && <p className="text-sm text-destructive">{errors.children.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily_rate">Diária (R$)</Label>
              <Input id="daily_rate" type="number" step="0.01" min={0} {...register('daily_rate')} />
              {errors.daily_rate && <p className="text-sm text-destructive">{errors.daily_rate.message}</p>}
            </div>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <p className="text-sm text-muted-foreground">
                {RESERVATION_STATUS_LABELS[reservation.status]} — use os botões "Fazer check-in", "Fazer
                check-out", "Cancelar" ou "Excluir" na lista para mudar o status.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="occupant_name">Nome de quem fica no quarto (opcional)</Label>
            <Input
              id="occupant_name"
              placeholder="Preencha só se for diferente do hóspede responsável"
              {...register('occupant_name')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input id="notes" {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saveReservation.isPending}>
              {saveReservation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Reserva vários quartos de uma vez pro mesmo hóspede responsável (ex.: empresa que reserva
 * vários quartos pros funcionários) — mesmas datas, um quarto por linha de reserva (igual ao
 * fluxo normal), mas criados todos juntos. Cada quarto pode ter um nome de ocupante diferente.
 */
function GroupReservationDialog({
  guests,
  rooms,
}: {
  guests: Pick<Guest, 'id' | 'full_name'>[]
  rooms: RoomOption[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = React.useState(false)
  // roomId -> nome do ocupante (chave presente = quarto marcado; valor pode ser vazio)
  const [selectedRooms, setSelectedRooms] = React.useState<Map<string, string>>(new Map())

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GroupReservationInput>({
    resolver: zodResolver(groupReservationSchema),
    defaultValues: { guest_id: '', check_in: '', check_out: '' },
  })

  const checkIn = watch('check_in')
  const checkOut = watch('check_out')
  const periodReady = !!checkIn && !!checkOut && new Date(checkOut) > new Date(checkIn)

  const { data: overlappingRoomIds, isLoading: loadingAvailability } = useQuery({
    queryKey: ['overlapping-rooms', checkIn, checkOut],
    queryFn: () => fetchOverlappingRoomIds(checkIn, checkOut),
    enabled: open && periodReady,
  })

  const availableRooms = React.useMemo(() => {
    if (!overlappingRoomIds) return []
    return rooms.filter((room) => !overlappingRoomIds.has(room.id))
  }, [rooms, overlappingRoomIds])

  React.useEffect(() => {
    // troca de período invalida a seleção anterior (quartos disponíveis mudam)
    setSelectedRooms(new Map())
  }, [checkIn, checkOut])

  const toggleRoom = (roomId: string, checked: boolean) => {
    setSelectedRooms((prev) => {
      const next = new Map(prev)
      if (checked) next.set(roomId, next.get(roomId) ?? '')
      else next.delete(roomId)
      return next
    })
  }

  const setOccupantName = (roomId: string, name: string) => {
    setSelectedRooms((prev) => {
      if (!prev.has(roomId)) return prev
      const next = new Map(prev)
      next.set(roomId, name)
      return next
    })
  }

  const createGroup = useMutation({
    mutationFn: async (values: GroupReservationInput) => {
      const rows = Array.from(selectedRooms.entries()).map(([roomId, occupantName]) => {
        const room = rooms.find((r) => r.id === roomId)
        return {
          guest_id: values.guest_id,
          room_id: roomId,
          check_in: values.check_in,
          check_out: values.check_out,
          adults: 1,
          children: 0,
          daily_rate: room?.room_types?.base_price ?? 0,
          status: 'confirmada' as const,
          occupant_name: occupantName.trim() || null,
        }
      })
      const { error } = await supabase.from('reservations').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      toast.success(`${count} reserva${count > 1 ? 's' : ''} criada${count > 1 ? 's' : ''}.`)
      reset()
      setSelectedRooms(new Map())
      setOpen(false)
    },
    onError: (error) => {
      const code = errorCode(error)
      if (code === '23P01') {
        toast.error(
          'Um dos quartos escolhidos acabou de ser reservado por outra pessoa. Reabra o formulário e tente de novo.'
        )
      } else {
        toast.error('Não foi possível criar as reservas do grupo.')
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={guests.length === 0 || rooms.length === 0}>
          Reserva em grupo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reserva em grupo</DialogTitle>
          <DialogDescription>
            Reserva vários quartos de uma vez pro mesmo hóspede responsável (ex.: empresa reservando pra vários
            funcionários), com as mesmas datas.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => createGroup.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Hóspede responsável</Label>
              <GuestDialog
                trigger={
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs">
                    + Novo hóspede
                  </Button>
                }
                onSaved={(newGuest) => {
                  queryClient.invalidateQueries({ queryKey: ['guests-select'] })
                  setValue('guest_id', newGuest.id)
                }}
              />
            </div>
            <Controller
              control={control}
              name="guest_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Quem será cobrado/responsável (ex.: a empresa)" />
                  </SelectTrigger>
                  <SelectContent>
                    {guests.map((guest) => (
                      <SelectItem key={guest.id} value={guest.id}>
                        {guest.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.guest_id && <p className="text-sm text-destructive">{errors.guest_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="group_check_in">Check-in</Label>
              <Input id="group_check_in" type="date" {...register('check_in')} />
              {errors.check_in && <p className="text-sm text-destructive">{errors.check_in.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="group_check_out">Check-out</Label>
              <Input id="group_check_out" type="date" {...register('check_out')} />
              {errors.check_out && <p className="text-sm text-destructive">{errors.check_out.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quartos</Label>
            {!periodReady && (
              <p className="text-sm text-muted-foreground">Informe check-in e check-out pra ver os quartos livres.</p>
            )}
            {periodReady && loadingAvailability && (
              <p className="text-sm text-muted-foreground">Verificando disponibilidade...</p>
            )}
            {periodReady && !loadingAvailability && availableRooms.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum quarto livre nesse período.</p>
            )}
            {periodReady && !loadingAvailability && availableRooms.length > 0 && (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
                {availableRooms.map((room) => {
                  const checked = selectedRooms.has(room.id)
                  return (
                    <div key={room.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input"
                        checked={checked}
                        onChange={(e) => toggleRoom(room.id, e.target.checked)}
                        id={`room-${room.id}`}
                      />
                      <label htmlFor={`room-${room.id}`} className="w-28 shrink-0 text-sm">
                        {room.number}
                        {room.room_types?.name && (
                          <span className="text-xs text-muted-foreground"> ({room.room_types.name})</span>
                        )}
                      </label>
                      <Input
                        placeholder="Nome de quem fica no quarto (opcional)"
                        className="h-8"
                        disabled={!checked}
                        value={selectedRooms.get(room.id) ?? ''}
                        onChange={(e) => setOccupantName(room.id, e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {selectedRooms.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedRooms.size} quarto{selectedRooms.size > 1 ? 's' : ''} selecionado
                {selectedRooms.size > 1 ? 's' : ''}.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createGroup.isPending || selectedRooms.size === 0}>
              {createGroup.isPending
                ? 'Salvando...'
                : `Criar ${selectedRooms.size > 0 ? selectedRooms.size : ''} reserva${selectedRooms.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
