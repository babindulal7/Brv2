import { describe, it, expect } from 'vitest'
import {
  GROUPS,
  REPORTS,
  CATALOG_ERRORS,
  PROJECTIONS,
  PER_GROUP,
  TOTAL_REPORTS,
  reportsIn,
  reportByKey,
  projectFigures,
  headlineFor,
} from '../catalog'
import { figuresFor, PERIODS, DEFAULT_PERIOD } from '../../../data/pulse'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'

/**
 * # The §9.6 register — 43 reports, ten groups, and no invented figure
 *
 * Two rules from the brief are load-bearing here and both are asserted rather
 * than trusted:
 *
 *  1. *"'8 groups' is a wireframe count, not a register… Do not delete three
 *     seeded categories to hit the number."* The inverse applies to the total:
 *     a count that drifts must fail loudly rather than be quietly reconciled by
 *     adding or dropping an entry.
 *  2. *"A report with no data source shows 'not tracked yet', never zeros."*
 *     So every report must either project the ONE figures source, route to a
 *     built screen, or carry a sentence saying what is missing.
 *
 * ## 43, and why it is not the 45 §9.6 prints
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §11.3 closed the three duplications spec 09
 * declared and left open. Two entries went — the second Profit & Loss and
 * `05 Outstanding` — and the two that are each a Finance tab as well as a
 * report became deep-links into that tab. The suite below asserted the old
 * numbers and the *presence* of the three TODO(decision) flags; it now asserts
 * the ruled numbers and the *absence* of those flags, exactly, because a count
 * loosened into a range is a count nobody can be wrong about.
 */

const money = (p: number) => formatMoney(p as unknown as Paisa)

describe('the register reconciles', () => {
  it('reports no reconciliation errors of its own', () => {
    expect(CATALOG_ERRORS).toEqual([])
  })

  it('holds exactly the 43 rulings §11.3 leaves', () => {
    expect(REPORTS).toHaveLength(43)
    /* The banner's own constant, asserted against the literal above so that
       re-pointing one without the other fails here rather than on screen. */
    expect(TOTAL_REPORTS).toBe(43)
  })

  it('holds ten groups, and the per-group counts rulings §11.3 leaves', () => {
    expect(GROUPS).toHaveLength(10)
    const counts = Object.fromEntries(GROUPS.map((g) => [g.key, reportsIn(g.key).length]))
    expect(counts).toEqual({
      '01': 4, '02': 5, '03': 5, '04': 4, '05': 3, '06': 6, '07': 5, '08': 4, '09': 3, '10': 4,
    })
    /* §9.6's 45 was 05 × 4 and 06 × 7. Both moved, and only those two. */
    expect(PER_GROUP).toEqual(counts)
    expect(Object.values(PER_GROUP).reduce((a, b) => a + b, 0)).toBe(TOTAL_REPORTS)
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

  it('keeps the renamed group-05 reports, in order, after §11.3 removes Outstanding', () => {
    /* The Law 17 rename (Customers → Clients) comes from `PLAN.md` §0 and
       rulings §7, not from §11.3 — §11.3 only removes the `05 Outstanding`
       duplicate of `06 Receivables`. Two separate rulings landing in one group,
       and the rename survives the removal. */
    expect(reportsIn('05')).toHaveLength(3)
    expect(reportsIn('05').map((r) => r.name)).toEqual([
      'Client Revenue',
      'Client Lifetime Value',
      'Client History',
    ])
    expect(GROUPS.find((g) => g.key === '05')?.name).toBe('Clients')
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

describe('rulings §11.3 — the three duplications spec 09 left open are closed', () => {
  it('keeps Profit & Loss in 01 only', () => {
    const pnl = REPORTS.filter((r) => r.name === 'Profit & Loss')
    expect(pnl).toHaveLength(1)
    expect(pnl[0]?.group).toBe('01')
    /* Collapsed, not cut: the surviving entry still answers the question, from
       the same projection the pair shared. */
    expect(pnl[0]?.projection).toBe('profit')
    expect(reportByKey('profit-and-loss-06')).toBeUndefined()
  })

  it('collapses 05 Outstanding into 06 Receivables, and says so where it went', () => {
    expect(reportByKey('outstanding')).toBeUndefined()
    expect(REPORTS.filter((r) => r.name === 'Outstanding')).toHaveLength(0)

    const receivables = reportByKey('receivables')
    expect(receivables?.group).toBe('06')
    /* Still blocked on the same unruled formula — PLAN.md §4.17. The dedup
       must not have handed it a projection to tidy the catalog up. */
    expect(receivables?.projection).toBeNull()
    expect(receivables?.needs).toMatch(/Outstanding/)
    expect(receivables?.needs).toMatch(/§4\.17/)
  })

  it('makes Payments and Expenses deep-link into their Finance tab, not duplicate it', () => {
    const payments = reportByKey('payments')
    const expenses = reportByKey('expenses')

    expect(payments?.route).toBe('/finance/payments')
    expect(expenses?.route).toBe('/finance/expenses')
    expect(payments?.financeTab).toBe('Payments')
    expect(expenses?.financeTab).toBe('Expenses')

    /* The substance of the ruling: the entry points at the tab instead of
       rendering the same money a second time through the §9.7 template. */
    expect(payments?.projection).toBeNull()
    expect(expenses?.projection).toBeNull()
    /* And it is not therefore "not tracked yet" — it says which tab answers. */
    expect(payments?.needs).toMatch(/Payments/)
    expect(expenses?.needs).toMatch(/Expenses/)
  })

  it('leaves no entry still flagged unresolved, and every deep-link a route to follow', () => {
    for (const r of REPORTS) {
      expect(r.unresolved, `"${r.name}" is still flagged unresolved after §11.3`).toBeUndefined()
      if (r.financeTab) expect(r.route, `"${r.name}" opens a tab but has no route`).toBeTruthy()
    }
    /* Exactly the two the ruling names — a third would be a new duplication. */
    expect(REPORTS.filter((r) => r.financeTab).map((r) => r.key)).toEqual(['payments', 'expenses'])
  })

  it('gives every report exactly one home — no name appears twice', () => {
    const names = REPORTS.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
    const keys = REPORTS.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
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
