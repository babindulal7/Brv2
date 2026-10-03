/**
 * `previewNextNumbers` / `previewNextNumber` — the read-only mirror of
 * `next_document_number()`.
 *
 * Why this suite exists (6 Sep 2026, DB-01). The database formatter used
 * `lpad(v, padding, '0')`, and Postgres `lpad` CUTS to the width as readily as
 * it pads to it: with `padding = 1` (the 12 Aug "no zero padding" convention)
 * `918` came back as `9`, so the first live booking would have saved under a
 * one-digit number and the second collided. `0085` step 6 / `0089` §1 fix the
 * function with `greatest(padding, length(v))`. The app-side preview uses
 * `padStart`, which never truncates — this suite pins that the two agree on
 * every shape the registry holds after `0085`/`0089`, so a future "make the
 * preview match the SQL" edit cannot re-introduce the cut on the screen.
 *
 * Every expectation below is a string the database function mints for the same
 * row (verified by 0089's minting post-condition on a rebuilt database).
 */
import { describe, expect, it } from 'vitest'
import { formatConvention, previewNextNumber, previewNextNumbers, type SequenceShape } from '../numbering'

/** A fixed business "now" — 6 Sep 2026, well inside the Kathmandu day. */
const AT = new Date('2026-09-06T06:00:00Z')

function row(over: Partial<SequenceShape>): SequenceShape {
  return { prefix: 'B-', padding: 1, includeYear: false, currentYear: 2026, currentValue: 0, ...over }
}

describe('previewNextNumbers mirrors next_document_number after 0085/0089', () => {
  it('never truncates a padding-1 sequence — the four live counters from the DB-01 table', () => {
    expect(previewNextNumber(row({ prefix: 'B-', currentValue: 917 }), AT)).toBe('B-918')
    expect(previewNextNumber(row({ prefix: 'C-', currentValue: 750 }), AT)).toBe('C-751')
    expect(previewNextNumber(row({ prefix: 'INV-', currentValue: 120 }), AT)).toBe('INV-121')
    expect(previewNextNumber(row({ prefix: 'DEP-', currentValue: 89 }), AT)).toBe('DEP-90')
  })

  it('renders the bare booking form 0085 stores (prefix "", padding 1) and counts on', () => {
    expect(previewNextNumbers(row({ prefix: '', currentValue: 899 }), 3, AT)).toEqual(['900', '901', '902'])
  })

  it('pads up to the width and never cuts past it', () => {
    expect(previewNextNumber(row({ prefix: 'EQ', padding: 6, currentValue: 1150 }), AT)).toBe('EQ001151')
    expect(previewNextNumber(row({ prefix: 'INV-', padding: 4, currentValue: 9999 }), AT)).toBe('INV-10000')
  })

  it('payment after R-18 is year-less with its padding kept', () => {
    expect(previewNextNumber(row({ prefix: 'PAY-', padding: 4, currentValue: 93 }), AT)).toBe('PAY-0094')
  })

  it('payment after 0151 ruling is short sequential PAY-N (padding 1, include_year false)', () => {
    expect(previewNextNumber(row({ prefix: 'PAY-', padding: 1, includeYear: false, currentValue: 93 }), AT)).toBe('PAY-94')
  })

  it('a year-scoped sequence still resets on a year change; a year-less one never does', () => {
    expect(previewNextNumber(row({ prefix: 'PAY-', padding: 4, includeYear: true, currentYear: 2025, currentValue: 93 }), AT)).toBe(
      'PAY-2026-0001',
    )
    expect(previewNextNumber(row({ prefix: 'B-', currentYear: 2025, currentValue: 917 }), AT)).toBe('B-918')
  })

  it('the transfer row 0089 seeds renders TRF-1 under the TRF-N convention', () => {
    expect(previewNextNumber(row({ prefix: 'TRF-', currentValue: 0 }), AT)).toBe('TRF-1')
    expect(formatConvention({ prefix: 'TRF-', padding: 1, includeYear: false })).toBe('TRF-N')
  })

  it('asks for zero or a negative count and gets nothing, never a throw', () => {
    expect(previewNextNumbers(row({ currentValue: 5 }), 0, AT)).toEqual([])
    expect(previewNextNumbers(row({ currentValue: 5 }), -2, AT)).toEqual([])
  })
})
