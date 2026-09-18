/**
 * `lib/queries/clients.ts` — the three things this conversion added.
 *
 * ## Why this suite lives here and not in `src/lib/queries/__tests__/`
 *
 * That is where it belongs and where it should move. It is here because a
 * concurrent session is adding suites to that directory this session and a
 * `clients.test.ts` collision would have one of us silently overwrite the other.
 * `src/modules/clients/__tests__/` is this change's own assigned ground.
 *
 * ## What is pinned
 *
 * 1. **`is_blocked` reaches `ClientRecord.isBlocked`.** Migration 0054 added the
 *    column and 0054's own closing note asked for exactly this wiring. Until it
 *    landed, a blacklisted client rendered in the directory as an ordinary one —
 *    a false negative on a credit-control signal — and the "Blocked Balance" KPI
 *    counted nothing on every real record. The mapping is asserted in all three
 *    directions (true / false / null) because the FALSE case is the one that
 *    matters for `exactOptionalPropertyTypes`: an un-blocked client must have the
 *    key ABSENT, not present-and-false.
 *
 * 2. **`getClientRecord` addresses a client the way the app links to it.**
 *    Every `/clients/:id` link carries `client_code`, so a lookup by uuid could
 *    never resolve one. It must also return the uuid, because
 *    `invoicesForClient` and `bookings.client_id` take that and silently return
 *    zero rows for a code.
 *
 * 3. **`listMembershipPlans` reads the view, not the table, and keeps `null`.**
 *    `membership_plans_v` NULLs money for a money-blind session; a mapper that
 *    coalesced to 0 would state that the Elite tier extends no credit.
 *
 * The `supabase` module is replaced wholesale, exactly as `queries/__tests__/
 * finance.test.ts` and `bookings.test.ts` do. Nothing here reaches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => {
  interface State {
    table: string
    columns: string
    calls: Array<[string, ...unknown[]]>
    rows: unknown[]
    single: unknown
    error: { message: string } | null
  }

  const state: State = { table: '', columns: '', calls: [], rows: [], single: null, error: null }

  function reset(): void {
    state.table = ''
    state.columns = ''
    state.calls = []
    state.rows = []
    state.single = null
    state.error = null
  }

  /** A recording stand-in for the postgrest builder. Thenable, because the query module `await`s the chain. */
  const builder = {
    select(columns: string) {
      state.columns = columns
      return builder
    },
    eq(column: string, value: unknown) {
      state.calls.push(['eq', column, value])
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    or(filters: string) {
      state.calls.push(['or', filters])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    limit(n: number) {
      state.calls.push(['limit', n])
      return builder
    },
    async maybeSingle() {
      state.calls.push(['maybeSingle'])
      return { data: state.single, error: state.error }
    },
    then(onFulfilled: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown): void {
      onFulfilled({ data: state.rows, error: state.error })
    },
  }

  const supabase = {
    from(table: string) {
      state.table = table
      return builder
    },
  }

  return { state, reset, supabase }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const {
  toClientRecord,
  listClients,
  listClientRecords,
  getClientRecord,
  listMembershipPlans,
  UNJOINED_MEMBERSHIP_PLACEHOLDER,
} = await import('../../../lib/queries/clients')

/**
 * The health engine is imported here on purpose. The dangerous property of
 * `toClientRecord`'s credit-used placeholder is not visible inside this module —
 * it only becomes a defect where a safety check divides by it. Asserting the
 * mapper's output against the real engine is the only way to pin that the two
 * cannot drift back into agreement.
 */
const { clientHealth } = await import('../../rentals/booking/clientHealth')

beforeEach(() => {
  db.reset()
})

/** A complete `client_directory_v` row. Every field is overridable; nothing is optional in the view. */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    client_code: 'CL-2026-0001',
    name: 'Kathmandu Cinema Works',
    phone: '+977 9801234567',
    email: 'hello@kcw.example',
    address_line: 'Jhamsikhel',
    city: 'Lalitpur',
    district: 'Lalitpur',
    country: 'Nepal',
    status: 'Active',
    client_since: '2026-01-04',
    type_parent: 'Organisation',
    pan_vat: '123456789',
    approved_credit_limit: 500000,
    outstanding_amount: 124506,
    deposit_held_amount: 50000,
    total_paid_amount: 900000,
    active_bookings_count: 2,
    total_bookings_count: 14,
    last_pickup_at: null,
    contact_name: 'Sujan Rai',
    contact_designation: 'Producer',
    contact_phone: '+977 9807654321',
    membership_level: 'Elite',
    kyc_docs_count: 3,
    kyc_verified_count: 3,
    deactivated_at: null,
    is_blocked: false,
    ...overrides,
  }
}

const asRow = (o: Record<string, unknown>) => o as any

describe('toClientRecord — the block flag (migration 0054)', () => {
  it('sets isBlocked for a client carrying a live Blocked flag', () => {
    const record = toClientRecord(asRow(row({ is_blocked: true })))
    expect(record.isBlocked).toBe(true)
  })

  it('leaves the key ABSENT for an un-blocked client, never present-and-false', () => {
    const record = toClientRecord(asRow(row({ is_blocked: false })))
    expect('isBlocked' in record).toBe(false)
  })

  it('leaves the key absent when the view returns null', () => {
    const record = toClientRecord(asRow(row({ is_blocked: null })))
    expect('isBlocked' in record).toBe(false)
  })

  it('never invents a block reason — the view carries the boolean only', () => {
    const record = toClientRecord(asRow(row({ is_blocked: true })))
    expect('blockReason' in record).toBe(false)
  })

  it('still refuses to guess credit used — no column, no formula', () => {
    // Guards the field the Credit tab's removed "Utilised" KPI came from: if
    // this ever becomes `outstanding_amount`, that is a ruling, not a fix.
    const record = toClientRecord(asRow(row({ outstanding_amount: 124506 })))
    expect(record.creditUsedPaisa).toBe(0)
  })

  it('and that placeholder can no longer be read as "within the credit limit"', () => {
    // The pairing that made the 0 above dangerous. This record is a real client
    // with a Rs 500,000 approved limit; the 0 beside it is `ClientRecord`'s type
    // obligation, not a measurement. The old `clientHealth` divided one by the
    // other, got 0%, and returned Good — so converting New Booking from
    // `CLIENTS_DATA` to `listClientRecords` would have silently retired the
    // "Credit limit exceeded" blocker with no visible symptom.
    //
    // The check now reports itself unavailable and withholds the verdict.
    const record = toClientRecord(asRow(row({ approved_credit_limit: 500000 })))
    const verdict = clientHealth(record)
    expect(verdict.level).not.toBe('good')
    expect(verdict.reasons.map((r) => r.code)).toContain('credit-check-unavailable')
  })
})

describe('toClientRecord — membership, where the last fabricated value still lives', () => {
  it('passes a real tier through untouched', () => {
    expect(toClientRecord(asRow(row({ membership_level: 'Elite' }))).membership).toBe('Elite')
  })

  it('marks the substituted tier as a placeholder, not a client fact', () => {
    // ⚠ TODO(decision) — `MembershipTier` has no 'None', so a client with no
    // membership row still renders a tier badge they never bought. The value is
    // pinned by NAME rather than by the literal 'Academy': whichever member the
    // placeholder is, the point of this test is that it is the placeholder and
    // not something the database said. Delete this test when the ruling lands
    // and `membership` can be 'None'.
    const record = toClientRecord(asRow(row({ membership_level: null })))
    expect(record.membership).toBe(UNJOINED_MEMBERSHIP_PLACEHOLDER)
  })

  it('carries the truthful answer on ClientProfile, where the type can hold it', async () => {
    db.state.single = row({ membership_level: null })
    await expect(getClientRecord('CL-2026-0001')).resolves.toMatchObject({
      membershipKnown: false,
    })

    db.state.single = row({ membership_level: 'Elite' })
    await expect(getClientRecord('CL-2026-0001')).resolves.toMatchObject({
      membershipKnown: true,
    })
  })

  it('and on the narrow list row, as null rather than a substituted tier', async () => {
    db.state.rows = [row({ membership_level: null }), row({ membership_level: 'Elite' })]
    const items = await listClients()
    expect(items.map((i) => i.membershipLevel)).toEqual([null, 'Elite'])
  })
})

describe('listClientRecords — the select list', () => {
  it('asks the view for is_blocked exactly once', async () => {
    await listClientRecords()
    const tokens = db.state.columns.split(',').map((t) => t.trim())
    expect(tokens.filter((t) => t === 'is_blocked')).toHaveLength(1)
  })

  it('reads client_directory_v, never the clients table', async () => {
    await listClientRecords()
    expect(db.state.table).toBe('client_directory_v')
  })

  it('excludes deactivated clients rather than deleting them (Law 3)', async () => {
    await listClientRecords()
    expect(db.state.calls).toContainEqual(['is', 'deactivated_at', null])
  })
})

describe('getClientRecord', () => {
  it('looks a client_code up on client_code — the shape links from inside Clients carry', async () => {
    db.state.single = row()
    await getClientRecord('CL-2026-0001')
    expect(db.state.table).toBe('client_directory_v')
    expect(db.state.calls).toContainEqual(['eq', 'client_code', 'CL-2026-0001'])
  })

  /*
   * The regression this pair guards, fixed 4 Sep 2026.
   *
   * Eight links from OUTSIDE the clients module build `/clients/:id` from the
   * uuid FK they already hold (`RentalsList.tsx:1834`, `Payments.tsx:854`,
   * `OperationsQueues.tsx:791`, …), because `bookings.ts:341` and
   * `finance.ts:404` map `clientId: r.client_id`. Filtering those on
   * `client_code` could never match — `0055:136` pins the column to
   * `^C-[0-9]+$` — so every one of them rendered "Client not found".
   *
   * The old test asserted the code path and called it "the id every
   * /clients/:id link carries", which is why a P0 sat behind a green suite.
   */
  it('looks a uuid up on id — the shape links from outside Clients carry', async () => {
    db.state.single = row()
    await getClientRecord('11111111-1111-4111-8111-111111111111')
    expect(db.state.table).toBe('client_directory_v')
    expect(db.state.calls).toContainEqual(['eq', 'id', '11111111-1111-4111-8111-111111111111'])
    expect(db.state.calls.some((c) => c[1] === 'client_code')).toBe(false)
  })

  it('resolves a uuid to the same record a code resolves to', async () => {
    db.state.single = row()
    const byUuid = await getClientRecord('11111111-1111-4111-8111-111111111111')
    expect(byUuid?.record.id).toBe('CL-2026-0001')
  })

  it('returns the uuid alongside the record — per-client queries key on it, not on the code', async () => {
    db.state.single = row()
    const profile = await getClientRecord('CL-2026-0001')
    expect(profile?.id).toBe('11111111-1111-4111-8111-111111111111')
    // The record's own `id` stays the code, which is what the screen renders
    // and what every link is built from.
    expect(profile?.record.id).toBe('CL-2026-0001')
  })

  it('opens a closed account and reports the closure (Law 3 — retained and marked)', async () => {
    db.state.single = row({ deactivated_at: '2026-06-01T00:00:00Z' })
    const profile = await getClientRecord('CL-2026-0001')
    expect(profile?.deactivatedAtAd).toBe('2026-06-01T00:00:00Z')
    // Not filtered out: a link to a retained account must still resolve.
    expect(db.state.calls.some((c) => c[0] === 'is' && c[1] === 'deactivated_at')).toBe(false)
  })

  it('returns null for a code that matches nothing — a missing client is not an error', async () => {
    db.state.single = null
    await expect(getClientRecord('CL-2026-9999')).resolves.toBeNull()
  })

  it('throws a named failure when the read itself fails', async () => {
    db.state.error = { message: 'JWT expired' }
    await expect(getClientRecord('CL-2026-0001')).rejects.toThrow(/getClientRecord failed: JWT expired/)
  })
})

describe('listMembershipPlans', () => {
  const plan = (overrides: Record<string, unknown> = {}) => ({
    level: 'Elite',
    label: 'Elite',
    default_credit_limit: 500000,
    individual_discount_pct: 20,
    display_order: 5,
    status: 'Active',
    ...overrides,
  })

  it('reads membership_plans_v, never the base table — money is masked by the view', async () => {
    await listMembershipPlans()
    expect(db.state.table).toBe('membership_plans_v')
  })

  it('excludes retired plans and orders by the plan display order', async () => {
    await listMembershipPlans()
    expect(db.state.calls).toContainEqual(['eq', 'status', 'Active'])
    expect(db.state.calls).toContainEqual(['order', 'display_order', { ascending: true }])
  })

  it('converts the default credit limit from rupees to paisa', async () => {
    db.state.rows = [plan({ default_credit_limit: 2500 })]
    const [first] = await listMembershipPlans()
    expect(first?.defaultCreditLimit).toBe(250000)
  })

  it('keeps a withheld money figure as null rather than collapsing it to zero', async () => {
    db.state.rows = [plan({ default_credit_limit: null, individual_discount_pct: null })]
    const [first] = await listMembershipPlans()
    expect(first?.defaultCreditLimit).toBeNull()
    expect(first?.individualDiscountPct).toBeNull()
  })

  it('drops a row with no level rather than rendering an unnamed tier', async () => {
    db.state.rows = [plan(), plan({ level: null })]
    await expect(listMembershipPlans()).resolves.toHaveLength(1)
  })

  it('falls back to the level when the view returns no label', async () => {
    db.state.rows = [plan({ label: null })]
    const [first] = await listMembershipPlans()
    expect(first?.label).toBe('Elite')
  })

  it('throws a named failure when the read fails', async () => {
    db.state.error = { message: 'permission denied' }
    await expect(listMembershipPlans()).rejects.toThrow(/listMembershipPlans failed: permission denied/)
  })
})
