/**
 * CREATE_CLIENT — the write, and the ways it must refuse.
 *
 * Every assertion here pins a failure that is INVISIBLE on the screen. Before
 * this action wrote anything, Add Client showed a green "Client created
 * successfully · CL-2026-0025" toast on a 700 ms timer and navigated away — a
 * saved client, a client rejected by a unique phone, and a client that never
 * left the browser all looked identical to the operator. Only a test can tell
 * them apart.
 *
 * The seams mocked are `lib/dataAccess` (the write) and `lib/supabase` (the
 * number allocator) — the same two `actions/finance/__tests__/recordPayment.test.ts`
 * mocks. Nothing about the action's own logic is stubbed.
 *
 * ⚠ `validate`/`execute` are driven through `createClientConfig`, not through
 * the dispatched `createClient`, because `client.create` resolves to no rule in
 * `lib/rbac` and the dispatcher therefore denies every call before the body
 * runs. That denial is itself pinned, at the bottom of this file — when the
 * capability matrix (`actions/core.ts:45-52`) is ruled, that test is the one
 * that will fail and say so.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PHONE_REJECTION } from '../../../lib/phone'
/* Type-only, so it is erased at compile time and does not evaluate the module
   before the mocks below are installed. */
import type { CreateClientInput } from '../createClient'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updateCalls: [] as unknown[][],
  /** What `idempotentInsert` hands back. Overridden per test to model its odd branches. */
  insertResult: { data: {} as unknown, error: null as unknown },
  /** When set, `idempotentInsert` throws it — how `dataAccess` reports a real failure. */
  insertThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    if (access.insertThrows) throw new Error(access.insertThrows)
    return access.insertResult
  },
  /* Law 3 / create has no update path. Present so an edit that reaches for it
     fails loudly here rather than silently rewriting a client. */
  safeUpdate: async (...args: unknown[]) => {
    access.updateCalls.push(args)
    throw new Error('safeUpdate must never be reached from a client create')
  },
}))

const db = vi.hoisted(() => {
  const state = {
    rpc: { data: 'CL-2026-0001' as unknown, error: null as { message: string } | null },
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  }
  return {
    state,
    supabase: {
      from: () => {
        throw new Error('createClient must not read a table directly')
      },
      rpc: async (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args })
        return state.rpc
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const { createClientConfig, createClient } = await import('../createClient')

const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

/** A well-formed submit from Add Client. */
const INPUT: CreateClientInput = {
  name: '  Himalayan Films Pvt. Ltd.  ',
  phone: '+9779801234567',
  email: 'hello@himalayanfilms.com.np',
  clientType: 'Organisation' as const,
  orgSubtype: 'Production House',
  addressLine: 'Jhamsikhel',
  city: 'Lalitpur',
  district: 'Lalitpur',
  postalCode: '44700',
  country: 'Nepal',
  panVat: '123456789',
  notes: 'Repeat client',
  clientUuid: '55555555-5555-4555-8555-555555555555',
}

const run = (patch: Partial<CreateClientInput> = {}) => createClientConfig.execute({ ...INPUT, ...patch }, CTX)
const check = (patch: Partial<CreateClientInput> = {}) => createClientConfig.validate({ ...INPUT, ...patch })

beforeEach(() => {
  access.inserts.length = 0
  access.updateCalls.length = 0
  access.insertThrows = null
  access.insertResult = {
    data: { id: '66666666-6666-4666-8666-666666666666', client_code: 'CL-2026-0001' },
    error: null,
  }
  db.state.rpc = { data: 'CL-2026-0001', error: null }
  db.state.rpcCalls.length = 0
})

describe('CREATE_CLIENT — validate', () => {
  it('refuses a client with no name', () => {
    expect(() => check({ name: '   ' })).toThrow(/name/i)
  })

  it('refuses a client with no phone, and says why phone is the one that stayed', () => {
    expect(() => check({ phone: '' })).toThrow(/unique identifier/i)
  })

  it.each(['9801234567', '+9779601234567', '+977980123456', '0009779801234567'])(
    'refuses %s with lib/phone’s one wording, rather than inventing a second',
    (bad) => {
      expect(() => check({ phone: bad })).toThrow(PHONE_REJECTION)
    },
  )

  it('refuses a submit with no idempotency key — Law 8', () => {
    // Without it, a retried Save creates a SECOND client that then collides on
    // the phone unique constraint, which reads to the operator as "this client
    // already exists" about a client they have just created twice.
    expect(() => check({ clientUuid: undefined })).toThrow(/idempotency key/i)
  })

  it('refuses isDraft: true rather than accepting a flag it would drop', () => {
    expect(() => check({ isDraft: true })).toThrow(/no draft column|nowhere to be stored/i)
  })

  it('refuses an Organisation with no organisation type — clients_org_subtype_pairing', () => {
    expect(() => check({ orgSubtype: '' })).toThrow(/Organisation/)
  })

  it('refuses an Individual that carries an organisation type', () => {
    expect(() => check({ clientType: 'Individual', orgSubtype: 'Production House' })).toThrow(/Individual/)
  })

  it('refuses a PAN that is not exactly nine digits', () => {
    expect(() => check({ panVat: '12345' })).toThrow(/nine digits/i)
  })

  it('accepts a well-formed submit', () => {
    expect(() => check()).not.toThrow()
  })
})

describe('CREATE_CLIENT — the write', () => {
  it('takes the client code from the database allocator, never from the clock', async () => {
    const result = await run()

    expect(db.state.rpcCalls).toEqual([{ fn: 'next_document_number', args: { p_sequence_key: 'client' } }])
    expect(access.inserts).toHaveLength(1)
    expect(access.inserts[0]!.table).toBe('clients')
    expect(access.inserts[0]!.payload['client_code']).toBe('CL-2026-0001')
    expect(result.result.clientCode).toBe('CL-2026-0001')
    // The shape the previous version minted: `issue('CL', Date.now() % 10000)`.
    expect(String(access.inserts[0]!.payload['client_code'])).not.toMatch(/^CL-\d{1,4}$/)
  })

  it('carries the caller’s client_uuid, not a freshly minted one — Law 8', async () => {
    await run()
    expect(access.inserts[0]!.payload['client_uuid']).toBe(INPUT.clientUuid)
    expect(access.inserts[0]!.payload['client_uuid']).not.toBe('00000000-0000-4000-8000-000000000000')
  })

  it('returns the uuid Postgres generated, never a client-side string', async () => {
    const result = await run()
    expect(result.result.clientId).toBe('66666666-6666-4666-8666-666666666666')
  })

  it('trims the name and stores a blank email as NULL, never as an empty string', async () => {
    await run({ email: '   ' })
    expect(access.inserts[0]!.payload['name']).toBe('Himalayan Films Pvt. Ltd.')
    expect(access.inserts[0]!.payload['email']).toBeNull()
  })

  it('sends org_subtype for an Organisation and omits it entirely for an Individual', async () => {
    await run()
    expect(access.inserts[0]!.payload['type_parent']).toBe('Organisation')
    expect(access.inserts[0]!.payload['org_subtype']).toBe('Production House')

    access.inserts.length = 0
    await run({ clientType: 'Individual', orgSubtype: undefined })
    expect(access.inserts[0]!.payload['type_parent']).toBe('Individual')
    expect('org_subtype' in access.inserts[0]!.payload).toBe(false)
  })

  it('omits type_parent when none was chosen — Unassigned is an absent value, not an invented enum', async () => {
    await run({ clientType: undefined, orgSubtype: undefined })
    expect('type_parent' in access.inserts[0]!.payload).toBe(false)
  })

  it('writes no money and no status — credit is an approved override, Blocked is a flag', async () => {
    await run()
    const payload = access.inserts[0]!.payload
    // 0005:162-164 — no direct UPDATE path for any role including Owner.
    expect('approved_credit_limit' in payload).toBe(false)
    expect('payment_terms' in payload).toBe(false)
    // 0005:149-150 — 'Blocked' is never a client status; it is a client_flags row.
    expect('status' in payload).toBe(false)
    // The enum has no 'Phone' member; the column keeps its {WhatsApp} default.
    expect('preferred_contact_channels' in payload).toBe(false)
    expect('is_blocked' in payload).toBe(false)
  })

  it('names the actor — clients.created_by is who created the record', async () => {
    await run()
    expect(access.inserts[0]!.payload['created_by']).toBe(CTX.userId)
  })
})

describe('CREATE_CLIENT — the ways it refuses', () => {
  it('refuses offline instead of queueing a client with no code the registry issued', async () => {
    const nav = globalThis.navigator as { onLine: boolean } | undefined
    const original = nav?.onLine
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    try {
      await expect(run()).rejects.toThrow(/offline/i)
      expect(access.inserts).toHaveLength(0)
    } finally {
      Object.defineProperty(globalThis.navigator, 'onLine', { value: original ?? true, configurable: true })
    }
  })

  it('refuses when the allocator fails, rather than inventing a code', async () => {
    db.state.rpc = { data: null, error: { message: 'permission denied for table number_sequences' } }
    await expect(run()).rejects.toThrow(/nothing was saved/i)
    expect(access.inserts).toHaveLength(0)
  })

  it('treats a queued insert as NOT saved — the payload comes back with no id', async () => {
    // `dataAccess.ts:49-53`: the 'Failed to fetch'/408 branch returns the payload
    // it was handed, which has no `id` because that column is filled by Postgres.
    access.insertResult = { data: { client_code: 'CL-2026-0001' }, error: null }
    await expect(run()).rejects.toThrow(/queued rather than written/i)
  })

  it('treats a populated error field as NOT saved', async () => {
    // The Law 8 replay branch (`dataAccess.ts:56-58`) returns the raw PostgREST
    // result, so unlike every other path its `error` can be non-null.
    access.insertResult = { data: null, error: { message: 'row not found' } }
    await expect(run()).rejects.toThrow(/could not be confirmed/i)
  })

  it('turns a duplicate phone into a sentence naming the number, not a 400', async () => {
    access.insertThrows =
      '[DataAccess] Insert failed on clients: duplicate key value violates unique constraint "clients_phone_key"'
    await expect(run()).rejects.toThrow(/\+9779801234567 already exists/)
  })

  it('turns the client_code CHECK into a sentence naming the migration — PLAN.md §4.20', async () => {
    // The live CHECK is `^CL-[0-9]{4}-[0-9]{4}$` while `data/numbering.ts` emits
    // `C-1`; 0055 moves the CHECK, the sequence and the allocator together and is
    // not applied. The action picks NEITHER side — it asks the database for the
    // number — but if the two halves are ever out of step this is what the
    // operator must see instead of an unhandled 400.
    access.insertThrows =
      '[DataAccess] Insert failed on clients: new row for relation "clients" violates check constraint "clients_client_code_format"'
    await expect(run()).rejects.toThrow(/0055_ruled_identifier_formats/)
    await expect(run()).rejects.toThrow(/needs a migration, not a retry/)
  })

  it('turns a client_code collision into a sentence naming the sequence, not a retry', async () => {
    access.insertThrows =
      '[DataAccess] Insert failed on clients: duplicate key value violates unique constraint "clients_client_code_key"'
    await expect(run()).rejects.toThrow(/number sequence is behind the codes already in the table/i)
  })

  it('passes an unrecognised database failure through verbatim rather than dressing it up', async () => {
    access.insertThrows = '[DataAccess] Insert failed on clients: connection reset by peer'
    await expect(run()).rejects.toThrow('[DataAccess] Insert failed on clients: connection reset by peer')
  })
})

describe('CREATE_CLIENT — the dispatcher still refuses it', () => {
  /**
   * ⚠ **This test is the blocker, in executable form.**
   *
   * `actions/core.ts:105-126` resolves seven capability strings and
   * `client.create` is not one of them, so `checkCapability` returns `undefined`
   * and the dispatcher denies the action for EVERY role, Owner included — before
   * `validate` or `execute` runs. The rule is not unknown: the live project
   * carries `policy clients_insert with check (auth_user_role() = any (array[
   * 'Owner','Admin','Manager','Coordinator','Warehouse']))`. It simply has no
   * mirror in `lib/rbac`, and writing one is a change to files this task was not
   * given.
   *
   * When the matrix is ruled, this test fails. That is the point: it should not
   * be deleted, it should be rewritten to assert the ruled role list.
   */
  it('denies every role by name, because client.create has no rule in lib/rbac', async () => {
    await expect(createClient(INPUT, CTX)).rejects.toThrow(/requires client\.create/)
    expect(access.inserts).toHaveLength(0)
  })

  it('is implemented — the refusal is the permission gate, not an unbuilt body', async () => {
    // If `implemented` were false the message would be "is not connected to the
    // database yet". It is connected; the capability is what stops it.
    await expect(createClient(INPUT, CTX)).rejects.not.toThrow(/not connected to the database/)
  })
})
