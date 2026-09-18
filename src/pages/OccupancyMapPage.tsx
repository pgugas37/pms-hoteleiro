import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
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

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

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
  return (data as unknown as RoomWithType[]) ?? []
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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mapa de ocupação</h1>
        <p className="text-sm text-muted-foreground">Visão dos quartos ao longo dos próximos dias.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <div>
            <CardTitle>
              {new Date(`${startDate}T00:00:00`).toLocaleDateString('pt-BR')} a{' '}
              {new Date(`${addDays(startDate, DAYS_IN_WINDOW - 1)}T00:00:00`).toLocaleDateString('pt-BR')}
            </CardTitle>
            <CardDescription>
              Considera reservas confirmadas e em andamento. Não reflete quartos em limpeza ou manutenção (isso é o
              status atual do quarto, não uma previsão por dia — veja a tela Quartos).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStartDate((d) => addDays(d, -DAYS_IN_WINDOW))}>
              ← {DAYS_IN_WINDOW} dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStartDate(todayIso)}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStartDate((d) => addDays(d, DAYS_IN_WINDOW))}>
              {DAYS_IN_WINDOW} dias →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> Confirmada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-destructive" /> Em andamento (ocupado)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-input" /> Livre
            </span>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && (rooms ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum quarto cadastrado.</p>
          )}

          {!isLoading && (rooms ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border-b bg-background px-2 py-1 text-left font-medium">
                      Quarto
                    </th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className={`min-w-[34px] border-b px-1 py-1 text-center font-normal ${
                          day === todayIso ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {new Date(`${day}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rooms ?? []).map((room) => {
                    const roomReservations = reservationsByRoom.get(room.id) ?? []
                    return (
                      <tr key={room.id}>
                        <td className="sticky left-0 z-10 whitespace-nowrap border-b bg-background px-2 py-1 font-medium">
                          {room.number}
                          {room.room_types?.name && (
                            <span className="text-muted-foreground"> ({room.room_types.name})</span>
                          )}
                        </td>
                        {days.map((day) => {
                          const match = roomReservations.find((r) => r.check_in <= day && day < r.check_out)
                          const guestLabel = match
                            ? `${match.occupant_name || match.guests?.full_name || 'Hóspede'} (${
                                match.check_in
                              } a ${match.check_out})`
                            : 'Livre'
                          return (
                            <td key={day} className="border-b px-0.5 py-1 text-center">
                              <div
                                title={guestLabel}
                                className={`mx-auto h-5 w-full rounded-sm ${
                                  match?.status === 'em_andamento'
                                    ? 'bg-destructive'
                                    : match?.status === 'confirmada'
                                      ? 'bg-primary'
                                      : 'border border-input'
                                }`}
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
