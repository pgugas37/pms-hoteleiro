import { beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, wipeLocalData, type EntityKey } from '@/offline/db'
import { classify, discardItem, enqueue, outboxCounts, processOutbox, requeue } from '@/offline/outbox'
import type { TransportFailure, TransportResult } from '@/offline/transport'

import {
  NETWORK,
  OK,
  fakeTransport,
  guestRow,
  makeGuest,
  makePayment,
  makeReservation,
  pgError,
  reservationRow,
} from './fakes'

const base = { entityIds: [] as EntityKey[], dependsOn: [] as EntityKey[], description: 'teste', userId: 'u1' }

function failure(result: TransportResult): TransportFailure {
  if (result.ok) throw new Error('esperava falha')
  return result
}

beforeEach(async () => {
  await wipeLocalData()
})

describe('classify', () => {
  it('rede e erro 5xx: tentar de novo', () => {
    expect(classify(failure(NETWORK))).toEqual({ type: 'retry' })
    expect(classify(failure(pgError(503, '', 'Service Unavailable')))).toEqual({ type: 'retry' })
  })
  it('login vencido', () => {
    expect(classify(failure(pgError(401, 'PGRST301', 'JWT expired')))).toEqual({ type: 'auth' })
  })
  it('etiqueta repetida conta como já enviada', () => {
    const result = pgError(409, '23505', 'duplicate key value violates unique constraint "reservations_pkey"')
    expect(classify(failure(result))).toEqual({ type: 'ok' })
  })
  it('documento de hóspede repetido: juntar com o existente', () => {
    const result = pgError(
      409,
      '23505',
      'duplicate key value violates unique constraint "guests_document_type_document_number_key"'
    )
    expect(classify(failure(result))).toEqual({ type: 'remap-guest' })
  })
  it('quarto ocupado vira conflito', () => {
    const result = pgError(409, '23P01', 'conflicting key value violates exclusion constraint "reservations_no_overlap"')
    expect(classify(failure(result))).toMatchObject({ type: 'reject', reason: 'conflito_quarto' })
  })
  it('sem permissão', () => {
    expect(classify(failure(pgError(403, '42501', 'new row violates row-level security policy')))).toMatchObject({
      reason: 'sem_permissao',
    })
    expect(classify(failure(pgError(400, 'P0001', 'Sem permissão para fazer check-in')))).toMatchObject({
      reason: 'sem_permissao',
    })
  })
  it('registro sumido', () => {
    expect(classify(failure(pgError(409, '23503', 'violates foreign key constraint')))).toMatchObject({
      reason: 'nao_encontrado',
    })
    expect(classify(failure(pgError(404, 'NAO_ENCONTRADO', 'Registro não encontrado.')))).toMatchObject({
      reason: 'nao_encontrado',
    })
    expect(classify(failure(pgError(400, 'P0001', 'Reserva não encontrada')))).toMatchObject({
      reason: 'nao_encontrado',
    })
  })
  it('regra da função mostra a mensagem do banco', () => {
    const message = 'Só é possível fazer check-out de uma reserva em andamento'
    expect(classify(failure(pgError(400, 'P0001', message)))).toEqual({ type: 'reject', reason: 'regra', message })
  })
})

describe('processOutbox', () => {
  it('envia na ordem e esvazia o caderninho', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r2' }, entityIds: ['rooms:r2'] })
    const { transport, calls } = fakeTransport(() => OK)
    expect(await processOutbox(transport)).toEqual({ sent: 2, rejected: 0, stoppedBy: null })
    expect(calls.map((c) => c.body)).toEqual([{ p_room_id: 'r1' }, { p_room_id: 'r2' }])
    expect(await db.outbox.count()).toBe(0)
  })

  it('para na queda de rede e retoma sem duplicar', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r2' }, entityIds: ['rooms:r2'] })
    let online = false
    const { transport, calls } = fakeTransport(() => (online ? OK : NETWORK))
    expect(await processOutbox(transport)).toEqual({ sent: 0, rejected: 0, stoppedBy: 'rede' })
    expect(await outboxCounts()).toEqual({ pending: 2, rejected: 0 })
    online = true
    expect(await processOutbox(transport)).toEqual({ sent: 2, rejected: 0, stoppedBy: null })
    expect(calls.filter((c) => c.body.p_room_id === 'r2')).toHaveLength(1)
  })

  it('reenvia um item que ficou "enviando" (app fechou no meio)', async () => {
    const item = await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    await db.outbox.update(item.seq!, { status: 'enviando' })
    const { transport } = fakeTransport(() => OK)
    expect((await processOutbox(transport)).sent).toBe(1)
  })

  it('pagamento leva a etiqueta e a hora real', async () => {
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'p1', reservation_id: 'res1', amount: 50, method: 'pix', notes: null, at: '2026-10-19T12:00:00.000Z' },
      entityIds: ['payments:p1'],
    })
    const { transport, calls } = fakeTransport(() => OK)
    await processOutbox(transport)
    expect(calls[0]).toEqual({
      method: 'rpc',
      target: 'register_payment',
      body: {
        p_reservation_id: 'res1',
        p_amount: 50,
        p_method: 'pix',
        p_notes: null,
        p_id: 'p1',
        p_paid_at: '2026-10-19T12:00:00.000Z',
      },
    })
  })

  it('conflito vai para recusados e o resto continua', async () => {
    await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'A' })) },
      entityIds: ['reservations:A'],
    })
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r9' }, entityIds: ['rooms:r9'] })
    const { transport } = fakeTransport((call) =>
      call.method === 'insert' ? pgError(409, '23P01', 'exclusion constraint "reservations_no_overlap"') : OK
    )
    expect(await processOutbox(transport)).toEqual({ sent: 1, rejected: 1, stoppedBy: null })
    const [rejected] = await db.outbox.where('status').equals('recusado').toArray()
    expect(rejected.error?.reason).toBe('conflito_quarto')
  })

  it('quem depende de um item recusado também é recusado, sem ser enviado', async () => {
    await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'A' })) },
      entityIds: ['reservations:A'],
    })
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    const { transport, calls } = fakeTransport(() => pgError(409, '23P01', 'reservations_no_overlap'))
    expect(await processOutbox(transport)).toEqual({ sent: 0, rejected: 2, stoppedBy: null })
    expect(calls).toHaveLength(1)
    const payment = await db.outbox.where('entityIds').equals('payments:P').first()
    expect(payment?.error?.reason).toBe('dependencia')
  })

  it('hóspede com documento repetido é juntado ao que já existe', async () => {
    const local = makeGuest({ id: 'g-local' })
    const server = makeGuest({ id: 'g-server' })
    await db.guests.add(local)
    await db.reservations.add(makeReservation({ id: 'res1', guest_id: 'g-local' }))
    await enqueue({ ...base, kind: 'guest.create', payload: { row: guestRow(local) }, entityIds: ['guests:g-local'] })
    await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'res1', guest_id: 'g-local' })) },
      entityIds: ['reservations:res1'],
      dependsOn: ['guests:g-local'],
    })
    const { transport, calls } = fakeTransport(
      (call) =>
        call.target === 'guests'
          ? pgError(409, '23505', 'duplicate key value violates unique constraint "guests_document_type_document_number_key"')
          : OK,
      [server]
    )
    expect((await processOutbox(transport)).sent).toBe(2)
    expect(await db.guests.get('g-local')).toBeUndefined()
    expect(await db.guests.get('g-server')).toBeDefined()
    expect((await db.reservations.get('res1'))?.guest_id).toBe('g-server')
    expect(calls[1].body.guest_id).toBe('g-server')
  })

  it('edição sem linha no servidor vira "não encontrado"', async () => {
    await enqueue({
      ...base,
      kind: 'reservation.update',
      payload: { id: 'A', patch: { notes: 'x' } },
      entityIds: ['reservations:A'],
    })
    const { transport } = fakeTransport(() => pgError(404, 'NAO_ENCONTRADO', 'Registro não encontrado.'))
    await processOutbox(transport)
    const [item] = await db.outbox.toArray()
    expect(item.error?.reason).toBe('nao_encontrado')
  })

  it('login vencido para o envio e mantém o item', async () => {
    await enqueue({ ...base, kind: 'room.clean', payload: { id: 'r1' }, entityIds: ['rooms:r1'] })
    const { transport } = fakeTransport(() => pgError(401, 'PGRST301', 'JWT expired'))
    expect((await processOutbox(transport)).stoppedBy).toBe('login')
    expect(await outboxCounts()).toEqual({ pending: 1, rejected: 0 })
  })
})

describe('discardItem e requeue', () => {
  it('descartar uma criação apaga a linha local e as ações que dependem dela', async () => {
    await db.reservations.add(makeReservation({ id: 'A' }))
    await db.payments.add(makePayment({ id: 'P', reservation_id: 'A' }))
    const create = await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'A' })) },
      entityIds: ['reservations:A'],
    })
    await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    await discardItem(create.seq!)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.reservations.get('A')).toBeUndefined()
    expect(await db.payments.get('P')).toBeUndefined()
  })

  it('descartar uma edição marca a linha para buscar de novo, sem levar junto quem não depende dela', async () => {
    const update = await enqueue({
      ...base,
      kind: 'reservation.update',
      payload: { id: 'A', patch: { notes: 'x' } },
      entityIds: ['reservations:A'],
      dependsOn: ['reservations:A'],
    })
    await enqueue({
      ...base,
      kind: 'reservation.checkin',
      payload: { id: 'A', at: '' },
      entityIds: ['reservations:A'],
      dependsOn: ['reservations:A'],
    })
    expect(await discardItem(update.seq!)).toEqual(['reservations:A'])
    expect(await getMeta('refetch')).toEqual(['reservations:A'])
    expect(await db.outbox.count()).toBe(1)
  })

  it('recolocar na fila leva junto os itens travados por dependência, na mesma ordem', async () => {
    const create = await enqueue({
      ...base,
      kind: 'reservation.create',
      payload: { row: reservationRow(makeReservation({ id: 'A' })) },
      entityIds: ['reservations:A'],
    })
    const pay = await enqueue({
      ...base,
      kind: 'payment.create',
      payload: { id: 'P', reservation_id: 'A', amount: 10, method: 'pix', notes: null, at: '' },
      entityIds: ['payments:P'],
      dependsOn: ['reservations:A'],
    })
    await db.outbox.update(create.seq!, { status: 'recusado', error: { reason: 'conflito_quarto', message: 'x' } })
    await db.outbox.update(pay.seq!, { status: 'recusado', error: { reason: 'dependencia', message: 'x' } })
    await requeue(create.seq!, (item) =>
      item.kind === 'reservation.create' ? { ...item, payload: { row: { ...item.payload.row, room_id: 'r2' } } } : item
    )
    const items = await db.outbox.orderBy('seq').toArray()
    expect(items.map((i) => [i.kind, i.status])).toEqual([
      ['reservation.create', 'pendente'],
      ['payment.create', 'pendente'],
    ])
    expect(items[0].kind === 'reservation.create' && items[0].payload.row.room_id).toBe('r2')
  })
})
