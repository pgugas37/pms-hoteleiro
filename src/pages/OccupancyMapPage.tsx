import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { compareRoomNumbers, toLocalIsoDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { ReservationStatus } from '@/types/reservation'
import type { RoomWithType } from '@/types/room'

const DAYS_IN_WINDOW = 14

interface MapReservation {
  room_id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  occupant_name: string | null
  guests: { full_name: string } | null
}

const toIsoDate = toLocalIsoDate

function addDays(isoDate: string, amount: number): string {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return toIsoDate(date)
}

async function fetchRooms(): Promise<RoomWithType[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_types(id, name)')
    .order('number', { ascending: true })
  if (error) throw error
  return ((data as unknown as RoomWithType[]) ?? []).sort((a, b) => compareRoomNumbers(a.number, b.number))
}

async function fetchWindowReservations(start: string, end: string): Promise<MapReservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('room_id, check_in, check_out, status, occupant_name, guests(full_name)')
    .neq('status', 'cancelada')
    .lt('check_in', end)
    .gt('check_out', start)
  if (error) throw error
  return (data as unknown as MapReservation[]) ?? []
}

export function OccupancyMapPage() {
  const [startDate, setStartDate] = React.useState(() => toIsoDate(new Date()))
  const endDate = React.useMemo(() => addDays(startDate, DAYS_IN_WINDOW), [startDate])
  const days = React.useMemo(
    () => Array.from({ length: DAYS_IN_WINDOW }, (_, i) => addDays(startDate, i)),
    [startDate]
  )
  const todayIso = React.useMemo(() => toIsoDate(new Date()), [])

  const { data: rooms, isLoading: loadingRooms } = useQuery({ queryKey: ['rooms-map'], queryFn: fetchRooms })
  const { data: reservations, isLoading: loadingReservations } = useQuery({
    queryKey: ['occupancy-map-reservations', startDate, endDate],
    queryFn: () => fetchWindowReservations(startDate, endDate),
  })

  const reservationsByRoom = React.useMemo(() => {
    const map = new Map<string, MapReservation[]>()
    for (const reservation of reservations ?? []) {
      const list = map.get(reservation.room_id) ?? []
      list.push(reservation)
      map.set(reservation.room_id, list)
    }
    return map
  }, [reservations])

  const isLoading = loadingRooms || loadingReservations

  return (
    <div className="page">
      <PageHeader
        title="Mapa de ocupação"
        description="Reservas confirmadas e em andamento de cada quarto, dia a dia."
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setStartDate((d) => addDays(d, -DAYS_IN_WINDOW))}
              aria-label={`Voltar ${DAYS_IN_WINDOW} dias`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setStartDate(todayIso)}>
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setStartDate((d) => addDays(d, DAYS_IN_WINDOW))}
              aria-label={`Avançar ${DAYS_IN_WINDOW} dias`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>
              {new Date(`${startDate}T00:00:00`).toLocaleDateString('pt-BR')} a{' '}
              {new Date(`${addDays(startDate, DAYS_IN_WINDOW - 1)}T00:00:00`).toLocaleDateString('pt-BR')}
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Quartos em limpeza ou manutenção não aparecem aqui, porque isso é a situação atual do quarto e não uma
              previsão por dia. Para isso, veja a tela Quartos.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] bg-status-confirmed" /> Confirmada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] bg-pine" /> Hospedado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] border border-border bg-muted/60" /> Livre
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && (rooms ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum quarto cadastrado.</p>
          )}

          {!isLoading && (rooms ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/70">
                    <th className="sticky left-0 z-10 border-b bg-muted px-3 py-2 text-left font-semibold text-muted-foreground">
                      Quarto
                    </th>
                    {days.map((day) => {
                      const date = new Date(`${day}T00:00:00`)
                      const isToday = day === todayIso
                      return (
                        <th
                          key={day}
                          className={cn(
                            'min-w-[38px] border-b px-0.5 py-1.5 text-center font-normal leading-tight',
                            isToday ? 'bg-mint/15 text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          <span className="block text-[10px]">
                            {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                          </span>
                          <span className={cn('font-display text-[13px]', isToday && 'font-semibold')}>
                            {date.toLocaleDateString('pt-BR', { day: '2-digit' })}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {(rooms ?? []).map((room) => {
                    const roomReservations = reservationsByRoom.get(room.id) ?? []
                    return (
                      <tr key={room.id} className="group">
                        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-border/60 bg-card px-3 py-1 group-hover:bg-accent">
                          <span className="font-display text-[13px] font-semibold">{room.number}</span>
                          {room.room_types?.name && (
                            <span className="ml-1.5 text-muted-foreground">{room.room_types.name}</span>
                          )}
                        </td>
                        {days.map((day) => {
                          const match = roomReservations.find((r) => r.check_in <= day && day < r.check_out)
                          const guestLabel = match
                            ? `${match.occupant_name || match.guests?.full_name || 'Hóspede'} (${
                                match.check_in
                              } a ${match.check_out})`
                            : 'Livre'
                          // Barra contínua por estadia: arredonda só no dia de chegada e na última noite.
                          const startsHere = match?.check_in === day
                          const endsHere = !!match && addDays(day, 1) === match.check_out
                          return (
                            <td
                              key={day}
                              className={cn(
                                'border-b border-border/60 px-0 py-1 text-center group-hover:bg-accent/50',
                                day === todayIso && 'bg-mint/[0.07]'
                              )}
                            >
                              <div
                                title={guestLabel}
                                className={cn(
                                  'h-6',
                                  match?.status === 'em_andamento'
                                    ? 'bg-pine'
                                    : match?.status === 'confirmada'
                                      ? 'bg-status-confirmed'
                                      : 'mx-0.5 rounded-[3px] bg-muted/60',
                                  startsHere && 'ml-0.5 rounded-l-md',
                                  endsHere && 'mr-0.5 rounded-r-md'
                                )}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
