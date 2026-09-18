/**
 * **The credit-limit gate — pinned so it cannot fail open again.**
 *
 * ## The defect this suite exists to prevent
 *
 * `clientHealth()` raises "Credit limit exceeded" (Red, §12–13), and until
 * 12 Aug 2026 it computed that from `ClientRecord.creditUsedPaisa` divided by
 * `ClientRecord.creditLimitPaisa`.
 *
 * `creditUsedPaisa` has no source. There is no `credit_used` column, no view
 * publishes one, and no formula has been ruled — so `toClientRecord`
 * (`lib/queries/clients.ts`) sets it to `0`, and the only non-zero values
 * anywhere in the app are the hand-typed demo numbers in `CLIENTS_DATA`. The
 * check was therefore correct only for as long as the New Booking screen kept
 * reading the seed. The first time it read real clients, every utilisation
 * would have become `0 / limit = 0`, the blocker would have stopped firing for
 * every client in the business, and **nothing would have looked wrong** — no
 * error, no empty state, no missing figure. A safety gate failing open in
 * silence, on the screen where money decisions are taken.
 *
 * The rule these tests encode: **a credit check that cannot be computed says so
 * and withholds the verdict.** It never passes by default.
 *
 * Nothing here asserts a threshold *value* — those are placeholders awaiting a
 * ruling (see `CLIENT_HEALTH_THRESHOLDS`) and pinning them would freeze a guess.
 * The assertions are about which branch fires, which is a correctness property
 * and not a business decision.
 */
import { describe, expect, it } from 'vitest'

import { rupees, type Paisa } from '../../../../lib/money'
import type { ClientRecord } from '../../../../data/clients'
import { CLIENT_HEALTH_THRESHOLDS, clientHealth, creditCheck } from '../clientHealth'

/** The fields these tests vary. All are required on `ClientRecord`, so spreading them is exact. */
type Vary = Partial<
  Pick<ClientRecord, 'creditLimitPaisa' | 'creditUsedPaisa' | 'outstandingPaisa' | 'kycStatus'>
>

/**
 * A client with nothing wrong with them: no balance, KYC verified, no
 * reliability record, not blocked. Any verdict other than `good` in the tests
 * below therefore comes from the credit branch and nowhere else.
 */
function client(overrides: Vary = {}): ClientRecord {
  return {
    id: 'CL-2026-0001',
    name: 'Kathmandu Cinema Works',
    clientType: 'Organisation',
    membership: 'Creator',
    phone: '+977 9801234567',
    email: 'hello@kcw.example',
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(0),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '—',
    lastRentalBs: '—',
    address: 'Jhamsikhel',
    contactPerson: { name: '—', designation: '—', phone: '—' },
    kycStatus: 'Verified',
    kycDocsCount: 1,
    totalRentalsCount: 0,
    totalSpentPaisa: rupees(0),
    ...overrides,
  }
}

const codes = (record: ClientRecord, signals?: { creditUsedPaisa?: Paisa }) =>
  (signals ? clientHealth(record, signals) : clientHealth(record)).reasons.map((r) => r.code)

describe('creditCheck — three states, because two of them used to share one', () => {
  it('reports not-applicable when no credit facility is configured', () => {
    expect(creditCheck(client({ creditLimitPaisa: rupees(0) }))).toEqual({ state: 'not-applicable' })
  })

  it('reports unavailable when a limit IS configured but nothing supplies credit used', () => {
    const check = creditCheck(client({ creditLimitPaisa: rupees(500_000) }))
    expect(check.state).toBe('unavailable')
  })

  it('never reads ClientRecord.creditUsedPaisa — that field has no source', () => {
    // The record claims a number. The engine still refuses to use it, because
    // the field cannot distinguish a real figure from `toClientRecord`'s
    // placeholder 0. If this ever returns `computed`, the gate is back on the
    // fabricated field and the silent failure is back with it.
    const check = creditCheck(
      client({ creditLimitPaisa: rupees(500_000), creditUsedPaisa: rupees(9_000_000) }),
    )
    expect(check.state).toBe('unavailable')
  })

  it('computes only from a signal a caller genuinely supplied', () => {
    const check = creditCheck(client({ creditLimitPaisa: rupees(400_000) }), {
      creditUsedPaisa: rupees(100_000),
    })
    expect(check).toEqual({
      state: 'computed',
      ratio: 0.25,
      usedPaisa: rupees(100_000),
      limitPaisa: rupees(400_000),
    })
  })
})

describe('clientHealth — the credit gate fails closed', () => {
  it('raises a CRITICAL when the check cannot be run, rather than passing the client', () => {
    const verdict = clientHealth(client({ creditLimitPaisa: rupees(500_000) }))
    expect(verdict.reasons.map((r) => r.code)).toContain('credit-check-unavailable')
    expect(verdict.reasons.find((r) => r.code === 'credit-check-unavailable')?.severity).toBe('critical')
    expect(verdict.level).toBe('attention')
    expect(verdict.label).toBe('Attention Required')
  })

  it('says so in words — the colour never carries this alone', () => {
    const verdict = clientHealth(client({ creditLimitPaisa: rupees(500_000) }))
    const reason = verdict.reasons.find((r) => r.code === 'credit-check-unavailable')
    expect(reason?.text).toMatch(/could not be run/i)
    // "Unverified" and "within limit" are different claims and the sentence has
    // to make that distinction, because passing silently is the whole defect.
    expect(reason?.text).toMatch(/unverified/i)
    expect(verdict.summary).toContain(reason?.text ?? '')
  })

  it('REGRESSION: a record carrying the placeholder credit-used never reads as good', () => {
    // This is the exact shape `toClientRecord` produces for a real client with
    // an approved limit: credit used 0, because there is nowhere to get it from.
    // Under the old engine this was `0 / 500000 = 0` — comfortably inside the
    // limit — and the client came back Good.
    const asMappedFromPostgres = client({
      creditLimitPaisa: rupees(500_000),
      creditUsedPaisa: rupees(0),
    })
    expect(clientHealth(asMappedFromPostgres).level).not.toBe('good')
    expect(codes(asMappedFromPostgres)).toContain('credit-check-unavailable')
  })

  it('does not ALSO emit the softer "approaching" warning while unavailable', () => {
    // An unavailable check must not produce a reassuring percentage beside its
    // own critical — there is no percentage to report.
    expect(codes(client({ creditLimitPaisa: rupees(500_000) }))).not.toContain('credit-approaching')
  })

  it('stays silent about credit when there is no facility to exceed', () => {
    // Not a gap in the data: `approved_credit_limit` is a real column and
    // "none configured" is a real answer, so there is nothing to withhold.
    const verdict = clientHealth(client({ creditLimitPaisa: rupees(0) }))
    expect(verdict.reasons.map((r) => r.code)).not.toContain('credit-check-unavailable')
    expect(verdict.level).toBe('good')
  })
})

describe('clientHealth — the gate still works when the figure is real', () => {
  const limit = rupees(400_000)

  it('raises "credit limit exceeded" from a supplied figure above the limit', () => {
    const verdict = clientHealth(client({ creditLimitPaisa: limit }), {
      creditUsedPaisa: rupees(500_000),
    })
    expect(verdict.reasons.map((r) => r.code)).toContain('credit-exceeded')
    expect(verdict.level).toBe('attention')
  })

  it('raises the approaching WARNING between the threshold and the limit', () => {
    const used = (limit * CLIENT_HEALTH_THRESHOLDS.creditLimitApproachingRatio) as Paisa
    const verdict = clientHealth(client({ creditLimitPaisa: limit }), { creditUsedPaisa: used })
    expect(verdict.reasons.map((r) => r.code)).toContain('credit-approaching')
    expect(verdict.level).toBe('warning')
  })

  it('passes a client genuinely well inside their limit — the gate is not stuck closed', () => {
    const verdict = clientHealth(client({ creditLimitPaisa: limit }), {
      creditUsedPaisa: rupees(10_000),
    })
    expect(verdict.level).toBe('good')
    expect(verdict.reasons).toEqual([])
  })
})

describe('clientHealth — blocked and overdue status (AUD-026)', () => {
  it('marks blocked client as attention required with on-stop reason', () => {
    const blockedClient = {
      ...client(),
      isBlocked: true,
      blockReason: 'Non-payment of past invoice',
    }
    const verdict = clientHealth(blockedClient)
    expect(verdict.level).toBe('attention')
    expect(verdict.reasons.map((r) => r.code)).toContain('on-stop')
    expect(verdict.reasons.find((r) => r.code === 'on-stop')?.text).toContain('Non-payment of past invoice')
  })

  it('marks client with significant outstanding balance as attention required', () => {
    const overdueClient = {
      ...client(),
      outstandingPaisa: rupees(60_000), // > significantOutstandingPaisa (50,000)
    }
    const verdict = clientHealth(overdueClient)
    expect(verdict.level).toBe('attention')
    expect(verdict.reasons.map((r) => r.code)).toContain('outstanding-significant')
  })
})

