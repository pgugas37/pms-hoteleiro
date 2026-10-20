import type { NewGuestRow, NewReservationRow } from '@/offline/outbox-types'
import type { Transport, TransportResult } from '@/offline/transport'
import type { Guest } from '@/types/guest'
import type { Payment } from '@/types/payment'
import type { Reservation } from '@/types/reservation'
import type { Room, RoomType } from '@/types/room'

export const STAMP = '2026-10-01T12:00:00.000000+00:00'

export function makeRoomType(over: Partial<RoomType> = {}): RoomType {
  return {
    id: 't1',
    name: 'Standard',
    description: null,
    capacity_adults: 2,
    capacity_children: 1,
    base_price: 150,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeRoom(over: Partial<Room> = {}): Room {
  return {
    id: 'r1',
    room_type_id: 't1',
    number: '1',
    floor: null,
    status: 'disponivel',
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeGuest(over: Partial<Guest> = {}): Guest {
  return {
    id: 'g1',
    full_name: 'Maria Souza',
    document_type: 'cpf',
    document_number: '529.982.247-25',
    email: null,
    phone: null,
    birth_date: null,
    nationality: 'Brasileira',
    notes: null,
    active: true,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'res1',
    guest_id: 'g1',
    room_id: 'r1',
    check_in: '2026-10-20',
    check_out: '2026-10-22',
    adults: 1,
    children: 0,
    daily_rate: 150,
    status: 'confirmada',
    notes: null,
    occupant_name: null,
    checked_in_at: null,
    checked_out_at: null,
    invoice_issued: false,
    invoice_issued_at: null,
    cancellation_reason: null,
    cancellation_notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    reservation_id: 'res1',
    amount: 100,
    method: 'pix',
    notes: null,
    registered_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  }
}

export function guestRow(guest: Guest): NewGuestRow {
  const row: Partial<Guest> = { ...guest }
  delete row.created_at
  delete row.updated_at
  return row as NewGuestRow
}

export function reservationRow(reservation: Reservation): NewReservationRow {
  const row: Partial<Reservation> = { ...reservation }
  delete row.created_at
  delete row.updated_at
  return row as NewReservationRow
}

export const OK: TransportResult = { ok: true }
export const NETWORK: TransportResult = { ok: false, status: 0, error: { message: 'TypeError: Failed to fetch' } }
export function pgError(status: number, code: string, message: string): TransportResult {
  return { ok: false, status, error: { code, message } }
}

export interface Call {
  method: 'insert' | 'update' | 'rpc'
  target: string
  body: Record<string, unknown>
}

export function fakeTransport(respond: (call: Call) => TransportResult, serverGuests: Guest[] = []) {
  const calls: Call[] = []
  const record = (call: Call) => {
    calls.push(call)
    return Promise.resolve(respond(call))
  }
  const transport: Transport = {
    insert: (table, row) => record({ method: 'insert', target: table, body: { ...row } as Record<string, unknown> }),
    update: (table, id, patch) =>
      record({ method: 'update', target: `${table}:${id}`, body: { ...patch } as Record<string, unknown> }),
    rpc: (fn, args) => record({ method: 'rpc', target: fn, body: args }),
    findGuestByDocument: async (type, number) =>
      serverGuests.find((g) => g.document_type === type && g.document_number === number) ?? null,
  }
  return { transport, calls }
}
