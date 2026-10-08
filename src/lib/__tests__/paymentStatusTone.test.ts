import { describe, expect, it } from 'vitest'

import { PAYMENT_STATUS_TONE, paymentStatusTone, STATUS } from '../status'
import { paymentGlance } from '../../data/bookingIntel'
import type { PaymentHistoryRow } from '../../data/booking'
import type { GateContext } from '../fieldGating'

/**
 * # What this suite pins
 *
 * A payment row is painted in THREE places — the Finance ledger
 * (`modules/finance/Payments.tsx`), the booking's Payment History
 * (`modules/rentals/BookingDetail.tsx`) and the hover Intel card that opens
 * from that same history row (`data/bookingIntel.ts`).
 *
 * Each carried its own copy of the status→tone map, and the third one
 * disagreed: it was a TWO-way ternary over a FOUR-member enum, so `Refunded`,
 * `Failed` and `Cancelled` all came out yellow. A bounced transfer and a refund
 * were the same colour, and neither was red.
 *
 * These tests exist so the three cannot drift apart again.
 */

const gctx = { role: 'Owner', surface: 'booking' } as unknown as GateContext

function row(status: string): PaymentHistoryRow {
  return { date: '16 Jul 2026', type: 'Advance Payment', amount: '25,000', method: 'Cash', status, ref: 'PAY-1' }
}

describe('paymentStatusTone — one map, four answers', () => {
  it('gives each enum member its own meaning, and only Received reads as money in', () => {
    expect(PAYMENT_STATUS_TONE).toEqual({
      Received: 'in',
      Refunded: 'neutral',
      Failed: 'danger',
      Cancelled: 'neutral',
    })
  })

  it('does not paint a failed payment the same as a refunded one', () => {
    // The old ternary answered 'progress' for both. A bounced transfer is not a refund.
    expect(paymentStatusTone('Failed')).not.toBe(paymentStatusTone('Refunded'))
    expect(paymentStatusTone('Failed')).toBe('danger')
  })

  it('never answers "in" for a status it does not recognise', () => {
    // Painting an unknown status with the colour that means "the money arrived"
    // is the one wrong answer available here.
    expect(paymentStatusTone('Sent to bank')).toBe('neutral')
    expect(paymentStatusTone('')).toBe('neutral')
  })

  it('resolves to a real token for every member — no undefined lookup reaches STATUS', () => {
    for (const key of Object.values(PAYMENT_STATUS_TONE)) {
      expect(STATUS[key]).toBeDefined()
    }
  })
})

describe('paymentGlance — the Intel card agrees with the row it opened from', () => {
  it('takes its tone from the shared map, not a two-way ternary', () => {
    for (const status of ['Received', 'Refunded', 'Failed', 'Cancelled'] as const) {
      const g = paymentGlance(row(status), 'B-715', gctx)
      expect(g.statusDot).toBe(PAYMENT_STATUS_TONE[status])
      expect(g.avatarTone).toBe(PAYMENT_STATUS_TONE[status])
    }
  })

  it('renders a failed payment in danger, where it used to render yellow', () => {
    expect(paymentGlance(row('Failed'), 'B-715', gctx).statusDot).toBe('danger')
  })

  it('carries the status as a WORD as well as a colour (Law 11)', () => {
    // The dot was previously the only carrier of status on this card.
    const g = paymentGlance(row('Failed'), 'B-715', gctx)
    expect(g.badges?.some((b) => b.label === 'Failed')).toBe(true)
  })

  it('keeps the dot and the word saying the same thing', () => {
    const g = paymentGlance(row('Refunded'), 'B-715', gctx)
    const badge = g.badges?.find((b) => b.label === 'Refunded')
    expect(badge?.tone).toBe(g.statusDot)
  })
})
