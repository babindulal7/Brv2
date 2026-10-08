import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageActions, Button, Rail, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { ScreenHeader } from './TabHeader'
import { PageBody } from '../../components/ui/PageBody'
import { DataTableShell } from '../../components/ui/DataTable'
import { STATUS, PAYMENT_STATUS_TONE } from '../../lib/status'
import { useViewport } from '../../lib/device'
import { formatMoney, toRupees } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { canRecordPayment, canReversePayment } from '../../lib/rbac'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  listPayments,
  receivedPayments,
  paymentsInPeriod,
  financeRestriction,
  listInvoices,
  payableInvoices,
  type PaymentListRow,
} from '../../lib/queries/finance'
import type { Database } from '../../types/supabase'
import { RecordPaymentModal } from './modals/RecordPaymentModal'
import { RefundPaymentModal } from './modals/RefundPaymentModal'
import { DateField } from '../../components/ui/DateField'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
import '../../components/ui/list-workspace.css'
import { Pagination } from '../../components/ui/Pagination'
import { IntelCard } from '../../components/ui/IntelCard'
import { gateContext } from '../../lib/fieldGating'
import { paymentGlance, paymentDetailGroups } from '../../data/paymentIntel'
import './finance.css'

/**
 * **Finance ▸ Payments** — `updated mds/09_FINANCE.md` §9.3, `/finance/payments`.
 *
 * The wireframe, in full:
 *
 * ```
 * │ Finance ▸ Payments                     [＋ Record Payment]     │
 * │ (All)(Received)(Refunded)(Reversed)          [method ▾][date▾] │
 * ├──────────────────────────────────┬─────────────────────────────┤
 * │ │ pay# │ BR# │ client │ method │ │  DEPOSITS (separate)        │
 * │ │      │ amount │ date │ ⋮     │ │  held · applied · refund    │
 * │ │ ↳ reversal row, linked to the│ │  never touches Outstand.    │
 * │ │   original, never an edit    │ │                             │
 * ```
 *
 * ## Law 4 — this screen offers no edit, and cannot
 *
 * `payments` is the one user-written table in migration 0006 with no
 * `updated_at` and no `updated_by`; UPDATE and DELETE are revoked and refused by
 * trigger (0006:172-175). `lib/queries/finance.ts` therefore exports `listPayments`
 * and no payment write at all, and its header says one must never be added. So
 * the row's `⋮` is **Reverse**, not Edit — a compensating entry, never a change
 * to the receipt. See REVERSAL below for exactly how far that goes today.
 *
 * ## Restricted, never empty
 *
 * `payments` has no `_v` view. RLS gates it WHOLE-ROW
 * (`payments_money_blind … using (auth_can_view_money())`, migration 0014), so a
 * Warehouse / Technician / Driver / Client session gets HTTP 200 and `[]` rather
 * than a 403. Handed straight to `useList` that becomes `isEmpty`, and the
 * screen would tell a warehouse user this business has taken no money — a false
 * claim, not a blank state. `financeRestriction(useCanViewMoney())` is spread
 * onto `PageBody`, whose ladder puts `restricted` above everything else.
 *
 * That is belt AND braces: `/finance` is already in `MONEY_ROUTES`, so App.tsx's
 * Shell refuses a money-blind session before this component mounts. The guard is
 * repeated here because the shell guard is a route table and this one is the
 * query's own contract — if the route ever moves, the screen still cannot lie.
 *
 * ## Every filter is server-side, or it is not offered
 *
 * A chip that narrows the page you already fetched is the defect
 * `lib/queries/listQuery.ts` exists to end, so nothing here calls `.filter()` on
 * `list.rows`. Two of the four controls §9.3 draws cannot be asked of the
 * database from this file, and both say so on screen rather than filtering
 * client-side or quietly matching nothing:
 *
 *  - **`(Reversed)`** needs `payment_reversals`, joined on `original_payment_id`
 *    (0006:215). `queries/finance.ts` has no reader for it — its own
 *    `TODO(persistence)` at the PAYMENT STATUS block says a
 *    `payments_with_reversal_v` view or a `listPaymentReversals` is what the chip
 *    actually needs, and that the reversals table has a NARROWER role list
 *    (Owner/Admin/Manager/Accounts, 0018:58 — Coordinator excluded) so it is its
 *    own query with its own restricted state, not a flag bolted onto this one.
 *  - **`[method ▾]`** is `bank_accounts.channel_group`, reached through an embed.
 *    `payments` itself carries only `bank_account_id`; there is no method column
 *    (verified against `types/supabase.ts` `payments.Row`). PostgREST can filter
 *    a parent by an embedded column only through an `!inner` join, and
 *    `PAYMENT_COLUMNS` (`queries/finance.ts:726`) embeds `bank_accounts ( … )`
 *    without it — so `in('bank_accounts.channel_group', …)` would filter the
 *    EMBED and return every payment with the method nulled out, which is worse
 *    than no filter. Fixing it means `bank_accounts!inner` in that select, or a
 *    `bank_accounts` query to turn a channel group into the set of
 *    `bank_account_id`s behind it. Both are edits to `queries/finance.ts`.
 *
 * The **method column** is unaffected and renders real data — only the
 * *narrowing* is missing. `09_FINANCE.md` §9.6 sets the house style for a drawn
 * control with no table behind it ("renders the honest 'not tracked yet' empty
 * state, never a fabricated figure"), so both controls are drawn, disabled, and
 * carry their reason.
 *
 * ## `(Refunded)` filters `payment_type`, NOT `payment_status`
 *
 * This is the one place where taking the wireframe's word literally would have
 * produced a silent lie, so it is spelled out.
 *
 * `payment_status` is `Received | Refunded | Failed | Cancelled` (0001:287), and
 * 0001:285 rules the second of those derived: *"'Refunded' is derived from the
 * existence of a reversal row - a status UPDATE would breach payment
 * immutability."* UPDATE is revoked, so nothing can ever move a row into it.
 * `chips: { status: ['Refunded'] }` does not error — it returns zero rows, and
 * the screen reports "no refunds" to a business that has issued them.
 *
 * `payment_type` is a different column and a storable one: `Advance Payment |
 * Refund | Security Deposit`, of which the third is forbidden by a table CHECK
 * (`payments_no_security_deposit`, 0006:198) and the first two are ordinary. A
 * refund paid back out is written as a row with `payment_type = 'Refund'`. That
 * is the column that answers "show me the refunds", so that is the column the
 * chip asks, and the chip says so in its own accessible name.
 */

type PaymentStatus = PaymentListRow['status']
type PaymentTypeDb = Database['public']['Enums']['payment_type']

/* ── filter vocabulary ────────────────────────────────────────────────────
 *
 * Exported so the tests pin the mapping without rendering, the way
 * `data/operations.ts` is pinned beside `OperationsQueues`.
 */

/** The three chips this screen can actually answer. `(Reversed)` is not one — see the header. */
export type PaymentChip = 'All' | 'Received' | 'Refunded'

export const PAYMENT_CHIPS: readonly PaymentChip[] = ['All', 'Received', 'Refunded']

/** Newest receipt first — a ledger is read backwards from the most recent entry. */
const NEWEST_FIRST: NonNullable<ListFilters['sort']> = { column: 'payment_date', ascending: false }

/**
 * A chip → the predicate the database is asked for.
 *
 * `All` sends NO constraint rather than a chip group listing every status: an
 * empty or absent group is "no constraint" in `applyListFilters`, and
 * enumerating the enum instead would drop any row whose status this file had not
 * been taught about.
 */
export function paymentChipFilters(chip: PaymentChip): ListFilters {
  if (chip === 'Received') return receivedPayments()
  if (chip === 'Refunded') {
    return { chips: { payment_type: ['Refund'] satisfies PaymentTypeDb[] }, sort: NEWEST_FIRST }
  }
  return { sort: NEWEST_FIRST }
}

type PaymentDateRange = NonNullable<ListFilters['dateRange']>

/**
 * The `payment_date` bounds for a Kathmandu day range — **borrowed from
 * `paymentsInPeriod`, not re-derived.**
 *
 * Law 7 and `bs.ts` own the `+05:45` offset; `queries/finance.ts` formats it from
 * `NPT_OFFSET_MIN` once and `paymentsInPeriod` is the only place in that module
 * that needs it, because `payments.payment_date` is a `timestamptz` while every
 * other finance date column is a plain `date`. Compare a `timestamptz` against a
 * bare `YYYY-MM-DD` and Postgres reads it as midnight UTC — 05:45 the same
 * morning in Kathmandu — so a day's takings would start 5h45m late and stop
 * 5h45m early, silently.
 *
 * Writing that arithmetic again here would be a third copy of Nepal's offset,
 * which `Calendar.md` §4.2 calls the highest-priority correctness bug in the
 * product. So each end is taken from a one-day `paymentsInPeriod` call and its
 * status chip is discarded: that function pins `status = 'Received'`, and on this
 * screen the status is whatever the chip row selected.
 *
 * Either end may be left blank — a range open at one end is a legitimate
 * question ("everything since the 1st"). Both blank is no constraint at all,
 * which returns `null` rather than an unbounded `dateRange`; an empty range
 * object would tell `useList` the list is filtered while filtering nothing.
 */
export function paymentDateRange(fromDay: string, toDay: string): PaymentDateRange | null {
  if (!fromDay && !toDay) return null
  const fromAd = fromDay ? paymentsInPeriod(fromDay, fromDay).dateRange?.fromAd : undefined
  const toAd = toDay ? paymentsInPeriod(toDay, toDay).dateRange?.toAd : undefined
  if (!fromAd && !toAd) return null
  return {
    column: 'payment_date',
    ...(fromAd ? { fromAd } : {}),
    ...(toAd ? { toAd } : {}),
  }
}

export const ROWS_PER_PAGE = 25

/** The complete set sent to Postgres: the chip's predicate with the day range bound onto it and page bounds. */
export function paymentFilters(chip: PaymentChip, fromDay: string, toDay: string, page = 1): ListFilters {
  const base = paymentChipFilters(chip)
  const range = paymentDateRange(fromDay, toDay)
  const filters = range ? { ...base, dateRange: range } : base
  return {
    ...filters,
    page: { index: Math.max(0, page - 1), size: ROWS_PER_PAGE },
  }
}

/* ── row rendering ──────────────────────────────────────────────────────── */

/**
 * The method cell.
 *
 * `channelGroup` is `null` when `bank_account_id` is null — meaning **no
 * destination account was recorded**, not that it was cash. 'Cash' is itself a
 * `payment_channel_group` value (0001:1028), so reading it out of an absence
 * would manufacture a fact. An absent method renders as an explicit non-value.
 */
export function methodLabel(row: Pick<PaymentListRow, 'channelGroup' | 'bankName'>): string {
  if (row.channelGroup === null) return '—'
  return row.bankName === null ? row.channelGroup : `${row.channelGroup} · ${row.bankName}`
}

export const NO_METHOD_TITLE =
  'No destination account was recorded on this payment. That is not the same as cash — "Cash" is a channel group of its own.'

/**
 * `payment_date` is an instant, so it is rendered in Kathmandu rather than UTC —
 * for 5h45m of every UTC day the two disagree about which day it is.
 */
export function formatPaymentAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = formatAd(d)
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kathmandu',
  })
  return `${day} · ${time}`
}

/**
 * The BS reading of the same instant, or `null`.
 *
 * `bs.ts`'s `toBs` vouches for one month only (Shrawan 2083) and returns `null`
 * outside it. Null becomes an omitted line rather than a dash on the primary
 * row: Law 7 says BS is rendered, never stored, and a converter that cannot
 * vouch for a date must not print one. The AD reading is always present, so no
 * cell is ever empty.
 */
export function paymentBsLabel(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const bs = toBs(d)
  return bs === null ? null : formatBs(bs)
}

/**
 * Status → one of the five colours (Foundation §4.2). Exhaustive over
 * `payment_status`, including the member that cannot be reached, so adding an
 * enum member is a type error rather than an undefined lookup.
 */
/* The map moved to `lib/status.ts`: the booking's payment history and the
   hover Intel card render these same rows, and each carried its own copy. */

/** Law 11 — colour is never the sole carrier. Dot **and** word **and** tone. */
function StatusBadge({ status }: { status: PaymentStatus }) {
  const tok = STATUS[PAYMENT_STATUS_TONE[status]]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        height: 20,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: tok.bg,
        color: tok.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="dot" size={9} />
      {status}
    </span>
  )
}

/* ── chip chrome, matching `OperationsQueues` ───────────────────────────── */

function chipStyle(on: boolean, disabled = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-sm)',
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 'var(--r-btn)',
    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is left alone.
 *
 * This ledger looks as though it already clears the floor, and that is the part
 * worth naming: the height comes from `ReverseAction`, whose button carries
 * `minHeight: 44` and pushes its own cell to 64px. But `ReverseAction` returns
 * null when the session lacks `canRecordPayment`, so for every read-only reader
 * the row collapses to 10 + one line + 10 and the geometry of the table becomes
 * a function of a permission check. That is the wrong thing for a row height to
 * depend on. The next control to land in this ledger inherits a ~38px row, and
 * a 44px target on a 38px row overhangs its neighbours by ~3px each side where
 * the rows touch — in that band the later row in the DOM wins the tap, which
 * here means a reversal opened against the WRONG payment.
 *
 * Stating the floor on `td` makes the row own its height instead of borrowing
 * it from whichever control happens to be tall and happens to be allowed.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

const inputStyle = {
  minHeight: 44,
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

/* ── URL state ───────────────────────────────────────────────────────────
 *
 * The URL is the state, as on `/operations`: a filtered ledger is linkable,
 * shareable and survives a reload, and nothing can hold a chip that disagrees
 * with the query that ran.
 */
const CHIP_PARAM: Record<PaymentChip, string | null> = { All: null, Received: 'received', Refunded: 'refunded' }

export function chipFromParam(param: string | null): PaymentChip {
  if (param === 'received') return 'Received'
  if (param === 'refunded') return 'Refunded'
  return 'All'
}

/* ── REVERSAL ─────────────────────────────────────────────────────────────
 * Law 4 corrections name the immutable payment directly. This includes advance
 * payments; the interface checks the receipt amount and Postgres enforces the
 * remaining cumulative cap under concurrent submissions.
 */
const REVERSAL_SCOPE_NOTE =
  'Corrects this receipt only.'

/**
 * Why no `↳ reversal row` is drawn beneath its original.
 *
 * Stated on the screen, not only in this comment, because its absence is
 * otherwise indistinguishable from "no payment has ever been reversed".
 */
const NO_REVERSAL_ROWS_NOTE =
  'Payment reversals are recorded separately and are not shown in this list.'

/* ── DEPOSITS ─────────────────────────────────────────────────────────────
 *
 * §9.3's right rail, and Law 5 — a deposit is an isolated liability, never
 * revenue, and never part of Rental Total or Outstanding.
 *
 * It is drawn with no figures because there are none to read: `security_deposits`
 * (0006:237-261) and `deposit_movements` (0006:271-292) have no query in
 * `lib/queries/finance.ts`, which excludes them deliberately and says so. A
 * "held" number invented from the payments list would be doubly wrong —
 * `payments_no_security_deposit` (0006:198) makes a deposit unreachable from this
 * table by construction, so summing anything here could only produce a figure
 * about something else.
 */
const DEPOSIT_LINES = ['Held', 'Applied', 'Refunded'] as const

/* ── fetchers ─────────────────────────────────────────────────────────────
 *
 * These are built inside the component with `useCallback` rather than living at
 * module scope, because both must close over `money`.
 *
 * ⚠ They were module-level constants and that was a defect, fixed 12 Aug 2026.
 * A money-blind session issued both requests, RLS answered `200`/`[]`, and
 * `withCount: true` brought back `count: 0` — see `listPayments`' own warning
 * ("Returns `{ rows: [], total: 0 }` for a money-blind session"). `PageBody`
 * refused the BODY correctly, but `countSuffix` below is rendered in the Card
 * TITLE, which sits outside it, so the page read
 *
 *     Payments — 0 payments      [RESTRICTED]
 *
 * i.e. it stated the ledger was empty to the one session that may not know.
 * That is the same false claim the restricted state exists to prevent, leaking
 * out through the one string the gate does not cover. `Finance.tsx:299-312` and
 * `Expenses.tsx:726-732` already short-circuit for exactly this reason; this is
 * the third copy of that guard, not a new idea.
 */

/**
 * **`embedded`** — this screen is hosted as a TAB, not reached as a page.
 *
 * `09_FINANCE.md` line 3: *"Six real working tabs, not links out to reports."*
 * `Finance.tsx` mounts this component inside its own tab strip, which already
 * carries the page title, the breadcrumb and the `[period ▾]` control. Rendering
 * `PageHeader` again there gives a second `<h1>` under the first — the exact
 * duplication `CONFLICTS.md` §09.2 warned re-hosting has to strip: *"stripping
 * the duplicate PageHeader and search box, not just importing them."*
 *
 * It is one boolean and NOT a second layout: every filter, column, card and
 * action below is identical either way. Only the title block moves out, and the
 * header's own actions move into a compact row so nothing is lost with it.
 *
 * The standalone route `/finance/payments` still renders `embedded={false}` and
 * keeps the full header, because a deep link arrives with no tab strip above it.
 */
export interface PaymentsProps {
  embedded?: boolean
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export default function Payments({
  embedded = false,
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: PaymentsProps = {}) {
  const [params, setParams] = useSearchParams()
  /* Law 13/14 — one width reading, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tabular = viewport !== 'phone'
  const railBesideList = viewport === 'desktop'

  /* Law 6 — the gate is the engine's, never local state. */
  const money = useCanViewMoney()

  /*
   * Found while gating the other Record Payment launchers (Finance.tsx,
   * BookingDetail.tsx, UnifiedInbox.tsx): this screen's header button was on
   * `money` alone, which is the same defect in a fourth place. Money
   * VISIBILITY admits Admin and Manager; `rbac.canRecordPayment` — the rule
   * `actions/core.ts` resolves `payment.create` through — is Owner /
   * Coordinator / Accounts. An Admin could open the modal, fill it in, and
   * only then be refused by the dispatcher.
   *
   * `money` is still checked alongside it (the whole ledger below is money),
   * because the two questions stay separate: reading the receipt ledger is not
   * writing to it. Absent, not disabled — `MovementList.tsx:307`.
   */
  const { user } = useAuth()
  const paymentGate = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  const canTakePayment = user ? canRecordPayment(user.role) : false

  // docs/PERMISSIONS.md F-a and the payment_reversals RLS policy agree exactly.
  const canReverse = user ? canReversePayment(user.role) : false

  const [recordOpen, setRecordOpen] = useState(false)
  const [reversing, setReversing] = useState<PaymentListRow | null>(null)

  const hasLoadedInvoices = useRef(false)
  const shouldLoadInvoices = recordOpen

  /* See the block above `Payments()` for why both of these close over `money`. */
  const fetchPayments = useCallback(
    async (filters: ListFilters) => {
      if (!money) return { rows: [], total: 0 }
      return listPayments({ ...filters, withCount: true })
    },
    [money],
  )
  const fetchInvoices = useCallback(
    async (filters: ListFilters) => {
      if (!money || (!shouldLoadInvoices && !hasLoadedInvoices.current)) {
        return { rows: [], total: 0 }
      }
      hasLoadedInvoices.current = true
      return listInvoices(filters)
    },
    [money, shouldLoadInvoices],
  )

  const chip = chipFromParam(params.get('status'))
  const fromDay = params.get('from') ?? ''
  const toDay = params.get('to') ?? ''
  const range = paymentDateRange(fromDay, toDay)
  const isFiltered = chip !== 'All' || range !== null

  const pageParam = parseInt(params.get('page') ?? '1', 10)
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1

  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    setParams(merged)
  }
  const clearFilters = () => setParams(new URLSearchParams())

  const setPage = (nextPage: number) => {
    patch({ page: nextPage > 1 ? String(nextPage) : null })
  }

  /*
   * The one list. Every predicate server-side.
   *
   * `isFilteredOverride` is the same boolean that decides whether "Clear filters"
   * is live. It is required rather than optional here because a chip REPLACES the
   * filter set rather than adding to a baseline — `receivedPayments()` and the
   * `payment_type` set are different shapes, so a baseline comparison cannot
   * answer "did the operator narrow this".
   */
  const list = useList<PaymentListRow>(fetchPayments, paymentFilters(chip, fromDay, toDay, page), {
    isFilteredOverride: isFiltered,
  })

  const total = list.total
  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / ROWS_PER_PAGE))

  useEffect(() => {
    if (total !== null && page > pageCount && pageCount > 0) {
      patch({ page: pageCount > 1 ? String(pageCount) : null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page bounds clamp
  }, [page, pageCount, total])

  /*
   * The invoices the Record Payment modal offers.
   *
   * ⚠ Deferred: only fetched once the operator opens Record Payment or clicks Reverse.
   */
  const invoiceFilters = payableInvoices()
  const invoiceList = useList(fetchInvoices, invoiceFilters, { baseline: invoiceFilters })

  useEffect(() => {
    if (shouldLoadInvoices && !hasLoadedInvoices.current) {
      invoiceList.refetch()
    }
  }, [shouldLoadInvoices, invoiceList])

  /**
   * Narrowed to what `RecordPaymentModal` declares, and mapped exactly as
   * `Finance.tsx` maps it, so one modal cannot be fed two different meanings of
   * the same field.
   *
   * ⚠ **`id` is the invoice's UUID now** (MONEY-05). It was `r.invoiceNo`, and
   * the modal resolved the payment by that number — which cannot settle a Draft,
   * because R-15 gives a Draft no number at all. `invoiceNo` travels alongside
   * as the picker's label and is `null` on a Draft, rendered as
   * "Draft (no number)". `booking` is still the booking NUMBER and is still
   * display-only.
   */
  const modalInvoices = useMemo(
    () =>
      invoiceList.rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        client: r.clientName,
        amount: formatMoney(r.totalAmount),
        status: r.status,
        booking: r.bookingNo,
        // R-39 D1 — prefills the Amount field with what the invoice still owes.
        outstandingRupees: toRupees(r.outstandingAmount),
      })),
    [invoiceList.rows],
  )

  const refreshAll = () => {
    list.refetch()
    if (hasLoadedInvoices.current) {
      invoiceList.refetch()
    }
  }

  const openRecord = () => {
    if (!hasLoadedInvoices.current) {
      invoiceList.refetch()
    }
    setRecordOpen(true)
  }

  const openReverse = (row: PaymentListRow) => {
    setReversing(row)
  }

  const rows = list.rows
  /*
   * No count until one has arrived — "0 payments" over a skeleton is a claim.
   *
   * `money` is checked as well as `total`, and belt-and-braces is deliberate:
   * the fetcher above already returns `total: 0` rather than the DB's, so this
   * title would say "0 payments" beside a RESTRICTED body on the strength of a
   * number this screen made up. The Card title is outside `PageBody`, so the
   * ladder cannot suppress it — the suppression has to happen here.
   */
  const countSuffix =
    !money || list.total === null ? '' : ` — ${list.total} ${list.total === 1 ? 'payment' : 'payments'}`

  const railContent = (
    <div className="finance-deposits-rail" style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="lock" size={14} style={{ flexShrink: 0, color: 'var(--muted)' }} />
        <h3 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          Deposits (separate)
        </h3>
      </div>

      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DEPOSIT_LINES.map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <dt style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{label}</dt>
            <dd
              className="figure"
              style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
              title="Deposit total unavailable"
            >
              —
            </dd>
          </div>
        ))}
      </dl>

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
        Deposit totals are unavailable in this view. Deposits are separate from rental charges and Outstanding.
      </p>
    </div>
  )

  return (
    <PageShell width="full">
      <div className="finance-v2">
      {/* Page when routed, subtitle + actions when hosted as Finance's Payments
          tab. See `TabHeader.tsx` for why the description and the actions
          survive the demotion and only the `<h1>` goes. */}
      <ScreenHeader
        embedded={embedded}
        icon="card"
        title="Payments"
        description="Review receipts and refunds."
        actions={
          !embedded ? (
            <PageActions
              primary={
                money && canTakePayment ? (
                  <Button icon="plus" variant="primary" aria-label="Record Payment" onClick={openRecord}>
                    {phone ? '' : 'Record Payment'}
                  </Button>
                ) : undefined
              }
              secondary={[
                <Button key="refresh" icon="refresh" aria-label="Refresh" onClick={refreshAll}>
                  {phone ? '' : 'Refresh'}
                </Button>,
              ]}
            />
          ) : undefined
        }
      />

      {/* §9.3 filter row — `(All)(Received)(Refunded)(Reversed)  [method ▾][date▾]` */}
      <div className="list-workspace__controls" style={{ gap: 'var(--sp-md)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', order: 0 }}>
          From
          <DateField
            ariaLabel="Payments from this Kathmandu day"
            value={fromDay}
            onChange={(v) => patch({ from: v || null, page: null })}
            showBs={false}
            clearable
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)', order: 0 }}>
          To
          <DateField
            ariaLabel="Payments up to and including this Kathmandu day"
            value={toDay}
            onChange={(v) => patch({ to: v || null, page: null })}
            showBs={false}
            clearable
            align="right"
            style={inputStyle}
          />
        </label>
        <div
          role="group"
          aria-label="Payment filters"
          className="finance-chip-track rsp-chip-scroll"
          style={{
            display: 'flex',
            gap: 'var(--sp-sm)',
            flexWrap: phone ? 'nowrap' : 'wrap',
            overflowX: phone ? 'auto' : undefined,
            paddingBottom: phone ? 2 : 0,
            order: 2,
            width: '100%',
          }}
        >
          {PAYMENT_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ status: CHIP_PARAM[c], page: null })}
              aria-pressed={chip === c}
              className={`finance-filter-chip ${chip === c ? 'is-active' : ''}`}
              style={chipStyle(chip === c)}
            >
              {c}
            </button>
          ))}

        </div>

        {isFiltered && <Button onClick={clearFilters} style={{ order: 3 }}>Clear filters</Button>}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: railBesideList ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <Card title={`Payments${countSuffix}`} bodyStyle={{ padding: tabular ? 0 : 10 }}>
          {total !== null && (
            <AppPageToolbar
              pagination={<Pagination page={page} total={total} pageSize={ROWS_PER_PAGE} onPageChange={setPage} />}
            />
          )}
          {/*
            Fixed ladder: restricted → error → loading → empty → children.
            `financeRestriction` outranks everything, so a money-blind session is
            never told the ledger is empty. `hasRows` keeps a failed REFRESH from
            blanking a ledger someone is reading.
          */}
          <PageBody
            {...financeRestriction(money)}
            loading={propLoading !== undefined ? propLoading : list.loading}
            error={propError !== undefined ? propError : list.error}
            onRetry={propOnRetry ?? refreshAll}
            hasRows={rows.length > 0}
            empty={list.isEmpty}
            emptyIsFiltered={list.isFiltered}
            onClearFilters={clearFilters}
            /* From main's Phase 9 work: an empty ledger offers its one next
               step, to the roles that may record a payment. */
            {...(!isFiltered && canTakePayment ? { emptyActionLabel: 'Record Payment', onEmptyAction: openRecord } : {})}
            noun="payments"
            skeleton="table"
            skeletonRows={5}
            emptyTitle={isFiltered ? 'No payments match these filters' : 'No payments yet'}
            emptyMessage={
              isFiltered
                ? 'Clear filters to see the full ledger.'
                : 'No payments have been recorded yet.'
            }
            {...(isFiltered
              ? { onClearFilters: clearFilters }
              : canTakePayment
                ? { emptyActionLabel: 'Record Payment', onEmptyAction: () => setRecordOpen(true) }
                : {})}
          >
            {/* PHONE <768 — the table becomes card rows. */}
            {!tabular && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {rows.map((p) => (
                  <article
                    key={p.id}
                    className="finance-card-item"
                    style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
                      <IntelCard glance={paymentGlance(p, paymentGate)} detail={paymentDetailGroups(p, paymentGate)} detailTitle={p.paymentNo} detailSubtitle={`${p.clientName} · ${p.status}`} entityType="payment" entityId={p.paymentNo} context="payments" gateContext={paymentGate}>
                        <span className="identifier finance-mono" style={{ fontWeight: 700, color: 'var(--text)' }} data-intel-identifier>{p.paymentNo}</span>
                      </IntelCard>
                      <span className="figure finance-mono" style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {formatMoney(p.amount)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)' }}>
                      <Link
                        to={`/rentals/${p.bookingNo}`}
                        className="identifier finance-mono"
                        style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {p.bookingNo}
                      </Link>
                      <span style={{ color: 'var(--muted)' }}>·</span>
                      <Link to={`/clients/${p.clientId}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                        <span
                          style={{
                            color: 'var(--text2)',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.clientName}
                        </span>
                      </Link>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-sm)',
                        flexWrap: 'wrap',
                        fontSize: 'var(--t-meta)',
                        color: 'var(--text2)',
                      }}
                    >
                      <StatusBadge status={p.status} />
                      <span>{p.paymentType}</span>
                      <span {...(p.channelGroup === null ? { title: NO_METHOD_TITLE } : {})}>{methodLabel(p)}</span>
                    </div>

                    <span
                      className="finance-mono"
                      style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
                      {...(paymentBsLabel(p.paymentDateAd) ? { title: paymentBsLabel(p.paymentDateAd) as string } : {})}
                    >
                      {formatPaymentAt(p.paymentDateAd)}
                    </span>

                    <ReverseAction row={p} onOpen={openReverse} canReverse={canReverse} full />
                  </article>
                ))}
              </div>
            )}

            {/* DESKTOP + TABLET — pay# │ BR# │ client │ method │ amount │ date │ ⋮ */}
            {tabular && (
              <DataTableShell ariaLabel="Payments" className="finance-table-shell" data-table-scroll style={{ overflowX: 'auto' }}>
                <table className="finance-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Payment', 'Booking', 'Client', 'Method', 'Type', 'Amount', 'Status', 'Date', ''].map((h, i) => (
                        <th key={h || i} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="finance-row" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier finance-mono" style={{ ...td, fontWeight: 600 }}>
                          <IntelCard glance={paymentGlance(p, paymentGate)} detail={paymentDetailGroups(p, paymentGate)} detailTitle={p.paymentNo} detailSubtitle={`${p.clientName} · ${p.status}`} entityType="payment" entityId={p.paymentNo} context="payments" gateContext={paymentGate}>
                            <span data-intel-identifier>{p.paymentNo}</span>
                          </IntelCard>
                        </td>
                        <td style={td}>
                          <Link
                            to={`/rentals/${p.bookingNo}`}
                            className="identifier finance-mono"
                            style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}
                          >
                            {p.bookingNo}
                          </Link>
                        </td>
                        <td style={td}>
                          <Link to={`/clients/${p.clientId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {p.clientName}
                          </Link>
                        </td>
                        <td
                          style={{ ...td, color: p.channelGroup === null ? 'var(--muted)' : 'var(--text2)' }}
                          {...(p.channelGroup === null ? { title: NO_METHOD_TITLE } : {})}
                        >
                          {methodLabel(p)}
                        </td>
                        {/*
                          Not drawn in §9.3, and kept because without it a refund
                          paid back out renders identically to money taken in:
                          `amount` is `check (amount > 0)` on both, so the type is
                          the only thing that says which direction it went.
                        */}
                        <td style={{ ...td, color: 'var(--text2)' }}>{p.paymentType}</td>
                        <td className="figure finance-mono" style={{ ...td, fontWeight: 700 }}>
                          {formatMoney(p.amount)}
                        </td>
                        {/* Likewise: under (All), a Failed or Cancelled row would
                            otherwise read as money received. */}
                        <td style={td}>
                          <StatusBadge status={p.status} />
                        </td>
                        <td
                          className="finance-mono"
                          style={{ ...td, color: 'var(--text2)' }}
                          {...(paymentBsLabel(p.paymentDateAd) ? { title: paymentBsLabel(p.paymentDateAd) as string } : {})}
                        >
                          {formatPaymentAt(p.paymentDateAd)}
                        </td>
                        <td style={td}>
                          <ReverseAction row={p} onOpen={openReverse} canReverse={canReverse} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            )}

            {total !== null && total > ROWS_PER_PAGE && (
              <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                <Pagination page={page} total={total} pageSize={ROWS_PER_PAGE} onPageChange={setPage} />
              </div>
            )}
          </PageBody>

          {/*
            Outside `PageBody` so it survives the empty state: the absence of
            `↳ reversal` rows is a fact about this build, not about the data, and
            it is exactly on an empty ledger that it would otherwise be misread.
          */}
          <p
            style={{
              margin: 0,
              padding: tabular ? '10px 14px' : '10px 0 0',
              borderTop: tabular ? '1px solid var(--border)' : 'none',
              display: 'flex',
              gap: 7,
              alignItems: 'flex-start',
              fontSize: 'var(--t-meta)',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            {NO_REVERSAL_ROWS_NOTE}
          </p>
        </Card>

        {/* Rulings §7 — below 1280 the rail REFLOWS beneath the list rather than
            hiding behind `CollapsibleAside`'s handle. */}
        {railBesideList ? <Rail label="Deposits">{railContent}</Rail> : railContent}
      </div>


      {/*
        Mounted only while open, and unmounted on close: `RecordPaymentModal`
        captures `initialInvoiceId` in `useState` on first mount, so a persistent
        mount posts every later payment against the first-ever invoice
        (P0-1, BUG_SWEEP_REGISTER_v1.0). Gated on `money` as well as `open` so no
        money-blind path can reach a rupee field, and on `canTakePayment` so a
        role change mid-session cannot leave an open payment form belonging to a
        session that may no longer post it.
      */}
      {money && canTakePayment && recordOpen && (
        <RecordPaymentModal
          isOpen={recordOpen}
          onClose={() => setRecordOpen(false)}
          onSuccess={() => refreshAll()}
          invoices={modalInvoices}
        />
      )}

      {/* The interface caps one receipt; the database remains the concurrent,
          cumulative authority. */}
      {money && canReverse && reversing && (
        <RefundPaymentModal
          isOpen
          onClose={() => setReversing(null)}
          onSuccess={() => refreshAll()}
          paymentId={reversing.id}
          paymentNo={reversing.paymentNo}
          paymentAmountPaisa={reversing.amount}
          client={reversing.clientName}
        />
      )}
      </div>
    </PageShell>
  )
}

/**
 * The row's `⋮` — Reverse, never Edit. See the REVERSAL block above for the two
 * limits it carries on its own accessible name.
 */
function ReverseAction({
  row,
  onOpen,
  canReverse,
  full = false,
}: {
  row: PaymentListRow
  onOpen: (row: PaymentListRow) => void
  /** `rbac.canReversePayment`, aligned with payment_reversals RLS. */
  canReverse: boolean
  full?: boolean
}) {
  /* Absent, not disabled: an unauthorized session must not be told this exists. */
  if (!canReverse) return null

  const label = `Reverse payment ${row.paymentNo}. ${REVERSAL_SCOPE_NOTE}`

  return (
    <button
      type="button"
      aria-label={label}
      title={REVERSAL_SCOPE_NOTE}
      onClick={() => onOpen(row)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sp-xs)',
        width: full ? '100%' : 'auto',
        minHeight: 44,
        padding: '0 12px',
        borderRadius: 'var(--r-btn)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        opacity: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="return_arrow" size={14} />
      Reverse
    </button>
  )
}
