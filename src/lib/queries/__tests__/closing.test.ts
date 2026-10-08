/**
 * The closing aggregation, and the variance wording the digest prints.
 *
 * `varianceLine` is pure and is tested directly. `fetchDailyClosing` is tested
 * through mocked queries — the point is not that Supabase works, it is that the
 * five channel groups land in the four buckets the ruled digest has room for,
 * that a payment with NO channel is counted rather than dropped, and that the
 * counts come from the server's count rather than from a page of rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Paisa } from '../../money'

const rs = (n: number) => (n * 100) as Paisa

/*
 * `operationalDayRange` is mocked with the REAL boundary arithmetic on purpose
 * (FI-06). What the test below asserts is that "New bookings" is counted over
 * the same OPERATIONAL day as the two movement counts beside it, and a stub
 * returning `{}` would assert nothing at all. `lib/operationalDay.ts` is the
 * pure half — it reads no storage and pulls in no Supabase — so it is safe to
 * import here; the real `queries/bookings.ts` differs only in reading the
 * day-start from the setting rather than taking the ruled default.
 */
vi.mock('../bookings', async () => {
  const { operationalDayBounds, operationalDayOf, OPERATIONAL_DAY_START_DEFAULT_MINUTES: START } = await import(
    '../../operationalDay'
  )
  return {
    listBookings: vi.fn(),
    todaysOutgoing: () => ({}),
    todaysIncoming: () => ({}),
    operationalDayRange: (dayAd: string) => operationalDayBounds(operationalDayOf(dayAd, START), START),
  }
})
vi.mock('../finance', () => ({
  listPayments: vi.fn(),
  listInvoices: vi.fn(),
  outstandingInvoices: () => ({}),
  paymentsInPeriod: () => ({}),
}))
vi.mock('../clients', () => ({ sumDepositsHeld: vi.fn() }))

const { listBookings } = await import('../bookings')
const { listPayments, listInvoices } = await import('../finance')
const { sumDepositsHeld } = await import('../clients')
const { fetchDailyClosing, varianceLine, bookingsCreatedOn } = await import('../closing')

const asMock = (f: unknown) => f as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  /* Counts arrive as `total`; `rows` is deliberately a SHORTER page so a test
     that passed by reading rows.length would fail here. */
  asMock(listBookings)
    .mockResolvedValueOnce({ rows: [{}], total: 6 })
    .mockResolvedValueOnce({ rows: [], total: 4 })
    .mockResolvedValueOnce({ rows: [], total: 2 })
  asMock(listPayments).mockResolvedValue({ rows: [] })
  asMock(listInvoices).mockResolvedValue({ rows: [] })
  asMock(sumDepositsHeld).mockResolvedValue({ total: 0, clients: 0 })
})

const DAY = '2026-08-05T06:00:00.000Z'

describe('fetchDailyClosing — the counts', () => {
  it('takes the server count, never the length of one page of rows', async () => {
    const out = await fetchDailyClosing(DAY)
    expect(out.pickupsCount).toBe(6)
    expect(out.returnsCount).toBe(4)
    expect(out.newCount).toBe(2)
  })

  it('falls back to rows only when the server gave no count', async () => {
    /* `clearAllMocks` clears CALLS, not the queue `mockResolvedValueOnce` built
       in `beforeEach` — reset the implementation or the outer queue answers
       first and this test passes for the wrong reason. */
    asMock(listBookings).mockReset()
    asMock(listBookings)
      .mockResolvedValueOnce({ rows: [{}, {}], total: null })
      .mockResolvedValueOnce({ rows: [], total: null })
      .mockResolvedValueOnce({ rows: [], total: null })
    asMock(listPayments).mockResolvedValue({ rows: [] })
    asMock(listInvoices).mockResolvedValue({ rows: [] })
    asMock(sumDepositsHeld).mockResolvedValue({ total: 0, clients: 0 })
    expect((await fetchDailyClosing(DAY)).pickupsCount).toBe(2)
  })
})

/**
 * FI-02 — the two money sums are reductions over rows, so they are only right
 * when every row was read. A one-page read of a two-page day is a smaller
 * number that looks exactly like the right one, and it would then be signed.
 */
describe('fetchDailyClosing — a sum is only signed over a complete read', () => {
  const pageOf = (n: number, amount: number) =>
    Array.from({ length: n }, () => ({ amount: rs(amount), channelGroup: 'Cash' }))

  it('asks every row-sum read for the server count', async () => {
    await fetchDailyClosing(DAY)
    for (const call of [...asMock(listPayments).mock.calls, ...asMock(listInvoices).mock.calls]) {
      expect(call[0]).toMatchObject({ withCount: true })
    }
  })

  it('pages payments until the server count is met, and sums all of them', async () => {
    asMock(listPayments)
      .mockResolvedValueOnce({ rows: pageOf(1000, 10), total: 1200 })
      .mockResolvedValueOnce({ rows: pageOf(200, 10), total: 1200 })
    const out = await fetchDailyClosing(DAY)
    expect(out.collected.cash).toBe(rs(12_000))
    expect(asMock(listPayments).mock.calls.map((c) => c[0].page)).toEqual([
      { index: 0, size: 1000 },
      { index: 1, size: 1000 },
    ])
  })

  it('refuses a short page of payments with a stated reason rather than signing a short figure', async () => {
    asMock(listPayments).mockResolvedValue({ rows: pageOf(2, 10), total: 5 })
    await expect(fetchDailyClosing(DAY)).rejects.toThrow(/5 payments today but only 2 were read/)
  })

  it('refuses a short page of invoices on the same terms', async () => {
    asMock(listInvoices).mockResolvedValue({ rows: [{ outstandingAmount: rs(1), isVoid: false }], total: 3 })
    await expect(fetchDailyClosing(DAY)).rejects.toThrow(/3 outstanding invoices but only 1 were read/)
  })

  it('accepts a short page only when it IS the whole result', async () => {
    asMock(listPayments).mockResolvedValue({ rows: pageOf(2, 10), total: 2 })
    expect((await fetchDailyClosing(DAY)).collected.cash).toBe(rs(20))
  })
})

describe('fetchDailyClosing — five channel groups into four buckets', () => {
  beforeEach(() => {
    asMock(listPayments).mockResolvedValue({
      rows: [
        { amount: rs(1000), channelGroup: 'Cash' },
        { amount: rs(2000), channelGroup: 'Bank' },
        { amount: rs(300), channelGroup: 'Cards' },
        { amount: rs(700), channelGroup: 'Digital wallets' },
        { amount: rs(50), channelGroup: 'Other' },
        { amount: rs(25), channelGroup: null },
      ],
    })
  })

  it('keeps cash, bank and cards on their own lines', async () => {
    const c = (await fetchDailyClosing(DAY)).collected
    expect(c.cash).toBe(rs(1000))
    expect(c.bank).toBe(rs(2000))
    expect(c.card).toBe(rs(300))
  })

  it('folds wallets, Other and unclassified into the one bucket the digest has', async () => {
    const c = (await fetchDailyClosing(DAY)).collected
    expect(c.other).toBe(rs(775))
  })

  it('never drops a payment — the four buckets add up to the total taken', async () => {
    const c = (await fetchDailyClosing(DAY)).collected
    expect(c.cash + c.bank + c.card + c.other).toBe(c.total)
    expect(c.total).toBe(rs(4075))
  })

  it('keeps the wallet split visible for the screen, since the message cannot carry it', async () => {
    const c = (await fetchDailyClosing(DAY)).collected
    expect(c.digitalWallets).toBe(rs(700))
  })

  it('counts a payment with no channel rather than guessing one', async () => {
    const c = (await fetchDailyClosing(DAY)).collected
    expect(c.unclassified).toBe(rs(25))
  })
})

describe('fetchDailyClosing — the standing position', () => {
  it('sums outstanding across live invoices and ignores voided ones', async () => {
    asMock(listInvoices).mockResolvedValue({
      rows: [
        { outstandingAmount: rs(5000), isVoid: false },
        { outstandingAmount: rs(9999), isVoid: true },
        { outstandingAmount: rs(2500), isVoid: false },
      ],
    })
    expect((await fetchDailyClosing(DAY)).receivablesTotal).toBe(rs(7500))
  })

  /**
   * FI-01 — the liability comes from `sumDepositsHeld`, which reads every
   * client (deactivated included) and count-checks itself. It is NOT rebuilt
   * here from `listClients`, whose 100-newest-active page understated it.
   */
  it('takes deposits held from the all-clients reader, as given', async () => {
    asMock(sumDepositsHeld).mockResolvedValue({ total: rs(1500), clients: 3 })
    expect((await fetchDailyClosing(DAY)).depositsHeld).toBe(rs(1500))
    expect(sumDepositsHeld).toHaveBeenCalledTimes(1)
  })

  it('rejects the whole read if one query fails, rather than reporting a silent zero', async () => {
    asMock(sumDepositsHeld).mockRejectedValue(new Error('deposits unavailable'))
    await expect(fetchDailyClosing(DAY)).rejects.toThrow('deposits unavailable')
  })

  it('carries the note that two different days are in the object', async () => {
    const out = await fetchDailyClosing(DAY)
    expect(out.dayBoundaryNote).toMatch(/operational day/i)
    expect(out.dayBoundaryNote).toMatch(/calendar day/i)
  })
})

describe('varianceLine', () => {
  const f = (p: Paisa) => `Rs ${Math.round(p / 100)}`

  it('says "not counted" for a drawer nobody has counted — never "balanced"', () => {
    /* An uncounted drawer reported as balanced is a closing that claims a
       reconciliation which never happened. */
    expect(varianceLine(rs(5000), null, f)).toBe('not counted')
  })

  it('reads as a sentence when it matches, not as Rs 0', () => {
    expect(varianceLine(rs(5000), rs(5000), f)).toBe('balanced')
  })

  it('names a shortfall and a surplus in the operator’s direction', () => {
    expect(varianceLine(rs(5000), rs(4500), f)).toBe('Rs 500 short')
    expect(varianceLine(rs(5000), rs(5200), f)).toBe('Rs 200 over')
  })

  it('treats a genuine zero count as counted, and as the shortfall it is', () => {
    expect(varianceLine(rs(5000), rs(0), f)).toBe('Rs 5000 short')
  })
})

describe('bookingsCreatedOn', () => {
  it('filters on created_at, not on a stage transition', () => {
    expect(bookingsCreatedOn(DAY).dateRange.column).toBe('created_at')
  })

  it('excludes cancellations by flag, since Cancelled is not a stage', () => {
    expect(bookingsCreatedOn(DAY).presence).toEqual({ cancelled_at: false })
  })

  /*
   * FI-06. The bounds were `setUTCHours(0,0,0,0)` / `23:59:59.999` — midnight
   * UTC, i.e. 05:45 → 05:45 in Kathmandu — so the Daily Closing screen put its
   * "New bookings" figure on a THIRD day boundary, unstated, beside two movement
   * counts on the operational day and a collections total on the calendar day.
   * A booking raised at 05:30 counted on a day the floor had already closed.
   */
  it('bounds created_at with the operational day, not with UTC midnight', () => {
    const { fromAd, toAd } = bookingsCreatedOn(DAY).dateRange
    expect(fromAd).toBe('2026-08-05T06:00:00.000+05:45')
    expect(toAd).toBe('2026-08-06T05:59:59.999+05:45')
    /* The old bounds, spelled out so the regression is unmistakable. */
    expect(fromAd).not.toBe('2026-08-05T00:00:00.000Z')
    expect(toAd).not.toBe('2026-08-05T23:59:59.999Z')
  })
})
