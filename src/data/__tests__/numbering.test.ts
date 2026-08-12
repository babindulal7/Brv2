import { describe, it, expect } from 'vitest'
import {
  SEQUENCES,
  SEED_ERRORS,
  LAST_SEQUENCE_USED,
  FORMAT_TOKENS,
  UNCONFIGURED_CODES,
  segmentsOf,
  buildNumber,
  paddingOf,
  padTo,
  advance,
  formatHas,
  prefixOf,
  prefixTokenOf,
  issue,
  isIssuedBy,
  wearsPrefixOf,
  counterIn,
  sequence,
} from '../numbering'

/**
 * The 12 Aug 2026 identifier ruling, pinned.
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §2 is a *product* decision, not an
 * implementation detail, so it is asserted exactly rather than loosely: `B-1`,
 * never `B-0001` and never `B-2026-0715`. Every one of these assertions failed
 * before the rename.
 */

const RULED: Array<[code: string, prefix: string, first: string]> = [
  ['BK', 'B', 'B-1'],
  ['CL', 'C', 'C-1'],
  ['MEM', 'M', 'M-1'],
  ['INV', 'INV', 'INV-1'],
  ['QT', 'Q', 'Q-1'],
  ['BND', 'BND', 'BND-1'],
]

describe('the six ruled sequences', () => {
  it.each(RULED)('%s issues counter 1 as %s (prefix %s)', (code, prefix, first) => {
    expect(prefixOf(code)).toBe(prefix)
    expect(issue(code, 1)).toBe(first)
  })

  it('carries no year segment and no zero padding', () => {
    for (const [code] of RULED) {
      const row = sequence(code)
      expect(row?.format).toBeTruthy()
      const parts = (row?.format as string).split('-')
      // Exactly two tokens: the literal prefix and the counter.
      expect(parts).toHaveLength(2)
      expect(parts[1]).toBe('N')
      expect(paddingOf(row?.format as string)).toBe(1)
      expect(formatHas(row?.format as string, 'YEAR')).toBe(false)
    }
  })

  it('renders booking 715 as B-715, not B-0715 and not BK-2026-0715', () => {
    expect(issue('BK', 715)).toBe('B-715')
    expect(issue('BK', 715)).not.toBe('B-0715')
    expect(issue('BK', 715)).not.toBe('BK-2026-0715')
  })

  it('keeps two adjacent bookings distinct and in order', () => {
    expect(issue('BK', 715)).toBe('B-715')
    expect(issue('BK', 716)).toBe('B-716')
    expect(Number(counterIn('BK', issue('BK', 716)))).toBeGreaterThan(
      Number(counterIn('BK', issue('BK', 715))),
    )
  })

  it('advances the seeded counter without re-padding it', () => {
    const bk = sequence('BK')
    expect(bk?.counter).toBe('4861')
    expect(advance(bk?.counter as string, 1)).toBe('4862')
    expect(LAST_SEQUENCE_USED).toBe('B-4861')
  })
})

describe('the format engine expresses the ruled shape', () => {
  it('reads PREFIX-N as two segments, the second a counter', () => {
    const segs = segmentsOf('B-N', {
      year: '2026',
      month: '05',
      day: '18',
      branchCode: 'KTM',
      warehouseCode: 'MAIN',
      counter: '715',
    })
    expect(segs.map((s) => s.kind)).toEqual(['PREFIX', 'COUNTER'])
    expect(segs.map((s) => s.value)).toEqual(['B', '715'])
  })

  it('pads to 1, which is no padding — padStart never truncates', () => {
    expect(paddingOf('B-N')).toBe(1)
    expect(padTo(715, 1)).toBe('715')
    expect(padTo(1, 1)).toBe('1')
  })

  it('still builds the unruled formats it always did', () => {
    expect(
      buildNumber('EQ-CAT-NNNNNN', {
        year: '2026',
        month: '05',
        day: '18',
        branchCode: 'KTM',
        warehouseCode: 'MAIN',
        counter: '000824',
      }),
    ).toBe('EQ-CAT-000824')
  })
})

describe('Requirement 3 — BR stays reserved as the branch token', () => {
  it('keeps BR in the token table', () => {
    expect(FORMAT_TOKENS.find((t) => t.placeholder === 'BR')?.kind).toBe('BRANCH')
  })

  it('still resolves BR to BRANCH in any format that uses it', () => {
    expect(formatHas('INV-BR-YYYY-NNNNN', 'BRANCH')).toBe(true)
    const segs = segmentsOf('INV-BR-YYYY-NNNNN', {
      year: '2026',
      month: '05',
      day: '18',
      branchCode: 'KTM',
      warehouseCode: 'MAIN',
      counter: '00492',
    })
    expect(segs.map((s) => s.kind)).toEqual(['PREFIX', 'BRANCH', 'YEAR', 'COUNTER'])
  })

  it('does not collide with the new one-letter booking prefix', () => {
    // Index 0 is unconditionally the literal prefix, so a prefix can never be
    // misread as a token. The reservation only bites at index > 0.
    expect(formatHas('B-N', 'BRANCH')).toBe(false)
    expect(formatHas('BND-N', 'BRANCH')).toBe(false)
  })

  it('drops the branch segment from the seeded invoice format', () => {
    expect(sequence('INV')?.format).toBe('INV-N')
    expect(formatHas('INV-N', 'BRANCH')).toBe(false)
    // …and therefore INV must not keep a Per Branch counter, or Kathmandu and
    // Pokhara would each mint INV-1.
    expect(sequence('INV')?.scope).toBe('Global')
    expect(sequence('BK')?.scope).toBe('Global')
  })

  it('never resets a year-less sequence, which would re-issue B-1', () => {
    for (const [code] of RULED) expect(sequence(code)?.resetRule).toBe('Never')
  })
})

describe('prefixes are configuration', () => {
  it('recognises an identifier by its registered prefix, not a literal', () => {
    expect(isIssuedBy('BK', 'B-715')).toBe(true)
    expect(isIssuedBy('BK', 'BND-23')).toBe(false)
    expect(isIssuedBy('BND', 'BND-23')).toBe(true)
    expect(isIssuedBy('BK', 'BK-2026-0715')).toBe(false)
    expect(isIssuedBy('BK', null)).toBe(false)
  })

  it('exposes the prefix token the sniffers use', () => {
    expect(prefixTokenOf('BK')).toBe('B-')
    expect(prefixTokenOf('INV')).toBe('INV-')
  })

  it('reads the counter back out of an issued identifier', () => {
    expect(counterIn('BK', 'B-715')).toBe(715)
    expect(counterIn('BK', 'C-715')).toBeNull()
    expect(counterIn('CL', 'C-45')).toBe(45)
  })

  /*
   * The ruling shortened three prefixes to a single letter, and one of them
   * landed on a namespace that was already occupied: `data/addBundle.ts` keys
   * equipment models `M-FX3-BODY`, `M-USBC`, `M-SR-CAGE`, and
   * `inventory/AddBundle.tsx` selects on `M-FX3-BODY`. Under a plain
   * `startsWith('M-')` every one of those was a Membership. No caller asks yet,
   * which is what makes it worth pinning — the failure would arrive with the
   * first `isIssuedBy('MEM', …)` and be silent when it did.
   */
  it('does not claim an equipment model key for the Membership sequence', () => {
    expect(isIssuedBy('MEM', 'M-FX3-BODY')).toBe(false)
    expect(isIssuedBy('MEM', 'M-USBC')).toBe(false)
    expect(isIssuedBy('MEM', 'M-SR-CAGE')).toBe(false)
    expect(counterIn('MEM', 'M-FX3-BODY')).toBeNull()
    // …while a real membership still resolves.
    expect(isIssuedBy('MEM', 'M-14')).toBe(true)
    expect(counterIn('MEM', 'M-14')).toBe(14)
  })

  it('matches the whole registered format, not just its opening token', () => {
    // The unruled formats keep their year segment, so shape-matching must not
    // have quietly narrowed them to `PREFIX-digits`.
    expect(isIssuedBy('CASE', 'CASE-2026-0041')).toBe(true)
    expect(isIssuedBy('CASE', 'CASE-41')).toBe(false)
    expect(isIssuedBy('BK', 'B-715')).toBe(true)
    expect(isIssuedBy('BK', 'B-')).toBe(false)
    expect(isIssuedBy('BK', 'B-715-DRAFT')).toBe(false)
    // padTo pads but never truncates, so a counter may outgrow its width.
    expect(isIssuedBy('CASE', 'CASE-2026-00412')).toBe(true)
  })

  it('keeps a separate, looser predicate for namespace collisions', () => {
    // `expenseReports.ts` asks whether a vendor bill squats on our invoice
    // namespace at all — a malformed `INV-WHATEVER` is exactly the collision
    // worth reporting, so this one must stay loose where isIssuedBy is strict.
    expect(wearsPrefixOf('INV', 'INV-WHATEVER')).toBe(true)
    expect(isIssuedBy('INV', 'INV-WHATEVER')).toBe(false)
    expect(wearsPrefixOf('INV', '3456')).toBe(false)
    expect(wearsPrefixOf('INV', 'NEA/07/83')).toBe(false)
    // Never true by accident: an unknown code yields no token, and no string
    // may be said to wear a token that does not exist.
    expect(wearsPrefixOf('NOPE', 'anything')).toBe(false)
  })

  it('falls back to the registered prefix for a still-unconfigured row', () => {
    // No format is invented for these — but a caller still never types "DOC-".
    expect(UNCONFIGURED_CODES).toContain('DOC')
    expect(issue('DOC', 12)).toBe('DOC-12')
  })
})

describe('seed invariants', () => {
  it('reconciles — no red banner on Settings ▸ Numbering', () => {
    expect(SEED_ERRORS).toEqual([])
  })

  it('catches a half-done rename: a padded counter beside a PREFIX-N format', () => {
    // The exact case this rename could have shipped. Reproduced against the
    // real predicate rather than trusting the array above.
    expect(padTo(Number('004861'), paddingOf('B-N'))).not.toBe('004861')
    expect(padTo(Number('4861'), paddingOf('B-N'))).toBe('4861')
  })

  it('has one row per registry code and no duplicate prefix', () => {
    const codes = SEQUENCES.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    const prefixes = SEQUENCES.map((s) => s.prefix.toUpperCase())
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it('registers every entity the ruling names', () => {
    for (const [code] of RULED) expect(sequence(code), `${code} has no registry row`).toBeTruthy()
  })
})
