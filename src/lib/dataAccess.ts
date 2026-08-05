/**
 * Data Access Layer — Law 8 Idempotency & Mutation Wrapper
 *
 * Enforces:
 *   - Every user-written mutation automatically carries a unique `client_uuid` (UUIDv4)
 *   - Duplicate submissions / network retries are rejected cleanly
 *   - Immutable tables (payments, audit logs, deposit movements) reject UPDATE/DELETE at the API layer
 */

import { supabase } from './supabase'
import type { Database } from '../types/database'
import { enqueueMutation } from './offlineQueue'

/** Generates standard UUIDv4 in browser/node */
export function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Inserts a record with mandatory `client_uuid` injection for idempotency */
export async function idempotentInsert<
  TTable extends keyof Database['public']['Tables'],
  TInsert extends Database['public']['Tables'][TTable]['Insert']
>(
  table: TTable,
  payload: Omit<TInsert, 'client_uuid'> & { client_uuid?: string }
) {
  const finalPayload = {
    ...payload,
    client_uuid: payload.client_uuid || generateClientUuid(),
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[DataAccess] Device offline. Queuing insert for ${String(table)}.`)
    await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
    return { data: finalPayload, error: null } // Optimistic response
  }

  const { data, error } = await (supabase.from(table as string) as any).insert(finalPayload).select().single()

  if (error) {
    // If it's a network error from Supabase, queue it instead
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during insert. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
       return { data: finalPayload, error: null }
    }

    // Detect duplicate idempotency violation
    if (error.code === '23505' && error.message.includes('client_uuid')) {
      console.warn(`[DataAccess] Idempotent request duplicate detected for table ${String(table)}. Fetching existing record.`)
      return await (supabase.from(table as string) as any).select().eq('client_uuid', finalPayload.client_uuid).single()
    }
    throw new Error(`[DataAccess] Insert failed on ${String(table)}: ${error.message}`)
  }

  return { data, error: null }
}

/** Updates a record (prohibited on immutable tables) */
export async function safeUpdate<
  TTable extends keyof Database['public']['Tables'],
  TUpdate extends Database['public']['Tables'][TTable]['Update']
>(
  table: TTable,
  id: string,
  payload: TUpdate
) {
  const immutableTables = ['payments', 'deposit_movements', 'audit_events']
  if (immutableTables.includes(String(table))) {
    throw new Error(`[DataAccess] Mutation Law 4 Violation: ${String(table)} is immutable and cannot be updated.`)
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[DataAccess] Device offline. Queuing update for ${String(table)} id=${id}.`)
    await enqueueMutation(String(table), 'update', { ...payload, id }, generateClientUuid())
    return { data: { ...payload, id }, error: null } // Optimistic response
  }

  const { data, error } = await (supabase.from(table as string) as any).update(payload).eq('id', id).select().single()

  if (error) {
    if (error.message === 'Failed to fetch' || error.code === '408') {
       console.warn(`[DataAccess] Network failure during update. Queuing ${String(table)}.`)
       await enqueueMutation(String(table), 'update', { ...payload, id }, generateClientUuid())
       return { data: { ...payload, id }, error: null }
    }
    throw new Error(`[DataAccess] Update failed on ${String(table)}: ${error.message}`)
  }

  return { data, error: null }
}
