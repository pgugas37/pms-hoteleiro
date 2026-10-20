import { browserSaysOffline, isSimulatedOffline, siteReachable } from '@/offline/connectivity'
import { getMeta, setMeta, SYNC_LOCK } from '@/offline/db'
import { lastServerContact, markServerContact } from '@/offline/identity'
import { outboxCounts, processOutbox } from '@/offline/outbox'
import { PullError, pullChanges, reconcileIfDue, refetchMarked, type PullSource } from '@/offline/pull'
import type { Transport } from '@/offline/transport'

export type Connection = 'online' | 'sem-internet' | 'servidor-fora'

export interface SyncState {
  connection: Connection
  /** Enviando ou baixando agora. */
  busy: boolean
  pending: number
  rejected: number
  /** A cópia deste aparelho já foi baixada inteira pelo menos uma vez. */
  ready: boolean
  lastServerContactAt: number | null
}

export interface SyncDeps {
  transport: Transport
  source: PullSource
  hasSession: () => Promise<'sim' | 'rede' | 'nao'>
  refreshSession: () => Promise<'ok' | 'rede' | 'recusada'>
  onDataChanged: () => void
  onRejected: (count: number) => void
}

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

/** Envia o caderninho e depois baixa as novidades. Uma rodada por vez (inclusive entre abas). */
export class SyncEngine {
  private state: SyncState = {
    connection: 'online',
    busy: false,
    pending: 0,
    rejected: 0,
    ready: false,
    lastServerContactAt: lastServerContact(),
  }
  private listeners = new Set<() => void>()
  private running = false
  private rerun = false
  private retryIndex = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: SyncDeps) {}

  getState = (): SyncState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((listener) => listener())
  }

  async refreshCounts(): Promise<void> {
    const { pending, rejected } = await outboxCounts()
    const ready = (await getMeta<boolean>('initialDownloadDone')) === true
    this.set({ pending, rejected, ready })
  }

  async syncNow(): Promise<void> {
    if (this.running) {
      this.rerun = true
      return
    }
    this.running = true
    try {
      await this.withLock(() => this.cycle())
    } catch (error) {
      console.error('[sincronização]', error)
    } finally {
      this.running = false
      if (this.rerun) {
        this.rerun = false
        void this.syncNow()
      }
    }
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) return fn()
    await locks.request(SYNC_LOCK, { ifAvailable: true }, async (lock) => {
      if (lock) await fn()
    })
  }

  private async cycle(): Promise<void> {
    if (browserSaysOffline() || isSimulatedOffline()) {
      this.set({ connection: 'sem-internet' })
      await this.refreshCounts()
      return
    }
    const session = await this.deps.hasSession()
    if (session === 'rede') return this.wentOffline()
    if (session === 'nao') {
      await this.refreshCounts()
      return
    }

    this.set({ busy: true })
    try {
      const result = await processOutbox(this.deps.transport)
      if (result.sent > 0 || result.rejected > 0) this.deps.onDataChanged()
      if (result.rejected > 0) this.deps.onRejected(result.rejected)
      if (result.stoppedBy === 'rede') return await this.wentOffline()
      if (result.stoppedBy === 'login') return await this.afterAuthFailure()

      await refetchMarked(this.deps.source)
      const changed = await pullChanges(this.deps.source)
      const firstDownload = (await getMeta<boolean>('initialDownloadDone')) !== true
      if (firstDownload) {
        await setMeta('initialDownloadDone', true)
        await setMeta('lastReconcileAt', Date.now())
      } else {
        await reconcileIfDue(this.deps.source)
      }
      markServerContact()
      this.retryIndex = 0
      this.set({ connection: 'online', lastServerContactAt: lastServerContact() })
      if (changed > 0 || firstDownload) this.deps.onDataChanged()
    } catch (error) {
      if (error instanceof PullError && (error.status === 0 || error.status >= 500)) return await this.wentOffline()
      if (error instanceof PullError && error.status === 401) return await this.afterAuthFailure()
      throw error
    } finally {
      this.set({ busy: false })
      await this.refreshCounts()
    }
  }

  private async afterAuthFailure(): Promise<void> {
    const refreshed = await this.deps.refreshSession()
    if (refreshed === 'ok') this.rerun = true
    else if (refreshed === 'rede') await this.wentOffline()
    // 'recusada': o AuthProvider recebe SIGNED_OUT e pede login; o caderninho fica guardado
  }

  private async wentOffline(): Promise<void> {
    this.set({ connection: (await siteReachable()) ? 'servidor-fora' : 'sem-internet' })
    if (this.retryTimer) return
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]
    this.retryIndex++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.syncNow()
    }, delay)
  }
}
