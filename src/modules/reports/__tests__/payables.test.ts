import { describe, it, expect } from 'vitest'
import {
  POSITION,
  LIABILITIES_ARE_COMPLETE,
  untrackedLines,
  currentAssets,
  currentLiabilities,
  workingCapital,
  workingCapitalCeiling,
  currentRatio,
  freeCash,
  freeCashMonths,
  receivables,
} from '../../../data/liquidityReports'
import { REPORTS, reportByKey } from '../catalog'

/**
 * # The fabricated payables figure, and the four figures it silently wronged
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §8 names this line by file and line number:
 *
 * > ⚠ `src/data/liquidityReports.ts:113` hand-types `Trade payables:
 * > rupees(42_200)` and feeds it into `currentLiabilities()`,
 * > `workingCapital()`, `currentRatio()` and `freeCash()` — all rendered by
 * > `WorkingCapitalReport.tsx`. There is no supplier-invoice table. **Fix this
 * > before the Payables report is built**, or the app says "not tracked yet" on
 * > one screen and Rs 42,200 of the same liability on another, with three
 * > derived ratios silently wrong.
 *
 * These tests are that fix, held in place. They are written against the
 * *behaviour* — "no figure is produced from an untracked line" — rather than
 * against the number 42,200, so re-introducing the same defect with a different
 * amount fails them just as loudly.
 */

describe('Trade payables — the named fabrication', () => {
  it('is present as a line, because deleting it would make the liability side look complete', () => {
    const payables = POSITION.find((l) => l.label === 'Trade payables')
    expect(payables).toBeDefined()
    expect(payables?.side).toBe('liability')
  })

  it('carries no amount — not a figure, and not zero either', () => {
    const payables = POSITION.find((l) => l.label === 'Trade payables')
    /* `null`, never `rupees(0)`. Zero is a claim that the business owes its
       suppliers nothing, which is a different and unevidenced statement. */
    expect(payables?.amount).toBeNull()
  })

  it('leaves the liability side declared incomplete', () => {
    expect(LIABILITIES_ARE_COMPLETE).toBe(false)
    expect(untrackedLines('liability').map((l) => l.label)).toContain('Trade payables')
  })
})

describe('the four derived figures it used to feed', () => {
  it('currentLiabilities() sums only what is tracked, and is therefore a floor', () => {
    const tracked = POSITION.filter((l) => l.side === 'liability' && l.amount !== null)
    const expected = tracked.reduce((t, l) => t + (l.amount as unknown as number), 0)
    expect(currentLiabilities() as unknown as number).toBe(expected)
    /* The proof that it is a floor and not a total: the caller is told. */
    expect(LIABILITIES_ARE_COMPLETE).toBe(false)
  })

  it('workingCapital() withholds rather than returning assets-less-known-liabilities', () => {
    expect(workingCapital()).toBeNull()
  })

  it('exposes the bound separately, so a caller that wants it has to say "at most"', () => {
    const ceiling = workingCapitalCeiling() as unknown as number
    expect(ceiling).toBe((currentAssets() as unknown as number) - (currentLiabilities() as unknown as number))
    /* It really is a ceiling: adding any positive payables figure lowers it. */
    expect(ceiling).toBeGreaterThan(0)
  })

  it('currentRatio() withholds — an incomplete denominator overstates liquidity', () => {
    expect(currentRatio()).toBeNull()
  })

  it('freeCash() and its cover withhold — this is the figure somebody would spend', () => {
    expect(freeCash()).toBeNull()
    expect(freeCashMonths()).toBeNull()
  })

  it('leaves the figures that do have a source alone', () => {
    /* The fix must not become "withhold everything". Assets are tracked, so
       they still answer, and so does the receivables line inside them. */
    expect(currentAssets() as unknown as number).toBeGreaterThan(0)
    expect(receivables() as unknown as number).toBeGreaterThan(0)
  })
})

describe('the two screens agree about the same liability', () => {
  it('registers the Payables report with no projection and no route', () => {
    const payables = reportByKey('payables')
    expect(payables).toBeDefined()
    expect(payables?.projection).toBeNull()
    expect(payables?.route).toBeNull()
  })

  it('gives it a reason naming the missing table', () => {
    const payables = reportByKey('payables')
    expect(payables?.needs).toMatch(/supplier-invoice/i)
  })

  it('is the whole point: neither screen states a payables figure', () => {
    /* The register cannot draw one (no projection), and the balance sheet
       cannot either (`amount === null`). Before this change the first was true
       and the second was not, which is the exact split §8 warned about. */
    expect(reportByKey('payables')?.projection).toBeNull()
    expect(POSITION.find((l) => l.label === 'Trade payables')?.amount).toBeNull()
  })
})

describe('nothing else in the register quietly invents a payables figure', () => {
  it('has no report whose projection is a liability the ledger does not carry', () => {
    /* `data/pulse.ts`'s ledger has revenue, expenses, cash and units on rent —
       no liability dimension at all. So no report may be projected onto one. */
    const liabilityish = REPORTS.filter((r) => /payable|liabilit/i.test(r.name))
    expect(liabilityish.length).toBeGreaterThan(0)
    for (const r of liabilityish) expect(r.projection).toBeNull()
  })
})
