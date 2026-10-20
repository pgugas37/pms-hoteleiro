import { beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, setMeta, wipeLocalData, type MirroredTable } from '@/offline/db'
import { pullChanges, reconcileIfDue, refetchMarked, type DeletionRow, type PullSource, type ServerRow } from '@/offline/pull'

import { makeReservation, makeRoom, makeRoomType } from './fakes'

function fakeSource(tables: Partial<Record<MirroredTable, ServerRow[]>>, deletions: DeletionRow[] = []) {
  const requestedSince: Array<string | null> = []
  const source: PullSource = {
    async fetchChanged(table, since, offset, limit) {
      if (table === 'rooms') requestedSince.push(since)
      const rows = (tables[table] ?? []).filter((r) => !since || Date.parse(r.updated_at) > Date.parse(since))
      return rows.slice(offset, offset + limit)
    },
    async fetchDeletions(since, offset, limit) {
      return deletions.filter((d) => !since || Date.parse(d.deleted_at) > Date.parse(since)).slice(offset, offset + limit)
    },
    async fetchIds(table) {
      return (tables[table] ?? []).map((r) => r.id)
    },
    async fetchByIds(table, ids) {
      return (tables[table] ?? []).filter((r) => ids.includes(r.id))
    },
  }
  return { source, requestedSince }
}

beforeEach(async () => {
  await wipeLocalData()
})

describe('pullChanges', () => {
  it('no primeiro download grava tudo e guarda o marcador', async () => {
    const rooms = [
      makeRoom({ id: 'r1', updated_at: '2026-10-01T10:00:00+00:00' }),
      makeRoom({ id: 'r2', number: '2', updated_at: '2026-10-02T10:00:00+00:00' }),
    ]
    const { source, requestedSince } = fakeSource({ rooms, room_types: [makeRoomType()] })
    const changed = await pullChanges(source)
    expect(changed).toBe(3)
    expect(await db.rooms.count()).toBe(2)
    expect(requestedSince).toEqual([null])
    expect(await getMeta('cursor:rooms')).toBe('2026-10-02T10:00:00+00:00')
  })

  it('depois pede só o que mudou, com 2 minutos de sobra', async () => {
    const { source, requestedSince } = fakeSource({ rooms: [makeRoom({ updated_at: '2026-10-02T10:00:00+00:00' })] })
    await pullChanges(source)
    await pullChanges(source)
    expect(requestedSince[1]).toBe('2026-10-02T09:58:00.000Z')
  })

  it('não sobrescreve um registro citado no caderninho', async () => {
    await db.rooms.put(makeRoom({ status: 'ocupado' }))
    await db.outbox.add({
      id: 'x',
      kind: 'room.clean',
      payload: { id: 'r1' },
      entityIds: ['rooms:r1'],
      dependsOn: [],
      description: 't',
      createdAt: '',
      userId: 'u1',
      status: 'pendente',
      error: null,
      attempts: 0,
    })
    const { source } = fakeSource({ rooms: [makeRoom({ status: 'disponivel', updated_at: '2026-10-05T00:00:00+00:00' })] })
    await pullChanges(source)
    expect((await db.rooms.get('r1'))?.status).toBe('ocupado')
  })

  it('aplica exclusões, menos as de registros protegidos', async () => {
    await db.reservations.bulkPut([makeReservation({ id: 'a' }), makeReservation({ id: 'b' })])
    await db.outbox.add({
      id: 'x',
      kind: 'reservation.checkin',
      payload: { id: 'b', at: '' },
      entityIds: ['reservations:b'],
      dependsOn: [],
      description: 't',
      createdAt: '',
      userId: 'u1',
      status: 'pendente',
      error: null,
      attempts: 0,
    })
    const deletions: DeletionRow[] = [
      { id: 1, table_name: 'reservations', row_id: 'a', deleted_at: '2026-10-05T00:00:00+00:00' },
      { id: 2, table_name: 'reservations', row_id: 'b', deleted_at: '2026-10-05T00:00:00+00:00' },
    ]
    const { source } = fakeSource({}, deletions)
    await pullChanges(source)
    expect(await db.reservations.get('a')).toBeUndefined()
    expect(await db.reservations.get('b')).toBeDefined()
    expect(await getMeta('cursor:sync_deletions')).toBe('2026-10-05T00:00:00+00:00')
  })
})

describe('reconcileIfDue', () => {
  it('remove da cópia o que não existe mais no servidor', async () => {
    await db.rooms.bulkPut([makeRoom({ id: 'r1' }), makeRoom({ id: 'sumiu', number: '9' })])
    const { source } = fakeSource({ rooms: [makeRoom({ id: 'r1' })] })
    expect(await reconcileIfDue(source)).toBe(1)
    expect(await db.rooms.get('sumiu')).toBeUndefined()
  })

  it('só roda uma vez a cada 24 h', async () => {
    await setMeta('lastReconcileAt', Date.now())
    await db.rooms.put(makeRoom({ id: 'sumiu' }))
    const { source } = fakeSource({ rooms: [] })
    expect(await reconcileIfDue(source)).toBe(0)
    expect(await db.rooms.get('sumiu')).toBeDefined()
  })
})

describe('refetchMarked', () => {
  it('busca de novo as linhas marcadas e apaga as que sumiram', async () => {
    await db.reservations.bulkPut([makeReservation({ id: 'a', status: 'em_andamento' }), makeReservation({ id: 'b' })])
    await setMeta('refetch', ['reservations:a', 'reservations:b'])
    const { source } = fakeSource({ reservations: [makeReservation({ id: 'a', status: 'confirmada' })] })
    await refetchMarked(source)
    expect((await db.reservations.get('a'))?.status).toBe('confirmada')
    expect(await db.reservations.get('b')).toBeUndefined()
    expect(await getMeta('refetch')).toEqual([])
  })
})
