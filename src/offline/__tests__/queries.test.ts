import { beforeEach, describe, expect, it } from 'vitest'

import { db, wipeLocalData } from '@/offline/db'
import {
  listPaymentsWithReservation,
  listReservationsWithRelations,
  listRoomsWithType,
  overlappingRoomIds,
  searchEverything,
  seasonalRateFor,
} from '@/offline/queries'

import { makeGuest, makePayment, makeReservation, makeRoom, makeRoomType } from './fakes'

beforeEach(async () => {
  await wipeLocalData()
  await db.room_types.put(makeRoomType({ id: 't1', name: 'Standard' }))
  await db.rooms.bulkPut([
    makeRoom({ id: 'r10', number: '10' }),
    makeRoom({ id: 'r2', number: '2' }),
    makeRoom({ id: 'r1', number: '1' }),
  ])
  await db.guests.bulkPut([
    makeGuest({ id: 'g1', full_name: 'Maria Souza' }),
    makeGuest({ id: 'g2', full_name: 'João Lima', document_number: '111.444.777-35' }),
  ])
  await db.reservations.bulkPut([
    makeReservation({ id: 'a', guest_id: 'g1', room_id: 'r1', check_in: '2026-10-20', check_out: '2026-10-22' }),
    makeReservation({
      id: 'b',
      guest_id: 'g2',
      room_id: 'r2',
      check_in: '2026-10-25',
      check_out: '2026-10-27',
      status: 'cancelada',
    }),
  ])
})

describe('consultas locais', () => {
  it('quartos em ordem numérica, com o tipo', async () => {
    const rooms = await listRoomsWithType()
    expect(rooms.map((r) => r.number)).toEqual(['1', '2', '10'])
    expect(rooms[0].room_types).toEqual({ id: 't1', name: 'Standard', base_price: 150 })
  })

  it('reservas com hóspede e quarto juntados, mais recente primeiro', async () => {
    const reservations = await listReservationsWithRelations()
    expect(reservations.map((r) => r.id)).toEqual(['b', 'a'])
    expect(reservations[1].guests?.full_name).toBe('Maria Souza')
    expect(reservations[1].rooms).toEqual({ id: 'r1', number: '1', room_types: { id: 't1', name: 'Standard' } })
  })

  it('sobreposição ignora reservas canceladas', async () => {
    expect(await overlappingRoomIds('2026-10-21', '2026-10-26')).toEqual(new Set(['r1']))
    expect(await overlappingRoomIds('2026-10-21', '2026-10-26', 'a')).toEqual(new Set())
  })

  it('tarifa sazonal cobre a data', async () => {
    await db.seasonal_rates.put({
      id: 's1',
      room_type_id: 't1',
      label: 'Réveillon',
      start_date: '2026-12-28',
      end_date: '2027-01-02',
      daily_rate: 300,
      created_at: '',
    })
    expect(await seasonalRateFor('t1', '2026-12-31')).toBe(300)
    expect(await seasonalRateFor('t1', '2026-11-01')).toBeNull()
  })

  it('pagamentos com reserva, hóspede e quarto', async () => {
    await db.payments.put(makePayment({ id: 'p1', reservation_id: 'a' }))
    const [payment] = await listPaymentsWithReservation()
    expect(payment.reservations).toEqual({
      id: 'a',
      check_in: '2026-10-20',
      check_out: '2026-10-22',
      guests: { id: 'g1', full_name: 'Maria Souza' },
      rooms: { id: 'r1', number: '1' },
    })
  })

  it('busca global por nome, documento e quarto', async () => {
    const byName = await searchEverything('maria')
    expect(byName.guests.map((g) => g.id)).toEqual(['g1'])
    expect(byName.reservations.map((r) => r.id)).toEqual(['a'])
    expect((await searchEverything('111.444')).guests.map((g) => g.id)).toEqual(['g2'])
    expect((await searchEverything('10')).rooms.map((r) => r.number)).toEqual(['10'])
  })
})
