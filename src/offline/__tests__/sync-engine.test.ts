import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db, getMeta, wipeLocalData } from '@/offline/db'
import { enqueue } from '@/offline/outbox'
import { PullError, type PullSource } from '@/offline/pull'
import { SyncEngine, type SyncDeps } from '@/offline/sync-engine'

import { NETWORK, OK, fakeTransport, makeRoom } from './fakes'

const engines: SyncEngine[] = []

function source(fail = false): PullSource {
  return {
    async fetchChanged(table) {
      if (fail) throw new PullError(0, { message: 'Failed to fetch' })
      return table === 'rooms' ? [makeRoom()] : []
    },
    fetchDeletions: async () => [],
    fetchIds: async () => [],
    fetchByIds: async () => [],
  }
}

function engine(over: Partial<SyncDeps>): SyncEngine {
  const created = new SyncEngine({
    transport: fakeTransport(() => OK).transport,
    source: source(),
    hasSession: async () => 'sim',
    refreshSession: async () => 'ok',
    onDataChanged: () => {},
    onRejected: () => {},
    ...over,
  })
  engines.push(created)
  return created
}

const cleanItem = {
  kind: 'room.clean' as const,
  payload: { id: 'r1' },
  entityIds: ['rooms:r1' as const],
  dependsOn: [],
  description: 't',
  userId: 'u1',
}

beforeEach(async () => {
  await wipeLocalData()
})

afterEach(() => {
  engines.splice(0).forEach((e) => e.stop())
})

describe('SyncEngine', () => {
  it('envia, baixa e fica pronto', async () => {
    await enqueue(cleanItem)
    let changes = 0
    const sync = engine({ onDataChanged: () => changes++ })
    await sync.syncNow()
    expect(sync.getState()).toMatchObject({ connection: 'online', pending: 0, rejected: 0, ready: true, busy: false })
    expect(await db.rooms.count()).toBe(1)
    expect(await getMeta('initialDownloadDone')).toBe(true)
    expect(changes).toBeGreaterThan(0)
  })

  it('sem rede no envio: fica "sem internet" e guarda o caderninho', async () => {
    await enqueue(cleanItem)
    const sync = engine({ transport: fakeTransport(() => NETWORK).transport })
    await sync.syncNow()
    expect(sync.getState()).toMatchObject({ connection: 'sem-internet', pending: 1 })
  })

  it('sem rede no download: fica "sem internet"', async () => {
    const sync = engine({ source: source(true) })
    await sync.syncNow()
    expect(sync.getState().connection).toBe('sem-internet')
    expect(sync.getState().ready).toBe(false)
  })

  it('sem sessão não envia nada', async () => {
    await enqueue(cleanItem)
    const fake = fakeTransport(() => OK)
    const sync = engine({ transport: fake.transport, hasSession: async () => 'nao' })
    await sync.syncNow()
    expect(fake.calls).toHaveLength(0)
    expect(sync.getState().pending).toBe(1)
  })
})
