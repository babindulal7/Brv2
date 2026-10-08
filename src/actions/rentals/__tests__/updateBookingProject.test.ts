import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * # UPDATE_BOOKING_PROJECT — what this suite pins
 *
 * The narrow project-type edit is the ONLY header writer besides
 * `create_booking` and the stage engine, so each property is asserted:
 *
 * 1. **It writes exactly two columns** (`project_type`, `project_type_other`)
 *    via `safeUpdate` — never money, never stage, never anything else.
 * 2. **The allow-list is enforced before the write**, with the Other pairing
 *    rule in both directions.
 * 3. **No-op edits write nothing and audit nothing** — same value in, no row
 *    out (the createRental replay rule applied to edits).
 * 4. **The audit row carries old → new**, who, and the booking.
 * 5. **A failed write throws with the old value intact** — the caller keeps
 *    rendering it (§42 rollback: never show what the database did not save).
 */

const db = vi.hoisted(() => {
  const state = {
    head: {
      id: 'booking-uuid-1',
      booking_no: 'B-715',
      branch_id: 'branch-1',
      project_type: 'Documentary',
      project_type_other: null,
    } as Record<string, unknown>,
  }
  function reset(): void {
    state.head = {
      id: 'booking-uuid-1',
      booking_no: 'B-715',
      branch_id: 'branch-1',
      project_type: 'Documentary',
      project_type_other: null,
    }
  }
  return { state, reset }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { ...db.state.head }, error: null }),
        }),
      }),
    }),
  },
  newClientUuid: () => 'test-action-key',
}))

const writes = vi.hoisted(() => {
  const state = {
    updates: [] as Array<{ table: string; id: string; payload: Record<string, unknown> }>,
    failUpdate: false,
  }
  function reset(): void {
    state.updates = []
    state.failUpdate = false
  }
  return { state, reset }
})

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>) => {
    if (writes.state.failUpdate) throw new Error('[DataAccess] Update failed on bookings: row is locked')
    writes.state.updates.push({ table, id, payload })
    return { data: { ...payload, id }, error: null }
  },
}))

const audits = vi.hoisted(() => {
  const state = { rows: [] as Array<Record<string, unknown>> }
  function reset(): void {
    state.rows = []
  }
  return { state, reset }
})

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: async (params: Record<string, unknown>) => {
    audits.state.rows.push(params)
    return { ok: true, error: null }
  },
}))

const { updateBookingProject, updateBookingProjectConfig } = await import('../updateBookingProject')

const OWNER = { userId: 'usr-owner', role: 'Owner' as const, isOnline: true }

async function run(input: Parameters<typeof updateBookingProjectConfig.validate>[0]) {
  await updateBookingProjectConfig.validate(input)
  return updateBookingProject(input, {
    userId: OWNER.userId,
    role: OWNER.role,
    isOnline: true,
  })
}

beforeEach(() => {
  db.reset()
  writes.reset()
  audits.reset()
})

describe('validation', () => {
  it('refuses a value outside the allow-list before anything is read', async () => {
    await expect(run({ id: 'B-715', projectType: 'doc shoot' })).rejects.toThrow(/from the list/)
  })

  it('refuses Other without its description, and a description without Other', async () => {
    await expect(run({ id: 'B-715', projectType: 'Other', projectTypeOther: ' ' })).rejects.toThrow(/Describe/)
    await expect(run({ id: 'B-715', projectType: 'Wedding', projectTypeOther: 'Beach' })).rejects.toThrow(/only used with Other/)
  })

  it('refuses an empty idempotency key', async () => {
    await expect(run({ id: 'B-715', projectType: 'Wedding', clientUuid: '  ' })).rejects.toThrow(/idempotency key/)
  })
})

describe('the write', () => {
  it('writes exactly the two project columns and returns the read-back row', async () => {
    const out = await run({ id: 'B-715', projectType: 'Feature Film' })
    expect(writes.state.updates).toHaveLength(1)
    expect(writes.state.updates[0]).toEqual({
      table: 'bookings',
      id: 'booking-uuid-1',
      payload: { project_type: 'Feature Film', project_type_other: null },
    })
    expect(out).toMatchObject({ bookingNo: 'B-715', projectType: 'Feature Film', projectTypeOther: null, unchanged: false })
  })

  it('writes an Other description alongside Other', async () => {
    const out = await run({ id: 'B-715', projectType: 'Other', projectTypeOther: 'Live Theatre' })
    expect(writes.state.updates[0]?.payload).toEqual({ project_type: 'Other', project_type_other: 'Live Theatre' })
    expect(out.projectTypeOther).toBe('Live Theatre')
  })

  it('clears back to unset with null', async () => {
    const out = await run({ id: 'B-715', projectType: null })
    expect(writes.state.updates[0]?.payload).toEqual({ project_type: null, project_type_other: null })
    expect(out.projectType).toBeNull()
  })

  it('writes nothing and audits nothing when nothing differs', async () => {
    const out = await run({ id: 'B-715', projectType: 'Documentary' })
    expect(out.unchanged).toBe(true)
    expect(writes.state.updates).toHaveLength(0)
    expect(audits.state.rows).toHaveLength(0)
  })

  it('audits old → new with the actor and the booking', async () => {
    await run({ id: 'B-715', projectType: 'Wedding' })
    expect(audits.state.rows).toHaveLength(1)
    expect(audits.state.rows[0]).toMatchObject({
      tableName: 'bookings',
      recordId: 'booking-uuid-1',
      action: 'Update',
      actorId: 'usr-owner',
      oldValues: { project_type: 'Documentary', project_type_other: null },
      newValues: { project_type: 'Wedding', project_type_other: null },
    })
  })

  it('throws with the old value intact when the write fails', async () => {
    writes.state.failUpdate = true
    await expect(run({ id: 'B-715', projectType: 'Wedding' })).rejects.toThrow(/Update failed on bookings/)
    expect(audits.state.rows).toHaveLength(0)
  })
})
