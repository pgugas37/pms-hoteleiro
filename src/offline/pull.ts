import { db, entityKey, getMeta, MIRRORED_TABLES, setMeta, type EntityKey, type MirroredTable } from '@/offline/db'
import type { TransportError } from '@/offline/transport'

export interface ServerRow {
  id: string
  updated_at: string
}

export interface DeletionRow {
  id: number
  table_name: string
  row_id: string
  deleted_at: string
}

/** Falha ao falar com o servidor durante o download. status 0 = sem rede. */
export class PullError extends Error {
  constructor(
    readonly status: number,
    readonly detail: TransportError
  ) {
    super(detail.message)
  }
}

/** O que o download precisa do servidor (a versão real fica em server.ts). Os métodos lançam PullError. */
export interface PullSource {
  fetchChanged(table: MirroredTable, since: string | null, offset: number, limit: number): Promise<ServerRow[]>
  fetchDeletions(since: string | null, offset: number, limit: number): Promise<DeletionRow[]>
  fetchIds(table: MirroredTable): Promise<string[]>
  fetchByIds(table: MirroredTable, ids: string[]): Promise<ServerRow[]>
}

export const PAGE_SIZE = 1000
const OVERLAP_MS = 2 * 60 * 1000
const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000

function isMirrored(name: string): name is MirroredTable {
  return (MIRRORED_TABLES as readonly string[]).includes(name)
}

function sinceFrom(cursor: string | undefined): string | null {
  return cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
}

function later(current: string | undefined, candidate: string): string {
  return !current || Date.parse(candidate) > Date.parse(current) ? candidate : current
}

/** Chaves citadas em qualquer item do caderninho: o download não mexe nelas. */
export async function protectedEntityKeys(): Promise<Set<EntityKey>> {
  const keys = await db.outbox.orderBy('entityIds').uniqueKeys()
  return new Set(keys as EntityKey[])
}

async function putUnprotected(table: MirroredTable, rows: ServerRow[]): Promise<void> {
  if (rows.length === 0) return
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const keep = await protectedEntityKeys()
    await db.table(table).bulkPut(rows.filter((row) => !keep.has(entityKey(table, row.id))))
  })
}

/** Baixa o que mudou desde a última vez (na primeira, tudo) e aplica as exclusões. Devolve quantas linhas mudaram. */
export async function pullChanges(source: PullSource): Promise<number> {
  let changed = 0
  for (const table of MIRRORED_TABLES) {
    let cursor = await getMeta<string>(`cursor:${table}`)
    const since = sinceFrom(cursor)
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await source.fetchChanged(table, since, offset, PAGE_SIZE)
      await putUnprotected(table, rows)
      for (const row of rows) cursor = later(cursor, row.updated_at)
      changed += rows.length
      if (rows.length < PAGE_SIZE) break
    }
    if (cursor) await setMeta(`cursor:${table}`, cursor)
  }

  let deletionCursor = await getMeta<string>('cursor:sync_deletions')
  const deletionSince = sinceFrom(deletionCursor)
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const deletions = await source.fetchDeletions(deletionSince, offset, PAGE_SIZE)
    for (const deletion of deletions) {
      deletionCursor = later(deletionCursor, deletion.deleted_at)
      const table = deletion.table_name
      if (!isMirrored(table)) continue
      await db.transaction('rw', db.table(table), db.outbox, async () => {
        const keep = await protectedEntityKeys()
        if (keep.has(entityKey(table, deletion.row_id))) return
        if (await db.table(table).get(deletion.row_id)) {
          await db.table(table).delete(deletion.row_id)
          changed++
        }
      })
    }
    if (deletions.length < PAGE_SIZE) break
  }
  if (deletionCursor) await setMeta('cursor:sync_deletions', deletionCursor)
  return changed
}

/** Busca de novo no servidor as linhas marcadas (ex.: depois de um "Descartar"). */
export async function refetchMarked(source: PullSource): Promise<void> {
  const marked = (await getMeta<EntityKey[]>('refetch')) ?? []
  if (marked.length === 0) return
  const byTable = new Map<MirroredTable, string[]>()
  for (const key of marked) {
    const separator = key.indexOf(':')
    const table = key.slice(0, separator)
    if (!isMirrored(table)) continue
    byTable.set(table, [...(byTable.get(table) ?? []), key.slice(separator + 1)])
  }
  for (const [table, ids] of byTable) {
    const rows = await source.fetchByIds(table, ids)
    const found = new Set(rows.map((row) => row.id))
    await db.transaction('rw', db.table(table), db.outbox, async () => {
      const keep = await protectedEntityKeys()
      await db.table(table).bulkPut(rows.filter((row) => !keep.has(entityKey(table, row.id))))
      await db.table(table).bulkDelete(ids.filter((id) => !found.has(id) && !keep.has(entityKey(table, id))))
    })
  }
  await setMeta('refetch', [])
}

/** Uma vez a cada 24 h: remove da cópia o que não existe mais no servidor (rede de segurança). */
export async function reconcileIfDue(source: PullSource, now = Date.now()): Promise<number> {
  const last = await getMeta<number>('lastReconcileAt')
  if (last !== undefined && now - last < RECONCILE_EVERY_MS) return 0
  let removed = 0
  for (const table of MIRRORED_TABLES) {
    const serverIds = new Set(await source.fetchIds(table))
    await db.transaction('rw', db.table(table), db.outbox, async () => {
      const keep = await protectedEntityKeys()
      const localIds = (await db.table(table).toCollection().primaryKeys()) as string[]
      const gone = localIds.filter((id) => !serverIds.has(id) && !keep.has(entityKey(table, id)))
      await db.table(table).bulkDelete(gone)
      removed += gone.length
    })
  }
  await setMeta('lastReconcileAt', now)
  return removed
}
