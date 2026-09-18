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
import { useAuth } from '@/lib/auth-context'
import { formatCurrency } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { reservationSchema, type ReservationInput } from '@/lib/validations'
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
    .select('*, guests(id, full_name), rooms(id, number, room_types(id, name))')
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

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: string }).code
  }
  return undefined
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

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: fetchReservations,
  })
  const { data: guests } = useQuery({ queryKey: ['guests-select'], queryFn: fetchGuestsForSelect })
  const { data: rooms } = useQuery({ queryKey: ['rooms-select'], queryFn: fetchRoomsForSelect })

  const cancelReservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservations').update({ status: 'cancelada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] })
      toast.success('Reserva cancelada.')
    },
    onError: () => toast.error('Não foi possível cancelar a reserva.'),
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <p className="text-sm text-muted-foreground">Reservas de hóspedes em quartos.</p>
      </div>

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
          {isStaff && <ReservationDialog guests={guests ?? []} rooms={rooms ?? []} />}
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

          {reservations && reservations.length > 0 && (
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
                {reservations.map((reservation) => {
                  const nights = nightsBetween(reservation.check_in, reservation.check_out)
                  return (
                    <TableRow key={reservation.id}>
                      <TableCell>{reservation.guests?.full_name ?? '—'}</TableCell>
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
                          {isAdmin && reservation.status === 'cancelada' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Excluir definitivamente esta reserva cancelada? Essa ação não pode ser desfeita.'
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
        </CardContent>
      </Card>
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

          <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESERVATION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {RESERVATION_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
