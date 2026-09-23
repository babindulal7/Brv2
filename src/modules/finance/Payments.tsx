import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { ScreenHeader } from './TabHeader'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS, PAYMENT_STATUS_TONE } from '../../lib/status'
import { useViewport } from '../../lib/device'
import { formatMoney, toRupees } from '../../lib/money'
import { toBs, formatBs } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { canRecordPayment } from '../../lib/rbac'
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
import { Pagination } from '../../components/ui/Pagination'

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
  const day = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kathmandu',
  })
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
 *
 * §9.3's row carries a `⋮`, and the section is titled "record · refund ·
 * reversals". Law 4 makes the only correction a compensating row, so the action
 * is Reverse. Two limits, both structural, both surfaced on the control itself
 * rather than discovered by an operator mid-correction:
 *
 *  1. **The reversal is recorded against the INVOICE, not against this payment.**
 *     `payment_reversals.original_payment_id` (0006:215) is the real linkage, and
 *     nothing in `src/actions/` reaches it: `refundPayment`'s whole input is
 *     `{ id: string }` and `RefundPaymentModal` is invoice-scoped. Widening that
 *     input is a change to the action contract, which is not this screen's to
 *     make. The button says so.
 *  2. **An advance has no invoice to reverse against.** `payments.invoice_id` is
 *     nullable (0006:181) and null is an ordinary state — money taken before the
 *     invoice was raised. There is nothing to pass, so the control is disabled
 *     with that reason rather than passing the payment's own id into a prop named
 *     `invoiceId`, which is precisely the class of fabrication this codebase
 *     keeps removing.
 *
 * `invoiceId` carries `invoiceNo`, not the uuid, because that is the existing
 * contract at the only other call site (`Finance.tsx` passes
 * `selectedInvoiceForRefund.invoiceNo`) and the modal renders it in its own
 * title.
 *
 * ## `currentPaidPaisa` — the cap this route was skipping
 *
 * This mount passed NO `currentPaidPaisa`, and the modal's cap read
 * `if (currentPaidPaisa !== undefined && …)`. So the reversal ceiling was not
 * merely unstated here, it was **switched off**: an operator could reverse any
 * figure at all against an invoice from this screen. The half of that defect
 * that lives in the modal is fixed there (absence now refuses); this is the
 * other half.
 *
 * The figure is `invoices.paid_amount`, and `PaymentListRow` genuinely does not
 * carry it — a payment row knows its own amount, never the invoice's running
 * total. Substituting this payment's amount would put a false figure behind the
 * modal's "Only … has been received against …" sentence, so it is still not
 * done. What IS available is the invoice row itself: this screen already reads
 * `invoices` for the Record Payment modal, and `InvoiceListRow.paidAmount` is
 * that exact column. `reversalPaidPaisa` below matches on `invoiceNo`, which is
 * `text not null unique` (0006:76, :112), so a match is the invoice — never a
 * near-miss.
 *
 * ⚠ Coverage is partial and the refusal, not a guess, is what covers the rest.
 * That read is `payableInvoices()` — Draft, 'Sent' and 'Partially Paid' — so a
 * reversal against a fully settled ('Paid') invoice finds nothing and hands the
 * modal `undefined`, which refuses and says the figure is unavailable. Refusing
 * is the correct behaviour for "we did not read what was received"; it is not a
 * claim that nothing was received. (The set gained 'Draft' with MONEY-05, which
 * narrows the gap rather than widening it: a Draft carrying an advance is now
 * reversible from here where before it was not readable at all.)
 *
 * TODO(persistence): a single-invoice read (`invoices` by `invoice_no`) would
 * close the gap. `lib/queries/finance.ts` has no such reader — only list sets —
 * and adding one is that module's change, not this screen's.
 */
const REVERSAL_SCOPE_NOTE =
  'Reversal is recorded against the invoice, not against this individual payment — ' +
  'payment_reversals.original_payment_id is not reachable from the current action.'
const REVERSAL_NO_INVOICE_NOTE =
  'This payment is an advance taken before any invoice was raised, so there is no invoice to reverse against.'

/**
 * Why no `↳ reversal row` is drawn beneath its original.
 *
 * Stated on the screen, not only in this comment, because its absence is
 * otherwise indistinguishable from "no payment has ever been reversed".
 */
const NO_REVERSAL_ROWS_NOTE =
  'Reversal rows are not shown beneath their original yet: corrections live in payment_reversals, ' +
  'which has no reader in lib/queries/finance.ts. Its absence here is not a claim that none exist.'

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
const DEPOSIT_LINES: ReadonlyArray<{ label: string; source: string }> = [
  { label: 'Held', source: 'security_deposits' },
  { label: 'Applied', source: 'deposit_movements' },
  { label: 'Refunded', source: 'deposit_movements' },
]

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
export default function Payments({ embedded = false }: { embedded?: boolean }) {
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
  const canTakePayment = user ? canRecordPayment(user.role) : false

  /*
   * The row's Reverse control had NO capability gate at all — it was drawn for
   * any money-visible session, so an Admin or a Manager was offered a reversal
   * that `actions/core.ts` would refuse only after the amount and the reason had
   * been typed.
   *
   * `canRecordPayment` is the rule, and it is not a choice made here:
   * `actions/core.ts:110-112` resolves BOTH `payment.create` and
   * `payment.refund` through it, and `refundPayment` declares
   * `permissions: ['payment.refund']`. Gating on the same predicate the
   * dispatcher will apply is what stops the UI offering what the engine refuses.
   * Money out is the same rule as money in — which is also why this is a
   * separate boolean from `money`: reading the receipt ledger is not moving it.
   *
   * TODO(decision): `lib/rbac` has no refund-specific rule, so a reversal
   * inherits Coordinator from `canRecordPayment`. Taking an advance at the
   * counter and paying money back out are plausibly not the same authority —
   * `canVoidInvoice` is the narrower Owner/Accounts shape — but narrowing it
   * here would invent a product decision AND desync the UI from the dispatcher.
   * The rule belongs in `lib/rbac` + `actions/core.ts` together, and PLAN.md §4.
   */
  const canReverse = canTakePayment

  const [recordOpen, setRecordOpen] = useState(false)
  const [reversing, setReversing] = useState<PaymentListRow | null>(null)

  const hasLoadedInvoices = useRef(false)
  const shouldLoadInvoices = recordOpen || reversing !== null

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

  /**
   * `invoices.paid_amount` for the invoice the payment being reversed settles —
   * the cap the reversal modal bounds itself with. See the REVERSAL block above
   * for why this is a lookup against the invoice rows rather than anything read
   * off the payment, and for what `undefined` means here (refusal, not "zero
   * received").
   *
   * This is a single-key lookup, not list filtering — `listQuery.ts`'s rule that
   * narrowing happens server-side is about which ROWS a list shows, and nothing
   * here changes the list.
   */
  const reversalPaidPaisa = useMemo(() => {
    if (!reversing || reversing.invoiceNo === null) return undefined
    return invoiceList.rows.find((r) => r.invoiceNo === reversing.invoiceNo)?.paidAmount
  }, [reversing, invoiceList.rows])

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
    if (!hasLoadedInvoices.current) {
      invoiceList.refetch()
    }
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
    <div style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="lock" size={14} style={{ flexShrink: 0, color: 'var(--muted)' }} />
        <h3 style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          Deposits (separate)
        </h3>
      </div>

      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {DEPOSIT_LINES.map((d) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <dt style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{d.label}</dt>
            <dd
              className="figure"
              style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
              title={`Not read — ${d.source} has no query in lib/queries/finance.ts.`}
            >
              —
            </dd>
          </div>
        ))}
      </dl>

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
        Not tracked yet — <span className="identifier">security_deposits</span> and{' '}
        <span className="identifier">deposit_movements</span> have no query in this app. A dash is a missing
        reading, never a zero.
      </p>

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
        A deposit is a liability, not revenue: it never touches Rental Total or Outstanding, and it can never
        appear in the ledger beside this — a table CHECK forbids a payment of type Security Deposit.
      </p>
    </div>
  )

  return (
    <PageShell width="full">
      {/* Page when routed, subtitle + actions when hosted as Finance's Payments
          tab. See `TabHeader.tsx` for why the description and the actions
          survive the demotion and only the `<h1>` goes. */}
      <ScreenHeader
        embedded={embedded}
        icon="card"
        title="Payments"
        description="The receipt ledger. Payments are immutable — a correction is a reversal row, never an edit."
        actions={
          <>
            {/* §9.3's one header action. Hidden, not disabled, for a session that
                cannot see money — Law 6 asks call sites to OMIT the figure and
                the affordance, and a disabled button still says money is here.
                `canTakePayment` narrows it further to the roles allowed to
                record one; see its definition above. */}
            {money && canTakePayment && (
              <Button icon="plus" variant="primary" aria-label="Record Payment" onClick={openRecord}>
                {phone ? '' : 'Record Payment'}
              </Button>
            )}
            <Button icon="refresh" aria-label="Refresh" onClick={refreshAll}>
              {phone ? '' : 'Refresh'}
            </Button>
          </>
        }
      />

      {/* §9.3 filter row — `(All)(Received)(Refunded)(Reversed)  [method ▾][date▾]` */}
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          role="group"
          aria-label="Payment filters"
          className="rsp-chip-scroll"
          style={{
            display: 'flex',
            gap: 'var(--sp-sm)',
            flexWrap: phone ? 'nowrap' : 'wrap',
            overflowX: phone ? 'auto' : undefined,
            paddingBottom: phone ? 2 : 0,
          }}
        >
          {PAYMENT_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => patch({ status: CHIP_PARAM[c], page: null })}
              aria-pressed={chip === c}
              style={chipStyle(chip === c)}
              {...(c === 'Refunded'
                ? {
                    title:
                      'Refunds are payment_type = Refund. The payment_status member "Refunded" is derived from a reversal row and is never written, so filtering on it would match nothing.',
                  }
                : {})}
            >
              {c}
            </button>
          ))}

          {/* Drawn, disabled, and carrying its reason — see the header. */}
          <button
            type="button"
            disabled
            aria-label="Reversed — not tracked yet. Reversals live in payment_reversals, which has no reader in lib/queries/finance.ts."
            title="Not tracked yet — payment_reversals has no reader in lib/queries/finance.ts, and it carries a narrower role list of its own."
            style={chipStyle(false, true)}
          >
            Reversed
            <Icon name="info" size={13} />
          </button>
        </div>

        {/* [method ▾] — the column renders, the narrowing cannot. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Method
          <select
            disabled
            aria-label="Method — not filterable yet. The channel lives on bank_accounts and the payments select does not join it with !inner."
            title="Not filterable yet — payments has no method column; the channel comes from bank_accounts through an embed that PostgREST cannot filter the parent by."
            style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
          >
            <option>Not filterable yet</option>
          </select>
        </label>

        {/* [date ▾] — genuinely server-side, at Kathmandu day boundaries. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
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

        {isFiltered && <Button onClick={clearFilters}>Clear filters</Button>}
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
            loading={list.loading}
            error={list.error}
            onRetry={refreshAll}
            hasRows={rows.length > 0}
            empty={list.isEmpty}
            emptyIsFiltered={list.isFiltered}
            onClearFilters={clearFilters}
            noun="payments"
            skeleton="table"
            skeletonRows={5}
            emptyMessage={
              isFiltered
                ? 'No payment matches this filter. Clear it to see the whole ledger.'
                : 'No payment has been recorded yet. Recording one is how it gets here — a payment is never edited afterwards.'
            }
          >
            {/* PHONE <768 — the table becomes card rows. */}
            {!tabular && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {rows.map((p) => (
                  <article
                    key={p.id}
                    style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
                      <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {p.paymentNo}
                      </span>
                      <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {formatMoney(p.amount)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)' }}>
                      <Link
                        to={`/rentals/${p.bookingNo}`}
                        className="identifier"
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
              <div data-table-scroll style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
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
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="identifier" style={{ ...td, fontWeight: 600 }}>
                          {p.paymentNo}
                        </td>
                        <td style={td}>
                          <Link
                            to={`/rentals/${p.bookingNo}`}
                            className="identifier"
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
                        <td className="figure" style={{ ...td, fontWeight: 700 }}>
                          {formatMoney(p.amount)}
                        </td>
                        {/* Likewise: under (All), a Failed or Cancelled row would
                            otherwise read as money received. */}
                        <td style={td}>
                          <StatusBadge status={p.status} />
                        </td>
                        <td
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
              </div>
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

      <FooterNote
        extra={[
          'Payments are immutable — corrections are reversal rows, never edits',
          'Deposits are a separate liability and never touch Outstanding',
        ]}
      />

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

      {/* `canReverse` alongside `money`, on the same reasoning the Record
          Payment mount above carries it: a role change mid-session must not
          leave an open reversal form belonging to a session that may not post
          one. `currentPaidPaisa` is the cap this mount used to omit entirely —
          see the REVERSAL block. */}
      {money && canReverse && reversing && reversing.invoiceNo !== null && (
        <RefundPaymentModal
          isOpen={reversing.invoiceNo !== null}
          onClose={() => setReversing(null)}
          onSuccess={() => refreshAll()}
          invoiceId={reversing.invoiceNo}
          client={reversing.clientName}
          currentPaidPaisa={reversalPaidPaisa}
        />
      )}
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
  /**
   * `rbac.canRecordPayment` for the signed-in session — the same predicate
   * `actions/core.ts` resolves `refundPayment`'s `payment.refund` through.
   * Required, not defaulted: a `canReverse = true` default would silently
   * restore the ungated behaviour at any call site that forgot it, which is
   * exactly how this control came to have no gate.
   */
  canReverse: boolean
  full?: boolean
}) {
  /*
   * ABSENT, not disabled — `MovementList.tsx:307`. A greyed Reverse still tells
   * a Warehouse-adjacent or Admin session that reversing money is something this
   * screen does. The `disabled` below answers a different question (this payment
   * is an advance with no invoice to reverse against), which is a fact about the
   * ROW and is worth stating; who may act is a fact about the SESSION and is
   * not.
   */
  if (!canReverse) return null

  const linked = row.invoiceNo !== null
  const label = linked
    ? `Reverse payment ${row.paymentNo}. ${REVERSAL_SCOPE_NOTE}`
    : `Reverse payment ${row.paymentNo} — unavailable. ${REVERSAL_NO_INVOICE_NOTE}`

  return (
    <button
      type="button"
      disabled={!linked}
      aria-label={label}
      title={linked ? REVERSAL_SCOPE_NOTE : REVERSAL_NO_INVOICE_NOTE}
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
        color: linked ? 'var(--text2)' : 'var(--muted)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: linked ? 'pointer' : 'not-allowed',
        opacity: linked ? 1 : 0.55,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="return_arrow" size={14} />
      Reverse
    </button>
  )
}
