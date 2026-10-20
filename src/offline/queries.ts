import { compareRoomNumbers } from '@/lib/format'
import { db } from '@/offline/db'
import type { Profile } from '@/types/auth'
import type { DocumentType, Guest } from '@/types/guest'
import type { Hotel } from '@/types/hotel'
import type { MaintenanceRequestWithRoom } from '@/types/maintenance'
import type { InternalNote } from '@/types/note'
import type { PaymentWithReservation } from '@/types/payment'
import type { ReservationStatus, ReservationWithRelations } from '@/types/reservation'
import type { Room, RoomStatus, RoomType } from '@/types/room'
import type { SeasonalRateWithType } from '@/types/seasonalRate'

/* Leituras da cópia local, no mesmo formato que as telas recebiam do Supabase. */

export interface RoomOption extends Room {
  room_types: { id: string; name: string; base_price: number } | null
}

async function lookups() {
  const [guests, rooms, roomTypes] = await Promise.all([db.guests.toArray(), db.rooms.toArray(), db.room_types.toArray()])
  return {
    guestById: new Map(guests.map((g) => [g.id, g])),
    roomById: new Map(rooms.map((r) => [r.id, r])),
    typeById: new Map(roomTypes.map((t) => [t.id, t])),
  }
}

export async function listReservationsWithRelations(): Promise<ReservationWithRelations[]> {
  const [reservations, { guestById, roomById, typeById }] = await Promise.all([db.reservations.toArray(), lookups()])
  return reservations
    .map((r) => {
      const guest = guestById.get(r.guest_id)
      const room = roomById.get(r.room_id)
      const type = room ? typeById.get(room.room_type_id) : undefined
      return {
        ...r,
        guests: guest
          ? {
              id: guest.id,
              full_name: guest.full_name,
              document_type: guest.document_type,
              document_number: guest.document_number,
              nationality: guest.nationality,
              birth_date: guest.birth_date,
            }
          : null,
        rooms: room ? { id: room.id, number: room.number, room_types: type ? { id: type.id, name: type.name } : null } : null,
      }
    })
    .sort((a, b) => b.check_in.localeCompare(a.check_in))
}

export async function listGuests(): Promise<Guest[]> {
  return (await db.guests.toArray()).sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
}

export async function listActiveGuestsForSelect(): Promise<Pick<Guest, 'id' | 'full_name'>[]> {
  return (await listGuests()).filter((g) => g.active).map(({ id, full_name }) => ({ id, full_name }))
}

export async function listRoomsWithType(): Promise<RoomOption[]> {
  const [rooms, types] = await Promise.all([db.rooms.toArray(), db.room_types.toArray()])
  const typeById = new Map(types.map((t) => [t.id, t]))
  return rooms
    .map((room) => {
      const type = typeById.get(room.room_type_id)
      return { ...room, room_types: type ? { id: type.id, name: type.name, base_price: Number(type.base_price) } : null }
    })
    .sort((a, b) => compareRoomNumbers(a.number, b.number))
}

export async function countRooms(): Promise<number> {
  return db.rooms.count()
}

export async function listRoomTypes(): Promise<RoomType[]> {
  return (await db.room_types.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function listSeasonalRatesWithType(): Promise<SeasonalRateWithType[]> {
  const [rates, types] = await Promise.all([db.seasonal_rates.toArray(), db.room_types.toArray()])
  const typeById = new Map(types.map((t) => [t.id, t]))
  return rates
    .map((rate) => {
      const type = typeById.get(rate.room_type_id)
      return { ...rate, room_types: type ? { id: type.id, name: type.name } : null }
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}

export async function seasonalRateFor(roomTypeId: string, date: string): Promise<number | null> {
  const rate = await db.seasonal_rates
    .where('room_type_id')
    .equals(roomTypeId)
    .filter((s) => s.start_date <= date && s.end_date >= date)
    .first()
  return rate ? Number(rate.daily_rate) : null
}

export async function seasonalRatesForDate(roomTypeIds: string[], date: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const id of roomTypeIds) {
    const rate = await seasonalRateFor(id, date)
    if (rate !== null) map.set(id, rate)
  }
  return map
}

/** Quartos com reserva ativa (não cancelada) que cruza [checkIn, checkOut). */
export async function overlappingRoomIds(
  checkIn: string,
  checkOut: string,
  ignoreReservationId?: string
): Promise<Set<string>> {
  const reservations = await db.reservations
    .filter((r) => r.id !== ignoreReservationId && r.status !== 'cancelada' && r.check_in < checkOut && r.check_out > checkIn)
    .toArray()
  return new Set(reservations.map((r) => r.room_id))
}

export async function listPaymentsWithReservation(): Promise<PaymentWithReservation[]> {
  const [payments, reservations, { guestById, roomById }] = await Promise.all([
    db.payments.toArray(),
    db.reservations.toArray(),
    lookups(),
  ])
  const reservationById = new Map(reservations.map((r) => [r.id, r]))
  return payments
    .map((payment) => {
      const r = reservationById.get(payment.reservation_id)
      const guest = r ? guestById.get(r.guest_id) : undefined
      const room = r ? roomById.get(r.room_id) : undefined
      return {
        ...payment,
        reservations: r
          ? {
              id: r.id,
              check_in: r.check_in,
              check_out: r.check_out,
              guests: guest ? { id: guest.id, full_name: guest.full_name } : null,
              rooms: room ? { id: room.id, number: room.number } : null,
            }
          : null,
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getHotel(): Promise<Hotel | null> {
  return (await db.hotels.toCollection().first()) ?? null
}

export async function listMaintenanceWithRoom(): Promise<MaintenanceRequestWithRoom[]> {
  const [requests, rooms] = await Promise.all([db.maintenance_requests.toArray(), db.rooms.toArray()])
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  return requests
    .map((request) => {
      const room = roomById.get(request.room_id)
      return { ...request, rooms: room ? { id: room.id, number: room.number } : null }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function listNotes(subjectType: 'guest' | 'room', subjectId: string): Promise<InternalNote[]> {
  const column = subjectType === 'guest' ? 'guest_id' : 'room_id'
  return (await db.internal_notes.where(column).equals(subjectId).toArray()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )
}

export async function listProfiles(): Promise<Profile[]> {
  return db.profiles.toArray()
}

/* ---------- Busca global ---------- */

export interface GuestResult {
  id: string
  full_name: string
  document_type: DocumentType
  document_number: string
}

export interface RoomResult {
  id: string
  number: string
  status: RoomStatus
  room_types: { name: string } | null
}

export interface ReservationResult {
  id: string
  check_in: string
  check_out: string
  status: ReservationStatus
  guests: { full_name: string } | null
  rooms: { number: string } | null
}

export interface GlobalSearchResults {
  guests: GuestResult[]
  rooms: RoomResult[]
  reservations: ReservationResult[]
}

export async function searchEverything(term: string): Promise<GlobalSearchResults> {
  const t = term.trim().toLowerCase()
  if (!t) return { guests: [], rooms: [], reservations: [] }
  const [guests, rooms, reservations] = await Promise.all([listGuests(), listRoomsWithType(), listReservationsWithRelations()])
  const nameMatches = guests.filter((g) => g.full_name.toLowerCase().includes(t))
  const roomMatches = rooms.filter((r) => r.number.toLowerCase().includes(t))
  const guestIds = new Set(nameMatches.map((g) => g.id))
  const roomIds = new Set(roomMatches.map((r) => r.id))
  return {
    guests: guests
      .filter((g) => g.full_name.toLowerCase().includes(t) || g.document_number.toLowerCase().includes(t))
      .slice(0, 6)
      .map(({ id, full_name, document_type, document_number }) => ({ id, full_name, document_type, document_number })),
    rooms: roomMatches.slice(0, 6).map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      room_types: r.room_types ? { name: r.room_types.name } : null,
    })),
    reservations: reservations
      .filter((r) => guestIds.has(r.guest_id) || roomIds.has(r.room_id))
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        check_in: r.check_in,
        check_out: r.check_out,
        status: r.status,
        guests: r.guests ? { full_name: r.guests.full_name } : null,
        rooms: r.rooms ? { number: r.rooms.number } : null,
      })),
  }
}
