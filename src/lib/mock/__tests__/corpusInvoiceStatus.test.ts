/**
 * X-07 — the mock corpus wrote an invoice status that does not exist.
 *
 * `corpus.ts` stamped every invoice `status: 'Issued'`. `invoice_status`
 * (`0001_enums.sql`) is Draft · Sent · Partially Paid · Paid · Overdue · Void;
 * 'Issued' belongs to `document_lifecycle_status`, a different enum on a
 * different table. Nothing threw — the mimic is JavaScript — so the string sat
 * there matching nothing: Finance's unsettled set is `['Sent', 'Partially
 * Paid']`, and the dashboard and the Daily Closing both read "Outstanding Rs 0 ·
 * every issued invoice has been settled" while Booking Detail showed real money
 * owed on one of those same invoices.
 *
 * The status is derived from the figures now, mirroring `sync_payment_to_invoice()`
 * (0010), which is what sets it live and which the mock engine does not run.
 */

import { describe, it, expect } from 'vitest'
import { buildStore } from '../corpus'
import { STORED_INVOICE_STATUSES } from '../../queries/finance'

const invoices = () => (buildStore()['invoices'] ?? []) as Array<Record<string, unknown>>

describe('the mock corpus invoices carry a real invoice_status', () => {
  it('serves invoices at all — an empty table would pass every check below', () => {
    expect(invoices().length).toBeGreaterThan(0)
  })

  it('never writes a value outside the enum, and never the retired string', () => {
    for (const inv of invoices()) {
      expect(inv['status']).not.toBe('Issued')
      expect(STORED_INVOICE_STATUSES).toContain(inv['status'])
    }
  })

  /**
   * The point of the fix, not just the shape of it: Finance's unsettled chips
   * have to match the rows that actually owe money, or the two screens disagree
   * about the one number a client is billed.
   */
  it('agrees with its own outstanding figure on every row', () => {
    for (const inv of invoices()) {
      const paid = Number(inv['paid_amount'])
      const outstanding = Number(inv['outstanding_amount'])
      const status = inv['status']
      /* Mirrors `corpus.ts`'s own precedence: nothing paid FIRST, then whether
         anything is left. Written the other way round ("outstanding > 0 &&
         paid === 0") it agreed only because no zero-total invoice exists in the
         corpus today — on the row where they differ, an invoice for nothing
         with no payment against it, the implementation says 'Sent' and the old
         assertion demanded 'Paid'. A pinning test that pins a DIFFERENT rule
         from the code fails the day someone seeds that row, and blames the
         wrong side. */
      if (paid === 0) expect(status).toBe('Sent')
      else if (outstanding > 0) expect(status).toBe('Partially Paid')
      else expect(status).toBe('Paid')
    }
  })

  it('leaves at least one invoice unsettled, so the Outstanding KPI has rows', () => {
    const unsettled = invoices().filter((i) => i['status'] === 'Sent' || i['status'] === 'Partially Paid')
    expect(unsettled.length).toBeGreaterThan(0)
  })
})
