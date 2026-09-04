/**
 * FI-04 — the invoice export used to leave the building malformed.
 *
 * `formatMoney` renders lakh grouping (`Rs 1,39,506`) and the row was joined
 * with a bare `,` while only `clientName` was hand-quoted. So every money cell
 * split into two or three columns and everything to its right shifted: an
 * eight-column header over eleven-field rows, which a spreadsheet opens without
 * a word of complaint. The file is the artefact that reaches an accountant.
 *
 * These assertions are about SHAPE, not about wording: whatever the columns say,
 * every row must carry exactly as many fields as the header, and the file must
 * survive a round trip through the parser in `lib/csv.ts`.
 */

import { describe, it, expect, vi } from 'vitest'
import type { Paisa } from '../../../lib/money'

vi.mock('../../../lib/supabase', () => ({
  supabase: {},
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const { invoicesCsv } = await import('../Finance')
const { parseCsv } = await import('../../../lib/csv')

type Row = Parameters<typeof invoicesCsv>[0][number]

const row = (over: Partial<Row> = {}): Row =>
  ({
    id: 'inv-1',
    invoiceNo: 'INV-0007',
    bookingId: 'bk-1',
    bookingNo: 'B-715',
    clientId: 'cl-1',
    clientName: 'ABC Films',
    status: 'Sent',
    issueDateAd: '2026-07-31',
    dueDateAd: '2026-08-15',
    currency: 'NPR',
    subtotal: 0 as Paisa,
    discountAmount: 0 as Paisa,
    discountPercent: 0,
    taxableAmount: 0 as Paisa,
    vatRate: 0.13,
    vatAmount: 0 as Paisa,
    /** The figure that broke it: `formatMoney` writes this "Rs 1,39,506". */
    totalAmount: 13_950_600 as Paisa,
    paidAmount: 0 as Paisa,
    outstandingAmount: 12_450_600 as Paisa,
    isVoid: false,
    ...over,
  }) as Row

const COLUMNS = 8

describe('invoicesCsv — the export is a valid CSV whatever the values are', () => {
  it('keeps a money cell in ONE column instead of splitting the row', () => {
    const parsed = parseCsv(invoicesCsv([row()]))
    expect(parsed.ok).toBe(true)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows[0]).toHaveLength(COLUMNS)
    expect(parsed.rows[1]).toHaveLength(COLUMNS)
    /* Column 3 is Total, and it arrives whole — commas and all. */
    expect(parsed.rows[1]?.[3]).toBe('Rs 1,39,506')
    expect(parsed.rows[1]?.[4]).toBe('Rs 1,24,506')
    /* Everything to the right of it is still where the header says it is. */
    expect(parsed.rows[1]?.[5]).toBe('2026-07-31')
    expect(parsed.rows[1]?.[6]).toBe('2026-08-15')
    expect(parsed.rows[1]?.[7]).toBe('Sent')
  })

  it('escapes a quote, a comma and a newline in a client name', () => {
    const parsed = parseCsv(invoicesCsv([row({ clientName: 'Sharma "Raju", Films\nPvt. Ltd.' })]))
    expect(parsed.ok).toBe(true)
    expect(parsed.rows[1]).toHaveLength(COLUMNS)
    expect(parsed.rows[1]?.[1]).toBe('Sharma "Raju", Films\nPvt. Ltd.')
  })

  it('quotes only what needs it, so a plain cell stays plain', () => {
    const text = invoicesCsv([row({ clientName: 'ABC Films' })])
    expect(text).toContain('INV-0007,ABC Films,B-715,')
  })

  it('every row is the width of the header, for any number of rows', () => {
    const parsed = parseCsv(invoicesCsv([row(), row({ invoiceNo: 'INV-0008', isVoid: true })]))
    expect(parsed.ok).toBe(true)
    for (const r of parsed.rows) expect(r).toHaveLength(COLUMNS)
    /* A voided invoice reports the FACT (`voided_at`), not the status label. */
    expect(parsed.rows[2]?.[7]).toBe('Void')
  })
})
