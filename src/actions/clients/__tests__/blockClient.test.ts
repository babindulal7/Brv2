/**
 * BLOCK_CLIENT — the write that ends block-as-component-state.
 *
 * The defect this closes was not a missing feature, it was a lie with a short
 * shelf life: `ClientDetail` and `Clients` flipped `isBlocked` in React state
 * and raised a success toast, so a block survived until the next reload and
 * nothing in the database ever refused a booking. Migration 0054 then made
 * `is_blocked` a real column on `client_directory_v`, which turned the local
 * flip into a fake block painted over a genuinely un-blocked record.
 *
 * So the assertions here are mostly about *where* the fact lands:
 *   - a block is a `client_flags` INSERT, never `clients.status`
 *   - an unblock is an UPDATE of that row's removal fields, never a DELETE
 *   - the row is addressed by the client's uuid, never by the client CODE the
 *     screens hold
 *
 * Seams mocked: `lib/dataAccess` (both writes), `lib/supabase` (the live-flag
 * lookup) and `lib/queries/clients` (code → uuid). Nothing about the action's
 * own logic is stubbed.
 *
 * ⚠ Driven through `blockClientConfig` rather than through the dispatcher, so
 * that the body's assertions stay independent of the permission gate. Until
 * 15 Aug 2026 that was a necessity — `client.block` resolved to no rule and the
 * dispatcher denied every call, Owner included. It is now ruled, and the gate is
 * pinned at the bottom against the role list the database itself carries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { canCreateClient, canBlockClient } from '../../../lib/rbac'
/* Type-only, so it is erased and does not evaluate the module before the mocks. */
import type { BlockClientInput } from '../blockClient'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown>; clientUuid?: string }>,
  insertResult: { data: {} as unknown, error: null as unknown },
  updateResult: { data: {} as unknown, error: null as unknown },
  insertThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    if (access.insertThrows) throw new Error(access.insertThrows)
    return access.insertResult
  },
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>, clientUuid?: string) => {
    access.updates.push({ table, id, payload, ...(clientUuid === undefined ? {} : { clientUuid }) })
    return access.updateResult
  },
}))

const db = vi.hoisted(() => {
  const state = {
    liveFlag: null as { id: string } | null,
    flagError: null as { message: string } | null,
    tablesRead: [] as string[],
    filters: [] as Array<[string, unknown]>,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = (column: string, value: unknown) => {
    state.filters.push([column, value])
    return builder
  }
  builder['is'] = (column: string, value: unknown) => {
    state.filters.push([column, value])
    return builder
  }
  builder['maybeSingle'] = async () => ({ data: state.liveFlag, error: state.flagError })
  /* Law 3 — there is no delete path anywhere in this action. If an edit ever
     reaches for one, it fails here rather than removing a block's history. */
  builder['delete'] = () => {
    throw new Error('client_flags is never deleted from — Law 3')
  }

  return {
    state,
    supabase: {
      from: (table: string) => {
        state.tablesRead.push(table)
        return builder
      },
      rpc: async () => {
        throw new Error('blockClient allocates no document number')
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const CLIENT_UUID = '11111111-1111-4111-8111-111111111111'

const profile = vi.hoisted(() => ({
  value: null as unknown,
  codesQueried: [] as string[],
}))

vi.mock('../../../lib/queries/clients', () => ({
  getClientRecord: async (code: string) => {
    profile.codesQueried.push(code)
    return profile.value
  },
}))

const { blockClientConfig, blockClient } = await import('../blockClient')

const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

const INPUT: BlockClientInput = {
  clientCode: 'CL-2026-0001',
  blocked: true,
  reason: 'Two unreturned lenses from the Pokhara shoot',
  clientUuid: '55555555-5555-4555-8555-555555555555',
}

const unblocked = () => ({
  id: CLIENT_UUID,
  record: { name: 'Himalayan Films Pvt. Ltd.' },
  deactivatedAtAd: null,
})
const blocked = () => ({
  id: CLIENT_UUID,
  record: { name: 'Himalayan Films Pvt. Ltd.', isBlocked: true },
  deactivatedAtAd: null,
})

const run = (patch: Partial<BlockClientInput> = {}) => blockClientConfig.execute({ ...INPUT, ...patch }, CTX)
const check = (patch: Partial<BlockClientInput> = {}) => blockClientConfig.validate({ ...INPUT, ...patch })

beforeEach(() => {
  access.inserts.length = 0
  access.updates.length = 0
  access.insertThrows = null
  access.insertResult = { data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, error: null }
  access.updateResult = {
    data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', removed_at: '2026-08-12T04:00:00.000Z' },
    error: null,
  }
  db.state.liveFlag = null
  db.state.flagError = null
  db.state.tablesRead.length = 0
  db.state.filters.length = 0
  profile.value = unblocked()
  profile.codesQueried.length = 0
})

describe('BLOCK_CLIENT — validate', () => {
  it('refuses a block that names no client', () => {
    expect(() => check({ clientCode: '  ' })).toThrow(/name the client/i)
  })

  it('refuses a submit with no idempotency key — Law 8', () => {
    expect(() => check({ clientUuid: undefined })).toThrow(/idempotency key/i)
  })

  it.each(['', 'too short', '123456789'])('refuses a block whose reason is %p', (reason) => {
    expect(() => check({ reason })).toThrow(/ten characters/i)
  })

  it('does not require a reason to LIFT a block — no rule makes removal_reason mandatory', () => {
    // 0005:256 argues it should be recorded and stops short of requiring it.
    // TODO(decision) noted in the action; the validator must not invent the rule.
    expect(() => check({ blocked: false, reason: undefined })).not.toThrow()
  })

  it('accepts a well-formed block', () => {
    expect(() => check()).not.toThrow()
  })
})

describe('BLOCK_CLIENT — applying a block', () => {
  it('writes a client_flags row, and never touches clients.status', async () => {
    const result = await run()

    expect(access.inserts).toHaveLength(1)
    expect(access.inserts[0]!.table).toBe('client_flags')
    expect(access.inserts.some((i) => i.table === 'clients')).toBe(false)
    expect(access.updates).toHaveLength(0)
    expect(result.result.flagId).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
  })

  it('addresses the row by the client uuid, never by the code the screens hold', async () => {
    await run()
    expect(profile.codesQueried).toEqual(['CL-2026-0001'])
    expect(access.inserts[0]!.payload['client_id']).toBe(CLIENT_UUID)
    expect(access.inserts[0]!.payload['client_id']).not.toBe('CL-2026-0001')
  })

  it('names the person — client_flags_manual_requires_actor', async () => {
    await run()
    expect(access.inserts[0]!.payload['source']).toBe('Manual')
    expect(access.inserts[0]!.payload['created_by']).toBe(CTX.userId)
    expect(access.inserts[0]!.payload['flag_type']).toBe('Blocked')
    expect(access.inserts[0]!.payload['reason']).toBe(INPUT.reason)
  })

  it('carries the caller’s key, not a freshly minted one — Law 8', async () => {
    await run()
    expect(access.inserts[0]!.payload['client_uuid']).toBe(INPUT.clientUuid)
  })

  it('refuses a second block instead of writing a second live flag row', async () => {
    profile.value = blocked()
    db.state.liveFlag = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }
    await expect(run()).rejects.toThrow(/already blocked/i)
    expect(access.inserts).toHaveLength(0)
  })

  it('turns the one-live-per-kind race into a sentence, not a 400', async () => {
    access.insertThrows =
      '[DataAccess] Insert failed on client_flags: duplicate key value violates unique constraint "client_flags_one_live_per_kind"'
    await expect(run()).rejects.toThrow(/blocked by someone else a moment ago/i)
  })

  it('treats a queued insert as NOT blocked — the database is not enforcing it', async () => {
    access.insertResult = { data: { client_id: CLIENT_UUID }, error: null }
    await expect(run()).rejects.toThrow(/queued rather than written/i)
  })
})

describe('BLOCK_CLIENT — lifting a block', () => {
  beforeEach(() => {
    profile.value = blocked()
    db.state.liveFlag = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }
  })

  it('sets the removal trio on the live row — Law 3, never a delete', async () => {
    const result = await run({ blocked: false, reason: 'Lenses returned and inspected' })

    expect(access.inserts).toHaveLength(0)
    expect(access.updates).toHaveLength(1)
    expect(access.updates[0]!.table).toBe('client_flags')
    expect(access.updates[0]!.id).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
    expect(access.updates[0]!.payload['removed_by']).toBe(CTX.userId)
    expect(access.updates[0]!.payload['removal_reason']).toBe('Lenses returned and inspected')
    expect(typeof access.updates[0]!.payload['removed_at']).toBe('string')
    expect(result.result.blocked).toBe(false)
  })

  it('stamps removed_at as an ISO instant in UTC — Law 7', async () => {
    await run({ blocked: false })
    const at = access.updates[0]!.payload['removed_at'] as string
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('passes the action key to safeUpdate as the offline envelope key, not into the row', async () => {
    await run({ blocked: false })
    expect(access.updates[0]!.clientUuid).toBe(INPUT.clientUuid)
    // `<table>.client_uuid` is the row's INSERT-time key under a unique
    // constraint — stamping a new one per edit destroys insert-side dedup.
    expect('client_uuid' in access.updates[0]!.payload).toBe(false)
  })

  it('stores a blank removal reason as NULL, never as an empty string', async () => {
    await run({ blocked: false, reason: '   ' })
    expect(access.updates[0]!.payload['removal_reason']).toBeNull()
  })

  it('refuses to lift a block that is not there', async () => {
    profile.value = unblocked()
    db.state.liveFlag = null
    await expect(run({ blocked: false })).rejects.toThrow(/not blocked/i)
    expect(access.updates).toHaveLength(0)
  })

  it('treats a queued update as still blocked', async () => {
    access.updateResult = { data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, error: null }
    await expect(run({ blocked: false })).rejects.toThrow(/queued rather than written/i)
  })
})

describe('BLOCK_CLIENT — the ways it refuses', () => {
  it('refuses offline, because a block the database has not seen stops no booking', async () => {
    const original = (globalThis.navigator as { onLine: boolean }).onLine
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    try {
      await expect(run()).rejects.toThrow(/offline/i)
      expect(access.inserts).toHaveLength(0)
      expect(access.updates).toHaveLength(0)
    } finally {
      Object.defineProperty(globalThis.navigator, 'onLine', { value: original ?? true, configurable: true })
    }
  })

  it('refuses a client code that resolves to nothing, rather than writing a flag against nobody', async () => {
    profile.value = null
    await expect(run()).rejects.toThrow(/No client with code CL-2026-0001/)
    expect(access.inserts).toHaveLength(0)
  })

  it('refuses when the block state cannot be read', async () => {
    db.state.flagError = { message: 'permission denied for table client_flags' }
    await expect(run()).rejects.toThrow(/nothing was changed/i)
    expect(access.inserts).toHaveLength(0)
  })
})

describe('BLOCK_CLIENT — the dispatcher, ruled 15 Aug 2026', () => {
  /**
   * **This block used to be the blocker in executable form** — `client.block`
   * resolved to nothing and the dispatcher denied every role, Owner included. It
   * said to rewrite rather than delete when the matrix was ruled. That is this.
   *
   * The narrow list is the database's own distinction, not a tightening invented
   * here. `policy client_flags_insert` splits on the flag: Owner/Admin/Manager
   * for a `Blocked` flag, and additionally Coordinator/Warehouse for every other
   * flag type. This action writes `Blocked`, so it takes the narrow branch —
   * which is why `lib/rbac`'s mirror is named `canBlockClient` and not something
   * about flagging in general.
   */
  const ALLOWED = ['Owner', 'Admin', 'Manager'] as const
  const REFUSED = ['Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client'] as const

  it.each(ALLOWED)('lets %s through the gate and reaches the write', async (role) => {
    await expect(blockClient(INPUT, { ...CTX, role })).resolves.toBeDefined()
    expect(access.inserts).toHaveLength(1)
  })

  it.each(REFUSED)('denies %s by name, and writes nothing', async (role) => {
    await expect(blockClient(INPUT, { ...CTX, role })).rejects.toThrow(/requires client\.block/)
    expect(access.inserts).toHaveLength(0)
  })

  /* The pair that shows the split is real: the same seat may create a client and
     may not block one. */
  it('refuses Coordinator here although clients_insert admits them to CREATE_CLIENT', async () => {
    await expect(blockClient(INPUT, { ...CTX, role: 'Coordinator' })).rejects.toThrow(/requires client\.block/)
    expect(canCreateClient('Coordinator')).toBe(true)
    expect(canBlockClient('Coordinator')).toBe(false)
  })

  it('is implemented — a refusal here is the permission gate, never an unbuilt body', async () => {
    await expect(blockClient(INPUT, { ...CTX, role: 'Driver' })).rejects.not.toThrow(
      /not connected to the database/,
    )
  })
})
