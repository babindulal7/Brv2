import { supabase } from './supabase'
import { drainQueue, getPendingMutations } from './offlineQueue'
import { localStore, isIndexedDbAvailable } from './localStore'
import type { CachedClient, CachedProduct } from './localStore'

/* What the two delta pulls read off `select('*')`. The client carries no
   `Database` generic at this layer, so the shape is declared rather than
   inferred — every field but `id` is optional because `*` promises nothing. */
interface RemoteProduct extends Partial<Omit<CachedProduct, 'id'>> { id: string }
interface RemoteClient extends Partial<Omit<CachedClient, 'id'>> { id: string }

/* Dexie treats an absent key and an `undefined` value alike;
   `exactOptionalPropertyTypes` does not — an optional field may be missing,
   never `undefined`. The remote row is mapped with every column named and
   the undefined ones dropped here, so the cached row's type stays strict. */
function withoutUndefined<T extends object>(row: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as T
}

export type SyncStatusType = 'synced' | 'syncing' | 'pending' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatusType
  pendingCount: number
  lastSyncTime: Date | null
  error?: string | undefined
}

type SyncListener = (state: SyncState) => void

class SyncEngine {
  private listeners: Set<SyncListener> = new Set()
  private state: SyncState = {
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced',
    pendingCount: 0,
    lastSyncTime: null,
  }
  private intervalTimer: number | null = null
  private syncing = false

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateState({ status: 'syncing' })
        this.syncAll().catch(() => {})
      })
      window.addEventListener('offline', () => {
        this.updateState({ status: 'offline' })
      })

      // Start periodic background sync every 25 seconds when online
      this.startBackgroundSync(25000)
    }
  }

  public getState(): SyncState {
    return this.state
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private updateState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
  }

  public startBackgroundSync(intervalMs = 25000) {
    if (this.intervalTimer) window.clearInterval(this.intervalTimer)
    this.intervalTimer = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.syncAll().catch(() => {})
      }
    }, intervalMs)
  }

  public stopBackgroundSync() {
    if (this.intervalTimer) {
      window.clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
  }

  /**
   * Refreshes the pending mutation count from IndexedDB.
   */
  public async refreshPendingCount(): Promise<number> {
    if (!isIndexedDbAvailable()) return 0
    try {
      const pending = await getPendingMutations()
      const count = pending.length
      this.updateState({
        pendingCount: count,
        status:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : count > 0
            ? 'pending'
            : 'synced',
      })
      return count
    } catch {
      return 0
    }
  }

  /**
   * Full 2-way sync: drains the pending mutation outbox to Supabase, then pulls fresh master deltas.
   */
  public async syncAll(): Promise<{ success: boolean; pushed: number; error?: string }> {
    if (this.syncing) return { success: false, pushed: 0 }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateState({ status: 'offline' })
      return { success: false, pushed: 0, error: 'Offline' }
    }

    this.syncing = true
    this.updateState({ status: 'syncing', error: undefined })

    try {
      // 1. Drain upstream offline queue
      await drainQueue()
      const remainingPending = await this.refreshPendingCount()

      // 2. Pull downstream deltas into local Dexie store
      await this.pullDeltas()

      const now = new Date()
      this.updateState({
        status: remainingPending > 0 ? 'pending' : 'synced',
        pendingCount: remainingPending,
        lastSyncTime: now,
        error: undefined,
      })

      return { success: true, pushed: 0 }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[SyncEngine] Sync failed:', message)
      this.updateState({
        status: 'error',
        error: message,
      })
      return { success: false, pushed: 0, error: message }
    } finally {
      this.syncing = false
    }
  }

  /**
   * Pulls delta tables from Supabase into Dexie localStore.
   */
  private async pullDeltas(): Promise<void> {
    if (!isIndexedDbAvailable()) return

    try {
      // Pull products / equipment
      const { data: products } = await supabase.from('products').select('*').limit(300)
      if (products && products.length > 0) {
        await localStore.products.bulkPut(
          products.map((p: RemoteProduct) => withoutUndefined<CachedProduct>({
            id: p.id,
            name: p.name ?? '',
            serial_no: p.serial_no,
            asset_tag: p.asset_tag,
            category: p.category,
            daily_rate_paisa: p.daily_rate_paisa,
            status: p.status,
            rack: p.rack,
            shelf: p.shelf,
            bin: p.bin,
            updated_at: p.updated_at || new Date().toISOString(),
          }))
        )
      }

      // Pull client directory
      const { data: clients } = await supabase.from('clients').select('*').limit(300)
      if (clients && clients.length > 0) {
        await localStore.clients.bulkPut(
          clients.map((c: RemoteClient) => withoutUndefined<CachedClient>({
            id: c.id,
            name: c.name ?? '',
            phone: c.phone ?? '',
            email: c.email,
            address: c.address,
            credit_tier: c.credit_tier,
            is_blocked: c.is_blocked || false,
            updated_at: c.updated_at || new Date().toISOString(),
          }))
        )
      }
    } catch (e) {
      // Soft-fail delta caching without interrupting operational flow
      console.debug('[SyncEngine] Delta caching bypassed or unauthenticated:', e)
    }
  }
}

export const syncEngine = new SyncEngine()
