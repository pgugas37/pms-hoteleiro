import { formatCurrency, toLocalIsoDate } from '@/lib/format'
import { db, entityKey, type EntityKey } from '@/offline/db'
import { emitLocalChange } from '@/offline/events'
import { newId } from '@/offline/ids'
import { enqueue, requeue } from '@/offline/outbox'
import type { GuestPatch, NewGuestRow, NewReservationRow, OutboxItem, ReservationPatch } from '@/offline/outbox-types'
import type { Role } from '@/types/auth'
import type { DocumentType, Guest } from '@/types/guest'
import type { Payment, PaymentMethod } from '@/types/payment'
import type { CancellationReason, Reservation } from '@/types/reservation'

/*
 * Ações que funcionam sem internet: conferem as mesmas regras do banco na cópia local,
 * mudam a cópia na hora e anotam no caderninho. O banco continua sendo o juiz final.
 * Os textos de "description" e as leituras para montá-los ficam sempre antes da transação,
 * que só inclui as tabelas que a ação grava.
 */

/** Regra conferida no aparelho. A mensagem vai direto para a tela. */
export class ActionError extends Error {}

export interface Actor {
  id: string
  role: Role
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new ActionError('Seu login não está carregado. Entre de novo.')
  return actor
}

export function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ActionError ? error.message : fallback
}

const STAFF: Role[] = ['admin', 'gerente', 'recepcao']
const CLEANING: Role[] = ['admin', 'gerente', 'governanca']
const PAYMENT: Role[] = ['admin', 'gerente', 'recepcao', 'financeiro']

function requireRole(actor: Actor, roles: Role[], what: string): void {
  if (!roles.includes(actor.role)) throw new ActionError(`Seu cargo não permite ${what}.`)
}

const nowIso = () => new Date().toISOString()
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')

function diff<T extends object>(current: T, next: Partial<T>): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (next[key] !== current[key]) patch[key] = next[key]
  }
  return patch
}

async function reservationLabel(
  r: Pick<Reservation, 'guest_id' | 'room_id' | 'check_in' | 'check_out' | 'occupant_name'>
): Promise<string> {
  const [guest, room] = await Promise.all([db.guests.get(r.guest_id), db.rooms.get(r.room_id)])
  const who = r.occupant_name || guest?.full_name || 'hóspede'
  return `${who}, quarto ${room?.number ?? '?'}, ${shortDate(r.check_in)} a ${shortDate(r.check_out)}`
}

async function assertRoomFree(roomId: string, checkIn: string, checkOut: string, ignoreId?: string): Promise<void> {
  const clash = await db.reservations
    .where('room_id')
    .equals(roomId)
    .filter((r) => r.id !== ignoreId && r.status !== 'cancelada' && r.check_in < checkOut && r.check_out > checkIn)
    .first()
  if (clash) throw new ActionError('Esse quarto já está reservado nesse período.')
}

async function getReservation(id: string): Promise<Reservation> {
  const reservation = await db.reservations.get(id)
  if (!reservation) throw new ActionError('Reserva não encontrada neste aparelho.')
  return reservation
}

/** Criação ainda não enviada (pendente ou recusada) de um registro, para juntar edições nela. */
async function unsentCreate(key: EntityKey): Promise<OutboxItem | undefined> {
  return db.outbox
    .where('entityIds')
    .equals(key)
    .filter((o) => (o.kind === 'reservation.create' || o.kind === 'guest.create') && o.status !== 'enviando')
    .first()
}

/** Troca os dados de uma criação ainda não enviada; se ela estava recusada, volta para a fila. */
async function rewriteCreate(item: OutboxItem, fix: (item: OutboxItem) => OutboxItem): Promise<void> {
  if (item.status === 'recusado') await requeue(item.seq!, fix)
  else await db.outbox.put(fix(item))
}

/* ---------- Hóspedes ---------- */

export interface GuestFields {
  full_name: string
  document_type: DocumentType
  document_number: string
  email: string | null
  phone: string | null
  birth_date: string | null
  nationality: string
  notes: string | null
}

async function assertDocumentFree(type: DocumentType, number: string, ignoreId?: string): Promise<void> {
  const same = await db.guests
    .where('[document_type+document_number]')
    .equals([type, number])
    .filter((g) => g.id !== ignoreId)
    .first()
  if (same) throw new ActionError('Já existe um hóspede com esse documento.')
}

export async function createGuest(actor: Actor, fields: GuestFields): Promise<Guest> {
  requireRole(actor, STAFF, 'cadastrar hóspedes')
  await assertDocumentFree(fields.document_type, fields.document_number)
  const now = nowIso()
  const row: NewGuestRow = { id: newId(), ...fields, active: true }
  const guest: Guest = { ...row, created_at: now, updated_at: now }
  await db.transaction('rw', db.guests, db.outbox, async () => {
    await db.guests.add(guest)
    await enqueue({
      kind: 'guest.create',
      payload: { row },
      entityIds: [entityKey('guests', row.id)],
      dependsOn: [],
      description: `Novo hóspede: ${row.full_name}`,
      userId: actor.id,
    })
  })
  emitLocalChange()
  return guest
}

export async function updateGuest(actor: Actor, id: string, fields: GuestFields): Promise<Guest> {
  requireRole(actor, STAFF, 'editar hóspedes')
  const current = await db.guests.get(id)
  if (!current) throw new ActionError('Hóspede não encontrado neste aparelho.')
  await assertDocumentFree(fields.document_type, fields.document_number, id)
  const patch = diff(current, fields) as GuestPatch
  if (Object.keys(patch).length === 0) return current
  const updated: Guest = { ...current, ...patch, updated_at: nowIso() }
  const key = entityKey('guests', id)
  await db.transaction('rw', db.guests, db.outbox, async () => {
    await db.guests.put(updated)
    const create = await unsentCreate(key)
    if (create?.kind === 'guest.create') {
      await rewriteCreate(create, (item) =>
        item.kind === 'guest.create'
          ? { ...item, description: `Novo hóspede: ${updated.full_name}`, payload: { row: { ...item.payload.row, ...patch } } }
          : item
      )
    } else {
      await enqueue({
        kind: 'guest.update',
        payload: { id, patch },
        entityIds: [key],
        dependsOn: [key],
        description: `Edição do hóspede ${updated.full_name}`,
        userId: actor.id,
      })
    }
  })
  emitLocalChange()
  return updated
}

/* ---------- Reservas ---------- */

export interface ReservationFields {
  guest_id: string
  room_id: string
  check_in: string
  check_out: string
  adults: number
  children: number
  daily_rate: number
  occupant_name: string | null
  notes: string | null
}

function assertDates(fields: Pick<ReservationFields, 'check_in' | 'check_out'>): void {
  if (!(fields.check_out > fields.check_in)) throw new ActionError('A data de saída precisa ser depois da entrada.')
}

async function assertGuestAndRoom(guestId: string, roomId: string): Promise<void> {
  const [guest, room] = await Promise.all([db.guests.get(guestId), db.rooms.get(roomId)])
  if (!guest || !guest.active) throw new ActionError('Hóspede não encontrado ou inativo.')
  if (!room) throw new ActionError('Quarto não encontrado.')
}

function newReservationRow(fields: ReservationFields): NewReservationRow {
  return {
    id: newId(),
    ...fields,
    status: 'confirmada',
    checked_in_at: null,
    checked_out_at: null,
    invoice_issued: false,
    invoice_issued_at: null,
    cancellation_reason: null,
    cancellation_notes: null,
  }
}

async function addReservation(actor: Actor, row: NewReservationRow): Promise<Reservation> {
  const now = nowIso()
  const reservation: Reservation = { ...row, created_at: now, updated_at: now }
  const description = `Nova reserva: ${await reservationLabel(row)}`
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    // confere de novo dentro da transação (outra aba pode ter reservado o quarto)
    await assertRoomFree(row.room_id, row.check_in, row.check_out)
    await db.reservations.add(reservation)
    await enqueue({
      kind: 'reservation.create',
      payload: { row },
      entityIds: [entityKey('reservations', row.id)],
      dependsOn: [entityKey('guests', row.guest_id)],
      description,
      userId: actor.id,
    })
  })
  return reservation
}

export async function createReservation(actor: Actor, fields: ReservationFields): Promise<Reservation> {
  requireRole(actor, STAFF, 'criar reservas')
  assertDates(fields)
  await assertGuestAndRoom(fields.guest_id, fields.room_id)
  await assertRoomFree(fields.room_id, fields.check_in, fields.check_out)
  const reservation = await addReservation(actor, newReservationRow(fields))
  emitLocalChange()
  return reservation
}

export async function createGroupReservations(
  actor: Actor,
  group: {
    guest_id: string
    check_in: string
    check_out: string
    rooms: { room_id: string; occupant_name: string | null; daily_rate: number }[]
  }
): Promise<number> {
  requireRole(actor, STAFF, 'criar reservas')
  assertDates(group)
  for (const room of group.rooms) {
    await assertGuestAndRoom(group.guest_id, room.room_id)
    await assertRoomFree(room.room_id, group.check_in, group.check_out)
  }
  for (const room of group.rooms) {
    await addReservation(
      actor,
      newReservationRow({
        guest_id: group.guest_id,
        room_id: room.room_id,
        check_in: group.check_in,
        check_out: group.check_out,
        adults: 1,
        children: 0,
        daily_rate: room.daily_rate,
        occupant_name: room.occupant_name,
        notes: null,
      })
    )
  }
  emitLocalChange()
  return group.rooms.length
}

export async function updateReservation(actor: Actor, id: string, fields: ReservationFields): Promise<Reservation> {
  requireRole(actor, STAFF, 'editar reservas')
  assertDates(fields)
  const current = await getReservation(id)
  await assertGuestAndRoom(fields.guest_id, fields.room_id)
  if (fields.room_id !== current.room_id || fields.check_in !== current.check_in || fields.check_out !== current.check_out) {
    await assertRoomFree(fields.room_id, fields.check_in, fields.check_out, id)
  }
  const patch = diff(current, fields) as ReservationPatch
  if (Object.keys(patch).length === 0) return current
  const updated: Reservation = { ...current, ...patch, updated_at: nowIso() }
  const key = entityKey('reservations', id)
  const label = await reservationLabel(updated)
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    await db.reservations.put(updated)
    const create = await unsentCreate(key)
    if (create?.kind === 'reservation.create') {
      await rewriteCreate(create, (item) =>
        item.kind === 'reservation.create'
          ? { ...item, description: `Nova reserva: ${label}`, payload: { row: { ...item.payload.row, ...patch } } }
          : item
      )
    } else {
      await enqueue({
        kind: 'reservation.update',
        payload: { id, patch },
        entityIds: [key],
        dependsOn: [key],
        description: `Edição da reserva: ${label}`,
        userId: actor.id,
      })
    }
  })
  emitLocalChange()
  return updated
}

export async function setInvoiceIssued(actor: Actor, id: string, issued: boolean): Promise<void> {
  requireRole(actor, STAFF, 'marcar nota fiscal')
  const current = await getReservation(id)
  const at = issued ? nowIso() : null
  const key = entityKey('reservations', id)
  const description = `Nota fiscal ${issued ? 'emitida' : 'pendente'}: ${await reservationLabel(current)}`
  await db.transaction('rw', db.reservations, db.outbox, async () => {
    await db.reservations.put({ ...current, invoice_issued: issued, invoice_issued_at: at })
    await enqueue({
      kind: 'reservation.invoice',
      payload: { id, invoice_issued: issued, invoice_issued_at: at },
      entityIds: [key],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function checkinReservation(actor: Actor, id: string): Promise<void> {
  requireRole(actor, STAFF, 'fazer check-in')
  const reservation = await getReservation(id)
  if (reservation.status !== 'confirmada') throw new ActionError('Só é possível fazer check-in de uma reserva confirmada.')
  if (reservation.check_in > toLocalIsoDate(new Date())) {
    throw new ActionError('Check-in só pode ser feito a partir da data marcada.')
  }
  const at = nowIso()
  const key = entityKey('reservations', id)
  const description = `Check-in: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({ ...reservation, status: 'em_andamento', checked_in_at: at })
    await db.rooms.update(reservation.room_id, { status: 'ocupado' })
    await enqueue({
      kind: 'reservation.checkin',
      payload: { id, at },
      entityIds: [key, entityKey('rooms', reservation.room_id)],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function checkoutReservation(actor: Actor, id: string): Promise<void> {
  requireRole(actor, STAFF, 'fazer check-out')
  const reservation = await getReservation(id)
  if (reservation.status !== 'em_andamento') {
    throw new ActionError('Só é possível fazer check-out de uma reserva em andamento.')
  }
  const at = nowIso()
  const key = entityKey('reservations', id)
  const description = `Check-out: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({ ...reservation, status: 'finalizada', checked_out_at: at })
    await db.rooms.update(reservation.room_id, { status: 'limpeza' })
    await enqueue({
      kind: 'reservation.checkout',
      payload: { id, at },
      entityIds: [key, entityKey('rooms', reservation.room_id)],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

export async function cancelReservation(
  actor: Actor,
  id: string,
  reason: CancellationReason,
  notes: string
): Promise<void> {
  requireRole(actor, STAFF, 'cancelar reservas')
  const reservation = await getReservation(id)
  if (reservation.status !== 'confirmada' && reservation.status !== 'em_andamento') {
    throw new ActionError('Só é possível cancelar reservas confirmadas ou em andamento.')
  }
  const wasHosted = reservation.status === 'em_andamento'
  const cleanNotes = notes.trim() || null
  const key = entityKey('reservations', id)
  const description = `Cancelamento: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.reservations, db.rooms, db.outbox, async () => {
    await db.reservations.put({
      ...reservation,
      status: 'cancelada',
      cancellation_reason: reason,
      cancellation_notes: cleanNotes,
    })
    if (wasHosted) await db.rooms.update(reservation.room_id, { status: 'limpeza' })
    await enqueue({
      kind: 'reservation.cancel',
      payload: { id, reason, notes: cleanNotes },
      entityIds: wasHosted ? [key, entityKey('rooms', reservation.room_id)] : [key],
      dependsOn: [key],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

/* ---------- Governança ---------- */

export async function markRoomClean(actor: Actor, roomId: string): Promise<void> {
  requireRole(actor, CLEANING, 'marcar quarto como limpo')
  const room = await db.rooms.get(roomId)
  if (!room) throw new ActionError('Quarto não encontrado.')
  if (room.status !== 'limpeza') throw new ActionError('Esse quarto não está aguardando limpeza.')
  await db.transaction('rw', db.rooms, db.outbox, async () => {
    await db.rooms.put({ ...room, status: 'disponivel' })
    await enqueue({
      kind: 'room.clean',
      payload: { id: roomId },
      entityIds: [entityKey('rooms', roomId)],
      dependsOn: [],
      description: `Quarto ${room.number} marcado como limpo`,
      userId: actor.id,
    })
  })
  emitLocalChange()
}

/* ---------- Financeiro ---------- */

export async function registerPayment(
  actor: Actor,
  input: { reservation_id: string; amount: number; method: PaymentMethod; notes: string }
): Promise<Payment> {
  requireRole(actor, PAYMENT, 'registrar pagamentos')
  const reservation = await getReservation(input.reservation_id)
  if (!(input.amount > 0)) throw new ActionError('O valor precisa ser maior que zero.')
  const id = newId()
  const at = nowIso()
  const notes = input.notes.trim() || null
  const payment: Payment = {
    id,
    reservation_id: input.reservation_id,
    amount: input.amount,
    method: input.method,
    notes,
    registered_by: actor.id,
    created_at: at,
    updated_at: at,
  }
  const description = `Pagamento de ${formatCurrency(input.amount)}: ${await reservationLabel(reservation)}`
  await db.transaction('rw', db.payments, db.outbox, async () => {
    await db.payments.add(payment)
    await enqueue({
      kind: 'payment.create',
      payload: { id, reservation_id: input.reservation_id, amount: input.amount, method: input.method, notes, at },
      entityIds: [entityKey('payments', id)],
      dependsOn: [entityKey('reservations', input.reservation_id)],
      description,
      userId: actor.id,
    })
  })
  emitLocalChange()
  return payment
}

/* ---------- Pendências ---------- */

export async function resolveReservationConflict(
  actor: Actor,
  seq: number,
  change: Pick<ReservationFields, 'room_id' | 'check_in' | 'check_out' | 'daily_rate'>
): Promise<void> {
  const item = await db.outbox.get(seq)
  if (!item || item.kind !== 'reservation.create') throw new ActionError('Pendência não encontrada.')
  const current = await getReservation(item.payload.row.id)
  const next: ReservationFields = {
    guest_id: current.guest_id,
    room_id: change.room_id,
    check_in: change.check_in,
    check_out: change.check_out,
    adults: current.adults,
    children: current.children,
    daily_rate: change.daily_rate,
    occupant_name: current.occupant_name,
    notes: current.notes,
  }
  if (Object.keys(diff(current, next)).length === 0) throw new ActionError('Escolha outro quarto ou outras datas.')
  await updateReservation(actor, current.id, next)
}
