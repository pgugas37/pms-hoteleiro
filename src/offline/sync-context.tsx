import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { ensureOwner, type EntityKey } from '@/offline/db'
import { onLocalChange, onServerChange } from '@/offline/events'
import { outboxEntityStatus } from '@/offline/outbox'
import { supabasePullSource, supabaseTransport } from '@/offline/server'
import { SyncEngine, type SyncState } from '@/offline/sync-engine'

const SYNC_INTERVAL_MS = 60_000
const LOCAL_CHANGE_DEBOUNCE_MS = 300

export const OFFLINE_HINT = 'Precisa de internet'

interface SyncContextValue {
  state: SyncState
  entityStatus: Map<EntityKey, 'pendente' | 'recusado'>
  syncNow: () => void
}

const SyncContext = React.createContext<SyncContextValue | null>(null)

async function hasSession(): Promise<'sim' | 'rede' | 'nao'> {
  const { data, error } = await supabase.auth.getSession()
  if (data.session) return 'sim'
  if (error && isAuthRetryableFetchError(error)) return 'rede'
  return 'nao'
}

async function refreshSession(): Promise<'ok' | 'rede' | 'recusada'> {
  const { data, error } = await supabase.auth.refreshSession()
  if (data.session) return 'ok'
  if (error && isAuthRetryableFetchError(error)) return 'rede'
  return 'recusada'
}

/** Liga o motor de sincronização: envia o caderninho e baixa novidades enquanto houver alguém logado. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { userId, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [entityStatus, setEntityStatus] = React.useState(() => new Map<EntityKey, 'pendente' | 'recusado'>())

  const refreshLocalViews = React.useCallback(async () => {
    setEntityStatus(await outboxEntityStatus())
    await queryClient.invalidateQueries()
  }, [queryClient])

  const engine = React.useMemo(
    () =>
      new SyncEngine({
        transport: supabaseTransport,
        source: supabasePullSource,
        hasSession,
        refreshSession,
        onDataChanged: () => {
          void refreshLocalViews()
        },
        onRejected: (count) =>
          toast.warning(
            count === 1
              ? '1 ação foi recusada pelo banco. Veja em Pendências.'
              : `${count} ações foram recusadas pelo banco. Veja em Pendências.`
          ),
      }),
    [refreshLocalViews]
  )

  const state = React.useSyncExternalStore(engine.subscribe, engine.getState)

  React.useEffect(() => {
    if (!isAuthenticated || !userId) return
    let cancelled = false
    let debounce: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      if (!cancelled) void engine.syncNow()
    }
    void (async () => {
      await ensureOwner(userId)
      if (cancelled) return
      await engine.refreshCounts()
      await refreshLocalViews()
      void navigator.storage?.persist?.()
      run()
    })()
    const interval = setInterval(run, SYNC_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('online', run)
    window.addEventListener('offline', run)
    document.addEventListener('visibilitychange', onVisible)
    const offLocal = onLocalChange(() => {
      void refreshLocalViews()
      void engine.refreshCounts()
      clearTimeout(debounce)
      debounce = setTimeout(run, LOCAL_CHANGE_DEBOUNCE_MS)
    })
    const offServer = onServerChange(run)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(debounce)
      window.removeEventListener('online', run)
      window.removeEventListener('offline', run)
      document.removeEventListener('visibilitychange', onVisible)
      offLocal()
      offServer()
      engine.stop()
    }
  }, [engine, isAuthenticated, userId, refreshLocalViews])

  const value = React.useMemo<SyncContextValue>(
    () => ({ state, entityStatus, syncNow: () => void engine.syncNow() }),
    [state, entityStatus, engine]
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = React.useContext(SyncContext)
  if (!ctx) throw new Error('useSync precisa estar dentro de <SyncProvider>.')
  return ctx
}

/** Para os botões só-online: falso quando a última tentativa de falar com o servidor falhou. */
export function useIsOnline(): boolean {
  return useSync().state.connection === 'online'
}
