// @vitest-environment jsdom
/**
 * # Restricted is not empty
 *
 * `invoices` and `payments` have no `_v` view. Migration 0014 gates them
 * WHOLE-ROW (`<table>_money_blind ... using (auth_can_view_money())`), so a
 * Warehouse / Technician / Driver / Client session is not refused with a 403 —
 * it is answered `200` and `[]`.
 *
 * That is the whole hazard. `useList` turns `[]` into `isEmpty`, `PageBody`
 * turns `isEmpty` into "No invoices yet", and the screen ends up making a claim
 * about the business — *this company has never invoiced anybody* — that the
 * query never made and could not make. It is invisible on screen: an empty
 * state looks exactly like an empty state. Only a test can hold it down, which
 * is why this file exists rather than a note in the page header.
 *
 * The four cases below are the four ways it goes wrong:
 *  1. money-blind + no rows  → must say RESTRICTED, and must not say empty
 *  2. money-visible + no rows → must say EMPTY, and must not say restricted
 *  3. a figure must be the query's figure, not a parsed display string
 *  4. a total nobody could compute must be a dash, not a smaller number
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { FINANCE_RESTRICTED_REASON, FINANCE_REQUIRED_ROLE } from '../../../lib/queries/finance'

/**
 * The signed-in role, mutable between mounts. `useCanViewMoney()` reads
 * `useAuth()`, so this is the one input that decides which branch runs.
 */
const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-REAL', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

/**
 * `lib/supabase` replaced wholesale — the same boundary
 * `lib/queries/__tests__/finance.test.ts` and `bookings.test.ts` mock at.
 * Nothing here reaches a database, and `calls` records every table a request
 * was opened against, which is how case 1 proves the request was never sent.
 */
const db = vi.hoisted(() => {
  const tables = new Map<string, { rows: unknown[]; count: number | null }>()
  const calls: string[] = []

  function builderFor(table: string) {
    const pass = () => builder
    const builder = {
      select: pass,
      or: pass,
      in: pass,
      gte: pass,
      lte: pass,
      is: pass,
      not: pass,
      order: pass,
      range: pass,
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
    supabase: {
      from(table: string) {
        calls.push(table)
        return builderFor(table)
      },
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

const { default: Finance } = await import('../Finance')

/**
 * One `invoices` row as PostgREST returns it. `total_amount` is deliberately
 * **not** a whole number of rupees: Rs 1,234.50 is the exact figure the screen's
 * old `parseInt(amount.replace(/[^0-9]/g, ''))` read back as Rs 1,23,450.
 */
function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    invoice_no: 'INV-492',
    booking_id: '22222222-2222-4222-8222-222222222222',
    client_id: '33333333-3333-4333-8333-333333333333',
    status: 'Sent',
    issue_date: '2026-07-26',
    due_date: '2026-08-02',
    currency: 'NPR',
    subtotal: 1092.48,
    discount_amount: 0,
    discount_percent: 0,
    taxable_amount: 1092.48,
    vat_rate: 0.13,
    vat_amount: 142.02,
    total_amount: 1234.5,
    paid_amount: 0,
    outstanding_amount: 1234.5,
    voided_at: null,
    void_reason: null,
    credit_note_no: null,
    notes: null,
    created_at: '2026-07-26T00:00:00.000Z',
    clients: { name: 'ABC Films Pvt. Ltd.' },
    bookings: { booking_no: 'B-715' },
    ...overrides,
  }
}

/**
 * Every root this file mounts, so `afterEach` can tear them down.
 *
 * Finance keeps `CreateInvoiceModal` / `VoidInvoiceModal` mounted-but-closed
 * for a money-visible session, and `Modal.tsx:59` arms a `window.setTimeout`
 * for the close transition. A root that is never unmounted never runs that
 * effect's cleanup, so the timer fires after vitest has torn the jsdom
 * environment down and React reports `ReferenceError: window is not defined`
 * as an uncaught exception — attributed to this file, but caused by the
 * missing unmount rather than by anything the screen did wrong.
 *
 * It stayed invisible while every money-visible case here mounted once; the
 * role matrix below multiplies the mounts and made it reproducible.
 */
const roots: Array<{ root: Root; container: HTMLElement }> = []

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push({ root, container })
  await act(async () => {
    root.render(
      <StrictMode>
        <MemoryRouter>
          <Finance />
        </MemoryRouter>
      </StrictMode>,
    )
  })
  return container
}

/**
 * An **action** button — a header launcher or a row action.
 *
 * Tabs and filter chips are deliberately excluded, and that exclusion is the
 * whole point of the helper rather than an optimisation. Since `09_FINANCE.md`
 * §9.4 gave this screen its six real tabs and §9.2 its seven status chips, a
 * bare `querySelectorAll('button')` matches the **Payments tab** for `/Pay/`
 * and the **(Void) chip** for `/^Void$/` — so three permission assertions here
 * started failing against a screen whose permissions had not changed. A tab is
 * navigation and a chip is a filter; neither is an action a role is granted, so
 * neither belongs in a query that asks "is this session offered this action".
 *
 * Identified structurally (`role="tab"`, `aria-pressed`) rather than by label,
 * so renaming a tab or adding a chip cannot silently reintroduce the collision.
 */
function byText(c: HTMLElement, re: RegExp) {
  return Array.from(c.querySelectorAll('button'))
    .filter((b) => b.getAttribute('role') !== 'tab' && !b.hasAttribute('aria-pressed'))
    .find((b) => re.test(b.textContent ?? ''))
}

/** The tab strip, which `byText` above excludes on purpose. */
function byTab(c: HTMLElement, re: RegExp) {
  return Array.from(c.querySelectorAll('button[role="tab"]')).find((b) => re.test(b.textContent ?? '')) as
    | HTMLButtonElement
    | undefined
}

/** Switch to the Invoices tab, where the list's own empty/restricted state lives. */
async function openInvoicesTab(c: HTMLElement) {
  const tab = byTab(c, /^Invoices$/)
  if (!tab) throw new Error('the Invoices tab button was never rendered')
  await act(async () => { tab.click() })
}

beforeEach(() => {
  auth.role = 'Owner'
  db.tables.clear()
  db.calls.length = 0
  db.tables.set('invoices', { rows: [], count: 0 })
  db.tables.set('payments', { rows: [], count: 0 })
})

afterEach(async () => {
  // Runs the effect cleanups — see `roots` above for what leaks without it.
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount())
    container.remove()
  }
})

describe('Finance — a money-blind session is RESTRICTED, never empty', () => {
  it('renders the restricted state, names the role, and never claims there are no invoices', async () => {
    auth.role = 'Warehouse'
    const c = await mount()

    // The restricted state, with the reason the query module owns.
    expect(c.textContent).toContain('Access restricted')
    expect(c.textContent).toContain(FINANCE_RESTRICTED_REASON)
    expect(c.textContent).toContain(FINANCE_REQUIRED_ROLE)

    // The defect this whole file exists for: RLS answered `[]`, and the screen
    // must not turn that into a statement about the business.
    expect(c.textContent).not.toContain('No invoices yet')
    expect(c.textContent).not.toContain('No voided invoices')
    expect(c.textContent).not.toContain('No payment was received')

    // Law 6 — omitted, not masked. Not one rupee figure is constructed, and the
    // three header actions that operate on withheld records are not offered.
    expect(c.textContent).not.toContain('Rs ')
    expect(byText(c, /^Record Payment$/)).toBeUndefined()
    expect(byText(c, /^Create Invoice$/)).toBeUndefined()
    expect(byText(c, /^Export$/)).toBeUndefined()
  })

  it('does not send the four requests it already knows RLS will refuse', async () => {
    auth.role = 'Warehouse'
    await mount()
    expect(db.calls).toEqual([])
  })

  it('still says restricted on the Invoices tab, where the empty state lives', async () => {
    auth.role = 'Warehouse'
    const c = await mount()
    await openInvoicesTab(c)
    expect(c.textContent).toContain('Access restricted')
    expect(c.textContent).not.toContain('No invoices yet')
  })
})

describe('Finance — a money-visible session with no rows is EMPTY, never restricted', () => {
  it('says the table is empty, and says it in words that are about the data', async () => {
    const c = await mount()
    await openInvoicesTab(c)

    expect(c.textContent).toContain('No invoices yet')
    expect(c.textContent).not.toContain('Access restricted')
    // "Nothing matched" and "you may not look" must not be offered together.
    expect(c.textContent).not.toContain(FINANCE_RESTRICTED_REASON)
  })

  it('asks a fixed number of questions — never one per row', async () => {
    /*
     * The screen makes four reads: the invoice list, the outstanding set, the
     * overdue set, and the payments in the period. The number must not depend on
     * how many rows come back — a per-row fetch (for line items, for receipts)
     * is the classic way a converted list turns one request into fifty.
     *
     * The count is compared against itself rather than asserted as a literal,
     * because StrictMode double-invokes effects in development and pinning the
     * doubled number would pin a React version, not this screen's behaviour.
     */
    await mount()
    const withNoRows = [...db.calls]

    db.calls.length = 0
    db.tables.set('invoices', {
      rows: [
        invoiceRow(),
        invoiceRow({ id: 'b', invoice_no: 'INV-493' }),
        invoiceRow({ id: 'c', invoice_no: 'INV-494' }),
        invoiceRow({ id: 'd', invoice_no: 'INV-495' }),
        invoiceRow({ id: 'e', invoice_no: 'INV-496' }),
      ],
      count: 5,
    })
    await mount()

    expect(db.calls).toEqual(withNoRows)
    // Three questions of `invoices` to one of `payments`, whatever the row count.
    const payments = db.calls.filter((t) => t === 'payments').length
    expect(payments).toBeGreaterThan(0)
    expect(db.calls.filter((t) => t === 'invoices')).toHaveLength(payments * 3)
  })
})

describe('Finance — every figure is the query’s figure', () => {
  it('renders a sub-rupee total exactly, never through a parsed display string', async () => {
    db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
    const c = await mount()
    await openInvoicesTab(c)

    expect(c.textContent).toContain('INV-492')
    expect(c.textContent).toContain('ABC Films Pvt. Ltd.')
    expect(c.textContent).toContain('B-715')
    // numeric(14,2) rupees → paisa → lakh grouping. The old string round-trip
    // produced Rs 1,23,450 from exactly this figure.
    expect(c.textContent).toContain('Rs 1,234.50')
    expect(c.textContent).not.toContain('Rs 1,23,450')
    expect(c.textContent).not.toContain('No invoices yet')
  })

  it('takes the KPI count from the exact count, and refuses to sum a partial answer', async () => {
    // Three invoices match; one came back. `count: 'exact'` still knows there
    // are three, so the COUNT is stateable and the TOTAL is not.
    db.tables.set('invoices', { rows: [invoiceRow()], count: 3 })
    const c = await mount()

    expect(c.textContent).toContain('Outstanding Invoices')
    expect(c.textContent).toContain('3')
    // A sum over the one row in hand would print Rs 1,234.50 as though it were
    // the receivable for all three.
    expect(c.textContent).toContain('— receivable')
    expect(c.textContent).not.toContain('Rs 1,234.50 receivable')
  })

  it('states the exact receivable when the rows in hand ARE the whole answer', async () => {
    db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
    const c = await mount()
    expect(c.textContent).toContain('Rs 1,234.50 receivable')
    expect(c.textContent).not.toContain('— receivable')
  })
})

/**
 * Seeing the money and being allowed to MOVE it are different questions, and
 * this screen used to answer only the first: all three Record Payment launchers
 * (header button, table row `+ Pay`, phone card `+ Pay`) were behind the page's
 * `money` gate alone.
 *
 * `money` admits Admin and Manager. `rbac.canRecordPayment` — the rule
 * `actions/core.ts` resolves `recordPayment`'s `payment.create` through — does
 * not: it is Owner / Coordinator / Accounts. So an Admin was shown the button,
 * given a form, and refused by the dispatcher only after typing an amount.
 *
 * The cases below are the two halves that must not collapse into each other:
 * an Admin keeps every FIGURE and loses every payment LAUNCHER. Both roles are
 * asserted, because Manager's grants mirror Admin's and a fix that only
 * remembered one of them is the same defect half-fixed.
 */
describe('Finance — money visibility is not permission to record a payment', () => {
  for (const role of ['Admin', 'Manager']) {
    it(`shows ${role} the figures and the other actions, but no payment launcher`, async () => {
      auth.role = role
      db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
      const c = await mount()

      // NOT restricted: this role may read the ledger, and every figure stands.
      expect(c.textContent).not.toContain('Access restricted')
      expect(c.textContent).toContain('Rs 1,234.50 receivable')
      /*
       * Export is not a money ACT — it writes nothing and serialises rows this
       * session already has — so it stays on the page's `money` gate and stands.
       */
      expect(byText(c, /^Export$/)).toBeDefined()
      /*
       * Create Invoice is asserted PRESENT here, and the change is deliberate.
       *
       * History, because this assertion has now been all three things it could
       * be. It first stood here as "not a payment and untouched" — the launcher
       * was ungated, offered to every role that could merely READ the ledger.
       * It was then gated on `canVoidInvoice` (Owner / Accounts) as the narrowest
       * money rule available, under a TODO(decision) recording that `lib/rbac`
       * had no invoice-creation rule at all, and this line became
       * `toBeUndefined()`.
       *
       * That decision is now RULED. `RULINGS-2026-09-04.md` **R-05**: *"Owner ·
       * Admin · Manager · Accounts may move an invoice out of Draft"*, and
       * SPEC-P0-1 §3.1 names the same four for creation. `rbac.canIssueInvoice`
       * encodes it, `actions/core.ts:231` resolves `invoice.create` through that
       * predicate, and `CreateInvoiceModal` now dispatches `createInvoice` — so
       * the launcher gate MUST mirror it (§4.20). Withholding the control from a
       * role the dispatcher would accept is wrong in the safe direction, which is
       * still wrong.
       *
       * Void below is untouched and still `toBeUndefined()` for these two roles:
       * no 4 Sep ruling restates who may void, and R-00 says silence is not
       * supersession.
       */
      expect(byText(c, /^Create Invoice$/)).toBeDefined()

      // Launcher 1 — the header button. Absent, not disabled: a greyed control
      // still tells you the action exists here.
      expect(byText(c, /^Record Payment$/)).toBeUndefined()

      // Launchers 2/3 — the row action, on the invoice with Rs 1,234.50
      // outstanding that would otherwise qualify for `+ Pay`.
      await openInvoicesTab(c)
      expect(c.textContent).toContain('INV-492')
      expect(byText(c, /Pay/)).toBeUndefined()
      /*
       * Void followed `+ Pay`, for the same reason and one step later. The row
       * action was gated on `!row.isVoid` alone — a fact about the INVOICE,
       * with no question about the session — while `actions/core.ts:113-114`
       * resolves `invoice.void` through `rbac.canVoidInvoice`, which is Owner /
       * Accounts. Admin and Manager fall outside it, so offering them the
       * button is the identical defect this whole describe block exists for.
       *
       * This line read `toBeDefined()` while only `+ Pay` had been gated, and
       * `Finance.tsx:295-307` is what moved past it. The RULE did not move:
       * `lib/rbac.ts:68` is untouched and `Settings.tsx:1376` prints the same
       * predicate in the capability matrix. Only the launcher caught up.
       *
       * The two cases below are the other half — a gate that hid Void from
       * everybody would satisfy this line and still be wrong.
       */
      expect(byText(c, /^Void$/)).toBeUndefined()
    })
  }

  /*
   * `canVoidInvoice` is Owner / Accounts — strictly narrower than
   * `canRecordPayment`'s Owner / Coordinator / Accounts. Both halves are
   * asserted because the two rules are not the same rule, and a fix that gated
   * Void on `canTakePayment` would pass every case above while handing
   * Coordinator a terminal action rbac does not admit.
   */
  for (const role of ['Owner', 'Accounts']) {
    it(`still offers ${role} the Void rbac admits`, async () => {
      auth.role = role
      db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
      const c = await mount()
      await openInvoicesTab(c)
      expect(byText(c, /^Void$/)).toBeDefined()
    })
  }

  it('withholds Void from Coordinator, who may take a payment but not void one', async () => {
    auth.role = 'Coordinator'
    db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
    const c = await mount()
    await openInvoicesTab(c)
    expect(byText(c, /^\+ Pay$/)).toBeDefined()
    expect(byText(c, /^Void$/)).toBeUndefined()
  })

  /*
   * Create Invoice, the fourth launcher, pinned in both directions.
   *
   * The positive list is R-05's four — Owner · Admin · Manager · Accounts — and
   * the negative case is Coordinator, which is what pins WHICH rule is in force:
   * `canRecordPayment` admits Coordinator and `rbac.canIssueInvoice` does not,
   * so a silent switch to `canTakePayment` fails here and nowhere else. Admin
   * and Manager are asserted in the money-visibility block above, where their
   * absence used to be asserted instead.
   */
  for (const role of ['Owner', 'Admin', 'Manager', 'Accounts']) {
    it(`still offers ${role} the Create Invoice launcher`, async () => {
      auth.role = role
      db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
      const c = await mount()
      expect(byText(c, /^Create Invoice$/)).toBeDefined()
    })
  }

  it('withholds Create Invoice from Coordinator, whom R-05 does not name', async () => {
    auth.role = 'Coordinator'
    db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
    const c = await mount()
    expect(byText(c, /^Record Payment$/)).toBeDefined()
    expect(byText(c, /^Create Invoice$/)).toBeUndefined()
  })

  for (const role of ['Owner', 'Coordinator', 'Accounts']) {
    it(`still offers ${role} the launcher rbac admits`, async () => {
      auth.role = role
      db.tables.set('invoices', { rows: [invoiceRow()], count: 1 })
      const c = await mount()

      expect(byText(c, /^Record Payment$/)).toBeDefined()
      await openInvoicesTab(c)
      // Anchored: a bare /Pay/ would also match the header's "Record Payment"
      // and pass even if the row action had been dropped for everyone.
      const pay = byText(c, /^\+ Pay$/)
      expect(pay).toBeDefined()
      expect(pay!.classList.contains('ui-button--primary')).toBe(true)
      expect(pay!.style.background).toBe('var(--btn-primary-bg)')
      expect(pay!.style.color).toBe('var(--btn-primary-fg)')
      expect(Number.parseInt(pay!.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
    })
  }
})

describe('Finance — no invented figure survives', () => {
  it('prints none of the five P&L constants the screen used to hold', async () => {
    const c = await mount()
    // REVENUE 1985000 · COST_OF_RENTAL 742000 · OPERATING_EXPENSES 413000 ·
    // GROSS_PROFIT 1243000 · NET_PROFIT 830000 · RECEIVED 1250000 ·
    // RECEIVABLE 735000, and the hard-typed Outstanding Invoices value '23'.
    for (const invented of ['19,85,000', '7,42,000', '4,13,000', '12,43,000', '8,30,000', '12,50,000', '7,35,000']) {
      expect(c.textContent).not.toContain(invented)
    }
    // The Payment Methods donut was five hand-typed rows; with no payments in
    // the period there is nothing to draw and the card says so.
    expect(c.textContent).toContain('No payment was received in this period')
    for (const method of ['Bank Transfer', 'eSewa', 'Khalti']) {
      expect(c.textContent).not.toContain(method)
    }
  })
})

describe('Finance — phone header de-crowding (<768px)', () => {
  it('collapses secondary actions into More menu and shows Payment on phone', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true })
    window.dispatchEvent(new Event('resize'))
    const c = await mount()

    // Primary action on phone is compact "Payment"
    const paymentBtn = byText(c, /^Payment$/)
    expect(paymentBtn).toBeDefined()
    expect(paymentBtn?.getAttribute('aria-label')).toBe('Record Payment')

    // On phone, secondary actions (Create Invoice, Export) are NOT in the header row
    expect(byText(c, /^Create Invoice$/)).toBeUndefined()
    expect(byText(c, /^Export$/)).toBeUndefined()

    // More actions menu button exists and has 44px hit target
    const moreBtn = c.querySelector('button[aria-haspopup="menu"][aria-label="More actions"]')
    expect(moreBtn).not.toBeNull()

    // Reset innerWidth for other tests
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true })
    window.dispatchEvent(new Event('resize'))
  })
})
