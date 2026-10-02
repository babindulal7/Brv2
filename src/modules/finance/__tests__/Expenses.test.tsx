// @vitest-environment jsdom
/**
 * # Finance ▸ Expenses — what this suite holds down
 *
 * Four failure modes, all of them silent on screen:
 *
 *  1. **Restricted read as empty.** `expenses` has no `_v` view and exactly ONE
 *     select policy — `expenses_money_blind ... using (auth_can_view_money())`
 *     (0014:156-170). A money-blind session is answered `200` and `[]`, not a
 *     403. Unguarded, `useList` turns that into `isEmpty` and `PageBody` renders
 *     "No expenses yet", which tells a warehouse user this business has never
 *     spent anything. An empty state looks exactly like an empty state, so only
 *     a test can catch it.
 *  2. **A filter that narrows the page instead of the table.** The status chips
 *     and the category dropdown must reach Postgres. Over a paged list an
 *     in-memory `.filter()` leaves the pager and the count describing a
 *     different set than the rows.
 *  3. **A fabricated field beside real rows.** §9.4 draws VAT, method, paid-by
 *     and cost centre; `expenses` has a column for none of them. The old
 *     Expense *report* has plausible-looking values for all four in
 *     `src/data/expenseReports.ts`, so the specific hazard is that vocabulary
 *     leaking onto the ledger.
 *  4. **Rupees vs paisa the wrong way round.** A 100× error that still reads as
 *     a plausible rupee figure.
 *
 * The `supabase` module is replaced wholesale, exactly as
 * `Finance.restricted.test.tsx` and `lib/queries/__tests__/finance.test.ts` do.
 * Nothing here reaches a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FINANCE_RESTRICTED_REASON, FINANCE_REQUIRED_ROLE } from '../../../lib/queries/finance'
import { toBs, formatBs, formatAd } from '../../../lib/bs'

const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

/**
 * A recording stand-in for the postgrest builder.
 *
 * `calls` records every table a request was opened against — that is how case 1
 * proves the request was never SENT, rather than sent and hidden. `filters`
 * records the predicate calls per table, which is how case 2 proves a chip
 * became SQL.
 */
const db = vi.hoisted(() => {
  const tables = new Map<string, { rows: unknown[]; count: number | null }>()
  const calls: string[] = []
  const filters: Array<[string, string, unknown]> = []

  function builderFor(table: string) {
    const record = (op: string) => (column: string, value: unknown) => {
      filters.push([table, `${op}:${column}`, value])
      return builder
    }
    const builder: Record<string, unknown> = {
      select: () => builder,
      or: () => builder,
      in: (column: string, values: readonly unknown[]) => {
        filters.push([table, `in:${column}`, [...values]])
        return builder
      },
      eq: record('eq'),
      gte: record('gte'),
      lte: record('lte'),
      is: record('is'),
      not: () => builder,
      order: () => builder,
      range: () => builder,
      then(onFulfilled: (value: { data: unknown[]; error: null; count: number | null }) => unknown): void {
        const held = tables.get(table) ?? { rows: [], count: 0 }
        onFulfilled({ data: held.rows, error: null, count: held.count })
      },
    }
    return builder
  }

  return {
    tables,
    calls,
    filters,
    supabase: {
      from(table: string) {
        calls.push(table)
        return builderFor(table)
      },
      rpc: () => Promise.resolve({ data: 'EXP-2026-0001', error: null }),
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

window.matchMedia = ((q: string) => ({
  matches: false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Expenses } = await import('../Expenses')

const CATEGORY_ID = '00000000-0000-0000-0000-000000000401'

/**
 * One `expenses` row as PostgREST returns it, embeds included.
 *
 * `amount` is deliberately **not** a whole number of rupees: Rs 1,234.50 is the
 * exact figure a `parseInt(display.replace(/[^0-9]/g, ''))` round trip reads
 * back as Rs 1,23,450.
 *
 * `expense_date` sits inside the month `lib/bs.ts` vouches for, so the BS line
 * is a real conversion rather than the em dash an out-of-range day gets.
 */
function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    expense_no: 'EXP-2026-0007',
    expense_date: '2026-07-26',
    amount: 1234.5,
    vendor_name: 'Sagarmatha Camera Service',
    description: 'Sensor clean, two bodies',
    category_id: CATEGORY_ID,
    branch_id: '00000000-0000-0000-0000-000000000201',
    status: 'Pending Approval',
    booking_id: null,
    receipt_url: null,
    receipt_size: null,
    created_at: '2026-07-26T04:15:00.000Z',
    expense_categories: { code: 'EXP-MAINT', name: 'Equipment Maintenance & Repair' },
    branches: { name: 'Boudha' },
    bookings: null,
    ...overrides,
  }
}

function categoryRow() {
  return { id: CATEGORY_ID, code: 'EXP-MAINT', name: 'Equipment Maintenance & Repair', description: null }
}

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <StrictMode>
        <Expenses />
      </StrictMode>,
    )
  })
  return container
}

function button(c: HTMLElement, re: RegExp) {
  return Array.from(c.querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''))
}

async function click(el: Element | undefined, what: string) {
  if (!el) throw new Error(`${what} was never rendered`)
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

/** Every predicate this screen actually sent against `expenses`. */
function expenseFilters() {
  return db.filters.filter(([table]) => table === 'expenses')
}

beforeEach(() => {
  auth.role = 'Owner'
  db.tables.clear()
  db.calls.length = 0
  db.filters.length = 0
  db.tables.set('expenses', { rows: [], count: 0 })
  db.tables.set('expense_categories', { rows: [categoryRow()], count: 1 })
  db.tables.set('branches', { rows: [{ id: '00000000-0000-0000-0000-000000000201', name: 'Boudha' }], count: 1 })
})

describe('Expenses — a money-blind session is RESTRICTED, never empty', () => {
  it('renders the restricted state and never claims the business has no expenses', async () => {
    auth.role = 'Warehouse'
    const c = await mount()

    expect(c.textContent).toContain('Access restricted')
    expect(c.textContent).toContain(FINANCE_RESTRICTED_REASON)
    expect(c.textContent).toContain(FINANCE_REQUIRED_ROLE)

    // The defect this file exists for.
    expect(c.textContent).not.toContain('No expenses yet')
    expect(c.textContent).not.toContain('No expenses match these filters')
  })

  it('omits the entry action rather than disabling it, and constructs no rupee figure', async () => {
    auth.role = 'Warehouse'
    const c = await mount()
    expect(button(c, /^Add Expense$/)).toBeUndefined()
    expect(c.textContent).not.toContain('Rs ')
  })

  it('sends no request at all — not the list, and not the two lookups', async () => {
    /*
     * `expense_categories` and `branches` are `auth_is_staff()`, so a Warehouse
     * session genuinely CAN read them. Fetching them anyway would be two
     * requests for a screen that is not being shown, and their contents would
     * sit in the DOM of a page the session was refused.
     */
    auth.role = 'Warehouse'
    await mount()
    expect(db.calls).toEqual([])
  })

  it('is restricted for every money-blind role, not only Warehouse', async () => {
    for (const role of ['Warehouse', 'Technician', 'Driver', 'Client']) {
      auth.role = role
      db.calls.length = 0
      const c = await mount()
      expect(c.textContent, `${role} must be restricted`).toContain('Access restricted')
      expect(c.textContent, `${role} must not be told the table is empty`).not.toContain('No expenses yet')
      expect(db.calls, `${role} must not reach the database`).toEqual([])
    }
  })
})

describe('Expenses — a money-visible session with no rows is EMPTY, never restricted', () => {
  it('says the table is empty, in words that are about the data', async () => {
    const c = await mount()
    expect(c.textContent).toContain('No expenses yet')
    expect(c.textContent).not.toContain('Access restricted')
    expect(c.textContent).not.toContain(FINANCE_RESTRICTED_REASON)
  })
})

describe('Expenses — every figure is the query’s figure', () => {
  beforeEach(() => {
    db.tables.set('expenses', { rows: [expenseRow()], count: 1 })
  })

  it('renders a sub-rupee amount exactly, never through a parsed display string', async () => {
    const c = await mount()
    // numeric(14,2) rupees → paisa → lakh grouping.
    expect(c.textContent).toContain('Rs 1,234.50')
    expect(c.textContent).not.toContain('Rs 1,23,450')
  })

  it('renders the row from its own columns and its own embeds', async () => {
    const c = await mount()
    expect(c.textContent).toContain('EXP-2026-0007')
    expect(c.textContent).toContain('Sagarmatha Camera Service')
    expect(c.textContent).toContain('Equipment Maintenance & Repair')
    expect(c.textContent).toContain('EXP-MAINT')
    // `branches ( name )` — proof the embed is read rather than the uuid shown.
    expect(c.textContent).toContain('Boudha')
    expect(c.textContent).not.toContain('(category not joined)')
    expect(c.textContent).not.toContain('(branch not joined)')
  })

  it('renders BS above AD, both derived from the stored AD day (Law 7)', async () => {
    const c = await mount()
    const day = new Date('2026-07-26T00:00:00.000Z')
    const bs = toBs(day)
    expect(bs, 'the fixture date must sit inside the range lib/bs.ts vouches for').not.toBeNull()
    expect(c.textContent).toContain(formatBs(bs!))
    expect(c.textContent).toContain(formatAd(day))
  })

  it('shows the stored status with its own name, not a wireframe synonym', async () => {
    const c = await mount()
    // §9.4 draws a "(Submitted)" chip. `expense_status` has no such member —
    // the stored value is 'Pending Approval', and that is what renders.
    expect(c.textContent).toContain('Pending Approval')
    expect(c.textContent).not.toContain('Submitted')
  })
})

describe('Expenses — nothing without a column is rendered as a value', () => {
  beforeEach(() => {
    db.tables.set('expenses', { rows: [expenseRow()], count: 1 })
  })

  it('renders the VAT column as an explicit non-value with the reason attached', async () => {
    const c = await mount()
    expect(c.textContent).toContain('VAT')

    // The dash is not a bare blank: it carries the reason as its accessible
    // name, so a screen reader and a hover both get the fact.
    const marks = Array.from(c.querySelectorAll('[aria-label]')).filter((n) =>
      /Not recorded\./.test(n.getAttribute('aria-label') ?? ''),
    )
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0]?.textContent).toBe('—')
    expect(marks[0]?.getAttribute('aria-label')).toContain('no vat_amount and no vat_rate')
  })

  it('never prints the report fixture’s vocabulary beside a real row', async () => {
    /*
     * `src/data/expenseReports.ts` carries a payment method, a bill number, a
     * reclaimable-VAT figure and a monthly budget for every one of its twelve
     * hand-typed rows. None has a column on `expenses`. This is the assertion
     * that stops them being imported here "just to fill the wireframe".
     */
    const c = await mount()
    for (const invented of ['Bank Transfer', 'eSewa', 'Khalti', 'Bill ', 'Budget Remaining', 'Reclaimable VAT', 'Paid By']) {
      expect(c.textContent, `${invented} has no column on expenses`).not.toContain(invented)
    }
  })

  it('offers no Edit and no Delete — corrections are reversal rows (Law 3, Law 4)', async () => {
    const c = await mount()
    await click(c.querySelector('[aria-label^="Actions for"]') ?? undefined, 'the row menu')

    const menu = c.querySelector('[role="menu"]')
    expect(menu, 'the row menu must open').not.toBeNull()
    expect(menu?.textContent).not.toContain('Edit')
    expect(menu?.textContent).not.toContain('Delete')
    // Drawn, disabled, and carrying why — never silently missing.
    expect(menu?.textContent).toContain('Record a reversal')
    expect(menu?.textContent).toContain('Approve')
    expect(menu?.textContent).toContain('Reject')
  })
})

describe('Expenses — every filter is a database predicate', () => {
  beforeEach(() => {
    db.tables.set('expenses', { rows: [expenseRow()], count: 1 })
  })

  it('sends no status constraint while the All chip is selected', async () => {
    await mount()
    expect(expenseFilters().filter(([, op]) => op === 'in:status')).toEqual([])
  })

  it('turns a status chip into in(status, [...]) rather than filtering the page', async () => {
    const c = await mount()
    db.filters.length = 0
    await click(button(c, /^Approved$/), 'the Approved chip')

    const sent = expenseFilters().filter(([, op]) => op === 'in:status')
    expect(sent.length).toBeGreaterThan(0)
    expect(sent[0]?.[2]).toEqual(['Approved'])
  })

  it('filters by category id, never by the category name', async () => {
    const c = await mount()
    await click(c.querySelector('[aria-label="Show filters panel"]') ?? undefined, 'the Filters button')
    db.filters.length = 0

    const select = Array.from(c.querySelectorAll('select')).find(
      (s) => s.getAttribute('aria-label') === 'Filter expenses by category',
    )
    if (!select) throw new Error('the category filter was never rendered')
    await act(async () => {
      select.value = CATEGORY_ID
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const sent = expenseFilters().filter(([, op]) => op === 'in:category_id')
    expect(sent.length).toBeGreaterThan(0)
    // `expenses.category_id` is a uuid FK; matching on the NAME would need a
    // join filter `applyListFilters` cannot build and would return nothing.
    expect(sent[0]?.[2]).toEqual([CATEGORY_ID])
    expect(expenseFilters().some(([, , v]) => JSON.stringify(v).includes('Equipment Maintenance'))).toBe(false)
  })

  it('offers a chip for every stored status, so no row is unreachable', async () => {
    const c = await mount()
    for (const s of ['Draft', 'Pending Approval', 'Approved', 'Paid', 'Rejected', 'Cancelled']) {
      expect(button(c, new RegExp(`^${s}$`)), `${s} needs a chip`).toBeDefined()
    }
  })

  it('asks a fixed number of questions — never one per row', async () => {
    await mount()
    const withOneRow = [...db.calls]

    db.calls.length = 0
    db.tables.set('expenses', {
      rows: [
        expenseRow(),
        expenseRow({ id: 'b', expense_no: 'EXP-2026-0008' }),
        expenseRow({ id: 'c', expense_no: 'EXP-2026-0009' }),
        expenseRow({ id: 'd', expense_no: 'EXP-2026-0010' }),
      ],
      count: 4,
    })
    await mount()

    expect(db.calls).toEqual(withOneRow)
  })
})
