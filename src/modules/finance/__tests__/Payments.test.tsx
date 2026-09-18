// @vitest-environment jsdom
/**
 * # Finance ▸ Payments — the mappings, and what §9.3 actually renders
 *
 * Two halves, deliberately in one file because the screen keeps its own filter
 * vocabulary (there is no `data/payments.ts` to pin separately):
 *
 *  1. **The mappings** — chip → `ListFilters`, day → `payment_date` bound,
 *     row → cell. Pure functions, no DOM.
 *  2. **The screen** — the four states, the three layouts, and every affordance
 *     §9.3 draws that this build cannot answer, which must stay visibly disabled
 *     rather than quietly returning zero rows.
 *
 * The claims worth failing over:
 *
 *  - a money-blind session gets **restricted**, never "no payments yet";
 *  - `(Refunded)` filters `payment_type`, never the derived `payment_status`
 *    member, which would match nothing forever;
 *  - `(Reversed)` and `[method ▾]` are drawn, disabled, and say why;
 *  - the day filter is bound at **Kathmandu** midnight, not UTC midnight;
 *  - the screen offers no edit — Law 4 — and its row action is Reverse;
 *  - `nav.ts` records where the tab goes.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { PaymentListRow } from '../../../lib/queries/finance'

/* `queries/finance.ts` holds the supabase client. Replaced wholesale — nothing
   here touches a database. */
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

const RECEIPT: PaymentListRow = {
  id: 'aa11bb22-cc33-4d44-8e55-ff6677889900',
  paymentNo: 'PAY-0007',
  bookingId: '8f1d1a56-0b6a-4f0e-9d3c-2f4b6c7a9e11',
  bookingNo: 'B-715',
  invoiceId: '11112222-3333-4444-8555-666677778888',
  invoiceNo: 'INV-0042',
  clientId: 'c0ffee00-1111-4222-8333-444455556666',
  clientName: 'Mountain Stories',
  amount: 1_250_000 as PaymentListRow['amount'],
  paymentType: 'Advance Payment',
  status: 'Received',
  paymentDateAd: '2026-08-11T09:30:00.000Z',
  channelGroup: 'Digital wallets',
  bankName: 'eSewa',
  transactionRef: 'TXN-9948123',
  notes: null,
  receivedById: '00000000-0000-0000-0000-000000000101',
  createdAtAd: '2026-08-11T09:30:04.000Z',
}

/** An advance: no invoice yet, and no destination account recorded. */
const ADVANCE: PaymentListRow = {
  ...RECEIPT,
  id: 'bb22cc33-dd44-4e55-8f66-001122334455',
  paymentNo: 'PAY-0008',
  invoiceId: null,
  invoiceNo: null,
  channelGroup: null,
  bankName: null,
  transactionRef: null,
}

let paymentRows: PaymentListRow[] = [RECEIPT, ADVANCE]

/**
 * How many reads the screen actually issued.
 *
 * A money-blind session must issue ZERO. RLS answers `200`/`[]` rather than
 * `403`, so a request that "works" is indistinguishable from an empty ledger —
 * counting the calls is the only way to tell a gate from a coincidence.
 */
const reads = { payments: 0, invoices: 0 }

/* The real filter sets and the real day arithmetic are kept — only the fetch is
   replaced, so the table renders and `paymentsInPeriod` is genuinely exercised. */
vi.mock('../../../lib/queries/finance', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/finance')>()
  return {
    ...real,
    listPayments: async () => {
      reads.payments += 1
      return { rows: paymentRows, total: paymentRows.length }
    },
    listInvoices: async () => {
      reads.invoices += 1
      return { rows: [], total: 0 }
    },
  }
})

let canViewMoney = true
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => canViewMoney }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mod = await import('../Payments')
const {
  default: Payments,
  paymentChipFilters,
  paymentDateRange,
  paymentFilters,
  methodLabel,
  formatPaymentAt,
  paymentBsLabel,
  chipFromParam,
  PAYMENT_CHIPS,
} = mod

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 · The mappings
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('chip → ListFilters', () => {
  it('offers only the three chips the database can answer', () => {
    expect([...PAYMENT_CHIPS]).toEqual(['All', 'Received', 'Refunded'])
  })

  it('All sends no narrowing constraint at all', () => {
    const f = paymentChipFilters('All')
    expect(f.chips).toBeUndefined()
    expect(f.presence).toBeUndefined()
    expect(f.dateRange).toBeUndefined()
  })

  it('Received asks the one reachable live status', () => {
    expect(paymentChipFilters('Received').chips).toEqual({ status: ['Received'] })
  })

  /**
   * The single most important assertion in this file. `payment_status`'s
   * 'Refunded' is derived from a reversal row and is never written (0001:285),
   * so a chip that sent it would return zero rows forever and report "no
   * refunds" to a business that has issued them.
   */
  it('Refunded filters payment_type, NOT the derived payment_status member', () => {
    const f = paymentChipFilters('Refunded')
    expect(f.chips).toEqual({ payment_type: ['Refund'] })
    expect(JSON.stringify(f)).not.toContain('status')
  })

  it('no chip ever sends the forbidden Security Deposit payment type (Law 5)', () => {
    for (const c of PAYMENT_CHIPS) {
      expect(JSON.stringify(paymentChipFilters(c))).not.toContain('Security Deposit')
    }
  })

  it('every chip sorts newest receipt first', () => {
    for (const c of PAYMENT_CHIPS) {
      expect(paymentChipFilters(c).sort).toEqual({ column: 'payment_date', ascending: false })
    }
  })
})

describe('day filter → payment_date bounds', () => {
  it('is no constraint at all when neither end is picked', () => {
    expect(paymentDateRange('', '')).toBeNull()
  })

  /**
   * `payment_date` is a `timestamptz`; a bare 'YYYY-MM-DD' would be read as
   * midnight UTC, which is 05:45 the same morning in Kathmandu. A month's
   * takings would start 5h45m late and stop 5h45m early, silently.
   */
  it('bounds both ends at Kathmandu midnight, not UTC midnight', () => {
    const r = paymentDateRange('2026-08-01', '2026-08-31')
    expect(r?.column).toBe('payment_date')
    expect(r?.fromAd).toBe('2026-08-01T00:00:00.000+05:45')
    expect(r?.toAd).toBe('2026-08-31T23:59:59.999+05:45')
  })

  it('is inclusive at both ends, so a one-day range is a whole day', () => {
    const r = paymentDateRange('2026-08-11', '2026-08-11')
    expect(r?.fromAd).toBe('2026-08-11T00:00:00.000+05:45')
    expect(r?.toAd).toBe('2026-08-11T23:59:59.999+05:45')
  })

  it('accepts a range open at one end and sends only that bound', () => {
    const from = paymentDateRange('2026-08-01', '')
    expect(from?.fromAd).toBe('2026-08-01T00:00:00.000+05:45')
    expect(from?.toAd).toBeUndefined()

    const to = paymentDateRange('', '2026-08-31')
    expect(to?.fromAd).toBeUndefined()
    expect(to?.toAd).toBe('2026-08-31T23:59:59.999+05:45')
  })

  /**
   * The offset is formatted from `bs.ts`'s `NPT_OFFSET_MIN` inside
   * `queries/finance.ts` and borrowed from there. A literal '+05:45' typed on
   * this screen would be the second copy Calendar.md §4.2 calls the
   * highest-priority correctness bug in the product.
   */
  it('never hardcodes the offset on this screen — the bound comes from paymentsInPeriod', () => {
    expect(mod).not.toHaveProperty('NPT_OFFSET')
  })

  it('binds the range onto the chip predicate rather than replacing it', () => {
    const f = paymentFilters('Received', '2026-08-01', '2026-08-31')
    expect(f.chips).toEqual({ status: ['Received'] })
    expect(f.dateRange?.fromAd).toBe('2026-08-01T00:00:00.000+05:45')
  })

  it('leaves dateRange off entirely when no day is picked', () => {
    expect(paymentFilters('All', '', '').dateRange).toBeUndefined()
  })

  it('binds page pagination onto filters', () => {
    expect(paymentFilters('All', '', '', 3).page).toEqual({ index: 2, size: 25 })
  })
})

describe('row → cell', () => {
  it('names the channel group and the bank behind it', () => {
    expect(methodLabel(RECEIPT)).toBe('Digital wallets · eSewa')
  })

  /**
   * `bank_account_id` is nullable and 'Cash' is a channel group of its own, so
   * reading cash out of an absence would manufacture a fact.
   */
  it('renders an absent method as an explicit non-value, never as Cash', () => {
    expect(methodLabel(ADVANCE)).toBe('—')
    expect(methodLabel(ADVANCE)).not.toContain('Cash')
  })

  it('renders the instant in Kathmandu, not UTC', () => {
    // 09:30 UTC on 11 Aug is 15:15 the same day in Kathmandu.
    expect(formatPaymentAt(RECEIPT.paymentDateAd)).toContain('15:15')
    expect(formatPaymentAt(RECEIPT.paymentDateAd)).toContain('11 Aug 2026')
  })

  it('refuses to print a date it cannot parse', () => {
    expect(formatPaymentAt('not-a-date')).toBe('—')
    expect(paymentBsLabel('not-a-date')).toBeNull()
  })

  /**
   * `bs.ts` covers BS 2078–2095; outside that span no BS line is printed.
   *
   * Both figures moved on 5 Sep 2026 when the 2078–2095 table landed and the
   * anchor was corrected by one day (1 Shrawan 2083 is 17 Jul 2026, not 16):
   *   · 11 Aug 2026 is **26** Shrawan, not 27.
   *   · 1 Jan 2027 now resolves (17 Poush 2083) — it used to be outside the
   *     one-month window. The honest-null contract moved to the edge of the
   *     TABLE, so this asserts a year the table genuinely cannot name.
   */
  it('omits the BS reading rather than inventing one outside the years bs.ts vouches for', () => {
    expect(paymentBsLabel('2026-08-11T09:30:00.000Z')).toBe('26 Shrawan 2083 BS')
    expect(paymentBsLabel('2040-01-01T00:00:00.000Z')).toBeNull()
  })

  it('reads the chip back out of the URL, defaulting to All', () => {
    expect(chipFromParam('received')).toBe('Received')
    expect(chipFromParam('refunded')).toBe('Refunded')
    expect(chipFromParam(null)).toBe('All')
    expect(chipFromParam('reversed')).toBe('All')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 · The screen
 * ═══════════════════════════════════════════════════════════════════════════ */

let container: HTMLDivElement
let root: Root

async function mount(width: number, entry = '/finance/payments') {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Payments />
      </MemoryRouter>,
    )
  })
  // One more tick so `useList`'s async fetch has resolved into the tree.
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  canViewMoney = true
  paymentRows = [RECEIPT, ADVANCE]
  reads.payments = 0
  reads.invoices = 0
})

const text = () => container.textContent ?? ''
const allButtons = () => [...container.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => b.textContent?.trim() === label)

describe('Law 6 — restricted, never empty', () => {
  /**
   * `payments` has no `_v` view; RLS gates it whole-row, so a money-blind
   * session gets HTTP 200 and `[]`. Rendering that as "No payments yet" tells a
   * warehouse user this business has taken no money, which is a different and
   * false claim.
   */
  it('renders the restricted state for a money-blind session, with no rows fetched', async () => {
    canViewMoney = false
    paymentRows = []
    await mount(1280)
    expect(text()).not.toContain('No payments yet')
    expect(text()).toContain('Accounts')
    expect(text()).toMatch(/money visibility/i)
  })

  /**
   * REGRESSION, 12 Aug 2026. The restricted BODY was always correct; the Card
   * TITLE was not, and it lives outside `PageBody` where the ladder cannot
   * reach it. `withCount: true` against an RLS-refused read returns `count: 0`,
   * so the page rendered
   *
   *     Payments — 0 payments      [RESTRICTED]
   *
   * — the exact claim ("this business has taken no money") that the restricted
   * state exists to avoid making, leaking out through the one string the gate
   * does not cover.
   *
   * `paymentRows` is left POPULATED here on purpose. The old test pinned this
   * case with `paymentRows = []`, which cannot distinguish "the gate held" from
   * "the mock happened to return nothing" — and that is why the defect survived
   * a suite that already had a Law 6 block. If the gate is ever removed, the
   * two receipts below reach the DOM and every assertion here fails.
   */
  it('makes no claim about how many payments exist, and issues no read at all', async () => {
    canViewMoney = false
    await mount(1280)

    // Not "0 payments", and not "2 payments" either — no count, in any form.
    // No `\b` after the noun: the title abuts the table header, so the rendered
    // string is literally `…2 paymentsPayment…` and a word boundary never lands.
    expect(text()).not.toMatch(/\d+\s+payments?/i)
    expect(text()).not.toContain('PAY-0007')
    expect(text()).not.toContain('PAY-0008')

    // A request RLS will refuse is not a gate. Neither read may be issued.
    expect(reads).toEqual({ payments: 0, invoices: 0 })
  })

  it('DOES count for a money-visible session, so the assertion above is not vacuous', async () => {
    await mount(1280)
    expect(text()).toMatch(/Payments — 2 payments/)
    expect(reads.payments).toBeGreaterThan(0)
  })

  it('offers no Record Payment button to a money-blind session', async () => {
    canViewMoney = false
    paymentRows = []
    await mount(1280)
    expect(button('Record Payment')).toBeUndefined()
  })

  it('says "no payments yet" only for a session that CAN see money', async () => {
    paymentRows = []
    await mount(1280)
    expect(text()).toContain('No payments yet')
  })
})

describe('Law 4 — the screen offers no edit', () => {
  it('draws Reverse on the row and never an Edit or Delete', async () => {
    await mount(1280)
    expect(button('Reverse')).toBeDefined()
    expect(button('Edit')).toBeUndefined()
    expect(button('Delete')).toBeUndefined()
    expect(text()).not.toContain('Delete')
  })

  it('disables Reverse on an advance, naming the reason rather than passing a payment id as an invoice id', async () => {
    await mount(1280)
    const reverse = allButtons().filter((b) => b.textContent?.trim() === 'Reverse')
    expect(reverse).toHaveLength(2)
    // PAY-0007 is invoice-linked; PAY-0008 is an advance.
    expect(reverse[0]?.disabled).toBe(false)
    expect(reverse[1]?.disabled).toBe(true)
    expect(reverse[1]?.getAttribute('aria-label')).toContain('advance')
  })

  /** The reversal is invoice-scoped today; the control must not imply otherwise. */
  it('says on the control itself that the reversal lands on the invoice, not this payment', async () => {
    await mount(1280)
    const reverse = allButtons().find((b) => b.textContent?.trim() === 'Reverse')
    expect(reverse?.getAttribute('aria-label')).toContain('original_payment_id')
  })

  it('states that no ↳ reversal row is drawn, so its absence is not read as "none exist"', async () => {
    await mount(1280)
    expect(text()).toContain('payment_reversals')
    expect(text()).toContain('not a claim that none exist')
  })

  it('keeps that note visible on an empty ledger, where it is most easily misread', async () => {
    paymentRows = []
    await mount(1280)
    expect(text()).toContain('payment_reversals')
  })
})

describe('§9.3 filter row — every control is server-side or visibly disabled', () => {
  it('draws the three answerable chips plus a disabled Reversed', async () => {
    await mount(1280)
    const chips = allButtons()
      .filter((b) => b.getAttribute('aria-pressed') !== null)
      .map((b) => b.textContent?.trim())
    expect(chips).toEqual(['All', 'Received', 'Refunded'])

    const reversed = allButtons().find((b) => b.textContent?.trim().startsWith('Reversed'))
    expect(reversed?.disabled).toBe(true)
    expect(reversed?.getAttribute('aria-label')).toContain('payment_reversals')
  })

  it('draws the method control disabled, naming what is missing', async () => {
    await mount(1280)
    const method = container.querySelector('select')
    expect(method?.disabled).toBe(true)
    expect(method?.getAttribute('aria-label')).toContain('bank_accounts')
  })

  it('draws two live day inputs', async () => {
    await mount(1280)
    /*
     * These were `input[type="date"]` until 4 Sep 2026. They are
     * `components/ui/DateField` now — one calendar across the whole app, with
     * the BS date on it, which a native date input cannot show (Law 9 §9.4).
     * The control is still a text input, so it is found by its accessible name
     * rather than by a type the field no longer has.
     */
    const days = [...container.querySelectorAll<HTMLInputElement>('input')].filter((i) =>
      /Kathmandu day$/.test(i.getAttribute('aria-label') ?? ''),
    )
    expect(days).toHaveLength(2)
    // Each carries its own calendar trigger, so the range is pickable and not
    // only typeable.
    expect(container.querySelectorAll('button[aria-label^="Open calendar"]')).toHaveLength(2)
  })

  it('reads the active chip from the URL, so a filtered ledger is linkable', async () => {
    await mount(1280, '/finance/payments?status=received')
    const pressed = allButtons().find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed?.textContent?.trim()).toBe('Received')
  })

  it('offers Clear filters only once something is narrowed', async () => {
    await mount(1280)
    expect(button('Clear filters')).toBeUndefined()
    await mount(1280, '/finance/payments?status=refunded')
    expect(button('Clear filters')).toBeDefined()
  })
})

describe('§9.3 — the deposits rail (Law 5)', () => {
  it('draws the three lines with no figure behind any of them', async () => {
    await mount(1280)
    expect(text()).toContain('Deposits (separate)')
    expect(text()).toContain('Held')
    expect(text()).toContain('Applied')
    expect(text()).toContain('Refunded')
    expect(text()).toContain('security_deposits')
    expect(text()).toContain('Not tracked yet')
  })

  it('never invents a rupee figure for a deposit', async () => {
    await mount(1280)
    // The only Rs figures on the page are the two payment amounts.
    expect((text().match(/Rs/g) ?? []).length).toBe(2)
  })

  it('says a deposit never touches Outstanding', async () => {
    await mount(1280)
    expect(text()).toContain('Outstanding')
  })

  /* Rulings §7 — "right rails collapse below 1280" means reflow, not hide. */
  it('keeps the rail on the page below 1280', async () => {
    await mount(1000)
    expect(text()).toContain('Deposits (separate)')
    await mount(420)
    expect(text()).toContain('Deposits (separate)')
  })
})

describe('the three layouts, from one width reading (Law 14)', () => {
  it('desktop ≥1280 — the table, with the wireframe columns', async () => {
    await mount(1280)
    const headers = [...container.querySelectorAll('th')].map((h) => h.textContent?.trim())
    expect(headers).toContain('Payment')
    expect(headers).toContain('Booking')
    expect(headers).toContain('Client')
    expect(headers).toContain('Method')
    expect(headers).toContain('Amount')
    expect(headers).toContain('Date')
  })

  /**
   * Neither is drawn in §9.3, and both are kept: `amount` is `check (amount > 0)`
   * on a refund too, so the type is the only thing that says which direction the
   * money went, and under (All) a Failed row would otherwise read as money taken.
   */
  it('carries Type and Status, so a refund and a failure cannot read as a receipt', async () => {
    await mount(1280)
    const headers = [...container.querySelectorAll('th')].map((h) => h.textContent?.trim())
    expect(headers).toContain('Type')
    expect(headers).toContain('Status')
    expect(text()).toContain('Advance Payment')
  })

  it('tablet 768–1279 — still a table, scrolling horizontally', async () => {
    await mount(1000)
    expect(container.querySelector('table')).not.toBeNull()
    const scroller = container.querySelector('[data-table-scroll]') as HTMLElement | null
    expect(scroller?.style.overflowX).toBe('auto')
  })

  it('phone <768 — card rows, no table', async () => {
    await mount(420)
    expect(container.querySelector('table')).toBeNull()
    expect(text()).toContain('PAY-0007')
    expect(text()).toContain('B-715')
  })
})

describe('the ledger rows', () => {
  it('renders the payment number, the money and the client from real columns', async () => {
    await mount(1280)
    expect(text()).toContain('PAY-0007')
    expect(text()).toContain('Mountain Stories')
    expect(text()).toContain('Rs 12,500')
  })

  it('links the booking and the client by their own identifiers', async () => {
    await mount(1280)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/rentals/B-715')
    expect(hrefs).toContain('/clients/c0ffee00-1111-4222-8333-444455556666')
  })

  it('gives every status badge a glyph beside its word (Law 11 — never colour alone)', async () => {
    await mount(1280)
    expect(text()).toContain('Received')
    const badge = [...container.querySelectorAll('span')].find((s) => s.textContent?.trim() === 'Received')
    expect(badge?.querySelector('svg')).not.toBeNull()
  })
})

describe('nav — Payments is a Finance TAB, not a twelfth nav item', () => {
  it('records where the tab goes without touching primary nav', async () => {
    const { NAV, SPEC_TABS, FINANCE_TAB_ROUTES } = await import('../../../data/nav')
    expect(NAV).toHaveLength(7)
    expect(NAV.map((s) => s.to)).not.toContain('/finance/payments')
    expect(SPEC_TABS['/finance']).toContain('Payments')
    expect(FINANCE_TAB_ROUTES['Payments']).toBe('/finance/payments')
  })

  it('is already a money surface by prefix, so the Shell guard needs no new entry', async () => {
    const { isMoneySurface } = await import('../../../data/nav')
    expect(isMoneySurface('/finance/payments')).toBe(true)
  })
})
