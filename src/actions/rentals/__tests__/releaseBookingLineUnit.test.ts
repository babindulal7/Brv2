/**
 * RELEASE_BOOKING_LINE_UNIT — what this suite pins.
 *
 * §4.39 ruled (a): an assignment ends by release, never by delete. The pins
 * are the seams a later edit would most plausibly break:
 *
 *  1. **The write is an UPDATE on `booking_line_units`** carrying exactly the
 *     release pair — `released_at` (an ISO instant) and `released_by` (the
 *     actor) — under the caller's Law 8 key. Nothing else is touched; the
 *     freeze is 0076's trigger, not a bigger payload.
 *  2. **The gate is `unit.release` → `canWriteBookingDesk`** — the §4.20
 *     mirror of `booking_line_units_all`. Warehouse releases; Accounts is
 *     refused; **Technician is refused too**, though they pack — BOOKING_DESK
 *     deliberately excludes them and the live policy agrees.
 *  3. **Law 8 is enforced, not decorative** — no key, no send.
 *  4. **0076's freeze trigger reads as "already released"**, not as a raw
 *     trigger message, and the missing-column state (0076 drafted, unapplied)
 *     names the migration instead of leaking 42703.
 *  5. **An unconfirmed write is not a success** — a result without the
 *     released_at Postgres accepted must be reported as still assigned.
 *
 * Seam mocked: `lib/dataAccess` only. The dispatcher runs for real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActionPermissionError } from '../../core'
import type { ReleaseBookingLineUnitInput } from '../releaseBookingLineUnit'

const access = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown>; clientUuid: string | undefined }>,
  updateResult: { data: {} as unknown, error: null as unknown },
  updateThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>, clientUuid?: string) => {
    access.updates.push({ table, id, payload, clientUuid })
    if (access.updateThrows) throw new Error(access.updateThrows)
    return access.updateResult
  },
}))

const { releaseBookingLineUnit } = await import('../releaseBookingLineUnit')

const WAREHOUSE = { userId: 'usr-warehouse', role: 'Warehouse' as const }
const ACCOUNTS = { userId: 'usr-accounts', role: 'Accounts' as const }
const TECHNICIAN = { userId: 'usr-tech', role: 'Technician' as const }

const UNIT_ROW = '11111111-2222-4333-8444-555555555555'
const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const input = (over: Partial<ReleaseBookingLineUnitInput> = {}): ReleaseBookingLineUnitInput => ({
  unitRowId: UNIT_ROW,
  unitLabel: 'SN-CAM-0001',
  clientUuid: KEY,
  ...over,
})

beforeEach(() => {
  access.updates = []
  access.updateResult = { data: { id: UNIT_ROW, released_at: '2026-08-31T10:00:00.000Z' }, error: null }
  access.updateThrows = null
})

describe('the write', () => {
  it('updates booking_line_units with exactly the release pair, under the caller’s key', async () => {
    const res = await releaseBookingLineUnit(input(), WAREHOUSE)

    expect(access.updates).toHaveLength(1)
    const sent = access.updates[0]!
    expect(sent.table).toBe('booking_line_units')
    expect(sent.id).toBe(UNIT_ROW)
    expect(sent.clientUuid).toBe(KEY)
    expect(Object.keys(sent.payload).sort()).toEqual(['released_at', 'released_by'])
    expect(sent.payload['released_by']).toBe('usr-warehouse')
    expect(typeof sent.payload['released_at']).toBe('string')
    expect(Number.isNaN(Date.parse(sent.payload['released_at'] as string))).toBe(false)

    expect(res.unitRowId).toBe(UNIT_ROW)
    expect(res.releasedAt).toBe('2026-08-31T10:00:00.000Z')
  })
})

describe('the gate — §4.20 mirror of booking_line_units_all', () => {
  it('refuses Accounts before anything observable happens', async () => {
    await expect(releaseBookingLineUnit(input(), ACCOUNTS)).rejects.toBeInstanceOf(ActionPermissionError)
    expect(access.updates).toHaveLength(0)
  })

  it('refuses Technician — packing a unit and ending its assignment are different jobs', async () => {
    await expect(releaseBookingLineUnit(input(), TECHNICIAN)).rejects.toBeInstanceOf(ActionPermissionError)
    expect(access.updates).toHaveLength(0)
  })

  it('refuses a call without a session context', async () => {
    await expect(releaseBookingLineUnit(input())).rejects.toThrow(/session context/)
    expect(access.updates).toHaveLength(0)
  })
})

describe('Law 8', () => {
  it('refuses a release with no idempotency key, and sends nothing', async () => {
    await expect(releaseBookingLineUnit(input({ clientUuid: undefined }), WAREHOUSE)).rejects.toThrow(/idempotency key/)
    expect(access.updates).toHaveLength(0)
  })
})

describe('the refusals that come back from the database', () => {
  it('translates 0076’s freeze trigger to "already released"', async () => {
    access.updateThrows =
      'This unit assignment was released at 2026-08-31T09:00:00Z and is history (§4.39a): it cannot be edited, un-released, or re-released.'
    await expect(releaseBookingLineUnit(input(), WAREHOUSE)).rejects.toThrow(/already released/)
  })

  it('names migration 0076 when the release columns do not exist yet', async () => {
    access.updateThrows = 'column "released_at" of relation "booking_line_units" does not exist'
    await expect(releaseBookingLineUnit(input(), WAREHOUSE)).rejects.toThrow(/0076/)
  })

  it('reports an unconfirmed write as still assigned, never as done', async () => {
    access.updateResult = { data: null, error: null }
    await expect(releaseBookingLineUnit(input(), WAREHOUSE)).rejects.toThrow(/still assigned/)
  })
})
