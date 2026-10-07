/**
 * APPROVE_DAILY_CLOSING — the refusals, which are the part that matters.
 *
 * A closing is a signed record, so every way this can decline to write one has
 * to say whether anything was stored. The happy path is one test; the rest are
 * the sentences an operator reads when it did not happen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Paisa } from '../../../lib/money'

const rs = (n: number) => (n * 100) as Paisa

vi.mock('../../../lib/dataAccess', () => ({ idempotentInsert: vi.fn() }))
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  newClientUuid: () => 'uuid-fixed',
}))

const { idempotentInsert } = await import('../../../lib/dataAccess')
const { supabase } = await import('../../../lib/supabase')
const { approveDailyClosingConfig } = await import('../approveDailyClosing')

const asMock = (f: unknown) => f as ReturnType<typeof vi.fn>
const CTX = { userId: 'user-1', role: 'Owner' as const }

const INPUT = {
  businessDate: '2026-09-01',
  countedCash: rs(2500),
  expectedCash: rs(2000),
  variance: rs(500),
  pickupsCount: 6,
  returnsCount: 4,
  newCount: 2,
  collectedCash: rs(2000),
  collectedBank: rs(0),
  collectedCard: rs(0),
  collectedOther: rs(0),
  receivables: rs(0),
  depositsHeld: rs(5825),
  clientUuid: 'uuid-1',
}

/** `users` lookup returns a branch unless a test says otherwise. */
function mockBranch(branch: string | null, error: { message: string } | null = null) {
  asMock(supabase.from).mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: branch ? { branch_id: branch } : null, error }) }) }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBranch('branch-1')
  asMock(idempotentInsert).mockResolvedValue({ data: { id: 'closing-1', approved_at: '2026-09-01T12:00:00Z' }, error: null })
})

const run = (over: Partial<typeof INPUT> = {}) =>
  approveDailyClosingConfig.execute({ ...INPUT, ...over }, CTX)

describe('the write', () => {
  it('stores the day, not the instant — business_date is a date column', async () => {
    await run()
    const payload = asMock(idempotentInsert).mock.calls[0]![1]
    expect(payload.business_date).toBe('2026-09-01')
  })

  it('files it under the approver’s own branch, read rather than assumed', async () => {
    await run()
    expect(asMock(idempotentInsert).mock.calls[0]![1].branch_id).toBe('branch-1')
  })

  it('names the returning columns, so the read-back cannot hit a masked one', async () => {
    /* 0078 revoked table SELECT and granted back 13 non-money columns. An
       unqualified RETURNING * would be denied on counted_cash and the write
       would LOOK like a failure while the row committed. */
    await run()
    const options = asMock(idempotentInsert).mock.calls[0]![2]
    expect(options.returningColumns).toBe('id, approved_at')
  })

  it('carries the idempotency key so a double press is one closing', async () => {
    await run()
    expect(asMock(idempotentInsert).mock.calls[0]![1].client_uuid).toBe('uuid-1')
  })

  it('returns the id Postgres minted', async () => {
    const out = await run()
    expect(out.result.closingId).toBe('closing-1')
  })
})

describe('validate — nothing leaves the screen', () => {
  const v = (over: Partial<typeof INPUT>) => () => approveDailyClosingConfig.validate?.({ ...INPUT, ...over })

  it('refuses a variance that contradicts its own two figures', () => {
    expect(v({ variance: rs(999) })).toThrow(/contradict/i)
  })

  it('refuses a negative count', () => {
    expect(v({ countedCash: -1 as Paisa })).toThrow(/never negative/i)
  })

  it('refuses a day that is not a date', () => {
    expect(v({ businessDate: '1/9/2026' })).toThrow(/YYYY-MM-DD/)
  })

  it('refuses a press with no idempotency key', () => {
    expect(v({ clientUuid: '' })).toThrow(/idempotency/i)
  })
})

describe('refusals — each says whether anything was written', () => {
  it('refuses when the approver has no branch, rather than defaulting to one', async () => {
    /* Defaulting would file one branch's takings under another, silently. */
    mockBranch(null)
    await expect(run()).rejects.toThrow(/carries no branch/i)
  })

  it('says nothing was signed when the branch lookup itself fails', async () => {
    mockBranch(null, { message: 'network down' })
    await expect(run()).rejects.toThrow(/nothing was signed/i)
  })

  it('translates the one-live-closing-per-day index into a sentence with the way out', async () => {
    asMock(idempotentInsert).mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "daily_closings_one_live_per_branch_day"' },
    })
    await expect(run()).rejects.toThrow(/already closed for this branch.*[Vv]oid/s)
  })

  it('reads a client_uuid duplicate as the same press twice, not as a second closing', async () => {
    asMock(idempotentInsert).mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "daily_closings_client_uuid_key"' },
    })
    await expect(run()).rejects.toThrow(/reached the database twice/i)
  })

  it('translates the variance CHECK', async () => {
    asMock(idempotentInsert).mockResolvedValue({
      data: null,
      error: { message: 'new row violates check constraint "daily_closings_variance_agrees"' },
    })
    await expect(run()).rejects.toThrow(/does not match the counted and expected/i)
  })

  it('translates an RLS refusal into a role sentence', async () => {
    asMock(idempotentInsert).mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy for table "daily_closings"' },
    })
    await expect(run()).rejects.toThrow(/may not approve a closing/i)
  })

  it('passes an unrecognised database error through rather than swallowing it', async () => {
    asMock(idempotentInsert).mockResolvedValue({ data: null, error: { message: 'some novel failure' } })
    await expect(run()).rejects.toThrow(/some novel failure/)
  })

  it('refuses to call the day signed when no server row came back', async () => {
    /* The offline branch of idempotentInsert echoes the payload, which has no
       server id. Treating that as success would show "signed" for a closing
       that does not exist. */
    asMock(idempotentInsert).mockResolvedValue({ data: { business_date: '2026-09-01' }, error: null })
    await expect(run()).rejects.toThrow(/NOT signed off/)
  })
})
