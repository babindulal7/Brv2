/**
 * `logAuditEvent`'s contract — `R3-5` / `PLAN.md` §4.36.
 *
 * Two things are pinned here, and neither of them is the open ruling.
 *
 * 1. **The write does not ask for a read.** `audit_events` grants INSERT to all
 *    staff and SELECT to Owner/Admin/Manager only, so `.insert().select()`
 *    made every Warehouse audit write fail *after committing the row*. The
 *    engine must pass `returnRow: false`. Asserted on the call, because the
 *    permission it avoids cannot be reproduced without a live database and a
 *    real Warehouse JWT — see §4.33(2), which is why no such session exists to
 *    test against yet.
 *
 * 2. **A failure is reported, never swallowed, and never thrown.** Thrown would
 *    turn an audit outage into an unhandled rejection inside a business verb;
 *    swallowed is the defect itself.
 *
 * What a CALLER should do with `ok: false` is §4.36 and is deliberately not
 * asserted anywhere — there is nothing to pin until it is ruled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const idempotentInsert = vi.fn()
vi.mock('../dataAccess', () => ({
  idempotentInsert: (...args: unknown[]) => idempotentInsert(...args),
}))

const { logAuditEvent } = await import('../audit')

/** The shape every test writes; individual tests vary only what matters. */
const PARAMS = {
  module: 'Operations',
  action: 'Update',
  tableName: 'operation_sessions',
  recordId: 'sess-1',
} as unknown as Parameters<typeof logAuditEvent>[0]

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  idempotentInsert.mockReset()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('the audit write does not require read permission it does not have', () => {
  it('inserts into audit_events with returnRow false', async () => {
    idempotentInsert.mockResolvedValue({ data: null, error: null })

    await logAuditEvent(PARAMS)

    expect(idempotentInsert).toHaveBeenCalledTimes(1)
    const [table, , options] = idempotentInsert.mock.calls[0] as [string, unknown, unknown]
    expect(table).toBe('audit_events')
    // The whole of `R3-5`'s mechanical half is this one option. If a refactor
    // drops it, Warehouse audit rows start vanishing again and nothing else in
    // the suite would notice.
    expect(options).toEqual({ returnRow: false })
  })
})

describe('a failed audit write is reported rather than swallowed', () => {
  it('returns ok:false carrying the error instead of throwing', async () => {
    const boom = new Error('permission denied for table audit_events')
    idempotentInsert.mockRejectedValue(boom)

    // Not `.rejects` — throwing is as wrong as swallowing. A business verb must
    // be able to await this without a try/catch around every call site.
    const result = await logAuditEvent(PARAMS)

    expect(result.ok).toBe(false)
    expect(result.error).toBe(boom)
  })

  it('wraps a non-Error rejection rather than leaking it raw', async () => {
    idempotentInsert.mockRejectedValue('a string, because Postgrest can do that')

    const result = await logAuditEvent(PARAMS)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toContain('Postgrest')
  })

  it('still logs to console — the signal was never the problem, being the ONLY signal was', async () => {
    idempotentInsert.mockRejectedValue(new Error('nope'))

    await logAuditEvent(PARAMS)

    expect(consoleError).toHaveBeenCalled()
  })

  it('returns ok:true with a null error on success', async () => {
    idempotentInsert.mockResolvedValue({ data: null, error: null })

    const result = await logAuditEvent(PARAMS)

    expect(result).toEqual({ ok: true, error: null })
  })
})

describe('defaults the caller relies on', () => {
  it('sends Desktop as device_type when the caller names none', async () => {
    idempotentInsert.mockResolvedValue({ data: null, error: null })

    await logAuditEvent(PARAMS)

    const [, payload] = idempotentInsert.mock.calls[0] as [string, Record<string, unknown>]
    // `'Web / Desktop'` is not a member of the `device_type` enum — a previous
    // version sent it, so every audit write Postgres saw was rejected on an
    // invalid enum and swallowed by the catch. Pinned so it cannot come back.
    expect(payload['device_type']).toBe('Desktop')
  })

  it('passes the record it was given through unchanged', async () => {
    idempotentInsert.mockResolvedValue({ data: null, error: null })

    await logAuditEvent(PARAMS)

    const [, payload] = idempotentInsert.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload['table_name']).toBe('operation_sessions')
    expect(payload['record_id']).toBe('sess-1')
  })
})
