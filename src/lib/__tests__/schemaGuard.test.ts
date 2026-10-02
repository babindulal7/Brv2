import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkDatabaseSchema,
  __resetSchemaGuardCache,
  SCHEMA_PROBES,
} from '../schemaGuard'

/**
 * **The boot-time schema guard must fail LOUD, not quiet.**
 *
 * The guard exists to stop an operator meeting a missing-function error halfway
 * through an action. Every test here is one way it could instead mislead them:
 *
 *   * reporting "in sync" against a database that is behind (the regression that
 *     `read_record_editor(p_table, …)` caused — the probe's arg name did not
 *     match the function, PostgREST said PGRST202, and a fully-migrated database
 *     was reported as behind on every screen);
 *   * reporting "behind" against a database that is current, which trains the
 *     operator to ignore the one banner that matters;
 *   * reporting "in sync" when the check never reached the database at all, which
 *     is the silent failure a guard exists to prevent.
 */

const rpc = vi.fn()
const limit = vi.fn()

vi.mock('../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: () => ({ limit: (...args: unknown[]) => limit(...args) }) }),
  },
}))

/** A PostgREST/Postgres error shaped the way supabase-js delivers it. */
function pgError(code: string, message: string) {
  return { code, message, details: null, hint: null }
}

/** A deployed object that refused the call — RLS, role ceiling, no such row. */
const REFUSED = [
  pgError('42501', 'permission denied for function read_quote_editor'),
  pgError('P0001', 'GATE:gate.stock_adjust.rpc_required|Use the audited action'),
  pgError('P0002', 'no_data_found'),
]

function replyRpcWith(error: unknown) {
  rpc.mockResolvedValue({ data: null, error })
}
function replySelectWith(error: unknown) {
  limit.mockResolvedValue({ data: null, error })
}

beforeEach(() => {
  rpc.mockReset()
  limit.mockReset()
  __resetSchemaGuardCache()
})

describe('schemaGuard — a database that is fully migrated', () => {
  it('reports in sync when every probe is refused rather than absent', async () => {
    // Any non-"not found" error is evidence the object EXISTS. Getting this
    // backwards is what raises a false alarm on a correct database.
    replyRpcWith(REFUSED[0])
    replySelectWith(REFUSED[0])

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(false)
    expect(state.isUnverified).toBe(false)
    expect(state.missing).toEqual([])
    expect(state.unverified).toEqual([])
  })

  it('treats every refusal shape as "deployed"', async () => {
    for (const err of REFUSED) {
      __resetSchemaGuardCache()
      replyRpcWith(err)
      replySelectWith(err)
      const state = await checkDatabaseSchema()
      expect(state.isBehind, `${err.code} must not read as missing`).toBe(false)
    }
  })
})

describe('schemaGuard — a database that is behind', () => {
  it('reports behind when an RPC is absent from the schema cache', async () => {
    replyRpcWith(pgError('PGRST202', 'Could not find the function public.read_quote_editor in the schema cache.'))
    replySelectWith(null)

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(true)
    expect(state.missing.map((m) => m.name)).toContain('read_quote_editor')
    expect(state.missing[0]?.migration).toBe('0147')
  })

  it('reports behind when a table is absent', async () => {
    replyRpcWith(null)
    replySelectWith(pgError('PGRST205', 'Could not find the table public.stock_adjustments in the schema cache.'))

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(true)
    expect(state.missing.map((m) => m.name)).toContain('stock_adjustments')
  })

  it('reports behind when a selected column is absent', async () => {
    replyRpcWith(null)
    replySelectWith(pgError('42703', 'column bookings.project_type does not exist'))

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(true)
    expect(state.missing.map((m) => m.name)).toContain('project_type')
  })

  it('lists missing objects newest migration first', async () => {
    replyRpcWith(pgError('PGRST202', 'Could not find the function in the schema cache.'))
    replySelectWith(pgError('PGRST205', 'Could not find the table in the schema cache.'))

    const state = await checkDatabaseSchema()

    const migrations = state.missing.map((m) => m.migration)
    expect(migrations).toEqual([...migrations].sort().reverse())
  })
})

describe('schemaGuard — when the check could not be performed', () => {
  it('surfaces a transport failure instead of claiming the schema is current', async () => {
    // The false all-clear. `Promise.allSettled` over probes that throw or return
    // a fetch error used to leave `missing` empty, which reads as "in sync".
    replyRpcWith(pgError('', 'TypeError: Failed to fetch'))
    replySelectWith(null)

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(false)
    expect(state.isUnverified).toBe(true)
    expect(state.unverified.length).toBeGreaterThan(0)
  })

  it('surfaces a thrown probe rather than dropping it', async () => {
    rpc.mockRejectedValue(new Error('Failed to fetch'))
    replySelectWith(null)

    const state = await checkDatabaseSchema()

    expect(state.isUnverified).toBe(true)
  })

  it('reports behind AND unverified when only some probes resolve', async () => {
    replyRpcWith(pgError('PGRST202', 'Could not find the function in the schema cache.'))
    replySelectWith(pgError('', 'NetworkError when attempting to fetch resource.'))

    const state = await checkDatabaseSchema()

    expect(state.isBehind).toBe(true)
    expect(state.isUnverified).toBe(true)
  })
})

describe('schemaGuard — probe hygiene', () => {
  it('probes every object it declares', async () => {
    replyRpcWith(null)
    replySelectWith(null)

    await checkDatabaseSchema()

    expect(rpc).toHaveBeenCalledTimes(SCHEMA_PROBES.filter((p) => p.kind === 'rpc').length)
    expect(limit).toHaveBeenCalledTimes(SCHEMA_PROBES.filter((p) => p.kind !== 'rpc').length)
  })

  it('never probes with an id that could resolve to a row', async () => {
    // The guard runs at boot against production. A probe that could match real
    // data would make the check itself a write, so every id must be nil.
    replyRpcWith(null)
    replySelectWith(null)

    await checkDatabaseSchema()

    const NIL = '00000000-0000-0000-0000-000000000000'
    for (const [name, args] of rpc.mock.calls as [string, Record<string, unknown>][]) {
      for (const [key, value] of Object.entries(args ?? {})) {
        const isUuidish = typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
        if (isUuidish) expect(value, `${name}.${key}`).toBe(NIL)
      }
    }
  })

  it('caches the verdict so a boot check runs once, not per route', async () => {
    replyRpcWith(null)
    replySelectWith(null)

    await checkDatabaseSchema()
    const afterFirst = rpc.mock.calls.length + limit.mock.calls.length
    await checkDatabaseSchema()

    expect(rpc.mock.calls.length + limit.mock.calls.length).toBe(afterFirst)
  })

  it('gives every probe a migration, an impact, and a kind', () => {
    for (const p of SCHEMA_PROBES) {
      expect(p.migration, p.name).toMatch(/^\d{4}$/)
      expect(p.impact.length, p.name).toBeGreaterThan(0)
      expect(['rpc', 'column', 'table']).toContain(p.kind)
    }
  })
})