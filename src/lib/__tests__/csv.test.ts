/**
 * `parseCsv` — the two corruptions it used to accept silently.
 *
 * `BUG_SWEEP_ENGINES` `R3-6`, `PLAN.md` §4.35, fixed 16 Aug 2026. The parser
 * returned a bare `string[][]` with no error channel, and opened quote mode on
 * **any** `"` rather than only at a field boundary. Together those meant a
 * catalogue containing inch marks parsed to garbage that looked exactly like
 * good data: `ImportCenter` mapped it, validated it with `errors.length === 0`,
 * and showed a green "Ready" badge.
 *
 * The consumer is bulk client import. A wrong row here becomes a client record
 * with someone else's phone number.
 */
import { describe, it, expect } from 'vitest'
import { parseCsv, csvCell } from '../csv'

describe('parseCsv — inch marks are data, not quotes', () => {
  /*
   * THE ONE THAT MATTERS. Two inch marks in different rows used to open and
   * close a quoted field, swallowing every comma and newline between them.
   */
  it('does not let two inch marks collapse the rows between them', () => {
    const csv = ['Name,Phone', '6" Pipe,+9779800000001', 'Tripod,+9779800000002', '24" Ladder,+9779800000003'].join(
      '\n',
    )
    const out = parseCsv(csv)

    expect(out.ok).toBe(true)
    expect(out.rows).toHaveLength(4)
    expect(out.rows[1]).toEqual(['6" Pipe', '+9779800000001'])
    expect(out.rows[2]).toEqual(['Tripod', '+9779800000002'])
    expect(out.rows[3]).toEqual(['24" Ladder', '+9779800000003'])
    // The specific damage: row 2's phone must not have migrated to row 1.
    expect(out.rows[1]?.[1]).not.toContain('0000002')
  })

  it('keeps a mid-field quote verbatim', () => {
    const out = parseCsv('Name\nHe said "hi"')
    expect(out.ok).toBe(true)
    expect(out.rows[1]).toEqual(['He said "hi"'])
  })
})

describe('parseCsv — still a correct RFC 4180 parser', () => {
  it('honours a quoted field opened at a field boundary', () => {
    const out = parseCsv('Name,Note\n"Pvt. Ltd., Kathmandu",ok')
    expect(out.ok).toBe(true)
    expect(out.rows[1]).toEqual(['Pvt. Ltd., Kathmandu', 'ok'])
  })

  it('honours an escaped "" inside a quoted field', () => {
    const out = parseCsv('Name\n"He said ""hi"""')
    expect(out.ok).toBe(true)
    expect(out.rows[1]).toEqual(['He said "hi"'])
  })

  it('honours a newline inside a quoted field', () => {
    const out = parseCsv('Name,Addr\nA,"Line 1\nLine 2"')
    expect(out.ok).toBe(true)
    expect(out.rows).toHaveLength(2)
    expect(out.rows[1]?.[1]).toBe('Line 1\nLine 2')
  })

  it('drops the blank row a trailing newline creates', () => {
    const out = parseCsv('a,b\n1,2\n')
    expect(out.rows).toHaveLength(2)
  })
})

describe('parseCsv — an unparseable file says so', () => {
  it('refuses an unterminated quote instead of returning it as data', () => {
    const out = parseCsv('Name,Phone\n"Unclosed,+9779800000001\nNext,+9779800000002')

    expect(out.ok).toBe(false)
    expect(out.errors.join(' ')).toMatch(/never closed/i)
    // It names the line, because "somewhere in your file" is not actionable.
    expect(out.errors.join(' ')).toMatch(/line 2/i)
  })

  it('reports ragged rows without calling the parse a failure of the parser', () => {
    const out = parseCsv('a,b,c\n1,2,3\n4,5')
    expect(out.ok).toBe(false)
    expect(out.errors.join(' ')).toMatch(/same number of columns/i)
    expect(out.errors.join(' ')).toMatch(/row 3/i)
  })

  it('is ok for a well-formed file, with no errors at all', () => {
    const out = parseCsv('a,b\n1,2\n3,4')
    expect(out.ok).toBe(true)
    expect(out.errors).toEqual([])
  })

  it('still returns the rows when not ok, so the screen can show the damage', () => {
    const out = parseCsv('Name,Phone\n"Unclosed,+977')
    expect(out.ok).toBe(false)
    expect(out.rows.length).toBeGreaterThan(0)
  })
})

describe('csvCell — the write side still round-trips', () => {
  it('quotes only what needs it', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('has,comma')).toBe('"has,comma"')
    expect(csvCell('has"quote')).toBe('"has""quote"')
  })

  it('survives a round trip through the parser', () => {
    const values = ['plain', 'has,comma', 'has"quote', 'line\nbreak', '6" Pipe']
    const line = values.map(csvCell).join(',')
    const out = parseCsv(`h1,h2,h3,h4,h5\n${line}`)
    expect(out.ok).toBe(true)
    expect(out.rows[1]).toEqual(values)
  })
})
