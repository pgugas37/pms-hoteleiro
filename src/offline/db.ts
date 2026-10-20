import Dexie, { type Table } from 'dexie'

import type { OutboxItem } from '@/offline/outbox-types'
import type { Profile } from '@/types/auth'
import type { Guest } from '@/types/guest'
import type { Hotel } from '@/types/hotel'
import type { MaintenanceRequest } from '@/types/maintenance'
import type { InternalNote } from '@/types/note'
import type { Payment } from '@/types/payment'
import type { Reservation } from '@/types/reservation'
import type { Room, RoomType } from '@/types/room'
import type { SeasonalRate } from '@/types/seasonalRate'

/** Tabelas do Supabase que cada aparelho guarda (o RLS decide quais linhas vêm). */
export const MIRRORED_TABLES = [
  'hotels',
  'room_types',
  'rooms',
  'guests',
  'reservations',
  'payments',
  'seasonal_rates',
  'maintenance_requests',
  'internal_notes',
  'profiles',
] as const
export type MirroredTable = (typeof MIRRORED_TABLES)[number]

/** Chave de um registro no caderninho: "reservations:<uuid>". */
export type EntityKey = `${MirroredTable}:${string}`

export function entityKey(table: MirroredTable, id: string): EntityKey {
  return `${table}:${id}`
}

export interface MetaRow {
  key: string
  value: unknown
}

export class HotelFlowDB extends Dexie {
  hotels!: Table<Hotel, string>
  room_types!: Table<RoomType, string>
  rooms!: Table<Room, string>
  guests!: Table<Guest, string>
  reservations!: Table<Reservation, string>
  payments!: Table<Payment, string>
  seasonal_rates!: Table<SeasonalRate, string>
  maintenance_requests!: Table<MaintenanceRequest, string>
  internal_notes!: Table<InternalNote, string>
  profiles!: Table<Profile, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<MetaRow, string>

  constructor() {
    super('hotelflow')
    this.version(1).stores({
      hotels: 'id',
      room_types: 'id',
      rooms: 'id',
      guests: 'id, [document_type+document_number]',
      reservations: 'id, guest_id, room_id',
      payments: 'id, reservation_id',
      seasonal_rates: 'id, room_type_id',
      maintenance_requests: 'id, room_id',
      internal_notes: 'id, guest_id, room_id',
      profiles: 'id',
      outbox: '++seq, id, status, *entityIds',
      meta: 'key',
    })
  }
}

export const db = new HotelFlowDB()

/** Nome da trava entre abas: só uma aba sincroniza por vez, e "Sair" espera a sincronização terminar. */
export const SYNC_LOCK = 'hotelflow-sync'

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Apaga a cópia inteira deste aparelho, inclusive o caderninho. */
export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}

/** Igual a wipeLocalData, mas espera uma sincronização em andamento terminar antes. */
export async function wipeLocalDataSafely(): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) await locks.request(SYNC_LOCK, () => wipeLocalData())
  else await wipeLocalData()
}

/** Garante que a cópia é desta pessoa; se for de outra (ou de ninguém), começa do zero. */
export async function ensureOwner(userId: string): Promise<void> {
  const owner = await getMeta<string>('owner')
  if (owner === userId) return
  await wipeLocalDataSafely()
  await setMeta('owner', userId)
}
