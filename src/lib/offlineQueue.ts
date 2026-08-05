import Dexie, { type Table } from 'dexie'

export interface QueuedMutation {
  id?: number
  clientUuid: string
  table: string
  action: 'insert' | 'update' | 'delete'
  payload: Record<string, any>
  timestamp: string
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

export class OfflineQueueDB extends Dexie {
  mutations!: Table<QueuedMutation, number>

  constructor() {
    super('BabinOfflineQueue')
    this.version(1).stores({
      mutations: '++id, clientUuid, table, status, timestamp'
    })
  }
}

export const db = new OfflineQueueDB()

/**
 * Enqueues a mutation to be synced later.
 */
export async function enqueueMutation(
  table: string,
  action: 'insert' | 'update' | 'delete',
  payload: Record<string, any>,
  clientUuid: string
) {
  await db.mutations.add({
    clientUuid,
    table,
    action,
    payload,
    timestamp: new Date().toISOString(),
    status: 'pending'
  })
}

/**
 * Gets all pending mutations.
 */
export async function getPendingMutations() {
  return await db.mutations.where('status').equals('pending').sortBy('timestamp')
}

/**
 * Marks a mutation as syncing.
 */
export async function markMutationSyncing(id: number) {
  await db.mutations.update(id, { status: 'syncing' })
}

/**
 * Marks a mutation as failed.
 */
export async function markMutationFailed(id: number, error: string) {
  await db.mutations.update(id, { status: 'failed', error })
}

/**
 * Removes a mutation after successful sync.
 */
export async function resolveMutation(id: number) {
  await db.mutations.delete(id)
}
