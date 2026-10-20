import { db, entityKey, getMeta, setMeta, type EntityKey } from '@/offline/db'
import { newId } from '@/offline/ids'
import type { NewOutboxItem, OutboxItem, RejectReason } from '@/offline/outbox-types'
import type { Transport, TransportFailure, TransportResult } from '@/offline/transport'

export type Outcome =
  | { type: 'ok' }
  | { type: 'retry' }
  | { type: 'auth' }
  | { type: 'remap-guest' }
  | { type: 'reject'; reason: RejectReason; message: string }

const MESSAGES = {
  conflito_quarto: 'O quarto já foi reservado nesse período por outro aparelho.',
  sem_permissao: 'Seu usuário não tem mais permissão para isso.',
  nao_encontrado: 'O registro não existe mais (foi excluído em outro aparelho) ou seu usuário não pode mais alterá-lo.',
  duplicado: 'Já existe um registro igual no sistema.',
  documento: 'Já existe um hóspede com esse documento.',
  erro: 'O banco recusou sem explicar o motivo.',
} as const

/** Traduz a resposta de erro do Supabase no que o caderninho deve fazer. */
export function classify(failure: TransportFailure): Outcome {
  const { status, error } = failure
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (status === 0 || status >= 500) return { type: 'retry' }
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303') return { type: 'auth' }
  if (code === '23505') {
    if (text.includes('guests_document_type_document_number_key')) return { type: 'remap-guest' }
    if (text.includes('_pkey')) return { type: 'ok' }
    return { type: 'reject', reason: 'regra', message: MESSAGES.duplicado }
  }
  if (code === '23P01') return { type: 'reject', reason: 'conflito_quarto', message: MESSAGES.conflito_quarto }
  if (code === '42501' || (code === 'P0001' && /permiss/i.test(text))) {
    return { type: 'reject', reason: 'sem_permissao', message: MESSAGES.sem_permissao }
  }
  if (code === '23503' || code === 'NAO_ENCONTRADO' || (code === 'P0001' && /não encontrad/i.test(text))) {
    return { type: 'reject', reason: 'nao_encontrado', message: MESSAGES.nao_encontrado }
  }
  if (code === 'P0001') return { type: 'reject', reason: 'regra', message: error.message }
  return { type: 'reject', reason: 'erro', message: error.message || MESSAGES.erro }
}

export async function enqueue(item: NewOutboxItem): Promise<OutboxItem> {
  const full = {
    ...item,
    id: newId(),
    createdAt: new Date().toISOString(),
    status: 'pendente',
    error: null,
    attempts: 0,
  } as OutboxItem
  full.seq = await db.outbox.add(full)
  return full
}

export async function outboxCounts(): Promise<{ pending: number; rejected: number }> {
  const [pending, rejected] = await Promise.all([
    db.outbox.where('status').anyOf('pendente', 'enviando').count(),
    db.outbox.where('status').equals('recusado').count(),
  ])
  return { pending, rejected }
}

/** Situação de cada registro citado no caderninho (para as etiquetas "Aguardando envio"/"Recusada"). */
export async function outboxEntityStatus(): Promise<Map<EntityKey, 'pendente' | 'recusado'>> {
  const map = new Map<EntityKey, 'pendente' | 'recusado'>()
  for (const item of await db.outbox.toArray()) {
    for (const key of item.entityIds) {
      if (item.status === 'recusado') map.set(key, 'recusado')
      else if (!map.has(key)) map.set(key, 'pendente')
    }
  }
  return map
}

function withoutSeq(item: OutboxItem): OutboxItem {
  const copy = { ...item }
  delete copy.seq
  return copy
}

function send(transport: Transport, item: OutboxItem): Promise<TransportResult> {
  switch (item.kind) {
    case 'guest.create':
      return transport.insert('guests', item.payload.row)
    case 'reservation.create':
      return transport.insert('reservations', item.payload.row)
    case 'guest.update':
      return transport.update('guests', item.payload.id, item.payload.patch)
    case 'reservation.update':
      return transport.update('reservations', item.payload.id, item.payload.patch)
    case 'reservation.invoice':
      return transport.update('reservations', item.payload.id, {
        invoice_issued: item.payload.invoice_issued,
        invoice_issued_at: item.payload.invoice_issued_at,
      })
    case 'reservation.checkin':
      return transport.rpc('checkin_reservation', { p_reservation_id: item.payload.id, p_at: item.payload.at })
    case 'reservation.checkout':
      return transport.rpc('checkout_reservation', { p_reservation_id: item.payload.id, p_at: item.payload.at })
    case 'reservation.cancel':
      return transport.rpc('cancel_reservation', {
        p_reservation_id: item.payload.id,
        p_reason: item.payload.reason,
        p_notes: item.payload.notes,
      })
    case 'room.clean':
      return transport.rpc('mark_room_clean', { p_room_id: item.payload.id })
    case 'payment.create':
      return transport.rpc('register_payment', {
        p_reservation_id: item.payload.reservation_id,
        p_amount: item.payload.amount,
        p_method: item.payload.method,
        p_notes: item.payload.notes,
        p_id: item.payload.id,
        p_paid_at: item.payload.at,
      })
  }
}

async function nextItem(): Promise<OutboxItem | undefined> {
  const items = await db.outbox.where('status').anyOf('pendente', 'enviando').sortBy('seq')
  return items[0]
}

async function rejectedParent(item: OutboxItem): Promise<OutboxItem | undefined> {
  for (const key of item.dependsOn) {
    const parent = await db.outbox
      .where('entityIds')
      .equals(key)
      .filter((other) => other.status === 'recusado' && other.seq !== item.seq)
      .first()
    if (parent) return parent
  }
  return undefined
}

async function markRejected(item: OutboxItem, reason: RejectReason, message: string): Promise<void> {
  await db.outbox.update(item.seq!, { status: 'recusado', error: { reason, message } })
}

/** O banco já tem um hóspede com o mesmo documento: troca o id local pelo dele em tudo. */
async function remapGuest(
  item: Extract<OutboxItem, { kind: 'guest.create' }>,
  transport: Transport
): Promise<'ok' | 'nao-achou' | 'rede'> {
  const row = item.payload.row
  let found
  try {
    found = await transport.findGuestByDocument(row.document_type, row.document_number)
  } catch {
    return 'rede'
  }
  if (!found) return 'nao-achou'
  const existing = found
  const fromKey = entityKey('guests', row.id)
  const toKey = entityKey('guests', existing.id)
  await db.transaction('rw', db.guests, db.reservations, db.outbox, async () => {
    await db.guests.delete(row.id)
    await db.guests.put(existing)
    await db.reservations.where('guest_id').equals(row.id).modify({ guest_id: existing.id })
    await db.outbox.delete(item.seq!)
    await db.outbox.toCollection().modify((other) => {
      other.entityIds = other.entityIds.map((key) => (key === fromKey ? toKey : key))
      other.dependsOn = other.dependsOn.map((key) => (key === fromKey ? toKey : key))
      if (other.kind === 'reservation.create' && other.payload.row.guest_id === row.id) {
        other.payload.row.guest_id = existing.id
      }
      if (other.kind === 'reservation.update' && other.payload.patch.guest_id === row.id) {
        other.payload.patch.guest_id = existing.id
      }
      if (other.kind === 'guest.update' && other.payload.id === row.id) other.payload.id = existing.id
    })
  })
  return 'ok'
}

export interface ProcessResult {
  sent: number
  rejected: number
  stoppedBy: 'rede' | 'login' | null
}

/** Envia o caderninho, um item por vez, na ordem. Para na falta de rede ou de login. */
export async function processOutbox(transport: Transport): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, rejected: 0, stoppedBy: null }
  for (let item = await nextItem(); item; item = await nextItem()) {
    const parent = await rejectedParent(item)
    if (parent) {
      await markRejected(item, 'dependencia', `Depende de "${parent.description}", que foi recusada.`)
      result.rejected++
      continue
    }

    await db.outbox.update(item.seq!, { status: 'enviando', attempts: item.attempts + 1 })
    let response: TransportResult
    try {
      response = await send(transport, item)
    } catch (error) {
      response = { ok: false, status: 0, error: { message: String(error) } }
    }
    const outcome: Outcome = response.ok ? { type: 'ok' } : classify(response)

    if (outcome.type === 'ok') {
      await db.outbox.delete(item.seq!)
      result.sent++
      continue
    }
    if (outcome.type === 'retry' || outcome.type === 'auth') {
      await db.outbox.update(item.seq!, { status: 'pendente' })
      result.stoppedBy = outcome.type === 'retry' ? 'rede' : 'login'
      return result
    }
    if (outcome.type === 'remap-guest') {
      if (item.kind === 'guest.create') {
        const remapped = await remapGuest(item, transport)
        if (remapped === 'rede') {
          await db.outbox.update(item.seq!, { status: 'pendente' })
          result.stoppedBy = 'rede'
          return result
        }
        if (remapped === 'ok') {
          result.sent++
          continue
        }
      }
      await markRejected(item, 'regra', MESSAGES.documento)
      result.rejected++
      continue
    }
    await markRejected(item, outcome.reason, outcome.message)
    result.rejected++
  }
  return result
}

/**
 * Tira do caderninho um item recusado. Se era uma criação, apaga o registro local e, em cascata,
 * as ações que dependiam dele. Nos outros casos, marca os registros para buscar de novo no servidor.
 * Devolve as chaves marcadas.
 */
export async function discardItem(seq: number): Promise<EntityKey[]> {
  const toRefetch: EntityKey[] = []
  await db.transaction('rw', [db.outbox, db.guests, db.reservations, db.payments, db.meta], async () => {
    const queue = [seq]
    while (queue.length > 0) {
      const current = await db.outbox.get(queue.shift()!)
      if (!current) continue
      await db.outbox.delete(current.seq!)
      if (current.kind === 'guest.create') await db.guests.delete(current.payload.row.id)
      else if (current.kind === 'reservation.create') await db.reservations.delete(current.payload.row.id)
      else if (current.kind === 'payment.create') await db.payments.delete(current.payload.id)
      else toRefetch.push(...current.entityIds)

      if (current.kind === 'guest.create' || current.kind === 'reservation.create' || current.kind === 'payment.create') {
        const dependents = await db.outbox
          .filter((other) => other.dependsOn.some((key) => current.entityIds.includes(key)))
          .toArray()
        queue.push(...dependents.map((dependent) => dependent.seq!))
      }
    }
    const previous = (await getMeta<EntityKey[]>('refetch')) ?? []
    await setMeta('refetch', Array.from(new Set([...previous, ...toRefetch])))
  })
  return toRefetch
}

/** Recoloca no fim da fila um item recusado já corrigido e, logo depois dele, os que estavam travados por ele. */
export async function requeue(seq: number, fix: (item: OutboxItem) => OutboxItem): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    const item = await db.outbox.get(seq)
    if (!item) return
    await db.outbox.delete(seq)
    await db.outbox.add({ ...withoutSeq(fix(item)), status: 'pendente', error: null, attempts: 0 } as OutboxItem)
    const blocked = await db.outbox
      .where('status')
      .equals('recusado')
      .filter(
        (other) => other.error?.reason === 'dependencia' && other.dependsOn.some((key) => item.entityIds.includes(key))
      )
      .sortBy('seq')
    for (const dependent of blocked) {
      await db.outbox.delete(dependent.seq!)
      await db.outbox.add({ ...withoutSeq(dependent), status: 'pendente', error: null, attempts: 0 } as OutboxItem)
    }
  })
}
