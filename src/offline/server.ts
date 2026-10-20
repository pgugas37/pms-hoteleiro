import { supabase } from '@/lib/supabase'
import { PAGE_SIZE, PullError, type DeletionRow, type PullSource, type ServerRow } from '@/offline/pull'
import type { Transport, TransportResult } from '@/offline/transport'
import type { Guest } from '@/types/guest'

/* Implementações reais (Supabase) do que o caderninho e o download precisam. */

interface SupabaseErrorLike {
  code?: string
  message: string
  details?: string
}

function toResult(error: SupabaseErrorLike | null, status: number): TransportResult {
  return error
    ? { ok: false, status, error: { code: error.code, message: error.message, details: error.details } }
    : { ok: true }
}

export const supabaseTransport: Transport = {
  async insert(table, row) {
    // a etiqueta (id) repetida é ignorada: o mesmo item pode chegar duas vezes sem duplicar
    const { error, status } = await supabase
      .from(table)
      .upsert(row as Record<string, unknown>, { onConflict: 'id', ignoreDuplicates: true })
    return toResult(error, status)
  },
  async update(table, id, patch) {
    const { data, error, status } = await supabase
      .from(table)
      .update(patch as Record<string, unknown>)
      .eq('id', id)
      .select('id')
    if (error) return toResult(error, status)
    if (!data || data.length === 0) {
      return { ok: false, status: 404, error: { code: 'NAO_ENCONTRADO', message: 'Registro não encontrado.' } }
    }
    return { ok: true }
  },
  async rpc(fn, args) {
    const { error, status } = await supabase.rpc(fn, args)
    return toResult(error, status)
  },
  async findGuestByDocument(documentType, documentNumber) {
    const { data, error, status } = await supabase
      .from('guests')
      .select('*')
      .eq('document_type', documentType)
      .eq('document_number', documentNumber)
      .maybeSingle()
    if (error) throw new PullError(status, error)
    return (data as Guest | null) ?? null
  },
}

async function rows<T>(
  query: PromiseLike<{ data: unknown; error: SupabaseErrorLike | null; status: number }>
): Promise<T[]> {
  const { data, error, status } = await query
  if (error) throw new PullError(status, { code: error.code, message: error.message, details: error.details })
  return (data as T[] | null) ?? []
}

export const supabasePullSource: PullSource = {
  fetchChanged(table, since, offset, limit) {
    let query = supabase.from(table).select('*')
    if (since) query = query.gt('updated_at', since)
    return rows<ServerRow>(
      query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
    )
  },
  fetchDeletions(since, offset, limit) {
    let query = supabase.from('sync_deletions').select('*')
    if (since) query = query.gt('deleted_at', since)
    return rows<DeletionRow>(
      query
        .order('deleted_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
    )
  },
  async fetchIds(table) {
    const ids: string[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await rows<{ id: string }>(
        supabase
          .from(table)
          .select('id')
          .order('id')
          .range(offset, offset + PAGE_SIZE - 1)
      )
      ids.push(...page.map((row) => row.id))
      if (page.length < PAGE_SIZE) break
    }
    return ids
  },
  fetchByIds(table, ids) {
    return rows<ServerRow>(supabase.from(table).select('*').in('id', ids))
  },
}
