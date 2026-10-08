/**
 * PLAN.md Phase 9 — "Conflict UI naming both sides — never silent."
 *
 * Ported 8 Oct 2026 from main's uncommitted Phase 9 work. Before it, a queued
 * offline update replayed straight over a newer server row. These pin the
 * check that now runs first: when it holds the write, what it records, and
 * that it reads only the fields the write sets (a `select('*')` is refused
 * on the 0062 tables and would copy columns the device need not hold).
 *
 * The suite runs in `node` with no IndexedDB, so the two Dexie tables the
 * check writes to are stubbed; the logic under test is the decision.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const server = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
  selected: [] as string[],
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        server.selected.push(columns)
        return { eq: () => ({ maybeSingle: async () => ({ data: server.row, error: server.error }) }) }
      },
    }),
  },
}))

import { db, holdIfConflicting, type QueuedMutation } from '../offlineQueue'

const QUEUED_AT = '2026-10-08T06:00:00.000Z'
const mutation: QueuedMutation = {
  id: 7,
  clientUuid: 'cu-1',
  table: 'product_units',
  action: 'update',
  payload: { id: 'unit-1', status: 'Maintenance' },
  timestamp: QUEUED_AT,
  status: 'syncing',
}

let added: unknown[] = []
let updated: unknown[] = []

beforeEach(() => {
  server.row = null
  server.error = null
  server.selected = []
  added = []
  updated = []
  // Dexie's own promise type carries a `timeout`; the check only awaits these.
  vi.spyOn(db.conflicts, 'add').mockImplementation(((row: unknown) => {
    added.push(row)
    return Promise.resolve(1)
  }) as never)
  vi.spyOn(db.mutations, 'update').mockImplementation(((_id: unknown, patch: unknown) => {
    updated.push(patch)
    return Promise.resolve(1)
  }) as never)
})

describe('holdIfConflicting — a queued update never silently overwrites a newer row', () => {
  it('holds the write, naming both sides, when the server changed it later and disagrees', async () => {
    server.row = { updated_at: '2026-10-08T07:00:00.000Z', status: 'In Stock' }
    const held = await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance' })
    expect(held).toBe(true)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({
      mutationId: 7,
      table: 'product_units',
      recordId: 'unit-1',
      localChanges: { status: 'Maintenance' },
      remoteState: { updated_at: '2026-10-08T07:00:00.000Z', status: 'In Stock' },
      status: 'unresolved',
    })
    expect(updated[0]).toMatchObject({ status: 'failed', retryCount: 5 })
  })

  it('reads only the fields the write sets, plus updated_at — never select("*")', async () => {
    server.row = { updated_at: '2026-10-08T07:00:00.000Z', status: 'In Stock' }
    await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance', updated_at: QUEUED_AT })
    expect(server.selected).toEqual(['updated_at,status'])
  })

  it('replays when the server changed later but already agrees', async () => {
    server.row = { updated_at: '2026-10-08T07:00:00.000Z', status: 'Maintenance' }
    expect(await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance' })).toBe(false)
    expect(added).toHaveLength(0)
  })

  it('replays when the server row is older than the queued write', async () => {
    server.row = { updated_at: '2026-10-08T05:00:00.000Z', status: 'In Stock' }
    expect(await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance' })).toBe(false)
  })

  it("ignores the write's own updated_at, which always differs", async () => {
    server.row = { updated_at: '2026-10-08T07:00:00.000Z', status: 'Maintenance' }
    expect(await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance', updated_at: QUEUED_AT })).toBe(false)
  })

  it('replays as before when the read fails — the update meets the same condition and retries', async () => {
    server.error = { message: 'permission denied for table product_units' }
    expect(await holdIfConflicting(7, mutation, 'unit-1', { status: 'Maintenance' })).toBe(false)
    expect(added).toHaveLength(0)
  })
})
