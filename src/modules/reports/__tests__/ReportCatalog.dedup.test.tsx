// @vitest-environment jsdom
/**
 * # Rulings §11.3, on screen
 *
 * `catalog.test.ts` proves the register was deduplicated. That is half the
 * ruling. The half this file covers is the second row of §11.3's table —
 * *"the group-06 entries **deep-link into the Finance tab**, they do not
 * duplicate it"* — and what that has to look like on screen for a reader to tell
 * the two kinds of row apart.
 *
 * (§11.3 is prose and a three-row table; it has no numbered points. An earlier
 * draft of this header quoted "point 3" of the implementation brief as though it
 * were the ruling. A brief is not an artifact anyone can go and check later, so
 * the citation is to the register.)
 *
 * A register change with no rendered consequence would pass every assertion in
 * the sibling suite and still ship two rows that look like reports and behave
 * like links. So this one mounts the real catalog and reads the DOM:
 *
 *  - the Payments row is an anchor to `/finance/payments` that says which tab
 *    it opens **in words** — Law 11, never a colour or a weight alone;
 *  - it is not a button, so it cannot open the §9.7 template and render the
 *    same money a second time, which is the duplication §11.3 removes;
 *  - an ordinary report row still is a button;
 *  - Profit & Loss appears once;
 *  - and `CATALOG_ERRORS` is empty, so the page is not shipping its own
 *    failure banner — the trap of re-pointing the register without re-pointing
 *    the counts that guard it.
 *
 * Environment pragma per `vitest.config.ts`; auth mocked at the same boundary
 * `ExpenseReports.toolbar.test.tsx` mocks it, because the whole catalog is
 * money and `useCanViewMoney` gates it (Law 6).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** jsdom implements no `matchMedia`; `lib/device.ts` subscribes to two queries. */
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

const { ReportCatalog } = await import('../ReportCatalog')
const { CATALOG_ERRORS, REPORTS } = await import('../catalog')

let container: HTMLDivElement
let root: Root

/** Mounts the catalog and switches it to DETAILED, where the register is drawn. */
async function mountDetailed() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ReportCatalog />
      </MemoryRouter>,
    )
  })

  const detailed = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Detailed')
  if (!detailed) throw new Error('No Detailed toggle on screen')
  await act(async () => {
    detailed.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the catalog draws a tab deep-link differently from a report', () => {
  it('renders Payments as a link that names the tab it opens', async () => {
    await mountDetailed()

    const link = container.querySelector<HTMLAnchorElement>('a[href="/finance/payments"]')
    expect(link, 'no link to the Payments tab in the catalog').not.toBeNull()
    expect(link?.textContent).toContain('Payments')
    /* The words, not an icon alone and not a colour alone — Law 11. */
    expect(link?.textContent).toContain('Opens the Payments tab')
    /* Law 15 — 44px at every width, including this row. */
    expect(link?.style.minHeight).toBe('44px')
  })

  it('renders Expenses the same way, and only those two', async () => {
    await mountDetailed()

    expect(container.querySelector('a[href="/finance/expenses"]')?.textContent).toContain('Opens the Expenses tab')
    const tabRows = [...container.querySelectorAll('a')].filter((a) => (a.textContent ?? '').includes('Opens the'))
    expect(tabRows).toHaveLength(REPORTS.filter((r) => r.financeTab).length)
    expect(tabRows).toHaveLength(2)
  })

  it('does not also offer them as report tiles that would re-render the same money', async () => {
    await mountDetailed()

    /* A report row is a `<button>` carrying the report's name. If Payments were
       still one, clicking it would open the §9.7 template over the `cash`
       projection — the Finance tab's own figures, drawn twice. */
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(buttons.some((t) => t.trim() === 'Payments')).toBe(false)
    expect(buttons.some((t) => t.trim() === 'Expenses')).toBe(false)

    /* …while an ordinary report still is a button, so the two are genuinely
       different renderings and not both links. */
    expect(buttons.some((t) => t.trim() === 'Cash Flow')).toBe(true)
  })

  it('lists Profit & Loss once, under 01 Overview', async () => {
    await mountDetailed()

    const occurrences = (container.textContent ?? '').split('Profit & Loss').length - 1
    expect(occurrences).toBe(1)
  })

  it('ships no reconciliation banner — the counts were re-pointed, not deleted', async () => {
    await mountDetailed()

    expect(CATALOG_ERRORS).toEqual([])
    expect(container.textContent).not.toContain('The report register does not reconcile')
    /* The footer states the count from the register itself, so the copy cannot
       still say 45 while the list holds 43. */
    expect(REPORTS.length).toBe(43)
    expect(container.textContent).not.toContain('reports, each with one home')
  })
})
