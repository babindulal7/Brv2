import { useCallback, useEffect, useMemo, useState } from 'react'
import { recordExport } from '../../lib/exportAudit'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { Card, PageHeader, Button, KpiStrip, Rail } from '../../components/ui/Page'
import { SearchInput } from '../../components/ui/SearchInput'
import { ListControlRow } from '../../components/ui/ListWorkspace'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Donut, Legend } from '../../components/ui/Charts'
import type { Slice } from '../../components/ui/Charts'
import { formatAd, formatBs, toBs, kathmanduCivil } from '../../lib/bs'
import { rupees, formatMoney, toRupees } from '../../lib/money'
import { csvCell } from '../../lib/csv'
import type { Paisa } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { canIssueInvoice as rbacCanIssueInvoice, canRecordPayment, canVoidInvoice } from '../../lib/rbac'
import { gateContext } from '../../lib/fieldGating'
import { useViewport, useTabularLayout } from '../../lib/device'
import { IntelCard } from '../../components/ui/IntelCard'
import { DataTableShell } from '../../components/ui/DataTable'
import {
  listInvoices,
  listPayments,
  liveInvoices,
  voidedInvoices,
  outstandingInvoices,
  overdueInvoices,
  paymentsInPeriod,
  financeRestriction,
  STORED_INVOICE_STATUSES,
  invoiceGlance,
  invoiceDetailGroups,
  INVOICE_TOKEN,
  businessDayAd,
  businessNowAd,
  SPEC_TABS,
  fetchInvoiceLines,
  type InvoiceRow,
  type InvoiceListRow,
  type PaymentListRow,
} from '../../lib/queries/finance'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import { RecordPaymentModal } from './modals/RecordPaymentModal'
import { CreateInvoiceModal } from './modals/CreateInvoiceModal'
import type { CreateInvoiceResult } from '../../actions/finance/createInvoice'
import { VoidInvoiceModal } from './modals/VoidInvoiceModal'
import Documents from '../documents/Documents'
import Payments from './Payments'
import Expenses from './Expenses'
import DailyClosing from './DailyClosing'
import { ReportCatalog } from '../reports/ReportCatalog'
import { DateField } from '../../components/ui/DateField'
import { exportInvoicePdf } from '../../lib/pdf/exportPdf'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
import { Pagination } from '../../components/ui/Pagination'
import './finance.css'
import { BsAdDate } from '../../components/ui/BsAdDate'

export const ROWS_PER_PAGE = 25


/**
 * **Finance dashboard and Invoices** — now read from Postgres through
 * `lib/queries/finance.ts`, not from an array in this file.
 *
 * ## The one thing this screen exists to get right: restricted ≠ empty
 *
 * `invoices` and `payments` have **no `_v` view**. RLS gates them WHOLE-ROW
 * (`<table>_money_blind ... using (auth_can_view_money())`, migration 0014), so
 * a Warehouse / Technician / Driver / Client session does not get a 403 — it
 * gets HTTP 200 and `[]`. `useList` turns that into `isEmpty`, and an
 * unguarded `PageBody` would then render "No invoices yet", which is a *claim
 * about the business* the query never made and cannot make.
 *
 * So the money gate is `useCanViewMoney()` (`lib/moneyVisibility.ts`, which
 * mirrors `auth_can_view_money()`) and it is applied at the PAGE level, above
 * the KPI strip:
 *
 *  - `financeRestriction(money)` is spread into the outer `PageBody`, which
 *    renders `RestrictedState` — "Access restricted", the reason, and a
 *    "Requires Accounts" chip — before it looks at loading, error or empty.
 *  - every fetcher **short-circuits** when `!money` and returns
 *    `{ rows: [], total: 0 }` without touching the network. Sending four
 *    requests you already know RLS will refuse is not a gate, it is noise; and
 *    a count of 0 coming back from a denied read would be printed as a fact.
 *
 * This is deliberately stricter than the old `canViewMoneyField(gctx,
 * 'booking')` check, which omitted the Amount column and left the rest of the
 * table standing. Under RLS there is no rest of the table: the row never leaves
 * Postgres. `gctx` survives only for `invoiceGlance`/`invoiceDetailGroups`,
 * which do their own field gating and are only ever reached by a session that
 * already cleared the page gate.
 *
 * ## §9.4 — six real tabs, hosted here, not linked out
 *
 * `09_FINANCE.md` line 3 names the defect this file used to be: *"Six real
 * working tabs, **not links out** to reports: Dashboard · Invoices · Payments ·
 * Expenses · Documents · Reports."* Where a row of `<Link>`s with an
 * `external_link` icon stood — defended in a comment that argued re-hosting
 * would duplicate each screen's `PageHeader` and search box — the four other
 * tabs are now MOUNTED:
 *
 *  - **Payments** → `modules/finance/Payments.tsx` (§9.3)
 *  - **Expenses** → `modules/finance/Expenses.tsx` (§9.4) — the ledger, not
 *    `/reports/expenses`, which is the expense *report* over a fixture
 *  - **Documents** → `modules/documents/Documents.tsx` (§9.5)
 *  - **Reports** → `modules/reports/ReportCatalog.tsx` (§9.6 + §9.7)
 *
 * The old comment's argument was correct and is now closed work rather than a
 * reason: `TabHeader.tsx` demotes each duplicate `<h1>` to a subtitle keeping
 * its description and its actions, and `Documents` drops its second search
 * field because the Shell already renders one for `/finance`.
 *
 * **The fifth "Audit" link is deleted.** `data/nav.ts:336` records the ruling
 * and `WIREFRAME_RULINGS_2026-08-12.md` §1 lists it among the eight genuine
 * removals — the audit log is a Tools card (`10_TOOLS.md` §10.4).
 *
 * Each hosted screen keeps its own money gate, so they are mounted OUTSIDE this
 * page's `PageBody` — nesting them would stack two restricted states.
 *
 * ## What is NOT on this screen any more, and why
 *
 * Law 1 (never fabricate) removed five figures that had no column behind them.
 * They were module constants — `REVENUE`, `COST_OF_RENTAL`,
 * `OPERATING_EXPENSES` and the derived `GROSS_PROFIT` / `NET_PROFIT` — wired
 * together by two module-scope `throw`s so they always reconciled with each
 * other and with nothing else. There is no revenue column, no COGS concept and
 * no cost-of-rental column anywhere in `supabase/migrations`; `expenses.amount`
 * exists but answers a different question and `queries/finance.ts` is outside
 * this task's file list, so no named set for it could be added.
 *
 * A P&L built from two real numbers and three invented ones is worse than no
 * P&L, so the card now states what is missing instead of printing it. Same for
 * the `Outstanding Invoices` KPI, whose value was the literal string `'23'`.
 *
 * ## Every figure that IS here comes from a named filter set
 *
 * `outstandingInvoices()`, `overdueInvoices()`, `paymentsInPeriod()`,
 * `liveInvoices()`, `voidedInvoices()` — all from `queries/finance.ts`. Nothing
 * on this screen filters, sorts or pages an array in memory.
 */

/* ── The reporting period, stated rather than implied ─────────────────────
 *
 * §5.4 requires the payment-methods breakdown to say what period it covers.
 * "This Month" alone does not, so the AD calendar month is resolved here and
 * its two ends are rendered in the card title.
 *
 * The day passed in is the KATHMANDU calendar day (`data/today.ts`'s
 * `businessDayAd`, which goes through `bs.ts`'s `kathmanduCivil`) — not
 * `new Date().toISOString().slice(0,10)`, which is a different day for 5h45m of
 * every day. The month bounds below are then pure calendar arithmetic on a bare
 * date: no instant
 * survives the round trip, so no timezone is implied and none is needed.
 * `paymentsInPeriod` is what converts them to `+05:45` instants, because
 * `payments.payment_date` is a `timestamptz` while `invoices.issue_date` is a
 * plain `date`. That asymmetry is documented in `queries/finance.ts`.
 */
function lastDayOfMonth(dayAd: string): string {
  const year = Number(dayAd.slice(0, 4))
  const month = Number(dayAd.slice(5, 7))
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export interface ReportingPeriod {
  /** First day of the AD calendar month, `YYYY-MM-DD`. */
  readonly fromAd: string
  /** Last day of it. */
  readonly toAd: string
  /** What the card titles print — "1 Sep 2026 – 30 Sep 2026". */
  readonly label: string
}

/**
 * ⛔ These were three module-scope constants built from `data/today.ts`'s
 * import-time `TODAY_DAY_AD` (X-05). The month is on a *period label the
 * operator reads*, so a tab left open across a month end kept titling last
 * month's figures with last month's dates — and `RECEIVED_IN_PERIOD` kept
 * querying it. Resolved from the day the caller renders on instead.
 */
function reportingPeriod(dayAd: string): ReportingPeriod {
  const fromAd = `${dayAd.slice(0, 7)}-01`
  const toAd = lastDayOfMonth(dayAd)
  return {
    fromAd,
    toAd,
    label: [fromAd, toAd].map(day => { const bs = toBs(new Date(day)); return bs ? `${formatBs(bs)} ${bs.year}` : formatAd(new Date(day)) }).join(' – '),
  }
}

/* ── The named filter sets ────────────────────────────────────────────────
 *
 * Three of the five carry no date at all, so they stay module constants and
 * `useList` gets one stable object for the life of the page.
 *
 * ⛔ The other two did NOT belong here and were constants anyway: `Overdue`
 * bounds `due_date`, and `Received` bounds the current month. Both were
 * resolved at import (X-05), so both asked their question about the DAY THIS
 * TAB WAS OPENED — a tab still open on Tuesday answered Monday's Overdue under
 * Tuesday's heading. They are built in the component now.
 *
 * Both are DAY precision, and the distinction is worth keeping straight:
 * `invoices.due_date` is a `date` column (`0006_finance.sql:82`) and
 * `overdueInvoices` compares it against `previousDay(nepalDay(…))`. So there is
 * no instant to be wrong about here, and no 05:45 boundary — that is X-06's
 * defect, on `bookings.return_at`, which is a `timestamptz`. Keying these two
 * memos on the day is correct rather than a freeze.
 */
const LIVE_INVOICES: ListFilters = liveInvoices()
const VOIDED_INVOICES: ListFilters = voidedInvoices()
const OUTSTANDING_INVOICES: ListFilters = outstandingInvoices()

/**
 * §5.2 — payment and invoice statuses are **different sets**, and the build the
 * spec reviewed listed `Partially Paid` as both.
 *
 * Both vocabularies now carry the caveat the schema puts on them:
 *  - `payment_status` has four members and only `Received` is reachable on a
 *    live row. Law 4 revokes UPDATE on `payments`, so nothing can move a row
 *    out of it; 'Refunded' is derived from a `payment_reversals` row.
 *  - `invoice_status` has six members and only five are ever stored.
 *    'Overdue' is derived (0001:1010) — `STORED_INVOICE_STATUSES` is the
 *    filterable set, and it is imported rather than retyped so a chip built
 *    from it cannot ask for a value that matches nothing.
 */

/* ── §9.4 the six tabs, and §9.2 the seven chips ──────────────────────────── */

/**
 * **The six tabs, read from `data/nav.ts` rather than typed here.**
 *
 * `09_FINANCE.md` line 3: *"Six real working tabs, not links out to reports:
 * Dashboard · Invoices · Payments · Expenses · Documents · Reports."* Line 3 is
 * naming a defect, and this file was it — `CONFLICTS.md` §09.2 quotes the
 * comment that used to sit below, arguing that re-hosting the other four would
 * duplicate their `PageHeader` and search box, so a row of `<Link>`s with an
 * `external_link` icon was shipped instead.
 *
 * The argument was true and is now done work: `TabHeader.tsx` demotes the
 * duplicate `<h1>` to a subtitle and `Documents` drops its second search field,
 * so the four are hosted rather than linked. **The fifth link, "Audit", is
 * deleted** — `data/nav.ts:336` already records the ruling ("'Audit' is gone —
 * the audit log is a Tools card, `10_TOOLS.md` §10.4"), and
 * `WIREFRAME_RULINGS_2026-08-12.md` §1 lists it among the eight genuine
 * removals.
 *
 * Reading the labels from `SPEC_TABS` rather than retyping them is the point of
 * that constant — its own header says *"no page reads it yet"* and names this
 * file as the one that should. Now one does, so the strip cannot drift from the
 * ruling.
 */
const FINANCE_TABS = SPEC_TABS['/finance'] ?? []
type FinanceTab = 'Dashboard' | 'Invoices' | 'Payments' | 'Expenses' | 'Closing' | 'Documents' | 'Reports'

/**
 * §9.2's chip row — `(All)(Draft)(Sent)(Partially Paid)(Paid)(Overdue)(Void)`.
 *
 * Three of the seven are **not** a `status` filter, and taking the drawing
 * literally on any of them would have shipped a chip that silently matches
 * nothing:
 *
 *  - **All** is `liveInvoices()` — everything not voided. Not "every row":
 *    a list headed "All" that included voided invoices would double-count the
 *    business's receivables.
 *  - **Overdue** is a real member of `invoice_status` and is **never stored**
 *    (`0001:1010` — *"'Overdue' is derived (due_date vs today on the AD value)
 *    and must never be persisted"*). `chips: { status: ['Overdue'] }` does not
 *    error; it returns zero rows and the screen reports "no overdue invoices"
 *    to a business that has them. So this chip is `overdueInvoices(businessNowAd())`,
 *    which asks the question the schema can answer.
 *  - **Void** is `voidedInvoices()` — `voided_at IS NOT NULL`, the fact the
 *    void CHECK guarantees, rather than the `status` label nothing forces to
 *    agree with it. Law 3: a voided invoice is not deleted and stays reachable.
 *
 * The other four are the stored statuses, taken from `STORED_INVOICE_STATUSES`
 * so a chip cannot ask for a value the enum does not admit.
 */
const INVOICE_CHIPS = ['All', ...STORED_INVOICE_STATUSES.filter((s) => s !== 'Void'), 'Overdue', 'Void'] as const
type InvoiceChip = (typeof INVOICE_CHIPS)[number]

/**
 * The chip → the named filter set. Never a `.filter()` over fetched rows.
 *
 * `overdueSet` is passed in rather than read from module scope because it is
 * the one set here anchored to an instant; see the block above.
 */
function invoiceChipFilters(chip: InvoiceChip, overdueSet: ListFilters): ListFilters {
  if (chip === 'All') return LIVE_INVOICES
  if (chip === 'Void') return VOIDED_INVOICES
  if (chip === 'Overdue') return overdueSet
  return { ...LIVE_INVOICES, chips: { status: [chip] } }
}

/**
 * Empty state per chip.
 *
 * One message per chip rather than one for the table, because "no invoices" and
 * "no invoices in Draft" are different facts and only the first is a statement
 * about the business. A shared string would have the (Paid) chip telling an
 * operator that nothing has ever been invoiced.
 */
const EMPTY_TITLE: Readonly<Record<InvoiceChip, string>> = {
  All: 'No invoices yet',
  Draft: 'No drafts',
  Sent: 'Nothing awaiting payment',
  'Partially Paid': 'Nothing part-paid',
  Paid: 'Nothing settled yet',
  Overdue: 'Nothing overdue',
  Void: 'No voided invoices',
}

const EMPTY_MESSAGE: Readonly<Record<InvoiceChip, string>> = {
  All: 'Nothing has been invoiced. Invoices are raised against a booking, so a booking has to exist first.',
  Draft: 'Every invoice raised has been issued. A draft is an invoice that exists but has not gone to the client.',
  Sent: 'No invoice is issued and unpaid. Sent means the client has it and nothing has been received against it.',
  'Partially Paid': 'No invoice has had part of its total received. A part payment moves an invoice here until it settles.',
  Paid: 'No invoice has been settled in full.',
  Overdue:
    'No issued invoice is past its due date. Overdue is derived from the due date at read time, never stored — so this is a live answer, not a stale label.',
  Void: 'No invoice has been voided. Voiding is how an invoice reaches its terminal state — nothing is ever deleted.',
}

/** Payments with no `bank_account_id`. NEVER labelled 'Cash' — see `PaymentListRow.channelGroup`. */
const NO_ACCOUNT_RECORDED = 'No account recorded'

const th = { textAlign: 'left' as const, padding: '9px 10px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is left alone.
 *
 * Both tables on this page share this constant — the Outstanding snapshot and
 * the full invoice ledger — and the floor is owed by both, because §7.3 states
 * it of rows, not of rows that happen to carry a control.
 *
 * The ledger is what makes it a data-integrity fix rather than a density
 * preference. Its last cell holds `RowActions`: `+ Pay`, `Refund` and `Void`,
 * three untargeted buttons painted at `padding: '2px 8px'`, about 22px tall.
 * The 44px hit area each of them owes does not fit in a 10 + one line + 10 row;
 * it overhangs the neighbours by ~3px top and bottom, the rows touch, and the
 * later row in the DOM wins a tap in that band. `Void` moves an invoice to a
 * terminal state and `+ Pay` opens a payment against it, so a tap near a
 * boundary voids or bills the WRONG invoice. Raising the row is the
 * precondition for giving those three a real `TouchTarget`, which is the next
 * fix; it cannot be done safely on a 38px row.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/** A `date` column, `YYYY-MM-DD`, rendered as "2 Aug 2026". */
function formatDayAd(dayAd: string): string {
  return formatAd(new Date(`${dayAd}T00:00:00.000Z`))
}

/**
 * A count the query actually returned, or an explicit non-value.
 *
 * `total` is `count: 'exact'` from PostgREST — the size of the whole matching
 * set, not of the page in hand. While the query is in flight, or if it failed,
 * or if the caller never asked for a count, there is no number to print and a
 * dash is printed instead. Printing `rows.length` in those cases is how a KPI
 * comes to state a figure nobody computed.
 */
function countOf(list: ListResult<unknown>): string {
  if (list.loading) return '…'
  if (list.error || list.total === null) return '—'
  return String(list.total)
}

/**
 * The sum of a money column over a result set — **only when the rows in hand
 * ARE the whole set**.
 *
 * These lists are unpaged, and PostgREST caps an unpaged response (1000 rows on
 * a default Supabase project). So `rows` can silently be a prefix of the answer,
 * and summing it would print a total that is short by an unknown amount while
 * looking exactly like a correct one. `total` is the exact count, so
 * `total === rows.length` is the proof that nothing was cut off; without that
 * proof this returns `null` and the caller renders a dash.
 *
 * TODO(persistence): the right fix is a server-side aggregate (an RPC or a
 * `_totals_v`), which would also stop pulling every outstanding invoice down
 * the wire to add up one column. That belongs in `queries/finance.ts`.
 */
function sumOf<T>(list: ListResult<T>, pick: (row: T) => Paisa): Paisa | null {
  if (list.loading || list.error) return null
  if (list.total === null || list.total !== list.rows.length) return null
  return list.rows.reduce<Paisa>((acc, row) => (acc + pick(row)) as Paisa, rupees(0))
}

function moneyOf(total: Paisa | null): string {
  return total === null ? '—' : formatMoney(total)
}

/**
 * `InvoiceListRow` → the shape the Hover Intel builders take.
 *
 * `InvoiceRow.amount` is a pre-formatted string (`data/invoiceIntel.ts:47`) and
 * `amountPaisaOf` recovers the paisa with `parseMoney`, which reads grouping and
 * a decimal fraction correctly — so `formatMoney(totalAmount)` round-trips
 * exactly. That is NOT the old defect: the page used to recover a total with
 * `parseInt(amount.replace(/[^0-9]/g, ''))`, which reads "Rs 1,234.50" as
 * Rs 1,23,450. Nothing on this screen parses a money string any more; the two
 * places that need a figure (`+ Pay`, `Refund`) read `outstandingAmount` and
 * `paidAmount` as `Paisa` directly.
 *
 * Three optional fields are deliberately left undefined rather than defaulted:
 *  - `lines` — `invoice_lines` is a separate table this list query does not
 *    read. The intel card omits the group entirely when it is absent.
 *  - `payments` — one `paymentsForInvoice()` query per row. Not fetched.
 *  - and neither is faked from `paidAmount`, which would render an invented
 *    single receipt for money that arrived in several.
 */
function toIntelRow(row: InvoiceListRow): InvoiceRow {
  return {
    id: row.invoiceNo,
    client: row.clientName,
    booking: row.bookingNo,
    amount: formatMoney(row.totalAmount),
    due: formatDayAd(row.dueDateAd),
    status: row.status,
    vatPaisa: row.vatAmount,
    paidPaisa: row.paidAmount,
  }
}

/** The invoice export's columns, in the order the file writes them. */
const INVOICE_CSV_HEADERS = ['Invoice', 'Client', 'Booking', 'Total', 'Outstanding', 'Issued', 'Due', 'Status']

/**
 * The Invoices tab's CSV, as text — pure, so it can be asserted on.
 *
 * ## ⛔ Every money cell used to break the file (FI-04)
 *
 * The row was `r.join(',')` with only `clientName` hand-quoted, and `formatMoney`
 * renders lakh grouping — `Rs 1,39,506`. So one invoice emitted
 *
 *     INV-0007,"ABC Films",B-715,Rs 1,39,506,Rs 1,24,506,2026-07-31,…
 *
 * — eleven fields under an eight-column header, with Outstanding, Issued, Due
 * and Status all shifted left. A spreadsheet opens that without complaining,
 * which is the worst of it: the operator gets a plausible sheet in which the Due
 * column holds `506`, and the file is the artefact that leaves the building.
 *
 * Fixed with ONE quoter over EVERY field rather than a second hand-quoted
 * exception — `lib/csv.ts`'s `csvCell`, this app's single write-side rule
 * (`ReportToolbar` exports through it) which round-trips through the `parseCsv`
 * sitting beside it. Rows are joined with CRLF for the same reason: RFC 4180,
 * and it matches that other export.
 *
 * Money stays FORMATTED rather than raw: the file is read by a person, every
 * figure in this product goes through the Financial Engine (Law 1), and the
 * quoting is now what makes that safe.
 */
export function invoicesCsv(rows: readonly InvoiceListRow[]): string {
  const body = rows.map((i) => [
    i.invoiceNo,
    i.clientName,
    i.bookingNo,
    formatMoney(i.totalAmount),
    formatMoney(i.outstandingAmount),
    i.issueDateAd,
    i.dueDateAd,
    i.isVoid ? 'Void' : i.status,
  ])
  return [INVOICE_CSV_HEADERS, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export default function Finance() {
  const { user } = useAuth()
  /**
   * `gateContext` returns a fresh object literal on every call, so it is
   * memoized — the `invoiceRows` memo below is keyed on it and would otherwise
   * rebuild every row's Glance/Detail cards on every render.
   *
   * It is used for the intel cards ONLY. The page's own gate is
   * `useCanViewMoney()` below, which mirrors the RLS predicate exactly; see the
   * header for why the two are not interchangeable.
   */
  /*
   * The operating day and the reporting period, resolved on every render (X-05).
   * They were module-scope constants, so a Finance tab left open across midnight
   * — or across a month end — kept a stale As-of pill, a stale period label and
   * a stale Overdue set, all of which look exactly like fresh ones.
   *
   * `dayAd` is what the memos below key on: it changes once a day, so the sets
   * are rebuilt when (and only when) the answer can have changed.
   */
  const dayAd = businessDayAd()
  const period = useMemo(() => reportingPeriod(dayAd), [dayAd])
  /* Keyed on the DAY although the factory reads the clock: `businessNowAd()`
     cannot express "recompute at midnight", and the Overdue set has to. The
     lint rule sees an unused dependency; it is the one that makes this correct. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overdueInvoiceSet = useMemo(() => overdueInvoices(businessNowAd()), [dayAd])
  const receivedInPeriod = useMemo(() => paymentsInPeriod(period.fromAd, period.toAd), [period])

  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  const money = useCanViewMoney()
  const restriction = financeRestriction(money)

  /*
   * ⛔ The three Record Payment launchers on this screen (header button, table
   * row `+ Pay`, phone card `+ Pay`) had NO permission gate at all — only the
   * page-wide `money` gate, which is *visibility*. Every role that could read
   * an invoice was offered the button, Admin and Manager included, and since
   * `actions/core.ts` now really resolves `recordPayment`'s
   * `permissions: ['payment.create']` through `lib/rbac`, that button leads to
   * an inline `ActionPermissionError` rather than to a payment.
   *
   * `canRecordPayment` is Owner / Coordinator / Accounts — strictly narrower
   * than money visibility, and the same predicate the dispatcher will apply.
   * Kept as a second condition rather than folded into `money`: `money` gates
   * the FIGURES (KPIs, the invoice table, the donut) and a Manager keeps all of
   * them; this gates only the ACT of recording.
   *
   * Absent, not disabled, per `MovementList.tsx:307`. `isOnline` is not passed,
   * matching `UnifiedInbox.tsx:163` — the modal dispatches without it, so both
   * sides evaluate the rule with the same online default.
   */
  const canTakePayment = user ? canRecordPayment(user.role) : false

  /* Reversals are payment-specific, so they live in the Payments ledger rather
     than selecting an arbitrary receipt from an invoice aggregate. */
  const canVoid = user ? canVoidInvoice(user.role) : false

  /**
   * **Create Invoice** — the launcher the last pass missed.
   *
   * `+ Pay`, Refund and Void were each given a capability gate above; the header's
   * Create Invoice button and its modal mount were left on `money` alone, which
   * is *visibility*. Issuing an invoice is a money act — it is how a receivable
   * comes into existence — so every role that could merely READ the invoice table
   * was being offered the button that raises one.
   *
   * ⚠ **The TODO(decision) that stood here is closed, and the gate has moved.**
   *
   * It read: *"`lib/rbac` has no invoice-creation rule … `CreateInvoiceModal`
   * dispatches no action at all, so there is no dispatcher predicate to mirror"*,
   * and it stood in `canVoidInvoice` (Owner / Accounts) meanwhile as the
   * narrowest money rule available. Both halves of that are now false:
   *
   *  · `rbac.canIssueInvoice` exists and encodes **R-05** — Owner · Admin ·
   *    Manager · Accounts — the set `RULINGS-2026-09-04.md` names outright.
   *  · `actions/core.ts:231` resolves `invoice.create` through exactly that
   *    predicate, and `CreateInvoiceModal` now dispatches `createInvoice`.
   *
   * So there IS a dispatcher predicate to mirror, and §4.20's rule ("the launcher
   * gate mirrors the rule the engine will itself apply") makes mirroring it
   * mandatory rather than optional. Leaving `canVoidInvoice` here would withhold
   * from Admin and Manager a control R-05 grants them and the dispatcher would
   * accept — a gate that is wrong in the safe direction is still wrong, and it
   * is the direction that makes an operator ask for a role change they do not
   * need.
   *
   * `canVoidInvoice` is deliberately NOT changed: no 4 Sep ruling restates who
   * may void, and per R-00 silence is not supersession. Its own disagreement with
   * the live `invoices_update` policy is the remaining half of AUTHSEC-01 and
   * needs a ruling, not a refactor.
   *
   * ⚠ Live still says Owner/Admin/Manager/**Coordinator** on `invoices_insert`;
   * `0086_invoice_write_rights_and_draft_without_number.sql` realigns it and is
   * NOT applied. Until it lands, an Accounts user is offered a control Postgres
   * refuses — the modal surfaces that refusal inline rather than swallowing it.
   */
  const canIssueInvoice = user ? rbacCanIssueInvoice(user.role) : false

  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')?.toLowerCase()
  const tab: FinanceTab = useMemo(() => {
    if (!tabParam) return 'Dashboard'
    const found = (FINANCE_TABS as readonly string[]).find((t) => t.toLowerCase() === tabParam)
    return (found as FinanceTab) ?? 'Dashboard'
  }, [tabParam])

  const setTab = useCallback(
    (next: FinanceTab) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === 'Dashboard') p.delete('tab')
          else p.set('tab', next.toLowerCase())
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )
  /** §9.2 — the seven chips. Law 3 keeps `Void` among them, never a Delete. */
  const [chip, setChip] = useState<InvoiceChip>('All')

  /* ── the Invoices filter rail (31 Aug, pattern adoption) ─────────────────
   * The chips above stay as the table's primary tabs (the Operations
   * precedent); the rail carries the OTHER narrowings, every one of them
   * server-side through `applyListFilters` — never a `.filter()` on the page.
   *
   * What the rail deliberately does NOT offer: a client-NAME filter.
   * `client_name` reaches the row through the `clients ( name )` embed, and
   * the search machinery cannot express an ilike over an embedded column
   * without switching the embed to `clients!inner` and extending
   * `applyListFilters` — a query-engine change with blast radius on every
   * invoices consumer. Named as a follow-up, not half-built here.
   *
   * State is local, like `chip` above — this page's filters have never been
   * URL params, and making only the new ones linkable would be the worst of
   * both. One date scope at a time: `ListFilters.dateRange` binds a single
   * column, so the rail offers Issue date | Due date as a toggle rather than
   * pretending two ranges can be sent.
   */
  const [railSearch, setRailSearch] = useState(() => params.get('search') ?? '')
  const [dateCol, setDateCol] = useState<'issue_date' | 'due_date'>('issue_date')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [invoiceFiltersOpen, setInvoiceFiltersOpen] = useState(false)
  const [expenseFiltersOpen, setExpenseFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)

  /**
   * Law 13/14 — width decides, never a platform branch. `viewport` collapses
   * the dashboard grid; `tabular` swaps the ~840px Invoices table for phone
   * cards at the same threshold RentalsList uses.
   */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tabular = useTabularLayout()

  // Modals state
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [selectedInvoiceForRecord, setSelectedInvoiceForRecord] = useState<string>('')
  const [selectedInvoiceForVoid, setSelectedInvoiceForVoid] = useState<InvoiceListRow | null>(null)

  /**
   * Law 12 — an action that changed nothing says so inline and persistently.
   *
   * This said *"Create Invoice and Void Invoice write NOTHING"* and that both
   * modals refused inside themselves, so neither disclosure below could fire.
   * **Half of that is now out of date.**
   *
   *  · **Create Invoice writes** (MONEY-01): `CreateInvoiceModal` dispatches
   *    `createInvoice`, which is `implemented: true`, so
   *    `handleCreateInvoiceSuccess` fires after a confirmed write and this
   *    disclosure is live — it covers the window between the write landing and
   *    the refetch returning the row.
   *  · **Void still writes nothing**: `VoidInvoiceModal` dispatches no action
   *    (there is no `voidInvoice`, SPEC-P0-1 §3.4), refuses inside itself and
   *    never calls `onSuccess`, so `handleVoidSuccess` stays unreachable and says
   *    so at its own definition.
   *
   * Why the disclosure exists at all: while this screen held its rows in
   * `useState`, a write that never happened was invisible — the row appeared and
   * the operator had every reason to believe it had landed. The list is read from
   * Postgres now, so the honest thing is to say which half happened rather than
   * let a refetch quietly undo the work.
   *
   * Both modals also used to `DomainEvents.emit` from the screen, announcing a
   * create and a void that never happened; both emits are gone — events follow
   * the write and the dispatcher owns them.
   */
  const [notPersisted, setNotPersisted] = useState<{ title: string; message: string } | null>(null)

  /* ── The four reads ────────────────────────────────────────────────────
   *
   * Fixed calls in a fixed order, never a loop, so the hook order cannot change
   * between renders.
   *
   * Each fetcher short-circuits for a money-blind session. `listQuery.ts` gives
   * the rule for a narrowing that cannot match — return without calling — and
   * this is the same shape: RLS has already decided, and the four requests
   * would come back 200/`[]`, which is the exact ambiguity this screen exists
   * to remove.
   */
  const invoiceFetcher = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<InvoiceListRow>> => {
      if (!money) return { rows: [], total: 0 }
      return listInvoices({ ...filters, withCount: true })
    },
    [money],
  )
  const paymentFetcher = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<PaymentListRow>> => {
      if (!money) return { rows: [], total: 0 }
      return listPayments({ ...filters, withCount: true })
    },
    [money],
  )

  const chipFilters = useMemo(() => invoiceChipFilters(chip, overdueInvoiceSet), [chip, overdueInvoiceSet])

  /* The rail's narrowings, merged OVER the chip's set. The key spaces are
     disjoint — chips own `chips`/`presence`/`sort`, the rail owns `search`
     and `dateRange` — so a merge cannot silently drop either side. `search`
     rides the module's default columns (`invoice_no`, `credit_note_no`). */
  const railFilters = useMemo<ListFilters>(() => {
    const f: ListFilters = {}
    if (railSearch.trim() !== '') f.search = railSearch.trim()
    if (dateFrom !== '' || dateTo !== '') {
      f.dateRange = {
        column: dateCol,
        ...(dateFrom !== '' ? { fromAd: dateFrom } : {}),
        ...(dateTo !== '' ? { toAd: dateTo } : {}),
      }
    }
    return f
  }, [railSearch, dateCol, dateFrom, dateTo])
  const railIsFiltered = railSearch.trim() !== '' || dateFrom !== '' || dateTo !== ''
  const invoiceFilterCount = Number(chip !== 'All') + Number(railSearch.trim() !== '') + Number(dateFrom !== '' || dateTo !== '')
  const invoiceListFilters = useMemo<ListFilters>(
    () => ({
      ...chipFilters,
      ...railFilters,
      page: { index: Math.max(0, page - 1), size: ROWS_PER_PAGE },
    }),
    [chipFilters, railFilters, page],
  )

  const clearInvoiceFilters = useCallback(() => {
    setChip('All')
    setRailSearch('')
    setDateFrom('')
    setDateTo('')
    setDateCol('issue_date')
    setPage(1)
  }, [])

  /* The other half of the Overdue ↔ date-range exclusivity (see the chip's
     onClick): picking a date while the Overdue chip holds its own dateRange
     flips the chip to (All) rather than letting the rail's range silently
     replace "due before today" under an Overdue heading. */
  const setRailDateFrom = useCallback(
    (v: string) => {
      setDateFrom(v)
      setChip((c) => (c === 'Overdue' ? 'All' : c))
      setPage(1)
    },
    [],
  )
  const setRailDateTo = useCallback(
    (v: string) => {
      setDateTo(v)
      setChip((c) => (c === 'Overdue' ? 'All' : c))
      setPage(1)
    },
    [],
  )
  /**
   * `baseline` is `LIVE_INVOICES` — the (All) chip.
   *
   * `useList` compares `filters` against `baseline` to decide whether an empty
   * result means "nothing exists" or "nothing matches what you asked", and only
   * the second gets a "Clear filters" affordance. (All) IS the baseline, so an
   * empty (All) reads as "no invoices yet"; an empty (Draft) reads as "no draft
   * invoices" with a way back. `Void` and `Overdue` are structurally different
   * questions rather than narrowings, but they are reached from the same row of
   * chips and clearing back to (All) is exactly the right offer for both.
   */
  const list = useList<InvoiceListRow>(invoiceFetcher, invoiceListFilters, { baseline: LIVE_INVOICES })

  const total = list.total
  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / ROWS_PER_PAGE))

  useEffect(() => {
    if (total !== null && page > pageCount && pageCount > 0) {
      setPage(pageCount)
    }
  }, [page, pageCount, total])

  /* A KPI is never "filtered": its set is the tile's own definition and no
     operator input reaches it. */
  const outstanding = useList<InvoiceListRow>(invoiceFetcher, OUTSTANDING_INVOICES, { isFilteredOverride: false })
  const overdue = useList<InvoiceListRow>(invoiceFetcher, overdueInvoiceSet, { isFilteredOverride: false })
  const received = useList<PaymentListRow>(paymentFetcher, receivedInPeriod, { isFilteredOverride: false })

  /* `useList` memoises `refetch`; naming them keeps the callback keyed on
     the functions rather than on the whole list objects, which are fresh
     literals every render (react-hooks/exhaustive-deps, TODO_SWEEP A13). */
  const { refetch: refetchList } = list
  const { refetch: refetchOutstanding } = outstanding
  const { refetch: refetchOverdue } = overdue
  const { refetch: refetchReceived } = received
  const refreshAll = useCallback(() => {
    refetchList()
    refetchOutstanding()
    refetchOverdue()
    refetchReceived()
  }, [refetchList, refetchOutstanding, refetchOverdue, refetchReceived])

  const receivableTotal = sumOf(outstanding, (r) => r.outstandingAmount)
  const overdueTotal = sumOf(overdue, (r) => r.outstandingAmount)
  const receivedTotal = sumOf(received, (r) => r.amount)

  /**
   * §3 — the KPI strip.
   *
   * Three tiles, not four, and every one of them is a query result. The two
   * that were dropped (`Total Revenue`, `Net Profit`) were the head and tail of
   * the invented P&L chain; see the header. `Outstanding Invoices` keeps its
   * place as the count §3 asks for, and its value is now `count: 'exact'`
   * rather than the string `'23'`.
   *
   * Nothing here is money-gated per-tile any more: for a money-blind session
   * the whole strip is inside the restricted `PageBody` and is not constructed
   * at all. That is a stronger guarantee than omitting a note.
   */
  const kpis: Kpi[] = [
    {
      label: 'Outstanding Invoices',
      value: countOf(outstanding),
      icon: 'invoice',
      accent: 'progress',
      detail: `${moneyOf(receivableTotal)} receivable`,
    },
    {
      label: 'Overdue',
      value: countOf(overdue),
      icon: 'alert_triangle',
      accent: 'danger',
      detail: `${moneyOf(overdueTotal)} past due`,
    },
    {
      label: 'Received',
      value: moneyOf(receivedTotal),
      icon: 'card',
      accent: 'success',
      note: period.label,
    },
  ]

  /**
   * §5.4 — the payment-method breakdown, from `bank_accounts.channel_group`
   * through the `payments` embed. It reconciles to Received by construction:
   * these are the same rows, bucketed, so the slices sum to the KPI above and
   * cannot drift from it the way two hand-typed arrays did.
   *
   * A payment with no `bank_account_id` lands in `No account recorded`, never
   * in `Cash`. 'Cash' is itself a `payment_channel_group` value, so reading it
   * out of an absent account would manufacture a fact about how money arrived.
   */
  const methodSlices = useMemo<Slice[]>(() => {
    if (receivedTotal === null || receivedTotal <= 0) return []
    const buckets = new Map<string, number>()
    for (const p of received.rows) {
      const key = p.channelGroup ?? NO_ACCOUNT_RECORDED
      buckets.set(key, (buckets.get(key) ?? 0) + p.amount)
    }
    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label,
        value,
        display: formatMoney(value as Paisa),
        percent: `${((value / receivedTotal) * 100).toFixed(1)}%`,
      }))
  }, [received.rows, receivedTotal])

  /**
   * §9.1's chart series — the same `paymentsInPeriod` rows as the Received KPI
   * and the method donut, bucketed by the Nepal calendar day they arrived on.
   *
   * `PaymentListRow.paymentDateAd` is already the Kathmandu civil day (the
   * conversion happens in `queries/finance.ts`, which documents why
   * `payments.payment_date` is a `timestamptz` while `invoices.issue_date` is a
   * plain `date`). Slicing an instant here would put 5h45m of every day in the
   * wrong bar.
   *
   * Guarded on `receivedTotal !== null` for the reason `sumOf` exists: if the
   * unpaged response was truncated, the bars would be short by an unknown
   * amount while looking exactly like a complete series.
   */
  const dailyCollections = useMemo(() => {
    if (receivedTotal === null) return []
    const byDay = new Map<string, number>()
    for (const p of received.rows) {
      const key = new Date(kathmanduCivil(new Date(p.paymentDateAd))).toISOString().slice(0, 10)
      byDay.set(key, (byDay.get(key) ?? 0) + (p.amount as number))
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([dayAd, total]) => ({ dayAd, total }))
  }, [received.rows, receivedTotal])

  const dailyPeak = Math.max(...dailyCollections.map((d) => d.total), 1)
  const busiestDay = dailyCollections.reduce(
    (best, d) => (d.total > best.total ? d : best),
    dailyCollections[0] ?? { dayAd, total: 0 },
  )

  /**
   * HIS v2.1 perf — the glance/detail builders walk a full field-gated object
   * graph per row, so they run once per row here rather than inside the
   * table's `.map()`, keyed on every value they read.
   */
  const invoiceRows = useMemo(
    () =>
      list.rows.map((row) => {
        const intel = toIntelRow(row)
        return { row, intel, glance: invoiceGlance(intel, gctx), detail: invoiceDetailGroups(intel, gctx) }
      }),
    [list.rows, gctx],
  )

  /**
   * What `RecordPaymentModal` needs, and no more — it takes a structural type,
   * so the DB row is narrowed to it here rather than the modal being taught
   * about `InvoiceListRow`.
   *
   * ⚠ **`id` is the invoice's UUID now, not its number** (MONEY-05). It used to
   * be `r.invoiceNo`, and the modal resolved the payment by that number — which
   * made every invoice this application creates unpayable: **R-15 gives a Draft
   * no `invoice_no` at all**, and R-02 keeps an invoice in Draft for the whole
   * rental, so for a rental's entire life there was no number to send. The
   * number travels alongside as `invoiceNo` and is display-only; it is `null` on
   * a Draft, which the picker renders as "Draft (no number)" rather than as a
   * blank label.
   *
   * `booking` still carries `bookingNo` and is still display-only: the booking a
   * payment belongs to is read off the invoice row by the action, which is the
   * only place that fact is authoritative.
   */
  const modalInvoices = useMemo(
    () =>
      list.rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        client: r.clientName,
        amount: formatMoney(r.totalAmount),
        status: r.status,
        booking: r.bookingNo,
        // R-39 D1 — prefills the Amount field with what the invoice still owes.
        outstandingRupees: toRupees(r.outstandingAmount),
      })),
    [list.rows],
  )

  /**
   * The modal has already written the payment; this only brings the screen back
   * into line with what the database now says.
   *
   * It used to rewrite a local array — recomputing the new status from
   * `parseInt(inv.amount.replace(/[^0-9]/g, ''))` and appending a payment row
   * the engine had not confirmed. Both are gone: `refreshAll()` re-reads
   * `invoices.status`, `paid_amount` and `outstanding_amount` as the engine
   * computed them, so the screen cannot disagree with the ledger.
   *
   * It must not dispatch. It used to fire a second `recordPayment` for the same
   * receipt with no `ActionContext` — one click, two irreversible rows, against
   * Law 4. `__tests__/FinanceDoubleWrite.test.tsx` counts the calls.
   */
  const handleRecordPaymentSuccess = useCallback(() => {
    refreshAll()
  }, [refreshAll])

  const handleExportPdf = useCallback(async (row: InvoiceListRow) => {
    try {
      const dbLines = await fetchInvoiceLines(row.id)
      const lines =
        dbLines.length > 0
          ? dbLines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              totalPaisa: rupees(l.lineTotal),
            }))
          : [
              {
                description: 'Equipment Rental & Production Services',
                quantity: 1,
                totalPaisa: row.totalAmount,
              },
            ]

      await exportInvoicePdf(
        {
          invoiceNo: row.invoiceNo,
          status: row.status,
          issueDateAd: row.issueDateAd,
          dueDateAd: row.dueDateAd,
          bookingNo: row.bookingNo,
          client: { name: row.clientName },
          lines,
          subtotalPaisa: row.totalAmount,
          taxablePaisa: row.totalAmount,
          vatPaisa: row.vatAmount,
          totalPaisa: row.totalAmount,
          paidPaisa: row.paidAmount,
          outstandingPaisa: row.outstandingAmount,
        },
        {
          invoiceId: row.id,
          download: true,
        },
      )
    } catch (err) {
      console.error('Failed to export invoice PDF:', err)
    }
  }, [])

  /**
   * ⚠ **Reachable as of MONEY-01** — the day this comment described has arrived.
   *
   * It read *"currently unreachable, on purpose … `CreateInvoiceModal` no longer
   * calls `onSuccess`"*, because the modal refused inline and `src/actions/finance/`
   * had no invoice write. Both are now false: `createInvoice` is dispatched from
   * the modal and `onSuccess` fires only after it resolves, carrying the ACTION's
   * own result — so `created.invoiceId` is a uuid Postgres generated, not a
   * number this screen chose.
   *
   * There is no number to name here at all. **R-15**: a Draft carries no
   * `invoice_no`; it is minted by `next_document_number('invoice')` at issue. So
   * the disclosure names the booking, which is the fact the operator recognises.
   *
   * Prepending the row locally is still refused: the list is read from Postgres,
   * so an invoice put on screen by hand would vanish at the next refetch with no
   * explanation. `refreshAll()` is what makes it appear, and the note below says
   * what it means if it does not.
   */
  const handleCreateInvoiceSuccess = useCallback(
    (created: CreateInvoiceResult) => {
      setNotPersisted({
        title: `${created.bookingNo}’s draft invoice is not in the list yet`,
        message:
          `The invoice was written (${created.linesWritten} line${created.linesWritten === 1 ? '' : 's'}, ` +
          `${formatMoney(created.totalPaisa)}) but the table below is read from the database, so the row appears only ` +
          'once the refetch returns it. It carries no number until it is issued at return — look for the Draft. If it ' +
          'does not appear at all, report it rather than raising a second one.',
      })
      refreshAll()
    },
    [refreshAll],
  )

  /**
   * ⚠ **Currently unreachable, on purpose** — the same shape as
   * `handleCreateInvoiceSuccess` above, and for the same reason.
   *
   * `VoidInvoiceModal` no longer calls `onSuccess`. It used to
   * `DomainEvents.emit('invoice.voided')` and hand the number back as though a
   * write had happened; this screen then set `notPersisted` and refetched, so
   * the operator learned the truth only AFTER the modal had closed on them. The
   * modal now refuses inline, before it closes and while their reason is still
   * on screen, which is the earlier and better place for it. (It also never
   * dispatched an action, so `invoice.void` → `rbac.canVoidInvoice` was never
   * consulted — the launcher gates above are the other half of that.)
   *
   * Kept wired, not deleted: the day a `voidInvoice` action exists, `onSuccess`
   * fires after a real write and this becomes the disclosure for a row the
   * refetch has not caught up with yet.
   */
  const handleVoidSuccess = useCallback(
    (invoiceNo: string) => {
      setNotPersisted({
        title: `${invoiceNo} is not shown as voided yet`,
        message:
          'The void reported success but the table below is read from the database, so the badge changes only once the refetch ' +
          'returns the row. If it stays live, nothing was voided — report it rather than retrying.',
      })
      refreshAll()
    },
    [refreshAll],
  )

  /**
   * ⚠ The invoice list is UNPAGED, and an unpaged PostgREST response is capped
   * (1000 rows on a default Supabase project). So `rows` can be a prefix of the
   * answer, and a table that quietly shows the first 1000 of 1400 invoices is
   * indistinguishable from one showing all of them.
   *
   * `count: 'exact'` knows the real number, so the title states both figures the
   * moment they differ rather than leaving the truncation silent. That is a
   * disclosure, not a fix: the fix is `ListFilters.page` plus a pager, the way
   * `RentalsList` does it, and it also decides what Export means (the page, or
   * the set). TODO(decision).
   */
  const invoiceCardTitle =
    list.total === null
      ? 'Invoices'
      : `Invoices (${list.total})`

  const exportCsv = useCallback(() => {
    recordExport({ list: 'finance.invoices', module: 'Finance', rowCount: list.rows.length, columns: INVOICE_CSV_HEADERS })
    const blob = new Blob([invoicesCsv(list.rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance_invoices_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [list.rows])

  /**
   * §9.1's right-rail stack — `P&L SUMMARY` then `BY METHOD`.
   *
   * Held as a value rather than written inline because it is rendered in two
   * places: inside `Rail` at desktop, and inline beneath the list below 1280.
   * One definition, so the two cannot drift; see where it is used for why the
   * rail is not simply left to `CollapsibleAside`.
   */
  const railCards = (
    <>
      {/*
        §9.1's `P&L SUMMARY` — `Revenue − Cost of rental = Gross profit −
        Operating expenses = Net profit`.

        Law 1 and the never-fabricate rule between them mean the five rows
        cannot be drawn. They used to be five module constants in this file,
        wired together by two `throw`s so they always reconciled with each other
        and with nothing else. There is no revenue column, no COGS concept and
        no cost-of-rental column anywhere in `supabase/migrations`.

        So the card renders the chain's SHAPE with every row marked untracked
        and names what each one needs. That is more use than a blank card and is
        not a figure: the reader learns which three things are missing, in the
        order the statement wants them.
      */}
      <Card title="P&L summary">
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
          Profit and loss figures will appear when rental costs and approved expenses are available.
        </p>
      </Card>

      {/* §9.1's `BY METHOD ▓▓▓░░`, from `bank_accounts.channel_group` through
          the `payments` embed. Same rows as the Received KPI, bucketed — so the
          slices sum to it by construction and cannot drift the way two
          hand-typed arrays did. */}
      <Card title={`By method · ${period.label}`}>
        {receivedTotal === null ? (
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
            {received.loading
              ? 'Loading payments…'
              : received.error
                ? 'The payments for this period could not be read, so the breakdown is not shown rather than shown short.'
                : 'More payments matched than were fetched in one request, so any breakdown drawn here would be short by an unknown amount.'}
          </p>
        ) : methodSlices.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
            No payment was received in this period.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'stretch' }}>
              <div style={{ alignSelf: 'center' }}><Donut slices={methodSlices} centreLabel="Methods" size={116} /></div>
              <Legend slices={methodSlices} showValues={methodSlices.length > 1} />
            </div>
          </>
        )}
      </Card>

    </>
  )

  const headerActions = (
    <>
      <BsAdDate date={dayAd} />
      {/* Launcher 1 of 2 money launchers. Hidden, not disabled, like its three
          siblings — a greyed button still says an invoice can be raised here.
          `canIssueInvoice` is `rbac.canIssueInvoice` (R-05: Owner · Admin ·
          Manager · Accounts), the same predicate `actions/core.ts` resolves
          `invoice.create` through; its TODO(decision) is closed. */}
      {canIssueInvoice && (
        <Button icon="plus" variant="secondary" aria-label="Create Invoice" onClick={() => setShowCreateInvoice(true)}>
          {phone ? '' : 'Create Invoice'}
        </Button>
      )}
      {/* Launcher 2 of 2. Export stays on the page's money gate alone — it
          writes nothing and reads only rows this session already has. */}
      {canTakePayment && (
        <Button
          icon="dollar"
          variant="primary"
          aria-label="Record Payment"
          onClick={() => {
            setSelectedInvoiceForRecord('')
            setShowRecordPayment(true)
          }}
        >
          {phone ? '' : 'Record Payment'}
        </Button>
      )}
      <Button icon="download" aria-label="Export invoices" onClick={exportCsv}>
        {phone ? '' : 'Export'}
      </Button>
    </>
  )

  /* Shared input dressing for the rail's controls — the same recipe the
     Operation column uses, so the two filter rails read as one control. */
  const railInputStyle = {
    minHeight: 44,
    padding: '0 9px',
    borderRadius: 'var(--r-input)',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: 'var(--t-meta)',
    fontFamily: 'inherit',
  } as const

  const dateColChip = (col: 'issue_date' | 'due_date', label: string, block: boolean) => (
    <button
      key={col}
      type="button"
      onClick={() => setDateCol(col)}
      aria-pressed={dateCol === col}
      className="tap"
      style={{
        minHeight: 28,
        padding: '0 10px',
        borderRadius: 'var(--r-badge)',
        border: `1px solid ${dateCol === col ? 'transparent' : 'var(--border)'}`,
        background: dateCol === col ? 'var(--st-primary-bg)' : 'var(--card2)',
        color: dateCol === col ? 'var(--st-primary-fg)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        ...(block ? { width: '100%', textAlign: 'left' as const } : {}),
      }}
    >
      {label}
    </button>
  )

  /* The Invoices filters now open from the table toolbar. The panel is fixed,
     so it never steals a table column, and the same control works at every
     viewport width. Status chips remain the table's primary tabs. */
  const invoiceFiltersPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      <Card title="Date">
        <div role="group" aria-label="Which date the range below binds" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dateColChip('issue_date', 'Issue date', true)}
          {dateColChip('due_date', 'Due date', true)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', marginTop: 'var(--sp-sm)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            From
            <DateField ariaLabel="Invoices from this day" value={dateFrom} onChange={setRailDateFrom} showBs={false} clearable style={railInputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            To
            <DateField ariaLabel="Invoices up to this day" value={dateTo} onChange={setRailDateTo} showBs={false} clearable style={railInputStyle} />
          </label>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {dateFrom || dateTo ? 'Kathmandu civil days; stored instants are UTC.' : 'No dates picked — showing every day.'}
          </span>
        </div>
      </Card>
      {(railIsFiltered || chip !== 'All') && (
        <Button icon="close" onClick={clearInvoiceFilters}>
          Clear all filters
        </Button>
      )}
    </div>
  )

  return (
    <PageShell width="full">
      <div className="finance-v2">
      {/* The three actions are omitted for a money-blind session, not disabled:
          all three operate on records that session may not read. */}
      {/* The header actions belong to the two tabs this file owns: Create
          Invoice and Record Payment act on invoices, and Export exports the
          invoice list. The four hosted tabs bring their own primaries (＋ Record
          Payment, ＋ Add Expense, ＋ Generate, the catalog's own controls), and
          two Export buttons on one screen exporting different things is the
          duplication the re-host was done to remove. */}
      <PageHeader
        {...(tab === 'Invoices' ? {
          leading: (
            <FilterButton
              onClick={() => setInvoiceFiltersOpen((open) => !open)}
              activeCount={invoiceFilterCount}
              controls="finance-invoice-filters"
              expanded={invoiceFiltersOpen}
            />
          ),
        } : money && tab === 'Expenses' ? {
          leading: <FilterButton onClick={() => setExpenseFiltersOpen((open) => !open)} controls="expense-filters" expanded={expenseFiltersOpen} />,
        } : {})}
        icon="card"
        title="Finance"
        module={tab === 'Expenses' ? 'expenses' : 'payments'}
        {...(money && (tab === 'Dashboard' || tab === 'Invoices') ? { actions: headerActions } : {})}
      />

      {/*
        §9.4 — the six tabs. Every one of them renders its screen HERE; none is
        a link out. `overflowX` because the strip is six items wide and §9.1's
        phone note is "tabs scroll" — it scrolls rather than wrapping or
        truncating, so no tab becomes unreachable at 320px.

        The labels come from `SPEC_TABS['/finance']`; see `FINANCE_TABS` above
        for why, and for where the deleted fifth "Audit" tab went.
      */}
      <div style={{ overflowX: 'auto', paddingBottom: 2, maxWidth: '100%' }}>
        <SegmentedControl<FinanceTab>
          ariaLabel="Finance sections"
          options={FINANCE_TABS.map((t) => ({ id: t as FinanceTab, label: t }))}
          value={tab}
          onChange={(next) => {
            if (next !== 'Invoices') setInvoiceFiltersOpen(false)
            if (next !== 'Expenses') setExpenseFiltersOpen(false)
            setTab(next)
          }}
        />
      </div>

      {/*
        The four re-hosted screens.

        Each is its own component with its own queries, its own money gate and
        its own restricted state — this file hosts them and does not reach into
        them. `embedded` strips only the duplicate title block (and, on
        Documents, the second search field); see `TabHeader.tsx`.

        Mounted here rather than inside the `PageBody` below because each screen
        applies `financeRestriction` itself: nesting them would render the
        restricted state twice, once from this page and once from theirs.
      */}
      {tab === 'Payments' && <Payments embedded />}
      {tab === 'Expenses' && <Expenses embedded filtersOpen={expenseFiltersOpen} onFiltersClose={() => setExpenseFiltersOpen(false)} />}
      {tab === 'Closing' && <DailyClosing embedded />}
      {tab === 'Documents' && <Documents embedded />}
      {tab === 'Reports' && <ReportCatalog />}

      {/*
        THE gate. `restricted` outranks every other state in `PageBody`, so a
        money-blind session never reaches the KPI strip, the donut or the table
        — and never sees "No invoices yet" for rows RLS withheld.

        No `loading`/`error`/`empty` at this level: those belong to the invoice
        list, which has its own `PageBody` inside, and a failing KPI count must
        not blank the whole page.

        Scoped to the two tabs this file itself owns. The other four are mounted
        above and bring their own gate; rendering this one around them would
        stack two restricted states on one screen.
      */}
      {(tab === 'Dashboard' || tab === 'Invoices') && (
      <PageBody noun="finance records" {...restriction}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {tab === 'Dashboard' && <KpiStrip items={kpis} columns={kpis.length} />}

          {tab === 'Invoices' && (
            <ListControlRow
              search={
                <SearchInput
                  value={railSearch}
                  onChange={setRailSearch}
                  onClear={() => setRailSearch('')}
                  placeholder="Search invoice or credit-note no…"
                  aria-label="Search invoices by invoice or credit-note number"
                />
              }
            />
          )}

          {/* No `onRetry`: `ErrorBanner`'s only button says "Retry", and retrying
              would mean issuing the invoice again, which is not what dismissing
              it does. Law 12 wants this persistent anyway — the work really was
              lost, and it stays said until another action replaces it. */}
          {notPersisted && <ErrorBanner title={notPersisted.title} message={notPersisted.message} />}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
              gap: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            {tab === 'Invoices' && (
              <FilterDrawer
                id="finance-invoice-filters"
                open={invoiceFiltersOpen}
                onClose={() => setInvoiceFiltersOpen(false)}
                desktopMode="overlay"
                width={360}
                resultCount={list.loading ? null : list.total}
                noun="invoices"
                activeCount={invoiceFilterCount}
                onClearAll={clearInvoiceFilters}
                standardFooter
                onApply={() => setInvoiceFiltersOpen(false)}
              >
                {invoiceFiltersPanel}
              </FilterDrawer>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
              {tab === 'Dashboard' ? (
                <>
                  {/*
                    §9.1's `REVENUE (chart)` slot.

                    ⚠ It is titled **Collections**, not Revenue, and that is not
                    a cosmetic choice. Revenue needs a recognition basis — is a
                    14-day hire earned on the day it is booked, spread across the
                    rental days, or recognised at return? `data/pulse.ts` records
                    that question as an open TODO(decision) (`PERIOD_BASIS`), and
                    no column in `supabase/migrations` answers it. What this
                    screen can prove is what ARRIVED, day by day: the same
                    `paymentsInPeriod` rows the Received KPI and the method donut
                    are built from, bucketed by payment date.

                    So the chart is real and reconciles to the KPI above it by
                    construction, and it is labelled as the quantity it actually
                    is rather than as the one the box is captioned.
                  */}
                  <Card title="Collections by day" action={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><BsAdDate date={period.fromAd} /><span>–</span><BsAdDate date={period.toAd} /></span>}>
                    {receivedTotal === null ? (
                      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
                        {received.loading
                          ? 'Loading payments…'
                          : received.error
                            ? 'Payments for this period could not be loaded.'
                            : 'Payment records unavailable.'}
                      </p>
                    ) : dailyCollections.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
                        No payments received in this period.
                      </p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 190, overflowX: 'auto', overflowY: 'hidden' }} role="img" aria-label="Daily collections">
                          {dailyCollections.map((d) => (
                            <div key={d.dayAd} style={{ width: 72, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flexShrink: 0 }}>
                              <span className="finance-daily-bar" title={formatMoney(d.total as Paisa)} style={{ width: 32, alignSelf: 'center', height: Math.max(d.total / dailyPeak * 100, 2), minHeight: 2 }} />
                              <span style={{ marginTop: 8, fontSize: 'var(--t-th)', textAlign: 'center' }}><BsAdDate date={d.dayAd} /></span>
                            </div>
                          ))}
                        </div>
                        {/* Law 11 — the bars are never the only statement. The
                            busiest day and the total are printed. */}
                        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
                          Collections recorded on {dailyCollections.length} day
                          {dailyCollections.length === 1 ? '' : 's'}. Busiest: <BsAdDate date={busiestDay.dayAd} layout="inline" />.
                        </p>
                      </>
                    )}
                  </Card>

                  {/*
                    §9.1's `OUTSTANDING INVOICES` table — `inv# │ client │ due │
                    amount`, exactly the four columns drawn.

                    It reuses the `outstandingInvoices()` query the KPI already
                    runs, so the count in the tile and the rows in the table
                    cannot disagree: they are the same result set, printed twice.
                  */}
                  <Card
                    title={`Outstanding invoices${outstanding.total === null ? '' : ` (${outstanding.total})`}`}
                    bodyStyle={{ padding: 0 }}
                  >
                    <PageBody
                      loading={outstanding.loading}
                      error={outstanding.error}
                      onRetry={refreshAll}
                      hasRows={outstanding.rows.length > 0}
                      empty={outstanding.isEmpty}
                      noun="outstanding invoices"
                      skeleton="table"
                      skeletonRows={4}
                      emptyTitle="Nothing outstanding"
                      emptyMessage="All issued invoices have been settled."
                      {...restriction}
                    >
                      <DataTableShell ariaLabel="Outstanding invoices" className="finance-table-shell">
                        <table className="finance-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--th-bg)' }}>
                              {['Invoice', 'Client', 'Due', 'Outstanding'].map((h, i) => (
                                <th key={h} style={i === 3 ? { ...th, textAlign: 'right' } : th}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {outstanding.rows.slice(0, 8).map((i) => (
                              <tr key={i.id} className="finance-row">
                                <td className="identifier finance-mono" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>{i.invoiceNo}</td>
                                <td style={td}>{i.clientName}</td>
                                <td className="finance-mono" style={{ ...td, color: 'var(--text2)' }}><BsAdDate date={i.dueDateAd} /></td>
                                <td className="figure finance-mono" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                                  {formatMoney(i.outstandingAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </DataTableShell>
                      {outstanding.total !== null && outstanding.total > 8 && (
                        <p style={{ margin: 0, padding: '10px 14px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                          The eight due soonest, of {outstanding.total}. The Invoices tab lists them all.
                        </p>
                      )}
                    </PageBody>
                  </Card>
                </>
              ) : (
                <>
                  <div className="finance-chip-track" role="group" aria-label="Filter invoices by status">
                        {INVOICE_CHIPS.map((c) => {
                        const on = chip === c
                        return (
                          <button
                            key={c}
                            type="button"
                            /* Overdue and the rail's date range are MUTUALLY
                               EXCLUSIVE — `overdueInvoices()` IS a dateRange
                               (due_date ≤ yesterday) and `ListFilters` carries
                               one, so holding both would silently replace the
                               chip's meaning. Same call as Operations' ?queue
                               vs ?quick: setting either clears the other. */
                            onClick={() => {
                              if (c === 'Overdue') {
                                setDateFrom('')
                                setDateTo('')
                              }
                              setChip(c)
                            }}
                            aria-pressed={on}
                            {...(c === 'Overdue' ? { title: 'Past due and unpaid invoices' } : {})}
                            className={`finance-filter-chip ${on ? 'is-active' : ''}`}
                            style={{
                              minHeight: 44,
                              padding: '0 14px',
                            }}
                          >
                            {c}
                          </button>
                        )
                        })}
                  </div>
                <Card title={invoiceCardTitle} bodyStyle={{ padding: 0 }}>
                  {list.total !== null && (
                    <AppPageToolbar
                      pagination={
                        <Pagination
                          page={page}
                          total={list.total}
                          pageSize={ROWS_PER_PAGE}
                          onPageChange={setPage}
                        />
                      }
                    />
                  )}
                  {/*
                    Fixed ladder: restricted → error → loading → empty → children.
                    `restricted` is spread here as well as on the page body: this
                    card is the surface whose empty state would otherwise read
                    "No invoices yet" for a session that was simply refused.

                    `hasRows` keeps a failed REFRESH from blanking a table
                    somebody is reading — the banner renders above the rows.
                  */}
                  <PageBody
                    loading={list.loading}
                    error={list.error}
                    onRetry={refreshAll}
                    hasRows={list.rows.length > 0}
                    empty={list.isEmpty}
                    emptyIsFiltered={list.isFiltered}
                    onClearFilters={clearInvoiceFilters}
                    noun="invoices"
                    skeleton="table"
                    skeletonRows={6}
                    /* The per-chip copy states a business fact ("No drafts").
                       When the RAIL caused the emptiness that fact is not
                       known — omit the pair and let PageBody's filtered
                       defaults ("No invoices match these filters") speak. */
                    {...(railIsFiltered ? {} : { emptyTitle: EMPTY_TITLE[chip], emptyMessage: EMPTY_MESSAGE[chip] })}
                    /* From main's Phase 9 work: with nothing invoiced at all,
                       offer the one next step, to the roles R-05 lets issue. */
                    {...(!list.isFiltered && canIssueInvoice
                      ? { emptyActionLabel: 'Create Invoice', onEmptyAction: () => setShowCreateInvoice(true) }
                      : {})}
                    {...restriction}
                  >
                    {tabular ? (
                      <DataTableShell ariaLabel="Invoices" className="finance-table-shell" data-table-scroll style={{ overflowX: 'auto' }}>
                        <table className="finance-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                          <thead>
                            <tr style={{ background: 'var(--th-bg)' }}>
                              {/* Two money columns rather than one "Amount": the
                                  invoice carries seven distinct money columns and
                                  collapsing them into a display string is what
                                  made this file parse "Rs 1,234.50" as
                                  Rs 1,23,450. There is no per-column money gate
                                  because there is no money-blind reader here —
                                  the page gate above already refused the session. */}
                              {['Invoice', 'Client', 'Booking', 'Total', 'Outstanding', 'Due', 'Status', 'Actions'].map((h) => (
                                <th key={h} style={th}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceRows.map(({ row: i, glance, detail }) => (
                              <tr key={i.id} className="finance-row" style={{ borderBottom: '1px solid var(--border)' }}>
                                <td className="identifier finance-mono" style={{ ...td, color: 'var(--link)', fontWeight: 600 }}>
                                  <IntelCard
                                    glance={glance}
                                    detail={detail}
                                    detailTitle={i.invoiceNo}
                                    detailSubtitle={`${i.clientName} · ${i.status}`}
                                    entityType="invoice"
                                    entityId={i.invoiceNo}
                                    context="payments"
                                    gateContext={gctx}
                                  >
                                    <span>{i.invoiceNo}</span>
                                  </IntelCard>
                                </td>
                                <td style={td}>{i.clientName}</td>
                                <td className="figure finance-mono" style={{ ...td, color: 'var(--link)', fontSize: 'var(--t-meta)' }}>
                                  <Link to={`/rentals/${i.bookingNo}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                    {i.bookingNo}
                                  </Link>
                                </td>
                                <td className="figure finance-mono" style={{ ...td, fontWeight: 600 }}>{formatMoney(i.totalAmount)}</td>
                                <td
                                  className="figure finance-mono"
                                  style={{ ...td, color: i.outstandingAmount > 0 ? 'var(--danger-text)' : 'var(--text2)' }}
                                >
                                  {formatMoney(i.outstandingAmount)}
                                </td>
                                <td className="finance-mono" style={{ ...td, color: 'var(--text2)' }}><BsAdDate date={i.dueDateAd} /></td>
                                <td style={td}>
                                  <StatusBadge row={i} />
                                </td>
                                {/* `display: flex` takes this cell out of table-cell
                                    layout, so the `height` the row floor puts on `td`
                                    stops behaving as a minimum and becomes a definite
                                    height on a flex container — and with `align-items`
                                    left at its default the three buttons would stretch
                                    to fill all 56px. `center` holds them at their
                                    painted size; the row still gets its floor from the
                                    seven real table cells beside this one. */}
                                <td style={{ ...td, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <RowActions
                                    row={i}
                                    canPay={canTakePayment}
                                    canVoid={canVoid}
                                    onPay={() => {
                                      // The UUID, not the number: a Draft has no
                                      // number (R-15) and the modal resolves the
                                      // payment by `invoices.id`. MONEY-05.
                                      setSelectedInvoiceForRecord(i.id)
                                      setShowRecordPayment(true)
                                    }}
                                    onVoid={() => setSelectedInvoiceForVoid(i)}
                                    onExportPdf={() => handleExportPdf(i)}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </DataTableShell>
                    ) : (
                      /* Below 768px a 900px table is a horizontal scrollbar, not a
                         layout (`useTabularLayout`) — same card shape RentalsList
                         uses. Every column and action above is preserved. */
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {invoiceRows.map(({ row: i, glance, detail }) => (
                          <div
                            key={i.id}
                            className="finance-card-item"
                          >
                            <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              <IntelCard
                                glance={glance}
                                detail={detail}
                                detailTitle={i.invoiceNo}
                                detailSubtitle={`${i.clientName} · ${i.status}`}
                                entityType="invoice"
                                entityId={i.invoiceNo}
                                context="payments"
                                gateContext={gctx}
                              >
                                <span className="identifier finance-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--link)' }}>
                                  {i.invoiceNo}
                                </span>
                              </IntelCard>
                              <StatusBadge row={i} />
                            </span>

                            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{i.clientName}</span>

                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)' }}>
                              <Icon name="box" size={12} style={{ color: 'var(--muted)' }} />
                              <Link to={`/rentals/${i.bookingNo}`} className="figure finance-mono" style={{ color: 'var(--link)', textDecoration: 'none' }}>
                                {i.bookingNo}
                              </Link>
                            </span>

                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span className="figure finance-mono" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                                {formatMoney(i.totalAmount)}
                              </span>
                              <span className="finance-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Due {formatDayAd(i.dueDateAd)}</span>
                            </span>

                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
                              <span style={{ color: 'var(--text2)' }}>Outstanding</span>
                              <span
                                className="figure finance-mono"
                                style={{ fontWeight: 600, color: i.outstandingAmount > 0 ? 'var(--danger-text)' : 'var(--text2)' }}
                              >
                                {formatMoney(i.outstandingAmount)}
                              </span>
                            </span>

                            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 2 }}>
                              <RowActions
                                phone
                                row={i}
                                canPay={canTakePayment}
                                canVoid={canVoid}
                                onPay={() => {
                                  // The UUID, not the number — see the desk table's
                                  // own `onPay` above. MONEY-05.
                                  setSelectedInvoiceForRecord(i.id)
                                  setShowRecordPayment(true)
                                }}
                                onVoid={() => setSelectedInvoiceForVoid(i)}
                                onExportPdf={() => handleExportPdf(i)}
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </PageBody>
                </Card>
                </>
              )}
            </div>

            {/*
              §9.1's right rail — `P&L SUMMARY` then `BY METHOD`.

              **"Right rails collapse below 1280" is REFLOW, not hide** —
              `WIREFRAME_RULINGS_2026-08-12.md` §7, and §9.1's own tablet note
              is "rail drops below". `Rail` wraps `CollapsibleAside`, which
              reads "collapse" as *hide behind a 28px handle* at both tablet and
              phone; under that reading the P&L summary and the method
              breakdown vanish on the 768–1279px tablet this product actually
              targets, behind a control nothing labels.

              So the rail is rendered only at desktop, and the same cards are
              rendered inline beneath the list below it — the `CasesQueue.tsx`
              pattern the ruling cites. `CollapsibleAside`'s defaults are NOT
              changed: other pages depend on them.
            */}
            {viewport === 'desktop' ? (
              <Rail>{railCards}</Rail>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{railCards}</div>
            )}
          </div>
        </div>
      </PageBody>
      )}

      {/* Finance modals. Mounted only for a session that can read the records
          they operate on, and remounted per open: `RecordPaymentModal` captures
          `initialInvoiceId` in `useState` on first mount, so a persistent mount
          posts every later payment against the first-ever invoice (P0-1,
          BUG_SWEEP_REGISTER_v1.0). */}
      {/* `canTakePayment` as well as `money`: the three launchers already carry
          it, and repeating it here means a role change mid-session cannot leave
          an open payment form belonging to a session that may not post it. */}
      {money && canTakePayment && showRecordPayment && (
        <RecordPaymentModal
          isOpen={showRecordPayment}
          onClose={() => setShowRecordPayment(false)}
          onSuccess={handleRecordPaymentSuccess}
          initialInvoiceId={selectedInvoiceForRecord}
          invoices={modalInvoices}
        />
      )}

      {/* `canIssueInvoice` here as well as on the launcher, for the reason the
          Record Payment mount above states: a role change mid-session must not
          leave an open money form belonging to a session that may no longer
          submit it.

          ⚠ Now gated on `showCreateInvoice` as well, which the previous pass
          explicitly deferred. Two reasons it can no longer wait: the modal reads
          the booking's lines when it opens, and a permanently-mounted modal
          holds that state across opens; and it raises a success TOAST, so a
          mounted-but-closed instance would require every screen that renders
          Finance — including its own suites — to provide a ToastProvider for a
          modal nobody opened. Same lifecycle as the three mounts around it. */}
      {money && canIssueInvoice && showCreateInvoice && (
        <CreateInvoiceModal
          isOpen={showCreateInvoice}
          onClose={() => setShowCreateInvoice(false)}
          onSuccess={handleCreateInvoiceSuccess}
        />
      )}

      {money && canVoid && selectedInvoiceForVoid && (
        <VoidInvoiceModal
          isOpen={!!selectedInvoiceForVoid}
          onClose={() => setSelectedInvoiceForVoid(null)}
          onSuccess={handleVoidSuccess}
          invoiceId={selectedInvoiceForVoid.id}
          invoiceNo={selectedInvoiceForVoid.invoiceNo}
          client={selectedInvoiceForVoid.clientName}
        />
      )}

      </div>
    </PageShell>
  )
}

/**
 * Law 3 — the badge reads the TIMESTAMP, not the label.
 *
 * `invoices_void_requires_reason` (0006:124-127) constrains `voided_at`,
 * `voided_by`, `void_reason` and `credit_note_no` together and says nothing at
 * all about `status`. So `voided_at` is the fact the database guarantees and
 * `status = 'Void'` is a label nothing forces to agree with it. When the two
 * disagree, the timestamp wins here — the same rule `InvoiceListRow.isVoid`
 * follows.
 */
function StatusBadge({ row }: { row: InvoiceListRow }) {
  const label = row.isVoid ? 'Void' : row.status
  /*
   * Delegates to <Badge> — DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one
   * component rendering the §4 map from lib/status; every screen inherits. No
   * screen colours a status itself."
   *
   * This used to assemble the chip here: `--r-badge` (a 999 pill, which §3.3
   * reserves for numeric COUNT badges), weight 600, sentence case, reading
   * `STATUS[token]` straight. That is three deviations from §4's block
   * anatomy, and it was one of fifteen local components doing the same thing —
   * which is how the product ended up with no status block that actually had
   * the ruled anatomy.
   *
   * The wrapper is KEPT rather than inlined at the call sites: it owns the
   * isVoid-beats-status rule documented above, which is a Finance decision and
   * not something <Badge> should know. What it no longer owns is the paint.
   *
   * `size="sm"` because these sit in dense invoice rows — it lands at roughly
   * the 20px the hand-rolled version had, without giving up the weight,
   * casing or tracking that ARE the identity of a status block.
   */
  return <Badge tone={INVOICE_TOKEN[label]} label={label} size="sm" />
}

/**
 * The three row actions, and the columns that decide whether each applies.
 *
 * Every condition now reads a real column instead of the status label:
 *  - **+ Pay** — there is something left to pay: `outstanding_amount > 0`.
 *    That is the invoice's own settled figure, computed by the engine.
 *  - **Void** — the invoice is not already void, by timestamp. Receipt
 *    corrections are started from the payment ledger, where one receipt is known.
 */
function RowActions({
  row,
  phone = false,
  canPay,
  canVoid,
  onPay,
  onVoid,
  onExportPdf,
}: {
  row: InvoiceListRow
  phone?: boolean
  /**
   * `rbac.canRecordPayment` for the signed-in session, passed in rather than
   * read here so the desktop table and the phone cards cannot answer the
   * permission question differently — they are two renderings of one row, and
   * this component is the single place `+ Pay` is drawn.
   *
   * Required, not defaulted: a `canPay = true` default would silently restore
   * the ungated behaviour at any future call site that forgets it.
   */
  canPay: boolean
  /** `rbac.canVoidInvoice` — Owner / Accounts. Required, same reason as `canPay`. */
  canVoid: boolean
  onPay: () => void
  onVoid: () => void
  onExportPdf?: () => void
}) {
  const base = phone
    ? {
        display: 'inline-flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        minHeight: 44,
        height: 44,
        flex: '1 1 88px',
        padding: '0 12px',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        borderRadius: 'var(--r-btn)',
        fontSize: 'var(--t-meta)',
        cursor: 'pointer' as const,
      }
    : {
        display: 'inline-flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        minHeight: 32,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        padding: '4px 10px',
        borderRadius: 'var(--r-btn)',
        fontSize: 'var(--t-meta)',
        cursor: 'pointer' as const,
      }

  return (
    <>
      {/* Each action checks both session capability and the invoice's real state. */}
      {canPay && !row.isVoid && row.outstandingAmount > 0 && (
        <button type="button" onClick={onPay} className="finance-action-btn is-primary" style={{ ...base, color: 'var(--nav-active-accent)', fontWeight: 600 }}>
          + Pay
        </button>
      )}
      {canVoid && !row.isVoid && row.status !== 'Paid' && row.paidAmount === 0 && (
        <button type="button" onClick={onVoid} className="finance-action-btn is-danger" style={{ ...base, color: 'var(--danger)', fontWeight: 500 }}>
          Void
        </button>
      )}
      {onExportPdf && (
        <button
          type="button"
          onClick={onExportPdf}
          aria-label={`Export PDF for ${row.invoiceNo || 'invoice'}`}
          className="finance-action-btn"
          style={{ ...base, color: 'var(--text)', fontWeight: 500 }}
        >
          PDF
        </button>
      )}
    </>
  )
}
