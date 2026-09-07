import { supabase } from '../supabase'
import { kathmanduCivil, NPT_OFFSET_MIN } from '../bs'
import { rupees, toRupees, type Paisa } from '../money'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'

/**
 * # The finance list queries — invoices, payments, expenses
 *
 * Law 2's Single Query Rule, applied to the three money ledgers. Finance,
 * Reports ▸ Expenses, Client Detail and the booking finance rail all read from
 * here; none of them may hand-roll a `supabase.from('invoices')`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ THE ONE THING TO UNDERSTAND BEFORE USING THIS MODULE ⛔
 *
 *   A MONEY-BLIND SESSION GETS **ZERO ROWS**, NOT MASKED ONES.
 *   THE SCREEN MUST RENDER `restricted`, NEVER `empty`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `clients_v`, `products_v`, `booking_lines_v` and the seventeen other `_v`
 * views mask money COLUMN-WISE: the row still arrives, the rupee field arrives
 * `null`, and `null` means "withheld" (see `queries/clients.ts:41-48`). **These
 * three tables do not work that way.** `invoices`, `payments`, `expenses`,
 * `security_deposits` and `deposit_movements` are gated WHOLE-ROW by
 * `0014_business_8_policies.sql:156-170`:
 *
 *     create policy <table>_money_blind on <table>
 *       for select using (auth_can_view_money());
 *
 * and `auth_can_view_money()` (0014:81) is
 * `auth_user_role() not in ('Warehouse','Technician','Driver','Client')`.
 * There is no `invoices_v`, no `payments_v`, no `expenses_v` — verified across
 * migrations 0001-0055.
 *
 * So a Warehouse session calling `listInvoices()` does not get an error and
 * does not get masked figures. Postgres simply returns `[]`, HTTP 200. Handed
 * straight to `useList`, that becomes `isEmpty: true`, and `PageBody` renders
 * **"No invoices yet"** — which tells a warehouse user that this business has
 * issued no invoices. That is a different and FALSE claim, and it is the one
 * failure this file exists to prevent. `restricted` says "you may not see
 * this"; `empty` says "there is nothing to see". Only one of them is true.
 *
 * The row gate is invisible from inside the query — it has no session and
 * cannot detect it — so the guard belongs at the call site, ABOVE `useList`.
 * `financeRestriction()` at the bottom of this file makes it one spread:
 *
 * ```tsx
 * const money = useCanViewMoney()                   // lib/moneyVisibility.ts
 * const list  = useList(listInvoices, filters)
 * <PageBody
 *   {...financeRestriction(money)}                  // restricted outranks all
 *   loading={list.loading} error={list.error} hasRows={list.rows.length > 0}
 *   empty={list.isEmpty} emptyIsFiltered={list.isFiltered} noun="invoices"
 * >
 * ```
 *
 * `PageBody`'s ladder is restricted → error → loading → empty → children, so
 * once `restricted` is true nothing below it can contradict it.
 *
 * ## Why the row types carry `Paisa`, not `Paisa | null`
 *
 * Directly because of the above. `ClientListItem.outstanding` is `Paisa | null`
 * because `clients_v` genuinely returns a row with the money withheld. Here
 * there is no such shape to represent: either the session sees the row with
 * every `numeric ... not null` money column populated, or it sees no row at
 * all. A nullable money type on these three would invite exactly the wrong
 * reading — that a `null` here might mean "masked" — when it can only ever mean
 * "the column was not selected", which is a bug.
 *
 * ## Who can read what (verified against the live policies, 12 Aug 2026)
 *
 * | Table               | Effective SELECT gate                                    |
 * |---------------------|----------------------------------------------------------|
 * | `invoices`          | `invoices_money_blind` (0014) OR `invoices_select` (0011) |
 * | `payments`          | `payments_money_blind` (0014) OR `payments_select` (0011) |
 * | `expenses`          | `expenses_money_blind` (0014) — that policy alone         |
 * | `payment_reversals` | Owner / Admin / Manager / Accounts (0018:58)              |
 * | `expense_reversals` | `auth_can_view_money()` (0037:48)                         |
 *
 * `invoices` and `payments` each additionally carry `auth_is_finance_or_admin()`
 * from 0011. Two facts about that, and they pull in opposite directions, so
 * both are stated rather than one being summarised away:
 *
 *  - Postgres ORs permissive policies, so an extra policy can only WIDEN a
 *    table's read surface, never narrow it. `invoices` is therefore not
 *    narrower than `expenses` by virtue of having two policies.
 *  - It does not widen it either, **today**: `auth_is_finance_or_admin()`
 *    (0018:20, the live definition, restated to re-add Manager) is
 *    `in ('Owner','Admin','Manager','Coordinator','Accounts')`, and over the
 *    nine-member `system_role` enum that is the exact complement of
 *    `auth_can_view_money()`'s excluded four. The two predicates select the
 *    identical set. All three tables answer to the same five roles.
 *
 * That coincidence is a property of the current enum, not a guarantee. If a
 * tenth role is ever added it lands in one predicate and not the other, and
 * `invoices` and `expenses` diverge. `financeRestriction()` gates on
 * `useCanViewMoney()`, the narrower and Law-6-derived of the two, so a divergence
 * makes this module over-restrictive (a role sees a restricted state it could
 * have read past) rather than under-restrictive. That is the safe direction, and
 * it is chosen deliberately.
 *
 * ## Law 4 — payments are immutable, and this module offers no way to change one
 *
 * 0006:172-175, verbatim: *"Immutable payment ledger entries (Law 4). UPDATE and
 * DELETE are prohibited by database triggers and revocations."* The table's own
 * shape agrees — it is the only user-written table in 0006 with no `updated_at`
 * and no `updated_by`. Corrections are compensating rows in `payment_reversals`
 * (0006:211-227, `reason` ≥ 10 chars, `reversed_by` AND `approved_by` both NOT
 * NULL) and, for expenses, `expense_reversals` (0006:360-375).
 *
 * There is therefore **no `updatePayment`, no `voidPayment`, no
 * `refundPayment` here, and there must never be one.** `listPayments` reads;
 * that is the whole surface. A screen that needs to correct a payment writes a
 * reversal through an action, and reads the result back through this module.
 *
 * ## Deposits are NOT payments (Law 5) — and are not in this file
 *
 * `security_deposits` (0006:237-261) and `deposit_movements` (0006:271-292)
 * were read while writing this module and are deliberately not queried from it.
 * A deposit is an isolated liability, never revenue: `payments` carries
 * `payments_no_security_deposit check (payment_type <> 'Security Deposit')`
 * (0006:198), so a "Deposits" chip on the payments list is not merely empty, it
 * is unreachable by construction. The `payment_type` enum still declares the
 * member (0001:1021) because the entry FORM branches on it — that branch writes
 * `deposit_movements`. See `PAYMENT TYPE` below.
 *
 * ## Money is rupees in the DB, paisa in the app
 *
 * Every amount here is `numeric(14,2)` in **RUPEES** — 0006's header says so
 * ("Money is numeric(14,2)") — and `lib/money.ts` §2.3 works in integer paisa.
 * So rupees → paisa (×100) at this boundary, via `rupees()`, exactly as
 * `queries/bookings.ts:292` and `queries/clients.ts:110` already do. Getting the
 * direction backwards renders every figure on the Finance screen 100× wrong, in
 * a way that still looks like a plausible number.
 */

type InvoiceStatusDb = Database['public']['Enums']['invoice_status']
type PaymentStatusDb = Database['public']['Enums']['payment_status']
type PaymentTypeDb = Database['public']['Enums']['payment_type']
type PaymentChannelGroupDb = Database['public']['Enums']['payment_channel_group']
type ExpenseStatusDb = Database['public']['Enums']['expense_status']

/* ═══════════════════════════════════════════════════════════════════════════
 * Restricted, not empty — the guard every finance screen spreads
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The five roles `auth_can_view_money()` admits, and therefore the five that
 * receive any row at all from `invoices`, `payments` or `expenses`.
 *
 * Derived from the live predicate rather than typed as an independent list:
 * `system_role` has nine members (0013:53-55 renamed three, 0013:65-66 added
 * Technician and Driver, 0017:28 re-added Manager) and 0014:81 excludes four.
 * Kept as data so a test can assert the complement, and so a screen that wants
 * to name them in copy does not invent a sixth.
 */
export const FINANCE_MONEY_ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'] as const

/**
 * Why the surface is closed, in words, for `RestrictedState`.
 *
 * Says the session may not see the records — NOT that there are none. That
 * distinction is the entire point of this module's header.
 */
export const FINANCE_RESTRICTED_REASON =
  'Invoices, payments and expenses are money records, and this role does not have money visibility. ' +
  'This is not a statement about whether any exist.'

/**
 * The role to go and ask, rendered by `RestrictedState` as a "Requires Accounts"
 * chip.
 *
 * Five roles qualify (`FINANCE_MONEY_ROLES`) and the prop takes one string, so
 * this names the role whose JOB this is rather than the most senior one: §2.5
 * asks the restricted state to "name who to ask", and on a rental floor the
 * answer to "who can see the invoice" is the accounts desk, not the owner.
 */
export const FINANCE_REQUIRED_ROLE = 'Accounts'

export interface FinanceRestriction {
  restricted: boolean
  restrictedReason: string
  restrictedRequiredRole: string
}

/**
 * The three `PageBody` props that turn a money-blind session's empty result into
 * an honest restricted state. Spread it; do not re-derive it.
 *
 * ```tsx
 * <PageBody {...financeRestriction(useCanViewMoney())} … >
 * ```
 *
 * Returns all three keys unconditionally rather than an empty object when the
 * session can see money. `PageBody` reads `restrictedReason` and
 * `restrictedRequiredRole` only inside `if (restricted)`, so the extra props are
 * inert — and returning a fixed shape keeps `exactOptionalPropertyTypes` happy
 * at every call site without a conditional spread the caller could get wrong.
 *
 * ⚠ The argument must come from `useCanViewMoney()` (`lib/moneyVisibility.ts`),
 * which mirrors `auth_can_view_money()`. Law 6: a money gate implemented as
 * local component state is a bug, not a gate — this function cannot tell the
 * difference, so the call site has to.
 */
export function financeRestriction(canViewMoney: boolean): FinanceRestriction {
  return {
    restricted: !canViewMoney,
    restrictedReason: FINANCE_RESTRICTED_REASON,
    restrictedRequiredRole: FINANCE_REQUIRED_ROLE,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * INVOICES — 0006:73-133
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * An invoice as the list renders it. Every field maps to a column verified in
 * `supabase/migrations/0006_finance.sql` and cross-checked against the
 * generated `src/types/supabase.ts` `invoices.Row`.
 *
 * Nothing here is derived, computed or defaulted. In particular there is no
 * "amount" field: the invoice carries seven distinct money columns and
 * collapsing them into one loses which is which. `Finance.tsx:260` currently
 * recovers a total by `parseInt(inv.amount.replace(/[^0-9]/g, ''))`, which reads
 * "Rs 1,234.50" as Rs 1,23,450 — that whole class of bug disappears when the
 * figure never becomes a string in the first place.
 */
export interface InvoiceListRow {
  id: string
  /** `invoice_no` — `text not null unique` (0006:76, :112). Prefix `INV-` per 0055:92. */
  invoiceNo: string
  bookingId: string
  /** `bookings.booking_no` via the embed. `'(booking not joined)'` if the join is missing — see `toInvoiceRow`. */
  bookingNo: string
  clientId: string
  /** `clients.name` via the embed. Never a placeholder that could pass for a real client. */
  clientName: string
  /**
   * `status` — the `invoice_status` enum. **'Overdue' is not stored**; see
   * `STORED_INVOICE_STATUSES` and `overdueInvoices()` below before filtering on
   * it.
   */
  status: InvoiceStatusDb
  /** `issue_date` — `date not null default current_date` (0006:81). A calendar date, not an instant. */
  issueDateAd: string
  /** `due_date` — `date not null` (0006:82). */
  dueDateAd: string
  /** `currency` — `text not null default 'NPR'` (0006:83). Carried, not assumed: the column exists and can hold something else. */
  currency: string
  subtotal: Paisa
  discountAmount: Paisa
  /** `discount_percent` — `numeric(5,2)`, a PERCENTAGE. Stays numeric: `lib/money.ts` §2.3 puts only amounts in paisa. */
  discountPercent: number
  taxableAmount: Paisa
  /** `vat_rate` — `numeric(5,4) not null default 0.1300`. A RATE (0.13), not 13. Percentage, so numeric. */
  vatRate: number
  vatAmount: Paisa
  totalAmount: Paisa
  paidAmount: Paisa
  outstandingAmount: Paisa
  /**
   * Law 3 — an invoice is never deleted, it is voided against a credit note.
   *
   * Derived from `voided_at`, NOT from `status === 'Void'`, and the difference
   * is load-bearing. `invoices_void_requires_reason` (0006:124-127) is an
   * all-or-nothing CHECK over `voided_at` + `voided_by` + a ≥10-character
   * `void_reason` + `credit_note_no`; it says nothing at all about `status`.
   * So the timestamp is the fact the database actually guarantees, and the
   * enum member is a label that nothing forces to agree with it.
   */
  isVoid: boolean
  /** `voided_at` — `timestamptz` nullable (0006:99), AD/UTC. */
  voidedAtAd: string | null
  /** `void_reason` — nullable, and ≥10 chars whenever `voidedAtAd` is set. */
  voidReason: string | null
  /** `credit_note_no` — nullable, and NOT NULL whenever `voidedAtAd` is set. */
  creditNoteNo: string | null
  /** `notes` — `text` nullable (0006:104). */
  notes: string | null
  /** `created_at` — `timestamptz not null default now()` (0006:106), AD/UTC. */
  createdAtAd: string
}

/**
 * The `invoice_status` values that are actually PERSISTED — the enum minus
 * 'Overdue'.
 *
 * ⚠ 'Overdue' is a real member of the `invoice_status` type and it is a trap.
 * 0001:1010 declares it and says so outright: *"'Overdue' is derived (due_date
 * vs today on the AD value) and must never be persisted"*. A status chip that
 * sends `status.in.('Overdue')` does not error — it returns zero rows and the
 * screen renders a plausible, wrong "no overdue invoices". Use
 * `overdueInvoices()` below, which asks the question the schema can answer.
 *
 * Honesty note: the *rule* is a comment, not a constraint. Nothing in 0006's
 * CHECK list forbids writing 'Overdue' into the column, so a row could carry it
 * if some future writer disregards the ruling. This constant encodes the ruling,
 * which is the right thing for a filter bar to offer; it is not a claim that the
 * database enforces it.
 */
export const STORED_INVOICE_STATUSES = [
  'Draft',
  'Sent',
  'Partially Paid',
  'Paid',
  'Void',
] as const satisfies readonly InvoiceStatusDb[]

/**
 * The statuses an invoice can be in while money is still owed on it.
 *
 * 'Draft' is excluded because a draft has not been issued to anybody — counting
 * it as receivable would overstate what the business is owed. 'Paid' is settled.
 * 'Void' never appears here anyway, since every set below excludes voided rows
 * by timestamp.
 */
const UNSETTLED_INVOICE_STATUSES = ['Sent', 'Partially Paid'] as const satisfies readonly InvoiceStatusDb[]

/**
 * Columns the invoice list needs, named explicitly. `select('*')` on a joined
 * query is how a column nobody reviewed leaks into the payload.
 *
 * The two embeds are unambiguous: `invoices.booking_id` is the only FK from
 * `invoices` to `bookings` and `invoices.client_id` the only one to `clients`
 * (0006:77-78; 0042:679-696 adds only `branch_id`, `discount_approved_by`,
 * `voided_by`, `created_by` and `updated_by`, all pointing at other tables), so
 * PostgREST has exactly one relationship to resolve for each.
 *
 * Neither embed names a revoked column — `clients`' revoked set is
 * (approved_credit_limit, payment_terms) per 0038:41, and `bookings` has no
 * column-level revoke at all — so neither 403s. Both parent tables are gated
 * `auth_is_staff()` (0020:102, :117), which is strictly wider than the
 * `auth_can_view_money()` gate on `invoices` itself: any session that can see
 * the invoice can see its booking and its client.
 *
 * ⚠ `bookings.deposit_required` is deliberately NOT reachable from here. It is
 * unmasked money on a base table (see the DEPOSIT block in `queries/bookings.ts`)
 * and this embed names `booking_no` only.
 */
const INVOICE_COLUMNS =
  'id, invoice_no, booking_id, client_id, status, issue_date, due_date, currency, ' +
  'subtotal, discount_amount, discount_percent, taxable_amount, vat_rate, vat_amount, ' +
  'total_amount, paid_amount, outstanding_amount, ' +
  'voided_at, void_reason, credit_note_no, notes, created_at, ' +
  'clients ( name ), bookings ( booking_no )'

interface RawInvoiceRow {
  id: string
  invoice_no: string
  booking_id: string
  client_id: string
  status: InvoiceStatusDb
  /** `date` — 'YYYY-MM-DD'. */
  issue_date: string
  /** `date` — 'YYYY-MM-DD'. */
  due_date: string
  currency: string
  /** All eight below are `numeric(14,2) not null` — RUPEES. */
  subtotal: number
  discount_amount: number
  discount_percent: number
  taxable_amount: number
  vat_rate: number
  vat_amount: number
  total_amount: number
  paid_amount: number
  outstanding_amount: number
  voided_at: string | null
  void_reason: string | null
  credit_note_no: string | null
  notes: string | null
  created_at: string
  clients: { name: string } | null
  bookings: { booking_no: string } | null
}

/**
 * `numeric` (rupees) → `Paisa`.
 *
 * Deliberately NOT null-tolerant, unlike `clients.ts`'s `toPaisa`. Every money
 * column on all three tables in this file is `not null` (0006:86-96, :184,
 * :332), and these tables mask by ROW rather than by column, so a `null` cannot
 * mean "withheld" here — it could only mean the column was dropped from the
 * select, which is a bug. Coalescing it to 0 would print a settled invoice where
 * a broken query was, so nothing coalesces: an absent field becomes `NaN`, which
 * is visible, rather than a zero, which is not.
 */
function toPaisa(rupeesValue: number): Paisa {
  return rupees(rupeesValue)
}

function toInvoiceRow(r: RawInvoiceRow): InvoiceListRow {
  return {
    id: r.id,
    invoiceNo: r.invoice_no,
    bookingId: r.booking_id,
    // Both parents are NOT NULL + FK, so a missing join is a query bug rather
    // than a data state. Say so, the way `queries/bookings.ts:303` does, instead
    // of printing a dash that hides it.
    bookingNo: r.bookings?.booking_no ?? '(booking not joined)',
    clientId: r.client_id,
    clientName: r.clients?.name ?? '(client not joined)',
    status: r.status,
    issueDateAd: r.issue_date,
    dueDateAd: r.due_date,
    currency: r.currency,
    subtotal: toPaisa(r.subtotal),
    discountAmount: toPaisa(r.discount_amount),
    discountPercent: r.discount_percent,
    taxableAmount: toPaisa(r.taxable_amount),
    vatRate: r.vat_rate,
    vatAmount: toPaisa(r.vat_amount),
    totalAmount: toPaisa(r.total_amount),
    paidAmount: toPaisa(r.paid_amount),
    outstandingAmount: toPaisa(r.outstanding_amount),
    isVoid: r.voided_at !== null,
    voidedAtAd: r.voided_at,
    voidReason: r.void_reason,
    creditNoteNo: r.credit_note_no,
    notes: r.notes,
    createdAtAd: r.created_at,
  }
}

/**
 * What a free-text invoice search covers. Both columns exist on `invoices`
 * (0006:76, :102).
 *
 * Client name is deliberately NOT searched, for the same reason
 * `queries/bookings.ts:326-334` gives: matching an embedded table needs a second
 * `or` scoped with `{ referencedTable: 'clients' }` plus `clients!inner(name)`
 * so the join filters the parent rather than the embed, and `applyListFilters`
 * builds one unscoped `or`. Typing a client's name into the Finance search box
 * returns nothing today. Stated here so the next reader does not assume it works.
 */
const INVOICE_SEARCH_COLUMNS = ['invoice_no', 'credit_note_no'] as const

export interface ListInvoicesOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
}

/**
 * The invoices list.
 *
 * ⚠ Returns `{ rows: [], total: 0 }` for a money-blind session — that is RLS,
 * not emptiness. Read the header. Gate the screen with `financeRestriction()`.
 */
export async function listInvoices(opts: ListInvoicesOptions = {}): Promise<ListQueryResult<InvoiceListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('invoices')
    .select(INVOICE_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? INVOICE_SEARCH_COLUMNS,
    // Newest first: a finance list is read from the most recent issue backwards.
    sort: filters.sort ?? { column: 'issue_date', ascending: false },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `invoices.id` is
    // `uuid not null default gen_random_uuid() primary key` (0006:74).
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawInvoiceRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listInvoices failed: ${error.message}`)

  return { rows: (data ?? []).map(toInvoiceRow), total: count ?? null }
}

/* ── Invoices · named filter sets ─────────────────────────────────────────
 *
 * The screens differ only in which filters they pass. Naming the sets here
 * rather than in each screen is what stops the Finance tab and the client's
 * invoice rail drifting apart.
 *
 * Every set excludes voided invoices with `presence: { voided_at: false }`
 * rather than by filtering the status column — see `InvoiceListRow.isVoid` for
 * why the timestamp is the fact and the enum member is only a label.
 */

/** Every invoice that has not been voided. The Finance ▸ Invoices tab's default. */
export function liveInvoices(): ListFilters {
  return {
    presence: { voided_at: false },
    sort: { column: 'issue_date', ascending: false },
  }
}

/** Voided invoices, newest void first. Law 3 — they still exist and are still read. */
export function voidedInvoices(): ListFilters {
  return {
    presence: { voided_at: true },
    sort: { column: 'voided_at', ascending: false },
  }
}

/**
 * Invoices with money still owed on them.
 *
 * Expressed as a STATUS set — issued but not settled — and not as
 * `outstanding_amount > 0`.
 *
 * ⚠ That is a real narrowing this module cannot do server-side, and it is worth
 * being precise about: `ListFilters` has `gte`/`lte` only through `dateRange`,
 * whose contract is dates (Law 7). Passing a rupee figure through a field named
 * `fromAd` would type-check and work, and would be a lie in the code that the
 * next reader has to decode. So the numeric comparison is not made here.
 *
 * The consequence: a 'Sent' invoice whose `outstanding_amount` is 0 — which
 * should not exist, since settling it should move it to 'Paid', but which
 * nothing in the schema prevents — appears in this list. If that turns out to
 * happen, the fix is a numeric bound in `ListFilters`, not a `.filter()` on the
 * page: filtering the fetched page rather than the table is the exact bug
 * `listQuery.ts` was written to end.
 */
export function outstandingInvoices(): ListFilters {
  return {
    chips: { status: [...UNSETTLED_INVOICE_STATUSES] },
    presence: { voided_at: false },
    sort: { column: 'due_date', ascending: true },
  }
}

/**
 * The statuses a payment may be recorded against.
 *
 * Deliberately a **different set from `UNSETTLED_INVOICE_STATUSES`**, and the
 * difference is exactly one member: 'Draft'.
 *
 * `outstandingInvoices()` answers *"what is the business owed"*, and a Draft is
 * not a receivable — it has not been issued to anybody, so counting it would
 * overstate the ledger. That reasoning is correct and is left standing.
 *
 * *"What may money be taken against"* is a different question and the 4 September
 * rulings answer it the other way:
 *
 *  · **R-02** — an invoice *"is created as **Draft** and stays Draft for the whole
 *    rental"*, and is *"issued once, at return, when the final figure is known"*.
 *  · **R-14** — while `status = 'Draft'`, a payment updates `paid_amount` and
 *    `outstanding_amount` but **does not change status**, so a Draft carries a
 *    true running balance through the whole rental. Draft is a payable state by
 *    ruling, not by accident.
 *  · **SPEC-P0-1 §5** — the acceptance case is *"Record a 50% advance; the
 *    invoice **stays Draft**; `outstanding_amount` halves."*
 *
 * A payment picker built on the receivables set therefore offered nothing for
 * every rental in progress. 'Paid' is still excluded (settled) and voided rows
 * are still excluded by timestamp, for the reasons `outstandingInvoices` gives.
 *
 * ⚠ Same limitation as that function: this is a STATUS set, not
 * `outstanding_amount > 0`, because `ListFilters` cannot express a numeric bound
 * without lying about a field named `fromAd`. A Draft whose balance is already
 * zero appears here; the modal's own guards refuse a Rs 0 payment.
 */
export function payableInvoices(): ListFilters {
  return {
    chips: { status: ['Draft', ...UNSETTLED_INVOICE_STATUSES] },
    presence: { voided_at: false },
    sort: { column: 'due_date', ascending: true },
  }
}

/**
 * Overdue invoices — issued, unsettled, and past their due date.
 *
 * `todayAd` takes either a `YYYY-MM-DD` Nepal calendar day (what a date picker
 * emits) or a full ISO instant (`new Date().toISOString()`), resolved through
 * `nepalDay` below.
 *
 * **Why this is not a status chip.** 'Overdue' is a member of `invoice_status`
 * that is never written — 0001:1010 rules it derived. `chips: { status:
 * ['Overdue'] }` therefore matches nothing, silently. This asks the question the
 * schema can answer: `due_date` has passed AND the invoice is still unsettled.
 *
 * **Day granularity is exact here.** `due_date` is a `date` (0006:82), not a
 * `timestamptz`, so comparing it against a bare `YYYY-MM-DD` involves no
 * timezone arithmetic at all — none of the `+05:45` boundary reasoning that
 * `paymentsInPeriod` below needs applies. The only Kathmandu question is which
 * calendar day "today" is, which `nepalDay` answers using `bs.ts`'s own
 * `kathmanduCivil` so the day this FILTERS by is the day the screen LABELS.
 *
 * ⚠ TODO(decision): an invoice due TODAY is treated as not yet overdue — the
 * bound is `due_date <= yesterday`, i.e. strictly before today. That is the
 * ordinary business reading (you are not late until the due date has passed),
 * and it is what "due_date vs today" most naturally means, but 0001:1010 does
 * not say whether the comparison is strict. Flagged rather than silently
 * assumed; if the ruling comes back inclusive, this is a one-line change here
 * and nowhere else.
 */
export function overdueInvoices(todayAd: string): ListFilters {
  return {
    dateRange: { column: 'due_date', toAd: previousDay(nepalDay(todayAd)) },
    chips: { status: [...UNSETTLED_INVOICE_STATUSES] },
    presence: { voided_at: false },
    sort: { column: 'due_date', ascending: true },
  }
}

/**
 * Invoices falling DUE inside an AD day window — the forward-looking half of
 * `overdueInvoices`.
 *
 * Same unsettled-status set and same void exclusion as `outstandingInvoices`;
 * the only addition is the `due_date` window. That makes it the answer to
 * "what has to be paid between these two days", which is the question the
 * Calendar's *Upcoming (Next 7 Days)* rail asks and the Today rail's Payment
 * Due row will ask after it.
 *
 * **Day granularity is exact.** `due_date` is a `date` (0006:82), not a
 * `timestamptz`, so both bounds are bare `YYYY-MM-DD` and no `+05:45` arithmetic
 * is involved — the same reasoning `overdueInvoices` above records. Both ends
 * are inclusive, matching `applyListFilters`' `gte`/`lte` contract and matching
 * how an operator reads "the next seven days".
 *
 * ⚠ Like every set in this module it answers with ROWS, and RLS decides which
 * rows a session may see: a money-blind session gets `{ rows: [], total: 0 }`,
 * which is a permission answer and not an emptiness. Gate the call site with
 * `financeRestriction()` / `useCanViewMoney()` and omit the figure rather than
 * rendering the zero — Law 6 is omission, not masking.
 *
 * ⚠ It does NOT compare an amount. `outstandingInvoices` records why the numeric
 * bound is not expressible in `ListFilters` and why faking it through a field
 * named `fromAd` would be a lie in the code; the same limit applies here, so a
 * 'Sent' invoice whose outstanding figure is already 0 is counted.
 */
export function invoicesDueInPeriod(fromDayAd: string, toDayAd: string): ListFilters {
  return {
    dateRange: { column: 'due_date', fromAd: nepalDay(fromDayAd), toAd: nepalDay(toDayAd) },
    chips: { status: [...UNSETTLED_INVOICE_STATUSES] },
    presence: { voided_at: false },
    sort: { column: 'due_date', ascending: true },
  }
}

/**
 * One client's invoices, newest first.
 *
 * A single-value `chips` group is how `ListFilters` expresses equality — it
 * becomes `in('client_id', [id])`, which is what `= id` compiles to anyway. No
 * `eq` is added to the shared contract for it.
 *
 * ⚠ `clientId` is `clients.id` (a uuid), NOT `client_code` ('CL-0042'). The
 * column is `invoices.client_id uuid not null references clients (id)`
 * (0006:78). Passing a code returns zero rows rather than an error.
 */
export function invoicesForClient(clientId: string): ListFilters {
  return {
    chips: { client_id: [clientId] },
    presence: { voided_at: false },
    sort: { column: 'issue_date', ascending: false },
  }
}

/** One booking's invoices. `bookingId` is `bookings.id`, not `booking_no`. */
export function invoicesForBooking(bookingId: string): ListFilters {
  return {
    chips: { booking_id: [bookingId] },
    sort: { column: 'issue_date', ascending: false },
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PAYMENTS — 0006:176-199. Immutable (Law 4); read-only by design.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A payment as the ledger renders it.
 *
 * There is no `updatedAt` because the table has no `updated_at` — see the Law 4
 * block in the header. The row you read is the row that was written.
 */
export interface PaymentListRow {
  id: string
  /** `payment_no` — `text not null unique` (0006:179, :195). */
  paymentNo: string
  /** `booking_id` — `uuid NOT NULL` (0006:180). A payment always belongs to a booking. */
  bookingId: string
  bookingNo: string
  /**
   * `invoice_id` — `uuid` **nullable** (0006:181). `null` means the payment was
   * taken against the booking before any invoice was raised (an advance), which
   * is an ordinary state — never render it as an error or as a missing link.
   */
  invoiceId: string | null
  /** `invoices.invoice_no` via the embed, or `null` when `invoiceId` is null. */
  invoiceNo: string | null
  clientId: string
  clientName: string
  /** `amount` — `numeric(14,2) not null check (amount > 0)` (0006:184, :197). */
  amount: Paisa
  /**
   * `payment_type` — the `payment_type` enum. Only 'Advance Payment' and
   * 'Refund' can occur: `payments_no_security_deposit` (0006:198) forbids the
   * third member. See PAYMENT TYPE below.
   */
  paymentType: PaymentTypeDb
  /**
   * `status` — the `payment_status` enum. In practice only 'Received' is
   * reachable on a live row; see PAYMENT STATUS below before building a chip
   * row out of this.
   */
  status: PaymentStatusDb
  /** `payment_date` — `timestamptz not null default now()` (0006:187), AD/UTC. An INSTANT, not a date. */
  paymentDateAd: string
  /**
   * `bank_accounts.channel_group` via the embed — 'Digital wallets' | 'Bank' |
   * 'Cash' | 'Cards' | 'Other' (0001:1028). This is the real source for the
   * Finance dashboard's payment-method breakdown.
   *
   * `null` when `bank_account_id` is null (the column is nullable, 0006:188) —
   * meaning no destination account was recorded, NOT that it was cash. 'Cash' is
   * itself a `channel_group` value, so inferring it from absence would
   * manufacture a fact.
   */
  channelGroup: PaymentChannelGroupDb | null
  /** `bank_accounts.bank_name` via the embed. `null` on the same terms as `channelGroup`. */
  bankName: string | null
  /** `transaction_ref` — `text` nullable (0006:189). */
  transactionRef: string | null
  /** `notes` — `text` nullable (0006:190). */
  notes: string | null
  /** `received_by` — `uuid not null` (0006:191), a `users.id`. NOT resolved to a name here; see below. */
  receivedById: string
  /** `created_at` — `timestamptz not null default now()` (0006:192), AD/UTC. */
  createdAtAd: string
}

/* ── PAYMENT STATUS · why 'Refunded' never appears ────────────────────────
 *
 * `payment_status` is Received | Refunded | Failed | Cancelled (0001:287). Only
 * the first is reachable on a row this query returns, and the reason is Law 4:
 * 0001:285 states it outright — *"'Refunded' is derived from the existence of a
 * reversal row - a status UPDATE would breach payment immutability."* UPDATE is
 * revoked on the table, so nothing can move a payment out of 'Received'.
 *
 * Consequences for a filter bar:
 *  - A 'Refunded' chip on the payments list matches nothing. Whether a payment
 *    has been reversed is a question about `payment_reversals`, joined on
 *    `original_payment_id` (0006:215) — a different query, with a NARROWER read
 *    gate (Owner/Admin/Manager/Accounts, 0018:58 — Coordinator is excluded even
 *    though Coordinator can read the payment itself).
 *  - 'Failed' and 'Cancelled' can only ever be set at INSERT time, which is a
 *    legitimate way to record a bounced transfer. They are left available in
 *    `receivedPayments()`'s complement rather than declared unreachable.
 *
 * TODO(persistence): a `payments_with_reversal_v` view, or a
 * `listPaymentReversals` here, is what a "Refunded" chip actually needs. Not
 * written: the reversals table has its own role list, so it is its own query
 * with its own restricted state, not a flag bolted onto this one.
 */

/* ── PAYMENT TYPE · 'Security Deposit' cannot occur ───────────────────────
 *
 * Law 5. `payments_no_security_deposit check (payment_type <> 'Security
 * Deposit')` (0006:198) is a table CHECK, so no role and no policy can write
 * one. The enum keeps the member because the payment-entry FORM branches on it
 * (0001:1020) — and that branch writes `deposit_movements`, not this table.
 *
 * So a "Deposits" tab reading `listPayments({ chips: { payment_type:
 * ['Security Deposit'] } })` is not merely empty, it is unreachable, and it
 * would quietly report that a business holding real deposits holds none.
 * Deposits are `security_deposits` + `deposit_movements`; see the header.
 */

/**
 * Columns the payments list needs.
 *
 * Three embeds, each on a single unambiguous FK: `client_id` → `clients`,
 * `invoice_id` → `invoices`, `bank_account_id` → `bank_accounts` (0006:178-188;
 * 0042:703-708 adds only `branch_id` and `received_by`, pointing elsewhere).
 * `bookings` joins on `booking_id`, likewise the only FK to that table.
 *
 * Every embedded table's read gate is at least as wide as `payments`' own:
 * `clients`/`bookings` are `auth_is_staff()` (0020:117, :102), `invoices` and
 * `bank_accounts` are `auth_can_view_money()` (0014:156-170, 0034:202). So no
 * embed can null out for a session that can see the payment.
 *
 * ⚠ `bank_accounts.account_number` is NOT selected. It is not money and carries
 * no `_v` mask, so nothing would stop it — which is exactly why the select names
 * the two label columns and no more.
 *
 * ⚠ `received_by` is returned as a raw `users.id` and NOT joined to a name.
 * `users` is self-scoped: its only SELECT policy is
 * `id = current_setting('app.current_user_id')` (0020:55), with no staff-directory
 * read. A `users ( full_name )` embed would therefore resolve for exactly one
 * row — the viewer's own — and `null` for everyone else's, which renders as
 * "unknown" beside every payment somebody else took. An id is honest; a
 * mostly-null name is not. TODO(persistence): a staff-directory read policy, or
 * a `users_directory_v`, is what "Received by Sita" needs.
 */
const PAYMENT_COLUMNS =
  'id, payment_no, booking_id, invoice_id, client_id, amount, payment_type, status, ' +
  'payment_date, transaction_ref, notes, received_by, created_at, ' +
  'clients ( name ), bookings ( booking_no ), invoices ( invoice_no ), ' +
  'bank_accounts ( channel_group, bank_name )'

interface RawPaymentRow {
  id: string
  payment_no: string
  booking_id: string
  invoice_id: string | null
  client_id: string
  /** `numeric(14,2) not null` — RUPEES. */
  amount: number
  payment_type: PaymentTypeDb
  status: PaymentStatusDb
  payment_date: string
  transaction_ref: string | null
  notes: string | null
  received_by: string
  created_at: string
  clients: { name: string } | null
  bookings: { booking_no: string } | null
  invoices: { invoice_no: string } | null
  bank_accounts: { channel_group: PaymentChannelGroupDb; bank_name: string } | null
}

function toPaymentRow(r: RawPaymentRow): PaymentListRow {
  return {
    id: r.id,
    paymentNo: r.payment_no,
    bookingId: r.booking_id,
    bookingNo: r.bookings?.booking_no ?? '(booking not joined)',
    invoiceId: r.invoice_id,
    // `?? null`, NOT a placeholder string. Here a missing embed is an ordinary
    // data state — an advance taken before any invoice existed — so it must read
    // as "none", which is different from the booking/client case above where a
    // missing join can only be a query bug.
    invoiceNo: r.invoices?.invoice_no ?? null,
    clientId: r.client_id,
    clientName: r.clients?.name ?? '(client not joined)',
    amount: toPaisa(r.amount),
    paymentType: r.payment_type,
    status: r.status,
    paymentDateAd: r.payment_date,
    channelGroup: r.bank_accounts?.channel_group ?? null,
    bankName: r.bank_accounts?.bank_name ?? null,
    transactionRef: r.transaction_ref,
    notes: r.notes,
    receivedById: r.received_by,
    createdAtAd: r.created_at,
  }
}

/** Both exist on `payments` (0006:179, :189). Client name is not searchable — same embed limitation as invoices. */
const PAYMENT_SEARCH_COLUMNS = ['payment_no', 'transaction_ref'] as const

export interface ListPaymentsOptions extends ListFilters {
  withCount?: boolean
}

/**
 * The payments list. **Read-only — Law 4.** There is no companion write in this
 * module and there must not be one; corrections are `payment_reversals` rows.
 *
 * ⚠ Returns `{ rows: [], total: 0 }` for a money-blind session. Read the header.
 */
export async function listPayments(opts: ListPaymentsOptions = {}): Promise<ListQueryResult<PaymentListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('payments')
    .select(PAYMENT_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? PAYMENT_SEARCH_COLUMNS,
    sort: filters.sort ?? { column: 'payment_date', ascending: false },
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawPaymentRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listPayments failed: ${error.message}`)

  return { rows: (data ?? []).map(toPaymentRow), total: count ?? null }
}

/* ── Payments · named filter sets ─────────────────────────────────────── */

/**
 * Money actually taken — `status = 'Received'`.
 *
 * The complement is not "refunded" (see PAYMENT STATUS above) but 'Failed' /
 * 'Cancelled', both of which can only be set at insert. This is the set the
 * "Received" figure on the Finance dashboard is built from.
 */
export function receivedPayments(): ListFilters {
  return {
    chips: { status: ['Received'] satisfies PaymentStatusDb[] },
    sort: { column: 'payment_date', ascending: false },
  }
}

/** One booking's payments, newest first. `bookingId` is `bookings.id`. */
export function paymentsForBooking(bookingId: string): ListFilters {
  return {
    chips: { booking_id: [bookingId] },
    sort: { column: 'payment_date', ascending: false },
  }
}

/**
 * One invoice's payments.
 *
 * Only reaches payments that were explicitly linked to the invoice.
 * `payments.invoice_id` is nullable, so an advance taken against the booking
 * before the invoice was raised is NOT here even though it reduced what the
 * client owes. `invoices.paid_amount` is the invoice's own settled figure and
 * is the number to render as "paid"; this list is the itemisation of the linked
 * receipts, which is a narrower thing. Stated because the two can differ and a
 * screen that sums this list to reconcile an invoice will find it short.
 */
export function paymentsForInvoice(invoiceId: string): ListFilters {
  return {
    chips: { invoice_id: [invoiceId] },
    sort: { column: 'payment_date', ascending: true },
  }
}

/** One client's payments across every booking. `clientId` is `clients.id`, not `client_code`. */
export function paymentsForClient(clientId: string): ListFilters {
  return {
    chips: { client_id: [clientId] },
    sort: { column: 'payment_date', ascending: false },
  }
}

/**
 * Payments taken between two Nepal calendar days, inclusive at both ends.
 *
 * ⚠ This is the only set in this file that needs `+05:45` boundary arithmetic,
 * and it needs it because `payments.payment_date` is a `timestamptz` (0006:187)
 * while `invoices.issue_date`/`due_date` and `expenses.expense_date` are plain
 * `date` columns. Comparing a `timestamptz` against a bare 'YYYY-MM-DD' makes
 * Postgres read it as midnight UTC, which is 05:45 the same morning in
 * Kathmandu — so a month's takings would start 5h45m late on the 1st and stop
 * 5h45m early on the last day, silently. See the DAY BOUNDARIES block below.
 *
 * ## Money taken, not money handed back (FI-03)
 *
 * This is the set behind the Received KPI, the method donut, the collections
 * chart and the Daily Closing's `collected.*` — every one of them a "takings"
 * figure. `payment_type` is pinned to 'Advance Payment' because a 'Refund' row
 * is also `status = 'Received'` with `amount > 0` (`payments_amount_positive`,
 * 0006:197): left in, a refund would be ADDED to the day's takings rather than
 * kept out of them. 'Security Deposit' is not listed because the table CHECK
 * `payments_no_security_deposit` (0006:198) makes it unreachable, so the pin
 * and the CHECK together leave exactly the one type that is money taken.
 *
 * ⚠ This is not "refunds are subtracted" — a refund's sign and its home in the
 * ledger are `payment_reversals` questions (Law 4), and nothing here nets one
 * against a receipt. It is only that a refund is not a receipt.
 */
export function paymentsInPeriod(fromDayAd: string, toDayAd: string): ListFilters {
  return {
    dateRange: { column: 'payment_date', fromAd: startOfDay(fromDayAd), toAd: endOfDay(toDayAd) },
    chips: {
      status: ['Received'] satisfies PaymentStatusDb[],
      payment_type: ['Advance Payment'] satisfies PaymentTypeDb[],
    },
    sort: { column: 'payment_date', ascending: false },
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EXPENSES — 0006:325-353
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * An expense as `Reports ▸ Expenses` renders it.
 *
 * ## Four fields that screen renders today and this row does NOT carry
 *
 * Named here rather than invented, because each one currently has a
 * plausible-looking value in `src/data/expenseReports.ts` and no column behind it:
 *
 *  - **payment method.** `ExpenseReports.tsx:168` filters on `method` and `:319`
 *    counts chips by it. `expenses` has no method column — not `bank_account_id`,
 *    not `payment_channel_group`, nothing. Unlike `payments`, an expense does not
 *    record how it was settled. There is no server-side filter for it and no
 *    honest client-side one either.
 *  - **VAT / reclaimable input credit.** No `vat_amount` and no `vat_rate` on
 *    this table. The seed's reclaimable figure has no home.
 *  - **bill / vendor invoice number.** Only `expense_no`, which is OUR number
 *    (prefix per 0055). The vendor's own bill number is not stored.
 *  - **budget.** No per-row or per-category budget column exists, so
 *    `budgetOf()`'s variance has nothing to compare against.
 *
 * Each is absent from `ExpenseListRow` rather than defaulted, so a screen cannot
 * accidentally render one beside real rows.
 */
export interface ExpenseListRow {
  id: string
  /** `expense_no` — `text not null unique` (0006:328, :345). */
  expenseNo: string
  /** `expense_date` — `date not null default current_date` (0006:333). A calendar date, no instant. */
  expenseDateAd: string
  /** `amount` — `numeric(14,2) not null check (amount > 0)` (0006:332, :346). */
  amount: Paisa
  /** `vendor_name` — `text NOT NULL` (0006:331). Always present; never a placeholder. */
  vendorName: string
  /** `description` — `text NOT NULL` (0006:335). The row's human label. */
  description: string
  categoryId: string
  /** `expense_categories.code` via the embed (0006:305). */
  categoryCode: string
  /** `expense_categories.name` via the embed (0006:306). */
  categoryName: string
  branchId: string
  /** `branches.name` via the embed (0007). */
  branchName: string
  /** `status` — the `expense_status` enum (0001:1067). Law 3: 'Cancelled' and 'Rejected' are the terminal states; no row is deleted. */
  status: ExpenseStatusDb
  /**
   * `booking_id` — `uuid` **nullable** (0006:338). `null` means an operating
   * expense not attributable to a booking, which is the common case — never an
   * error, and never to be rendered as a missing link.
   */
  bookingId: string | null
  /** `bookings.booking_no` via the embed, or `null` when `bookingId` is null. */
  bookingNo: string | null
  /** `receipt_url` — `text` nullable (0006:336). `null` means no receipt was attached. */
  receiptUrl: string | null
  /** `receipt_size` — `bigint` nullable, ≤ 50 MB by CHECK (0006:337, :347). Bytes, not money. */
  receiptSizeBytes: number | null
  /** `created_at` — `timestamptz not null default now()` (0006:339), AD/UTC. */
  createdAtAd: string
}

/**
 * The `expense_status` enum in declaration order (0001:1067).
 *
 * All six are genuinely storable — unlike `invoice_status`, no member of this
 * enum is documented as derived — so a status chip row may offer every one.
 */
export const EXPENSE_STATUSES = [
  'Draft',
  'Pending Approval',
  'Approved',
  'Paid',
  'Rejected',
  'Cancelled',
] as const satisfies readonly ExpenseStatusDb[]

/**
 * Columns the expenses list needs.
 *
 * Three embeds, each a single unambiguous FK: `category_id` →
 * `expense_categories` (0006:329), `booking_id` → `bookings` (0006:338),
 * `branch_id` → `branches` (added by 0042:743). `created_by`/`updated_by` point
 * at `users` and are not embedded — same self-scoped-policy reason as
 * `payments.received_by`.
 *
 * `expense_categories` and `branches` are both gated `auth_is_staff()`
 * (0032:132, 0022:57), strictly wider than `expenses`' own
 * `auth_can_view_money()`, so neither embed can null out for a session holding
 * the expense row. Neither table carries a column-level revoke.
 */
const EXPENSE_COLUMNS =
  'id, expense_no, expense_date, amount, vendor_name, description, ' +
  'category_id, branch_id, status, booking_id, receipt_url, receipt_size, created_at, ' +
  'expense_categories ( code, name ), branches ( name ), bookings ( booking_no )'

interface RawExpenseRow {
  id: string
  expense_no: string
  /** `date` — 'YYYY-MM-DD'. */
  expense_date: string
  /** `numeric(14,2) not null` — RUPEES. */
  amount: number
  vendor_name: string
  description: string
  category_id: string
  branch_id: string
  status: ExpenseStatusDb
  booking_id: string | null
  receipt_url: string | null
  receipt_size: number | null
  created_at: string
  expense_categories: { code: string; name: string } | null
  branches: { name: string } | null
  bookings: { booking_no: string } | null
}

function toExpenseRow(r: RawExpenseRow): ExpenseListRow {
  return {
    id: r.id,
    expenseNo: r.expense_no,
    expenseDateAd: r.expense_date,
    amount: toPaisa(r.amount),
    vendorName: r.vendor_name,
    description: r.description,
    categoryId: r.category_id,
    // `category_id` and `branch_id` are both NOT NULL + FK, so a missing embed
    // is a query bug, not a data state — named as such rather than dashed over.
    categoryCode: r.expense_categories?.code ?? '(category not joined)',
    categoryName: r.expense_categories?.name ?? '(category not joined)',
    branchId: r.branch_id,
    branchName: r.branches?.name ?? '(branch not joined)',
    status: r.status,
    bookingId: r.booking_id,
    // Nullable FK: no booking is an ordinary state, so this reads as "none".
    bookingNo: r.bookings?.booking_no ?? null,
    receiptUrl: r.receipt_url,
    receiptSizeBytes: r.receipt_size,
    createdAtAd: r.created_at,
  }
}

/**
 * All three exist on `expenses` (0006:328, :331, :335).
 *
 * `vendor_name` is searched rather than offered as a chip group: it is free text
 * with no lookup table behind it, so the set of vendors is unbounded and cannot
 * be enumerated for a chip row without a `select distinct` this module does not
 * do. `ExpenseReports.tsx:175` builds its vendor dropdown by sorting the seed
 * array, which is exactly the pattern that stops working against a real table.
 */
const EXPENSE_SEARCH_COLUMNS = ['expense_no', 'vendor_name', 'description'] as const

export interface ListExpensesOptions extends ListFilters {
  withCount?: boolean
}

/**
 * The expenses list.
 *
 * ⚠ `expenses` is gated by `expenses_money_blind` (0014) and by NOTHING ELSE —
 * it is the one table of the three with a single SELECT policy. A money-blind
 * session gets zero rows. `ExpenseReports.tsx:225-238` already renders a
 * full-page restricted state today, which is the behaviour every finance screen
 * needs; keep it, and prefer `financeRestriction()` so all four screens say it
 * the same way.
 */
export async function listExpenses(opts: ListExpensesOptions = {}): Promise<ListQueryResult<ExpenseListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('expenses')
    .select(EXPENSE_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? EXPENSE_SEARCH_COLUMNS,
    sort: filters.sort ?? { column: 'expense_date', ascending: false },
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawExpenseRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listExpenses failed: ${error.message}`)

  return { rows: (data ?? []).map(toExpenseRow), total: count ?? null }
}

/* ── Expenses · named filter sets ─────────────────────────────────────── */

/**
 * The approvals queue — `status = 'Pending Approval'`, oldest first so the
 * longest-waiting expense is at the top.
 *
 * Exactly one enum member, quoted from 0001:1067. No bucket is invented: the
 * spec's own status vocabulary drives editability (0001:1066), so grouping
 * several members under a name this file made up would be a product decision
 * taken in a query module.
 */
export function expensesAwaitingApproval(): ListFilters {
  return {
    chips: { status: ['Pending Approval'] satisfies ExpenseStatusDb[] },
    sort: { column: 'expense_date', ascending: true },
  }
}

/**
 * Expenses in one status, whichever the chip row selected.
 *
 * Passing an EMPTY array is the "All" chip and means no constraint — never
 * "match nothing". That is `applyListFilters`' contract (`listQuery.ts:39-45`)
 * and the single most common way to write a filter that silently returns an
 * empty table.
 */
export function expensesByStatus(statuses: readonly ExpenseStatusDb[]): ListFilters {
  return {
    chips: { status: [...statuses] },
    sort: { column: 'expense_date', ascending: false },
  }
}

/**
 * Expenses in a period, inclusive at both ends.
 *
 * `expense_date` is a `date` (0006:333), so bare `YYYY-MM-DD` bounds are exact
 * and no `+05:45` arithmetic is involved — a date compared against a date has no
 * instant in it to shift. Contrast `paymentsInPeriod`, which does need it.
 * Arguments are normalised through `nepalDay` anyway so that an ISO instant is
 * also accepted and resolves to the Kathmandu calendar day, matching what the
 * screen labels.
 */
export function expensesInPeriod(fromDayAd: string, toDayAd: string): ListFilters {
  return {
    dateRange: { column: 'expense_date', fromAd: nepalDay(fromDayAd), toAd: nepalDay(toDayAd) },
    sort: { column: 'expense_date', ascending: false },
  }
}

/** One category's expenses. `categoryId` is `expense_categories.id`, not its `code`. */
export function expensesForCategory(categoryId: string): ListFilters {
  return {
    chips: { category_id: [categoryId] },
    sort: { column: 'expense_date', ascending: false },
  }
}

/**
 * One branch's expenses. `branchId` is `branches.id` (a uuid), not `branch_code`
 * ('BR-KTM') and not the branch's name.
 *
 * `Reports ▸ Expenses` currently offers a branch dropdown built from the seed
 * array's branch NAMES (`ExpenseReports.tsx:170`). Against the real table that
 * has to become an id — `expenses.branch_id` is a uuid FK (0006:330, FK added
 * 0042:743) and matching on the name would need a join filter
 * `applyListFilters` cannot express. The screen reads names from
 * `branches ( name )`, which `EXPENSE_COLUMNS` already embeds, and filters by
 * the id behind them.
 */
export function expensesForBranch(branchId: string): ListFilters {
  return {
    chips: { branch_id: [branchId] },
    sort: { column: 'expense_date', ascending: false },
  }
}

/** One booking's attributable expenses. `bookingId` is `bookings.id`. */
export function expensesForBooking(bookingId: string): ListFilters {
  return {
    chips: { booking_id: [bookingId] },
    sort: { column: 'expense_date', ascending: false },
  }
}

/**
 * Expenses that have a receipt attached, or that do not.
 *
 * `receipt_url` is nullable, so this is a `presence` flag rather than a chip —
 * "missing receipt" is one of the few genuinely useful compliance filters this
 * table can answer, and it is the shape `presence` exists for.
 */
export function expensesByReceipt(hasReceipt: boolean): ListFilters {
  return {
    presence: { receipt_url: hasReceipt },
    sort: { column: 'expense_date', ascending: false },
  }
}

/* ── Expenses · the two lookups the entry form needs ──────────────────────
 *
 * Both live here rather than in the screen, for the reason at the top of this
 * file: Law 2's Single Query Rule. A component may call these; it may not
 * hand-roll `supabase.from('expense_categories')`.
 *
 * Neither is money-gated. `expense_categories_select` (0032:132) and
 * `branches_select` (0022:57) are both `auth_is_staff()`, which is strictly
 * WIDER than `expenses`' own `auth_can_view_money()` — so a Warehouse session
 * can read both and still get zero expenses. That asymmetry is why the screen's
 * restricted state must come from `financeRestriction()` and never from "the
 * category list came back empty".
 */

/**
 * An `expense_categories` row (0006:302-316), as the filter chip row and the
 * entry form's category picker need it.
 *
 * There is no `parent`/`group` column, so the wireframe's "8 groups" cannot be
 * expressed — this taxonomy is flat, and four rows deep, and the screen says so
 * rather than inventing a grouping.
 */
export interface ExpenseCategoryRow {
  id: string
  /** `code` — `text not null unique` (0006:305), e.g. `EXP-MAINT`. */
  code: string
  /** `name` — `text not null` (0006:306). The label a human reads. */
  name: string
  /** `description` — nullable (0006:307). */
  description: string | null
}

/**
 * The active expense categories, by code.
 *
 * `is_active` is `boolean not null default true` (0006:308). A retired category
 * still owns historic expenses — Law 3, nothing is deleted — so it is filtered
 * out of the PICKER here while rows already carrying it keep rendering their
 * category name through the `expense_categories ( code, name )` embed on
 * `listExpenses`. The two are deliberately different sets.
 */
export async function listExpenseCategories(): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, code, name, description')
    .eq('is_active', true)
    .order('code', { ascending: true })

  if (error) throw new Error(`listExpenseCategories failed: ${error.message}`)
  return (data ?? []) as unknown as ExpenseCategoryRow[]
}

/**
 * A `branches` row, narrowed to what a picker needs.
 *
 * `expenses.branch_id` is `uuid NOT NULL` with an FK to `branches` (0006:330,
 * FK added 0042:743), so an expense cannot be recorded without one and the
 * entry form cannot offer a "no branch" option. Named `listExpenseBranches`
 * rather than `listBranches` because this selects only the two label columns
 * the expense form binds to; a general branches module is a different query
 * with a wider select, and claiming this is it would be the drift Law 2 exists
 * to stop.
 */
export interface ExpenseBranchRow {
  id: string
  name: string
}

export async function listExpenseBranches(): Promise<ExpenseBranchRow[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name')
    .order('name', { ascending: true })

  if (error) throw new Error(`listExpenseBranches failed: ${error.message}`)
  return (data ?? []) as unknown as ExpenseBranchRow[]
}

/* ── Expenses · the write half, unblocked by migration 0054 ───────────────
 *
 * `expenses` carried a SELECT policy and NO write policy until 0054, so RLS
 * refused every INSERT for every role including Owner. 0054 added
 * `expenses_insert_finance` / `expenses_update_finance`, both
 * `auth_is_finance_or_admin()`. That is the whole reason an entry form can
 * exist at all, and it is why this is the first write in this module.
 *
 * ⚠ There is deliberately no `updateExpense` that touches `amount`,
 * `vendor_name`, `category_id` or `expense_date`. Law 4's shape applies here
 * too and 0006's own header says it: corrections are `expense_reversals` rows.
 * `setExpenseStatus` below moves the workflow state and nothing else, which is
 * what 0001:1066 means by "status drives editability".
 */

/**
 * The two statuses an ENTRY can create — the sheet's `[Save Draft]` and
 * `[Submit]`.
 *
 * The other four members of `expense_status` are reached by an approval
 * decision or not at all, so offering them on a create form would let the
 * operator write an approval nobody gave.
 */
export const EXPENSE_ENTRY_STATUSES = ['Draft', 'Pending Approval'] as const satisfies readonly ExpenseStatusDb[]
export type ExpenseEntryStatus = (typeof EXPENSE_ENTRY_STATUSES)[number]

export interface NewExpenseInput {
  /** `expense_categories.id`, from `listExpenseCategories()`. Never the `code`. */
  categoryId: string
  /** `branches.id`, from `listExpenseBranches()`. NOT NULL on the table. */
  branchId: string
  vendorName: string
  description: string
  /** **Paisa.** Converted to `numeric` rupees at this boundary, once — see the header. */
  amount: Paisa
  /** AD calendar day, `YYYY-MM-DD`. Law 7 — BS is rendered from this, never stored. */
  expenseDateAd: string
  status: ExpenseEntryStatus
  /** `users.id` of whoever entered it. Nullable on the table; there is no trigger that fills it. */
  createdBy?: string | null
}

/**
 * Record an expense.
 *
 * **`expense_no` is NOT generated here.** `next_document_number('expense')` is
 * the one allocator — it takes a row lock on `number_sequences`, so two
 * operators submitting at the same instant cannot be handed the same number —
 * and duplicating its sequence logic in the browser is exactly the drift Law 1
 * forbids. `queries/clients.ts:442` states the same rule for `client_code`.
 *
 * ⚠ The number it returns today is `EXP-2026-0001` — prefix, year, four-digit
 * pad. `WIREFRAME_RULINGS_2026-08-12.md` §2 ruled `EXP-1` (no year segment, no
 * padding) and PLAN.md §4.20 records that the rename landed in TypeScript only.
 * `expenses` has NO format CHECK (verified against the live project — the two
 * that exist are on `clients` and `bookings`), so both shapes are accepted and
 * the DATABASE's allocator is used rather than the app's fixture. When §4.20 is
 * settled, `number_sequences` changes and this call site does not.
 *
 * **Law 8 — `client_uuid`.** Generated once at the point the user acts and
 * passed in, so a replayed submit conflicts on `expenses_client_uuid_key`
 * instead of recording the same cost twice. The 23505 is caught and the row the
 * first submit created is returned, exactly as `createClient` does.
 *
 * ⚠ A retried call re-enters `next_document_number` BEFORE the insert, so a
 * replay burns a sequence number even though it writes no row. Gaps in
 * `expense_no` are therefore possible and are not a defect: an allocator that
 * could hand back an unused number would have to hold the transaction open
 * across the round trip. Stated because a gap in a finance sequence is the kind
 * of thing an auditor asks about.
 */
export async function createExpense(input: NewExpenseInput, clientUuid: string): Promise<ExpenseListRow> {
  const { data: expenseNo, error: numberError } = await supabase.rpc('next_document_number', {
    p_sequence_key: 'expense',
  })

  if (numberError) throw new Error(`createExpense failed to allocate a number: ${numberError.message}`)
  if (!expenseNo) throw new Error('createExpense: next_document_number returned nothing, so the expense has no number')

  const payload = {
    client_uuid: clientUuid,
    expense_no: expenseNo,
    category_id: input.categoryId,
    branch_id: input.branchId,
    vendor_name: input.vendorName.trim(),
    // `numeric(14,2)` is RUPEES; `lib/money` works in paisa. One conversion, at
    // the boundary. Getting it backwards writes a cost 100× wrong that still
    // looks like a plausible figure.
    amount: toRupees(input.amount),
    expense_date: input.expenseDateAd,
    status: input.status,
    description: input.description.trim(),
    created_by: input.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload as never)
    .select(EXPENSE_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505' && error.message.includes('client_uuid')) {
      const prior = await expenseByClientUuid(clientUuid)
      if (prior) return prior
    }
    throw new Error(`createExpense failed: ${error.message}`)
  }

  return toExpenseRow(data as unknown as RawExpenseRow)
}

/** The row a replayed submit already created. Read through the same columns, so the two paths cannot drift. */
async function expenseByClientUuid(clientUuid: string): Promise<ExpenseListRow | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('client_uuid', clientUuid)
    .maybeSingle()

  if (error) throw new Error(`expenseByClientUuid failed: ${error.message}`)
  return data ? toExpenseRow(data as unknown as RawExpenseRow) : null
}

/**
 * The approval transitions this module will perform, and the only ones.
 *
 * 0001:1066 gives the six-member vocabulary and says "status drives
 * editability"; it does NOT give a transition graph, and neither does any
 * migration. So rather than inventing one, this table encodes exactly the three
 * moves `09_FINANCE.md` §9.4 draws — the sheet's `[Submit]`, and the approval
 * decision its `(Approved)`/`(Rejected)` chips imply.
 *
 * **'Paid' and 'Cancelled' are deliberately unreachable from this screen.**
 * 'Paid' is a settlement fact and `expenses` records no payment — there is no
 * method column, no bank account, no paid_at — so a button that set it would be
 * asserting money moved. 'Cancelled' is a terminal state whose rule (who may,
 * and whether an approved expense may be cancelled at all) nothing has ruled.
 * Both are still readable and still filterable; they are just not writable
 * here. TODO(decision).
 */
export const EXPENSE_TRANSITIONS: Readonly<Record<ExpenseStatusDb, readonly ExpenseStatusDb[]>> = {
  Draft: ['Pending Approval'],
  'Pending Approval': ['Approved', 'Rejected'],
  Approved: [],
  Paid: [],
  Rejected: [],
  Cancelled: [],
}

/**
 * Move one expense's workflow state. **Status only** — no other column is sent.
 *
 * The `update` names a single field on purpose: a general `updateExpense` would
 * let a screen rewrite `amount` on a recorded cost, which is the history rewrite
 * 0006's header forbids and `expense_reversals` exists to replace.
 *
 * `from` is passed and matched, so the update is a compare-and-set: if someone
 * else approved the row while this menu was open, zero rows match and the caller
 * is told, rather than a stale click silently overwriting a decision.
 */
export async function setExpenseStatus(
  id: string,
  from: ExpenseStatusDb,
  to: ExpenseStatusDb,
): Promise<ExpenseListRow> {
  const allowed = EXPENSE_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new Error(
      `setExpenseStatus refuses ${from} → ${to}. ` +
        (allowed.length === 0
          ? `${from} is terminal on this screen.`
          : `From ${from} the only moves are ${allowed.join(' or ')}.`),
    )
  }

  const { data, error } = await supabase
    .from('expenses')
    .update({ status: to } as never)
    .eq('id', id)
    .eq('status', from)
    .select(EXPENSE_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`setExpenseStatus failed: ${error.message}`)
  if (!data) {
    throw new Error(
      `This expense is no longer ${from}, so it was not changed. Someone else may have acted on it — reload and look again.`,
    )
  }
  return toExpenseRow(data as unknown as RawExpenseRow)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * DAY BOUNDARIES · Law 7, Asia/Kathmandu (+05:45)
 *
 * ⚠ DUPLICATION, KNOWN AND DELIBERATE. The four helpers below are the same
 * arithmetic as the private `NPT_OFFSET` / `nepalDay` / `startOfDay` /
 * `endOfDay` in `queries/bookings.ts:648-740`. They are copied rather than
 * imported because that module does not export them and it is outside this
 * task's assigned file list — editing it to add an export would be a change to
 * a file another session is not expecting.
 *
 * What is NOT duplicated is the offset itself. Both copies derive it from
 * `bs.ts`'s `NPT_OFFSET_MIN`, and both resolve "which day is this" through
 * `bs.ts`'s `kathmanduCivil`. Calendar.md §4.2 calls a second hardcoded copy of
 * Nepal's offset "the highest-priority correctness bug in the product"; that
 * rule is intact — `bs.ts` still owns the number, and these are two call sites
 * of it, not two definitions.
 *
 * TODO(refactor): hoist these into a shared `queries/dayBounds.ts` and have both
 * modules import it. One file, two importers, zero behaviour change — but it
 * touches `queries/bookings.ts`, so it belongs to whoever owns that file next.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** `+05:45`, FORMATTED from `bs.ts`'s number rather than typed again. */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
  2,
  '0',
)}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/** A bare calendar date, `YYYY-MM-DD` — what a date picker emits. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The **Nepal** calendar day an argument names.
 *
 *  - `YYYY-MM-DD` is already a calendar date, and the calendar the operator was
 *    reading is Nepal's, so it is returned untouched.
 *  - A full ISO instant is converted through `kathmanduCivil`, the same function
 *    the render side uses to decide which day an instant belongs to. For 5h45m
 *    of every day `instant.slice(0, 10)` is a DIFFERENT day, which is why that
 *    shortcut is not taken here.
 *
 * Anything else throws rather than producing `Invalid Date` → `NaN-NaN-NaN`,
 * which Postgres answers with a 400 the operator cannot act on. Like the named
 * sets in `queries/bookings.ts`, these are called during a screen's render, so
 * the throw lands in `components/shell/ErrorBoundary`, not in `useList`'s error
 * state — a malformed day is a programming mistake at a fixed call site.
 */
function nepalDay(dayAd: string): string {
  if (DATE_ONLY.test(dayAd)) return dayAd

  const t = Date.parse(dayAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected an AD day (YYYY-MM-DD) or a full ISO instant, got ${JSON.stringify(dayAd)}`)
  }
  return new Date(kathmanduCivil(new Date(t))).toISOString().slice(0, 10)
}

/**
 * The calendar day before a `YYYY-MM-DD`, for `overdueInvoices`' strict bound.
 *
 * Parsed as midnight UTC purely as arithmetic on a calendar date — no instant
 * survives the round trip and no timezone is implied, because the input and the
 * output are both bare dates. UTC has no daylight saving, so subtracting exactly
 * 86 400 000 ms always lands on the previous calendar day.
 */
function previousDay(dayAd: string): string {
  const t = Date.parse(`${dayAd}T00:00:00.000Z`)
  if (Number.isNaN(t)) {
    throw new Error(`previousDay expected YYYY-MM-DD, got ${JSON.stringify(dayAd)}`)
  }
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

function startOfDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T00:00:00.000${NPT_OFFSET}`
}

/**
 * The last instant of the day, to a millisecond — `dateRange` compares `toAd`
 * with `lte`, so the bound must be the last value INSIDE the day rather than the
 * first value after it. `timestamptz` resolves to microseconds, so a payment
 * written at 23:59:59.9995 NPT slips past by half a millisecond; accepted
 * knowingly, exactly as `queries/bookings.ts:726-740` records, because closing it
 * properly means changing the shared "inclusive at both ends" contract.
 */
function endOfDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T23:59:59.999${NPT_OFFSET}`
}
