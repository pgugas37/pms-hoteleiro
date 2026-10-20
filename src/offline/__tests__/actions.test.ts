import { beforeEach, describe, expect, it } from 'vitest'

import { toLocalIsoDate } from '@/lib/format'
import * as actions from '@/offline/actions'
import { db, wipeLocalData } from '@/offline/db'

import { makeGuest, makeReservation, makeRoom, makeRoomType } from './fakes'

const recepcao: actions.Actor = { id: 'u1', role: 'recepcao' }
const governanca: actions.Actor = { id: 'u2', role: 'governanca' }
const financeiro: actions.Actor = { id: 'u3', role: 'financeiro' }

function day(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return toLocalIsoDate(date)
}

function fields(over: Partial<actions.ReservationFields> = {}): actions.ReservationFields {
  return {
    guest_id: 'g1',
    room_id: 'r1',
    check_in: day(0),
    check_out: day(2),
    adults: 1,
    children: 0,
    daily_rate: 150,
    occupant_name: null,
    notes: null,
    ...over,
  }
}

beforeEach(async () => {
  await wipeLocalData()
  await db.room_types.put(makeRoomType())
  await db.rooms.bulkPut([makeRoom({ id: 'r1', number: '1' }), makeRoom({ id: 'r2', number: '2' })])
  await db.guests.put(makeGuest())
})

describe('reservas', () => {
  it('criar grava na cópia e no caderninho', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    expect(await db.reservations.get(reservation.id)).toMatchObject({ status: 'confirmada', room_id: 'r1' })
    const [item] = await db.outbox.toArray()
    expect(item).toMatchObject({
      kind: 'reservation.create',
      entityIds: [`reservations:${reservation.id}`],
      dependsOn: ['guests:g1'],
    })
    expect(item.description).toContain('quarto 1')
  })

  it('não deixa reservar quarto ocupado no período, mas libera depois de cancelada', async () => {
    const first = await actions.createReservation(recepcao, fields())
    await expect(actions.createReservation(recepcao, fields({ check_in: day(1), check_out: day(3) }))).rejects.toThrow(
      'já está reservado'
    )
    await actions.cancelReservation(recepcao, first.id, 'hospede_avisou', '')
    await expect(
      actions.createReservation(recepcao, fields({ check_in: day(1), check_out: day(3) }))
    ).resolves.toBeDefined()
  })

  it('governança não cria reserva', async () => {
    await expect(actions.createReservation(governanca, fields())).rejects.toBeInstanceOf(actions.ActionError)
  })

  it('editar uma reserva ainda não enviada junta na criação', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    await actions.updateReservation(recepcao, reservation.id, fields({ room_id: 'r2', notes: 'janela' }))
    const items = await db.outbox.toArray()
    expect(items).toHaveLength(1)
    expect(items[0].kind === 'reservation.create' && items[0].payload.row).toMatchObject({ room_id: 'r2', notes: 'janela' })
  })

  it('editar uma reserva que já está no servidor envia só os campos mudados', async () => {
    await db.reservations.put(makeReservation({ id: 'S', check_in: day(5), check_out: day(7) }))
    await actions.updateReservation(recepcao, 'S', fields({ check_in: day(5), check_out: day(7), notes: 'andar alto' }))
    const [item] = await db.outbox.toArray()
    expect(item.kind === 'reservation.update' && item.payload).toEqual({ id: 'S', patch: { notes: 'andar alto' } })
  })
})

describe('check-in, check-out, limpeza e cancelamento', () => {
  it('check-in antes da data é recusado', async () => {
    await db.reservations.put(makeReservation({ id: 'F', check_in: day(1), check_out: day(3) }))
    await expect(actions.checkinReservation(recepcao, 'F')).rejects.toThrow('a partir da data marcada')
  })

  it('check-in no dia ocupa o quarto e protege os dois registros', async () => {
    await db.reservations.put(makeReservation({ id: 'H', check_in: day(0), check_out: day(2) }))
    await actions.checkinReservation(recepcao, 'H')
    expect((await db.reservations.get('H'))?.status).toBe('em_andamento')
    expect((await db.rooms.get('r1'))?.status).toBe('ocupado')
    const [item] = await db.outbox.toArray()
    expect(item.entityIds).toEqual(['reservations:H', 'rooms:r1'])
  })

  it('check-out deixa o quarto em limpeza e a governança libera', async () => {
    await db.reservations.put(makeReservation({ id: 'H', status: 'em_andamento' }))
    await db.rooms.update('r1', { status: 'ocupado' })
    await actions.checkoutReservation(recepcao, 'H')
    expect((await db.rooms.get('r1'))?.status).toBe('limpeza')
    await actions.markRoomClean(governanca, 'r1')
    expect((await db.rooms.get('r1'))?.status).toBe('disponivel')
    await expect(actions.markRoomClean(governanca, 'r1')).rejects.toThrow('não está aguardando limpeza')
  })

  it('cancelar uma reserva em andamento manda o quarto para limpeza', async () => {
    await db.reservations.put(makeReservation({ id: 'H', status: 'em_andamento' }))
    await db.rooms.update('r1', { status: 'ocupado' })
    await actions.cancelReservation(recepcao, 'H', 'outro', '  ')
    expect(await db.reservations.get('H')).toMatchObject({
      status: 'cancelada',
      cancellation_reason: 'outro',
      cancellation_notes: null,
    })
    expect((await db.rooms.get('r1'))?.status).toBe('limpeza')
  })
})

describe('pagamento e hóspede', () => {
  it('pagamento entra na cópia com a mesma etiqueta do caderninho', async () => {
    await db.reservations.put(makeReservation({ id: 'H' }))
    const payment = await actions.registerPayment(financeiro, { reservation_id: 'H', amount: 80, method: 'pix', notes: '' })
    expect(await db.payments.get(payment.id)).toMatchObject({ amount: 80, registered_by: 'u3', notes: null })
    const [item] = await db.outbox.toArray()
    expect(item.kind === 'payment.create' && item.payload.id).toBe(payment.id)
    await expect(
      actions.registerPayment(governanca, { reservation_id: 'H', amount: 1, method: 'pix', notes: '' })
    ).rejects.toBeInstanceOf(actions.ActionError)
  })

  it('documento já cadastrado na cópia é recusado', async () => {
    await expect(
      actions.createGuest(recepcao, {
        full_name: 'Outra Pessoa',
        document_type: 'cpf',
        document_number: '529.982.247-25',
        email: null,
        phone: null,
        birth_date: null,
        nationality: 'Brasileira',
        notes: null,
      })
    ).rejects.toThrow('Já existe um hóspede com esse documento')
  })
})

describe('resolver conflito', () => {
  it('trocar o quarto recoloca a criação na fila', async () => {
    const reservation = await actions.createReservation(recepcao, fields())
    const [item] = await db.outbox.toArray()
    await db.outbox.update(item.seq!, { status: 'recusado', error: { reason: 'conflito_quarto', message: 'x' } })
    await actions.resolveReservationConflict(recepcao, item.seq!, {
      room_id: 'r2',
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      daily_rate: 150,
    })
    const [fixed] = await db.outbox.toArray()
    expect(fixed.status).toBe('pendente')
    expect(fixed.kind === 'reservation.create' && fixed.payload.row.room_id).toBe('r2')
    expect((await db.reservations.get(reservation.id))?.room_id).toBe('r2')
  })
})
