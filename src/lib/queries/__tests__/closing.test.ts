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

vi.mock('../bookings', () => ({
  listBookings: vi.fn(),
  todaysOutgoing: () => ({}),
  todaysIncoming: () => ({}),
}))
vi.mock('../finance', () => ({
  listPayments: vi.fn(),
  listInvoices: vi.fn(),
  outstandingInvoices: () => ({}),
  paymentsInPeriod: () => ({}),
}))
vi.mock('../clients', () => ({ listClients: vi.fn() }))

const { listBookings } = await import('../bookings')
const { listPayments, listInvoices } = await import('../finance')
const { listClients } = await import('../clients')
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
  asMock(listClients).mockResolvedValue([])
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
    asMock(listClients).mockResolvedValue([])
    expect((await fetchDailyClosing(DAY)).pickupsCount).toBe(2)
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

  it('sums deposits held and reads a null hold as nothing, not as a gap', async () => {
    asMock(listClients).mockResolvedValue([{ depositHeld: rs(1000) }, { depositHeld: null }, { depositHeld: rs(500) }])
    expect((await fetchDailyClosing(DAY)).depositsHeld).toBe(rs(1500))
  })

  it('rejects the whole read if one query fails, rather than reporting a silent zero', async () => {
    asMock(listClients).mockRejectedValue(new Error('deposits unavailable'))
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
})
