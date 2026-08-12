import { describe, it, expect } from 'vitest'
import { GROUPS, REPORTS, CATALOG_ERRORS, PROJECTIONS, reportsIn, projectFigures, headlineFor } from '../catalog'
import { figuresFor, PERIODS, DEFAULT_PERIOD } from '../../../data/pulse'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

/**
 * # The §9.6 register — 45 reports, ten groups, and no invented figure
 *
 * Two rules from the brief are load-bearing here and both are asserted rather
 * than trusted:
 *
 *  1. *"'8 groups' is a wireframe count, not a register… Do not delete three
 *     seeded categories to hit the number."* The inverse applies to the 45: the
 *     spec's own table is the register, and a count that drifts must fail
 *     loudly rather than be quietly reconciled by adding or dropping an entry.
 *  2. *"A report with no data source shows 'not tracked yet', never zeros."*
 *     So every report must either project the ONE figures source, route to a
 *     built screen, or carry a sentence saying what is missing.
 */

const money = (p: number) => formatMoney(p as unknown as Paisa)

describe('the register reconciles', () => {
  it('reports no reconciliation errors of its own', () => {
    expect(CATALOG_ERRORS).toEqual([])
  })

  it('holds exactly the 45 the spec declares', () => {
    expect(REPORTS).toHaveLength(45)
  })

  it('holds ten groups, and the per-group counts the spec table prints', () => {
    expect(GROUPS).toHaveLength(10)
    const counts = Object.fromEntries(GROUPS.map((g) => [g.key, reportsIn(g.key).length]))
    expect(counts).toEqual({
      '01': 4, '02': 5, '03': 5, '04': 4, '05': 4, '06': 7, '07': 5, '08': 4, '09': 3, '10': 4,
    })
  })

  it('cut the four Sales & Marketing reports — no backing tables exist', () => {
    const names = REPORTS.map((r) => r.name.toLowerCase())
    for (const cut of ['leads', 'campaigns', 'conversion', 'acquisition']) {
      expect(names.some((n) => n.includes(cut))).toBe(false)
    }
  })
})

describe('Law 17 — the word "customer" appears nowhere', () => {
  it('renames spec 09\'s group 05 and its three "Customer …" reports', () => {
    /* `PLAN.md` §0 Law 17, and Rulings §7 — laws outrank wireframes. */
    const words = [...GROUPS.map((g) => g.name), ...REPORTS.map((r) => r.name)]
    for (const w of words) expect(w.toLowerCase()).not.toContain('customer')
  })

  it('keeps group 05 at four reports while doing it', () => {
    expect(reportsIn('05')).toHaveLength(4)
    expect(reportsIn('05').map((r) => r.name)).toEqual([
      'Client Revenue',
      'Client Lifetime Value',
      'Outstanding',
      'Client History',
    ])
  })
})

describe('never a zero', () => {
  it('gives every report a projection, a route, or a stated reason', () => {
    for (const r of REPORTS) {
      const answerable = r.projection !== null || r.route !== null
      if (!answerable) {
        expect(r.needs, `"${r.name}" would render an empty report with no reason`).toBeTruthy()
      }
    }
  })

  it('names a real projection wherever one is claimed', () => {
    for (const r of REPORTS) {
      if (r.projection) expect(PROJECTIONS[r.projection]).toBeDefined()
    }
  })

  it('gives every projection a formula and a source, which is what hover shows', () => {
    for (const p of Object.values(PROJECTIONS)) {
      expect(p.formula.length).toBeGreaterThan(20)
      expect(p.source).toMatch(/pulse/)
      /* The label column plus at least one figure column. */
      expect(p.columns.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('the three duplications spec 09 declares unresolved stay unresolved', () => {
  it('keeps Profit & Loss in both 01 and 06, flagged', () => {
    const pnl = REPORTS.filter((r) => r.name === 'Profit & Loss')
    expect(pnl).toHaveLength(2)
    expect(pnl.map((r) => r.group).sort()).toEqual(['01', '06'])
    for (const r of pnl) expect(r.unresolved).toMatch(/TODO\(decision\)/)
  })

  it('keeps 05 Outstanding and 06 Receivables as separate flagged entries', () => {
    const outstanding = REPORTS.find((r) => r.key === 'outstanding')
    const receivables = REPORTS.find((r) => r.key === 'receivables')
    expect(outstanding?.unresolved).toMatch(/TODO\(decision\)/)
    expect(receivables?.unresolved).toMatch(/TODO\(decision\)/)
    /* Both blocked on the same unruled formula — PLAN.md §4.17 — so neither
       renders a figure the database cannot defend. */
    expect(outstanding?.projection).toBeNull()
    expect(receivables?.projection).toBeNull()
  })

  it('flags Payments and Expenses being both a tab and a report, and points at the tab', () => {
    const payments = REPORTS.find((r) => r.key === 'payments')
    const expenses = REPORTS.find((r) => r.key === 'expenses')
    expect(payments?.unresolved).toMatch(/TODO\(decision\)/)
    expect(expenses?.unresolved).toMatch(/TODO\(decision\)/)
    /* The reversible option: deep-link into the tab rather than duplicate it. */
    expect(payments?.route).toBe('/finance/payments')
    expect(expenses?.route).toBe('/finance/expenses')
  })
})

describe('the ONE figures source, projected', () => {
  const period = PERIODS.find((p) => p.key === DEFAULT_PERIOD)
  const figures = period?.range ? figuresFor(period.range.from, period.range.to) : null

  it('has a default period the ledger can answer', () => {
    expect(figures).not.toBeNull()
  })

  it('produces a row per bucket for every period projection, and a row per model for equipment', () => {
    if (!figures) return
    for (const key of ['revenue', 'expenses', 'profit', 'cash', 'utilization'] as const) {
      expect(projectFigures(key, figures, money)).toHaveLength(figures.buckets.length)
    }
    expect(projectFigures('equipment', figures, money)).toHaveLength(figures.equipment.length)
  })

  it('gives every row the same number of cells as its projection has figure columns', () => {
    if (!figures) return
    for (const [key, p] of Object.entries(PROJECTIONS)) {
      for (const row of projectFigures(key as never, figures, money)) {
        expect(row.cells).toHaveLength(p.columns.length - 1)
      }
    }
  })

  it('writes a headline that moves with the figures rather than captioning them', () => {
    if (!figures) return
    const headline = headlineFor('revenue', figures, money)
    /* It must contain the period's own revenue, not a fixed sentence. */
    expect(headline).toContain(money(figures.revenue as unknown as number))
    expect(headline).toContain(`${figures.days} day`)
  })
})
