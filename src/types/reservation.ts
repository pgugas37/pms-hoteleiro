export const RESERVATION_STATUSES = ['confirmada', 'em_andamento', 'finalizada', 'cancelada'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmada: 'Confirmada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
}

export interface Reservation {
  id: string
  guest_id: string
  room_id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  daily_rate: number
  status: ReservationStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ReservationWithRelations extends Reservation {
  guests: { id: string; full_name: string } | null
  rooms: { id: string; number: string; room_types: { id: string; name: string } | null } | null
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00`)
  const end = new Date(`${checkOut}T00:00:00`)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
}
