/**
 * # The Expenses tab's address, and the gate in front of it
 *
 * Two facts that are invisible from inside the screen and expensive when wrong:
 *
 *  1. **Which screen the Expenses tab means.** `SPEC_TABS['/finance']` names six
 *     tabs and says where none of them lives, and `modules/finance/Finance.tsx`
 *     links its Expenses tab to `/reports/expenses` — the Expense *report*, over
 *     the `src/data/expenseReports.ts` fixture, not the ledger `09_FINANCE.md`
 *     §9.4 specifies. `FINANCE_TAB_ROUTES` is the record that settles it; this
 *     pins the entry so a later pass re-pointing that strip has something to
 *     read rather than a guess to make.
 *  2. **That the route is money-gated.** `App.tsx`'s Shell guard refuses a typed
 *     URL for a money-blind role via `isMoneySurface(pathname)`, and
 *     `permittedNav()` drops the section from the sidebar by the same predicate.
 *     `/finance/expenses` is covered by the `/finance` PREFIX rather than by an
 *     entry of its own — which is correct, and is exactly the kind of thing that
 *     looks correct while being wrong if the prefix match is ever loosened.
 */
import { describe, expect, it } from 'vitest'
import { FINANCE_TAB_ROUTES, SPEC_TABS, MONEY_ROUTES, isMoneySurface, permittedNav } from '../../../data/nav'

const EXPENSES_ROUTE = '/finance/expenses'

describe('the Expenses tab points at the ledger, not at the report', () => {
  it('is a tab 09_FINANCE.md ruled', () => {
    expect(SPEC_TABS['/finance']).toContain('Expenses')
  })

  it('resolves to modules/finance/Expenses, never to /reports/expenses', () => {
    expect(FINANCE_TAB_ROUTES['Expenses']).toBe(EXPENSES_ROUTE)
    expect(FINANCE_TAB_ROUTES['Expenses']).not.toBe('/reports/expenses')
  })

  it('gives every tab in the spec an entry, and no entry the spec does not name', () => {
    for (const tab of SPEC_TABS['/finance'] ?? []) {
      expect(Object.keys(FINANCE_TAB_ROUTES), `${tab} needs an entry`).toContain(tab)
    }
    // The record must not grow a tab `09_FINANCE.md` line 4 does not rule —
    // "Audit" in particular, which the wireframes moved to Tools.
    for (const tab of Object.keys(FINANCE_TAB_ROUTES)) {
      expect(SPEC_TABS['/finance'], `${tab} is not one of the six ruled tabs`).toContain(tab)
    }
  })

  it('keeps an unbuilt tab honestly null rather than pointing it at the nearest page', () => {
    /*
     * A tab with no screen must read `null`. Pointing one at whatever looked
     * closest is exactly how Expenses came to mean `/reports/expenses` — a
     * fixture-backed report — in `Finance.tsx`'s strip. Nothing is asserted
     * about WHICH tabs are unbuilt: that changes as screens land, and pinning
     * it would make this test fail on progress rather than on a defect.
     */
    for (const [tab, to] of Object.entries(FINANCE_TAB_ROUTES)) {
      if (to === null) continue
      expect(to.startsWith('/'), `${tab} must be a route or null, got ${to}`).toBe(true)
      expect(to, `${tab} must not point at a report screen`).not.toMatch(/^\/reports\/(expenses|clients|inventory)$/)
    }
  })
})

describe('the Expenses route is a money surface', () => {
  it('is caught by the /finance prefix without needing its own MONEY_ROUTES entry', () => {
    expect(isMoneySurface(EXPENSES_ROUTE)).toBe(true)
    expect(MONEY_ROUTES).not.toContain(EXPENSES_ROUTE)
    expect(MONEY_ROUTES).toContain('/finance')
  })

  it('is not caught by a bare startsWith, so a sibling path cannot be swept in', () => {
    // The prefix match is `path === r || path.startsWith(r + '/')`. A loosened
    // `startsWith('/finance')` would also claim this, which is the bug that
    // rule exists to prevent.
    expect(isMoneySurface('/finance-notes')).toBe(false)
  })

  it('is unreachable from the nav for every money-blind role', () => {
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Client'] as const) {
      const sections = permittedNav(role)
      expect(sections.some((s) => s.to === '/finance'), `${role} must not see Finance`).toBe(false)
    }
    expect(permittedNav('Accounts').some((s) => s.to === '/finance')).toBe(true)
  })
})
