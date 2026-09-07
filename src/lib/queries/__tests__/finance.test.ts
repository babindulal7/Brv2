import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EXPENSE_STATUSES,
  FINANCE_MONEY_ROLES,
  FINANCE_REQUIRED_ROLE,
  FINANCE_RESTRICTED_REASON,
  STORED_INVOICE_STATUSES,
  expensesAwaitingApproval,
  expensesByReceipt,
  expensesByStatus,
  expensesForBooking,
  expensesForBranch,
  expensesForCategory,
  expensesInPeriod,
  financeRestriction,
  invoicesForBooking,
  invoicesForClient,
  listExpenses,
  listInvoices,
  listPayments,
  liveInvoices,
  outstandingInvoices,
  overdueInvoices,
  paymentsForBooking,
  paymentsForClient,
  paymentsForInvoice,
  paymentsInPeriod,
  receivedPayments,
  voidedInvoices,
  type ExpenseListRow,
  type InvoiceListRow,
  type PaymentListRow,
} from '../finance'
import { applyListFilters, type ListFilters } from '../listQuery'
import { NPT_OFFSET_MIN } from '../../bs'
import { toRupees } from '../../money'

/**
 * # What this suite pins
 *
 * `finance.ts` reads the three whole-row money-gated tables, so the failures it
 * can produce are quiet ones:
 *
 *  1. **A dropped column.** PostgREST does not error on a column missing from
 *     the SELECT string — the field arrives `undefined` and renders blank. The
 *     select string is asserted as text, which is the only place a wrong or
 *     absent column name is still visible.
 *  2. **Rupees vs paisa the wrong way round.** A 100× error that still looks
 *     like a plausible rupee figure. Every money field is asserted through
 *     `toRupees` against the raw input.
 *  3. **A filter that cannot match.** 'Overdue' is a declared `invoice_status`
 *     that is never stored; 'Security Deposit' is a declared `payment_type` a
 *     table CHECK forbids. Either one in a chip returns zero rows and renders a
 *     confident, false empty state. Both are pinned as absent.
 *  4. **Restricted mistaken for empty.** A money-blind session gets `[]` from
 *     RLS, not an error, so the screen must be told `restricted` out of band.
 *     `financeRestriction` is what carries that, and it is pinned.
 *
 * The `supabase` module is replaced wholesale, exactly as `bookings.test.ts`
 * does. Nothing here reaches a database.
 */

const db = vi.hoisted(() => {
  interface State {
    /** The table `from()` was called with. */
    table: string
    /** The literal string handed to `.select()` — the thing a dropped column disappears from. */
    columns: string
    /** `.select()`'s second argument: `{ count: 'exact' }` or `undefined`. */
    selectOptions: unknown
    /** Every filter call, in order, exactly as `applyListFilters` made it. */
    calls: Array<[string, ...unknown[]]>
    rows: unknown[]
    count: number | null
    error: { message: string } | null
  }

  const state: State = {
    table: '',
    columns: '',
    selectOptions: undefined,
    calls: [],
    rows: [],
    count: null,
    error: null,
  }

  function reset(): void {
    state.table = ''
    state.columns = ''
    state.selectOptions = undefined
    state.calls = []
    state.rows = []
    state.count = null
    state.error = null
  }

  /** A recording stand-in for the postgrest builder. Thenable, because the query modules `await query`. */
  const builder = {
    select(columns: string, options?: unknown) {
      state.columns = columns
      state.selectOptions = options
      return builder
    },
    or(filters: string) {
      state.calls.push(['or', filters])
      return builder
    },
    in(column: string, values: readonly unknown[]) {
      state.calls.push(['in', column, [...values]])
      return builder
    },
    gte(column: string, value: unknown) {
      state.calls.push(['gte', column, value])
      return builder
    },
    lte(column: string, value: unknown) {
      state.calls.push(['lte', column, value])
      return builder
    },
    is(column: string, value: unknown) {
      state.calls.push(['is', column, value])
      return builder
    },
    not(column: string, operator: string, value: unknown) {
      state.calls.push(['not', column, operator, value])
      return builder
    },
    order(column: string, options?: unknown) {
      state.calls.push(['order', column, options])
      return builder
    },
    range(from: number, to: number) {
      state.calls.push(['range', from, to])
      return builder
    },
    then(
      onFulfilled: (value: {
        data: unknown[] | null
        error: { message: string } | null
        count: number | null
      }) => unknown,
    ): void {
      onFulfilled({ data: state.rows, error: state.error, count: state.count })
    },
  }

  const supabase = {
    from(table: string) {
      state.table = table
      return builder
    },
  }

  return { state, reset, supabase }
})

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

beforeEach(() => {
  db.reset()
})

/** Split the select string into its top-level tokens. Embeds keep their own commas; none of them is a bare column name. */
function selectTokens(): string[] {
  return db.state.columns.split(',').map((t) => t.trim())
}

function occurrences(column: string): number {
  return selectTokens().filter((t) => t === column).length
}

/** Every `in(column, values)` the filter set produced, as a lookup. */
function chipCalls(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const call of db.state.calls) {
    if (call[0] === 'in') out[String(call[1])] = call[2] as unknown[]
  }
  return out
}

function callsOfKind(kind: string): Array<[string, ...unknown[]]> {
  return db.state.calls.filter((c) => c[0] === kind)
}

/**
 * Runs a named filter set through the very same `applyListFilters` the query
 * modules use, against the recording builder — so a set is asserted on the SQL
 * it actually produces, not on the object literal it returns.
 */
function record(filters: ListFilters): void {
  db.reset()
  applyListFilters(db.supabase.from('probe').select(''), filters)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Restricted, not empty — the whole reason this module has a guard
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('financeRestriction — a money-blind session must not be told "none exist"', () => {
  it('restricts when the session cannot view money', () => {
    expect(financeRestriction(false).restricted).toBe(true)
  })

  it('does not restrict when the session can view money', () => {
    expect(financeRestriction(true).restricted).toBe(false)
  })

  it('always carries a reason and a role to ask, so PageBody never falls back to its generic copy', () => {
    for (const canViewMoney of [true, false]) {
      const guard = financeRestriction(canViewMoney)
      expect(guard.restrictedReason).toBe(FINANCE_RESTRICTED_REASON)
      expect(guard.restrictedRequiredRole).toBe(FINANCE_REQUIRED_ROLE)
    }
  })

  it('returns exactly the three PageBody keys, so it can be spread without extra props', () => {
    expect(Object.keys(financeRestriction(false)).sort()).toEqual([
      'restricted',
      'restrictedReason',
      'restrictedRequiredRole',
    ])
  })

  it('the reason says "may not see", never "there are none"', () => {
    // The single most important sentence in this module. A restricted state that
    // reads like an empty state is the bug the whole file exists to prevent.
    const reason = FINANCE_RESTRICTED_REASON.toLowerCase()
    expect(reason).toContain('money visibility')
    expect(reason).toContain('not a statement about whether any exist')
    expect(reason).not.toContain('no invoices')
    expect(reason).not.toContain('nothing')
  })

  it('names the five roles auth_can_view_money() admits, and none of the money-blind four', () => {
    expect([...FINANCE_MONEY_ROLES]).toEqual(['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'])
    for (const blind of ['Warehouse', 'Technician', 'Driver', 'Client']) {
      expect(FINANCE_MONEY_ROLES).not.toContain(blind)
    }
  })

  it('the role to ask is one of the roles that can actually read finance', () => {
    expect(FINANCE_MONEY_ROLES).toContain(FINANCE_REQUIRED_ROLE)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * INVOICES
 * ═══════════════════════════════════════════════════════════════════════════ */

const INVOICE_COLUMN_NAMES = [
  'id',
  'invoice_no',
  'booking_id',
  'client_id',
  'status',
  'issue_date',
  'due_date',
  'currency',
  'subtotal',
  'discount_amount',
  'discount_percent',
  'taxable_amount',
  'vat_rate',
  'vat_amount',
  'total_amount',
  'paid_amount',
  'outstanding_amount',
  'voided_at',
  'void_reason',
  'credit_note_no',
  'notes',
  'created_at',
] as const

describe('listInvoices — the select string', () => {
  it('reads the invoices table', async () => {
    await listInvoices()
    expect(db.state.table).toBe('invoices')
  })

  it('names every column exactly once', async () => {
    // Once, not "at least once": a duplicated column is a wider request PostgREST
    // does not complain about, and it makes the next duplication invisible.
    await listInvoices()
    for (const column of INVOICE_COLUMN_NAMES) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('embeds the client and the booking, and nothing else', async () => {
    await listInvoices()
    expect(db.state.columns).toContain('clients ( name )')
    expect(db.state.columns).toContain('bookings ( booking_no )')
  })

  it('never names bookings.deposit_required through the embed', async () => {
    // Unmasked money on a base table — see the DEPOSIT block in queries/bookings.ts.
    // The invoice list has no reason to reach it and must not.
    await listInvoices()
    expect(db.state.columns).not.toContain('deposit_required')
  })

  it('never names a revoked client money column', async () => {
    // 0038:41 revokes these from `authenticated` on the base table; naming one in
    // an embed is a 403 that takes the whole request down, not a null field.
    await listInvoices()
    expect(db.state.columns).not.toContain('approved_credit_limit')
    expect(db.state.columns).not.toContain('payment_terms')
  })

  it('asks for a count only when withCount is set', async () => {
    await listInvoices()
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listInvoices({ withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })

  it('defaults to newest issued first, with id as the paging tiebreaker', async () => {
    await listInvoices()
    expect(callsOfKind('order')).toEqual([
      ['order', 'issue_date', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ])
  })

  it('searches invoice_no and credit_note_no by default', async () => {
    await listInvoices({ search: 'INV-9' })
    const or = callsOfKind('or')[0]
    expect(or?.[1]).toBe('invoice_no.ilike.*INV-9*,credit_note_no.ilike.*INV-9*')
  })

  it('surfaces a query failure as a named error rather than an empty list', async () => {
    // An error rendered as emptiness is the same lie the restricted state exists
    // to prevent, one layer down.
    db.state.error = { message: 'JWT expired' }
    await expect(listInvoices()).rejects.toThrow('listInvoices failed: JWT expired')
  })
})

/** A complete raw invoice row, shaped as PostgREST returns it. Every money value is distinct. */
const RAW_INVOICE = {
  id: 'a1111111-1111-4111-8111-111111111111',
  invoice_no: 'INV-118',
  booking_id: 'b2222222-2222-4222-8222-222222222222',
  client_id: 'c3333333-3333-4333-8333-333333333333',
  status: 'Partially Paid' as const,
  issue_date: '2026-08-01',
  due_date: '2026-08-15',
  currency: 'NPR',
  subtotal: 132750,
  discount_amount: 9293,
  discount_percent: 7,
  taxable_amount: 123457,
  vat_rate: 0.13,
  vat_amount: 16049,
  total_amount: 139506,
  paid_amount: 15000,
  outstanding_amount: 124506,
  voided_at: null,
  void_reason: null,
  credit_note_no: null,
  notes: 'Second instalment agreed by phone',
  created_at: '2026-08-01T09:12:00+00:00',
  clients: { name: 'Himalaya Films' },
  bookings: { booking_no: 'B-715' },
}

async function mapInvoice(raw: unknown): Promise<InvoiceListRow> {
  db.state.rows = [raw]
  const { rows } = await listInvoices()
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped invoice')
  return row
}

describe('toInvoiceRow — raw DB row → InvoiceListRow', () => {
  it('carries every identifier and date through unchanged', async () => {
    const row = await mapInvoice(RAW_INVOICE)
    expect(row.id).toBe(RAW_INVOICE.id)
    expect(row.invoiceNo).toBe('INV-118')
    expect(row.bookingId).toBe(RAW_INVOICE.booking_id)
    expect(row.clientId).toBe(RAW_INVOICE.client_id)
    expect(row.status).toBe('Partially Paid')
    expect(row.issueDateAd).toBe('2026-08-01')
    expect(row.dueDateAd).toBe('2026-08-15')
    expect(row.currency).toBe('NPR')
    expect(row.createdAtAd).toBe('2026-08-01T09:12:00+00:00')
    expect(row.notes).toBe('Second instalment agreed by phone')
  })

  it('resolves both embeds', async () => {
    const row = await mapInvoice(RAW_INVOICE)
    expect(row.clientName).toBe('Himalaya Films')
    expect(row.bookingNo).toBe('B-715')
  })

  it('converts every money column rupees → paisa, ×100 and no other direction', async () => {
    const row = await mapInvoice(RAW_INVOICE)
    expect(row.subtotal).toBe(13_275_000)
    expect(row.discountAmount).toBe(929_300)
    expect(row.taxableAmount).toBe(12_345_700)
    expect(row.vatAmount).toBe(1_604_900)
    expect(row.totalAmount).toBe(13_950_600)
    expect(row.paidAmount).toBe(1_500_000)
    expect(row.outstandingAmount).toBe(12_450_600)
  })

  it('round-trips every money column back to the rupee figure the DB held', async () => {
    // The 100×-wrong bug survives an "is it a big number" check but not this one.
    const row = await mapInvoice(RAW_INVOICE)
    expect(toRupees(row.subtotal)).toBe(RAW_INVOICE.subtotal)
    expect(toRupees(row.totalAmount)).toBe(RAW_INVOICE.total_amount)
    expect(toRupees(row.outstandingAmount)).toBe(RAW_INVOICE.outstanding_amount)
  })

  it('keeps percentages and rates NUMERIC, never paisa', async () => {
    // lib/money.ts §2.3: only amounts are paisa. A vat_rate of 0.13 turned into
    // 13 paisa would silently zero every VAT figure computed from it.
    const row = await mapInvoice(RAW_INVOICE)
    expect(row.discountPercent).toBe(7)
    expect(row.vatRate).toBe(0.13)
  })

  it('handles a paisa-bearing amount without losing the sub-rupee part', async () => {
    const row = await mapInvoice({ ...RAW_INVOICE, total_amount: 1234.5 })
    expect(row.totalAmount).toBe(123_450)
    expect(toRupees(row.totalAmount)).toBe(1234.5)
  })

  it('reads isVoid from voided_at, not from status', async () => {
    // invoices_void_requires_reason (0006:124-127) constrains the timestamp set,
    // and says nothing about `status`. The timestamp is the fact.
    const live = await mapInvoice(RAW_INVOICE)
    expect(live.isVoid).toBe(false)
    expect(live.voidedAtAd).toBeNull()

    const voided = await mapInvoice({
      ...RAW_INVOICE,
      // status deliberately left at 'Partially Paid' — a row where the two
      // disagree is exactly what this mapping must not be fooled by.
      voided_at: '2026-08-09T04:00:00+00:00',
      void_reason: 'Raised against the wrong booking entirely',
      credit_note_no: 'CN-004',
    })
    expect(voided.isVoid).toBe(true)
    expect(voided.status).toBe('Partially Paid')
    expect(voided.voidReason).toBe('Raised against the wrong booking entirely')
    expect(voided.creditNoteNo).toBe('CN-004')
  })

  it('names a missing join rather than dashing over it', async () => {
    // Both parents are NOT NULL + FK, so an absent embed can only be a query bug.
    const row = await mapInvoice({ ...RAW_INVOICE, clients: null, bookings: null })
    expect(row.clientName).toBe('(client not joined)')
    expect(row.bookingNo).toBe('(booking not joined)')
  })

  it('passes nullable text through as null, never as an empty string', async () => {
    const row = await mapInvoice({ ...RAW_INVOICE, notes: null })
    expect(row.notes).toBeNull()
  })

  it('returns an empty list, and no thrown error, when the query matched nothing', async () => {
    // This is also the shape a money-blind session gets. The query cannot tell
    // the two apart — which is precisely why financeRestriction exists.
    db.state.rows = []
    await expect(listInvoices()).resolves.toEqual({ rows: [], total: null })
  })
})

describe("invoice statuses — 'Overdue' is declared but never stored", () => {
  it('STORED_INVOICE_STATUSES omits Overdue and keeps the other five', () => {
    expect([...STORED_INVOICE_STATUSES]).toEqual(['Draft', 'Sent', 'Partially Paid', 'Paid', 'Void'])
    expect(STORED_INVOICE_STATUSES).not.toContain('Overdue')
  })

  it('no named invoice filter set ever sends Overdue as a status chip', () => {
    // `status.in.('Overdue')` does not error — it returns nothing, and the screen
    // renders a confident "no overdue invoices".
    for (const filters of [
      liveInvoices(),
      voidedInvoices(),
      outstandingInvoices(),
      overdueInvoices('2026-08-12'),
      invoicesForClient('c1'),
      invoicesForBooking('b1'),
    ]) {
      record(filters)
      expect(chipCalls()['status'] ?? []).not.toContain('Overdue')
    }
  })
})

describe('invoice filter sets', () => {
  it('liveInvoices excludes voided rows by timestamp, not by status', () => {
    record(liveInvoices())
    expect(db.state.calls).toContainEqual(['is', 'voided_at', null])
    expect(chipCalls()['status']).toBeUndefined()
  })

  it('voidedInvoices selects exactly the complement', () => {
    record(voidedInvoices())
    expect(db.state.calls).toContainEqual(['not', 'voided_at', 'is', null])
  })

  it('outstandingInvoices asks for issued-but-unsettled, excluding Draft and Paid', () => {
    record(outstandingInvoices())
    expect(chipCalls()['status']).toEqual(['Sent', 'Partially Paid'])
    // Draft is not receivable — counting it would overstate what is owed.
    expect(chipCalls()['status']).not.toContain('Draft')
    expect(chipCalls()['status']).not.toContain('Paid')
    expect(db.state.calls).toContainEqual(['is', 'voided_at', null])
  })

  it('overdueInvoices bounds due_date strictly before the given day', () => {
    record(overdueInvoices('2026-08-12'))
    expect(db.state.calls).toContainEqual(['lte', 'due_date', '2026-08-11'])
    expect(chipCalls()['status']).toEqual(['Sent', 'Partially Paid'])
    expect(db.state.calls).toContainEqual(['is', 'voided_at', null])
  })

  it('overdueInvoices steps back across a month boundary', () => {
    record(overdueInvoices('2026-09-01'))
    expect(db.state.calls).toContainEqual(['lte', 'due_date', '2026-08-31'])
  })

  it('overdueInvoices steps back across a year boundary', () => {
    record(overdueInvoices('2027-01-01'))
    expect(db.state.calls).toContainEqual(['lte', 'due_date', '2026-12-31'])
  })

  it('overdueInvoices steps back across a leap day', () => {
    record(overdueInvoices('2028-03-01'))
    expect(db.state.calls).toContainEqual(['lte', 'due_date', '2028-02-29'])
  })

  it('overdueInvoices resolves an ISO instant to the KATHMANDU day before comparing', () => {
    // 19:00 UTC on 12 Aug is already 00:45 on 13 Aug in Kathmandu. Slicing the
    // instant would give 12 Aug, and every invoice that fell due on the 12th
    // would be dropped from the overdue list for 5h45m of every day.
    record(overdueInvoices('2026-08-12T19:00:00Z'))
    expect(db.state.calls).toContainEqual(['lte', 'due_date', '2026-08-12'])
  })

  it('overdueInvoices refuses a day it cannot parse rather than sending NaN to Postgres', () => {
    // A malformed day would otherwise reach Postgres as 'NaN-NaN-NaN' and come
    // back a 400 the operator cannot act on, five layers from its cause.
    expect(() => overdueInvoices('not-a-date')).toThrow(/YYYY-MM-DD|ISO instant/)
  })

  it('⚠ accepts anything JavaScript Date.parse accepts — inherited, and stated rather than claimed otherwise', () => {
    // `Date.parse('12 August')` is a VALID timestamp in V8 (this year's 12 Aug),
    // so the guard is "parseable", not "well-formed". Identical to
    // `queries/bookings.ts`'s nepalDay, from which this is copied. Pinned so the
    // limit is visible instead of being discovered by a caller who assumed the
    // stricter contract the throw's message implies.
    expect(() => overdueInvoices('12 August')).not.toThrow()
  })

  it('invoicesForClient and invoicesForBooking narrow by uuid through a single-value chip', () => {
    record(invoicesForClient('c3333333-3333-4333-8333-333333333333'))
    expect(chipCalls()['client_id']).toEqual(['c3333333-3333-4333-8333-333333333333'])

    record(invoicesForBooking('b2222222-2222-4222-8222-222222222222'))
    expect(chipCalls()['booking_id']).toEqual(['b2222222-2222-4222-8222-222222222222'])
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * PAYMENTS
 * ═══════════════════════════════════════════════════════════════════════════ */

const PAYMENT_COLUMN_NAMES = [
  'id',
  'payment_no',
  'booking_id',
  'invoice_id',
  'client_id',
  'amount',
  'payment_type',
  'status',
  'payment_date',
  'transaction_ref',
  'notes',
  'received_by',
  'created_at',
] as const

describe('listPayments — the select string', () => {
  it('reads the payments table', async () => {
    await listPayments()
    expect(db.state.table).toBe('payments')
  })

  it('names every column exactly once', async () => {
    await listPayments()
    for (const column of PAYMENT_COLUMN_NAMES) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('embeds the client, booking, invoice and bank account', async () => {
    await listPayments()
    expect(db.state.columns).toContain('clients ( name )')
    expect(db.state.columns).toContain('bookings ( booking_no )')
    expect(db.state.columns).toContain('invoices ( invoice_no )')
    expect(db.state.columns).toContain('bank_accounts ( channel_group, bank_name )')
  })

  it('never names bank_accounts.account_number', async () => {
    // Not money, so no `_v` view masks it, so nothing but this select stops it.
    await listPayments()
    expect(db.state.columns).not.toContain('account_number')
  })

  it('does not embed users for received_by', async () => {
    // `users` is self-scoped (0020:55): the embed resolves for the viewer's own
    // row and null for everybody else's, which renders "unknown" beside every
    // payment somebody else took. The raw id is honest; a mostly-null name is not.
    await listPayments()
    expect(db.state.columns).not.toContain('users (')
    expect(db.state.columns).not.toContain('full_name')
  })

  it('defaults to most recent payment first, with id as the paging tiebreaker', async () => {
    await listPayments()
    expect(callsOfKind('order')).toEqual([
      ['order', 'payment_date', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ])
  })

  it('searches payment_no and transaction_ref by default', async () => {
    await listPayments({ search: 'ESW77' })
    const or = callsOfKind('or')[0]
    expect(or?.[1]).toBe('payment_no.ilike.*ESW77*,transaction_ref.ilike.*ESW77*')
  })

  it('asks for a count only when withCount is set', async () => {
    await listPayments()
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listPayments({ withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })

  it('surfaces a query failure as a named error', async () => {
    db.state.error = { message: 'permission denied for table payments' }
    await expect(listPayments()).rejects.toThrow('listPayments failed: permission denied for table payments')
  })
})

const RAW_PAYMENT = {
  id: 'd4444444-4444-4444-8444-444444444444',
  payment_no: 'PAY-2083-0031',
  booking_id: 'b2222222-2222-4222-8222-222222222222',
  invoice_id: 'a1111111-1111-4111-8111-111111111111',
  client_id: 'c3333333-3333-4333-8333-333333333333',
  amount: 15000,
  payment_type: 'Advance Payment' as const,
  status: 'Received' as const,
  payment_date: '2026-08-03T05:20:00+00:00',
  transaction_ref: 'ESW-77120',
  notes: 'Paid at the counter',
  received_by: 'e5555555-5555-4555-8555-555555555555',
  created_at: '2026-08-03T05:21:00+00:00',
  clients: { name: 'Himalaya Films' },
  bookings: { booking_no: 'B-715' },
  invoices: { invoice_no: 'INV-118' },
  bank_accounts: { channel_group: 'Digital wallets' as const, bank_name: 'eSewa' },
}

async function mapPayment(raw: unknown): Promise<PaymentListRow> {
  db.state.rows = [raw]
  const { rows } = await listPayments()
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped payment')
  return row
}

describe('toPaymentRow — raw DB row → PaymentListRow', () => {
  it('carries the ledger identifiers through unchanged', async () => {
    const row = await mapPayment(RAW_PAYMENT)
    expect(row.id).toBe(RAW_PAYMENT.id)
    expect(row.paymentNo).toBe('PAY-2083-0031')
    expect(row.bookingId).toBe(RAW_PAYMENT.booking_id)
    expect(row.invoiceId).toBe(RAW_PAYMENT.invoice_id)
    expect(row.clientId).toBe(RAW_PAYMENT.client_id)
    expect(row.paymentType).toBe('Advance Payment')
    expect(row.status).toBe('Received')
    expect(row.paymentDateAd).toBe('2026-08-03T05:20:00+00:00')
    expect(row.transactionRef).toBe('ESW-77120')
    expect(row.notes).toBe('Paid at the counter')
    expect(row.createdAtAd).toBe('2026-08-03T05:21:00+00:00')
  })

  it('converts the amount rupees → paisa', async () => {
    const row = await mapPayment(RAW_PAYMENT)
    expect(row.amount).toBe(1_500_000)
    expect(toRupees(row.amount)).toBe(15000)
  })

  it('exposes received_by as a raw id, not a name', async () => {
    const row = await mapPayment(RAW_PAYMENT)
    expect(row.receivedById).toBe('e5555555-5555-4555-8555-555555555555')
  })

  it('reads the payment channel from bank_accounts', async () => {
    const row = await mapPayment(RAW_PAYMENT)
    expect(row.channelGroup).toBe('Digital wallets')
    expect(row.bankName).toBe('eSewa')
  })

  it('leaves the channel null when no destination account was recorded — it does NOT infer Cash', async () => {
    // 'Cash' is itself a channel_group value, so deriving it from an absent
    // account would manufacture a fact about how the money arrived.
    const row = await mapPayment({ ...RAW_PAYMENT, bank_accounts: null })
    expect(row.channelGroup).toBeNull()
    expect(row.bankName).toBeNull()
  })

  it('treats an unlinked invoice as an ordinary state, not a broken join', async () => {
    // payments.invoice_id is nullable: an advance taken before the invoice was
    // raised. It must read as "none", never as "(invoice not joined)".
    const row = await mapPayment({ ...RAW_PAYMENT, invoice_id: null, invoices: null })
    expect(row.invoiceId).toBeNull()
    expect(row.invoiceNo).toBeNull()
  })

  it('still names a missing client or booking join, which can only be a bug', async () => {
    const row = await mapPayment({ ...RAW_PAYMENT, clients: null, bookings: null })
    expect(row.clientName).toBe('(client not joined)')
    expect(row.bookingNo).toBe('(booking not joined)')
  })
})

describe('Law 4 — payments are immutable, and this module offers no way in', () => {
  it('exports no payment write of any kind', async () => {
    const finance = await import('../finance')
    for (const forbidden of [
      'updatePayment',
      'deletePayment',
      'voidPayment',
      'refundPayment',
      'reversePayment',
      'cancelPayment',
      'createPayment',
      'recordPayment',
      'savePayment',
      'updateInvoice',
      'deleteInvoice',
      /*
       * ⚠ These four stay forbidden even though `expenses` became WRITABLE on
       * 12 Aug 2026 (migration 0054 added `expenses_insert_finance` and
       * `expenses_update_finance`; the table had a SELECT policy and no write
       * policy before it, so RLS refused every INSERT for every role including
       * Owner).
       *
       * Insertable is not the same as editable. 0006's header puts expense
       * corrections in `expense_reversals`, so a general `updateExpense` — one
       * that could rewrite `amount`, `vendor_name`, `category_id` or
       * `expense_date` on a recorded cost — is still a history rewrite and is
       * still barred. What the module gained instead is `setExpenseStatus`,
       * which sends `status` and nothing else and is asserted to do so in
       * `modules/finance/__tests__/ExpenseWrites.test.ts`. The distinction is
       * the whole point: if the day comes that somebody needs to change an
       * amount, the answer is a reversal row, not a name on this list.
       */
      'updateExpense',
      'deleteExpense',
      'editExpense',
      'saveExpense',
    ]) {
      expect(Object.keys(finance)).not.toContain(forbidden)
    }
  })

  it('has exactly this runtime export surface, so a write cannot arrive unnoticed', async () => {
    // An allow-list rather than a verb heuristic: `voidedInvoices` is a READ that
    // any "no void*" regex would flag, and a heuristic that has to be loosened to
    // accommodate it is a heuristic that will let the next real write through.
    //
    // ⚠ THREE OF THESE ARE WRITES, and they are here because this list was
    // updated deliberately rather than because the guard was relaxed —
    // `createExpense` and `setExpenseStatus` (12 Aug 2026, migration 0054), plus
    // the two lookups the entry form binds to. Adding a name here is the review
    // step; if you are editing this list to make a failure go away, stop and
    // establish that the new export is a read, or that it is a write the laws in
    // `PLAN.md §0` permit. Nothing that touches `payments` may ever be added.
    const finance = await import('../finance')
    expect(Object.keys(finance).sort()).toEqual([
      'EXPENSE_ENTRY_STATUSES',
      'EXPENSE_STATUSES',
      'EXPENSE_TRANSITIONS',
      'FINANCE_MONEY_ROLES',
      'FINANCE_REQUIRED_ROLE',
      'FINANCE_RESTRICTED_REASON',
      'STORED_INVOICE_STATUSES',
      'createExpense',
      'expensesAwaitingApproval',
      'expensesByReceipt',
      'expensesByStatus',
      'expensesForBooking',
      'expensesForBranch',
      'expensesForCategory',
      'expensesInPeriod',
      'financeRestriction',
      /*
       * Added 4 Sep 2026 for the Calendar Workspace's *Upcoming* rail, and
       * added deliberately rather than to silence this guard: it is a named
       * `ListFilters` set — the same shape as `outstandingInvoices` and
       * `overdueInvoices` either side of it — that returns an object and
       * touches nothing. It reaches `invoices` only through `listInvoices`,
       * which is already on this list, and it goes nowhere near `payments`.
       */
      'invoicesDueInPeriod',
      'invoicesForBooking',
      'invoicesForClient',
      'listExpenseBranches',
      'listExpenseCategories',
      'listExpenses',
      'listInvoices',
      'listPayments',
      'liveInvoices',
      'outstandingInvoices',
      'overdueInvoices',
      // MONEY-05 — the set a PAYMENT may be recorded against, which is
      // `outstandingInvoices` plus 'Draft'. R-02 keeps an invoice in Draft for
      // the whole rental and R-14 leaves it there when a payment lands, so a
      // Draft is payable by ruling; it is still not a receivable, which is why
      // the two sets stayed separate rather than one being widened.
      'payableInvoices',
      'paymentsForBooking',
      'paymentsForClient',
      'paymentsForInvoice',
      'paymentsInPeriod',
      'receivedPayments',
      'setExpenseStatus',
      'voidedInvoices',
    ])
  })

  it('every exported list function is a read that names a select', async () => {
    for (const list of [listInvoices, listPayments, listExpenses]) {
      db.reset()
      await list()
      expect(db.state.columns.length).toBeGreaterThan(0)
    }
  })
})

describe("Law 5 — 'Security Deposit' is not a payment type any set may ask for", () => {
  it('no named payment filter set sends it', () => {
    // payments_no_security_deposit (0006:198) is a table CHECK, so such a chip is
    // not merely empty — it is unreachable, and it would report a business
    // holding real deposits as holding none.
    for (const filters of [
      receivedPayments(),
      paymentsForBooking('b1'),
      paymentsForInvoice('i1'),
      paymentsForClient('c1'),
      paymentsInPeriod('2026-08-01', '2026-08-31'),
    ]) {
      record(filters)
      expect(chipCalls()['payment_type'] ?? []).not.toContain('Security Deposit')
    }
  })

  it('no payment set filters on the derived Refunded status either', () => {
    // 0001:285 — 'Refunded' is derived from a payment_reversals row; a status
    // UPDATE would breach Law 4, so nothing ever writes it.
    for (const filters of [receivedPayments(), paymentsInPeriod('2026-08-01', '2026-08-31')]) {
      record(filters)
      expect(chipCalls()['status'] ?? []).not.toContain('Refunded')
    }
  })
})

describe('payment filter sets', () => {
  it('receivedPayments selects exactly the one reachable live status', () => {
    record(receivedPayments())
    expect(chipCalls()['status']).toEqual(['Received'])
  })

  it('paymentsForBooking / ForInvoice / ForClient narrow by uuid', () => {
    record(paymentsForBooking('b-1'))
    expect(chipCalls()['booking_id']).toEqual(['b-1'])

    record(paymentsForInvoice('i-1'))
    expect(chipCalls()['invoice_id']).toEqual(['i-1'])

    record(paymentsForClient('c-1'))
    expect(chipCalls()['client_id']).toEqual(['c-1'])
  })

  it('paymentsForInvoice reads oldest-first, so an instalment history reads forwards', () => {
    record(paymentsForInvoice('i-1'))
    expect(db.state.calls).toContainEqual(['order', 'payment_date', { ascending: true }])
  })

  /**
   * FI-03. A 'Refund' row is `status = 'Received'` with `amount > 0`
   * (payments_amount_positive, 0006:197), so a status-only set would ADD a
   * refund to the Received KPI, the method donut, the collections chart and
   * the closing's takings. The takings set names the one type that is money
   * taken; 'Security Deposit' needs no exclusion because the table CHECK
   * (0006:198) already makes it unreachable.
   */
  it('paymentsInPeriod is money taken: Received AND Advance Payment, never a Refund', () => {
    record(paymentsInPeriod('2026-08-01', '2026-08-31'))
    expect(chipCalls()['status']).toEqual(['Received'])
    expect(chipCalls()['payment_type']).toEqual(['Advance Payment'])
    expect(chipCalls()['payment_type']).not.toContain('Refund')
  })
})

describe('paymentsInPeriod — payment_date is a timestamptz, so the day boundary is Kathmandu', () => {
  /** `+05:45`, derived from bs.ts rather than typed again — the test must not hold a second copy either. */
  const OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
    2,
    '0',
  )}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

  it('bounds the range at Kathmandu midnight, not UTC midnight', () => {
    // A UTC-bounded month starts at 05:45 on the 1st and stops at 05:45 on the
    // last day. Every payment taken in those windows would vanish from the total.
    record(paymentsInPeriod('2026-08-01', '2026-08-31'))
    expect(db.state.calls).toContainEqual(['gte', 'payment_date', `2026-08-01T00:00:00.000${OFFSET}`])
    expect(db.state.calls).toContainEqual(['lte', 'payment_date', `2026-08-31T23:59:59.999${OFFSET}`])
  })

  it('uses the offset bs.ts owns, and no second copy of it', () => {
    expect(OFFSET).toBe('+05:45')
    record(paymentsInPeriod('2026-08-01', '2026-08-31'))
    const gte = db.state.calls.find((c) => c[0] === 'gte')
    expect(String(gte?.[2])).toContain('+05:45')
    expect(String(gte?.[2])).not.toMatch(/Z$/)
  })

  it('resolves an ISO instant to the Kathmandu calendar day it belongs to', () => {
    // 19:00 UTC on 12 Aug is 00:45 on 13 Aug in Kathmandu.
    record(paymentsInPeriod('2026-08-12T19:00:00Z', '2026-08-12T19:00:00Z'))
    expect(db.state.calls).toContainEqual(['gte', 'payment_date', `2026-08-13T00:00:00.000${OFFSET}`])
    expect(db.state.calls).toContainEqual(['lte', 'payment_date', `2026-08-13T23:59:59.999${OFFSET}`])
  })

  it('is inclusive at both ends, so a one-day period is a whole day', () => {
    record(paymentsInPeriod('2026-08-12', '2026-08-12'))
    const gte = db.state.calls.find((c) => c[0] === 'gte')
    const lte = db.state.calls.find((c) => c[0] === 'lte')
    expect(gte?.[2]).toBe(`2026-08-12T00:00:00.000${OFFSET}`)
    expect(lte?.[2]).toBe(`2026-08-12T23:59:59.999${OFFSET}`)
  })

  it('refuses a day it cannot parse', () => {
    expect(() => paymentsInPeriod('last Tuesday', '2026-08-31')).toThrow(/YYYY-MM-DD|ISO instant/)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * EXPENSES
 * ═══════════════════════════════════════════════════════════════════════════ */

const EXPENSE_COLUMN_NAMES = [
  'id',
  'expense_no',
  'expense_date',
  'amount',
  'vendor_name',
  'description',
  'category_id',
  'branch_id',
  'status',
  'booking_id',
  'receipt_url',
  'receipt_size',
  'created_at',
] as const

describe('listExpenses — the select string', () => {
  it('reads the expenses table', async () => {
    await listExpenses()
    expect(db.state.table).toBe('expenses')
  })

  it('names every column exactly once', async () => {
    await listExpenses()
    for (const column of EXPENSE_COLUMN_NAMES) {
      expect(occurrences(column)).toBe(1)
    }
  })

  it('embeds the category, branch and booking', async () => {
    await listExpenses()
    expect(db.state.columns).toContain('expense_categories ( code, name )')
    expect(db.state.columns).toContain('branches ( name )')
    expect(db.state.columns).toContain('bookings ( booking_no )')
  })

  it('names no column the expenses table does not have', async () => {
    // The four fields Reports ▸ Expenses renders today with nothing behind them.
    // Naming any of them is a 400 that takes the whole request down, not a blank
    // cell — which is why they are absent from the row type too.
    await listExpenses()
    for (const invented of ['payment_method', 'method', 'vat_amount', 'vat_rate', 'bill_no', 'budget']) {
      expect(db.state.columns).not.toContain(invented)
    }
  })

  it('defaults to most recent expense first, with id as the paging tiebreaker', async () => {
    await listExpenses()
    expect(callsOfKind('order')).toEqual([
      ['order', 'expense_date', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ])
  })

  it('searches expense_no, vendor_name and description by default', async () => {
    await listExpenses({ search: 'diesel' })
    const or = callsOfKind('or')[0]
    expect(or?.[1]).toBe('expense_no.ilike.*diesel*,vendor_name.ilike.*diesel*,description.ilike.*diesel*')
  })

  it('strips punctuation out of a search term rather than letting it reshape the filter', async () => {
    // sanitiseSearchTerm's job, asserted here because this module is the one that
    // decides which columns the `or` spans.
    await listExpenses({ search: 'Karki, Rupesh' })
    const or = callsOfKind('or')[0]
    expect(String(or?.[1])).toBe(
      'expense_no.ilike.*Karki Rupesh*,vendor_name.ilike.*Karki Rupesh*,description.ilike.*Karki Rupesh*',
    )
  })

  it('asks for a count only when withCount is set', async () => {
    await listExpenses()
    expect(db.state.selectOptions).toBeUndefined()

    db.reset()
    await listExpenses({ withCount: true })
    expect(db.state.selectOptions).toEqual({ count: 'exact' })
  })

  it('surfaces a query failure as a named error', async () => {
    db.state.error = { message: 'relation does not exist' }
    await expect(listExpenses()).rejects.toThrow('listExpenses failed: relation does not exist')
  })
})

const RAW_EXPENSE = {
  id: 'f6666666-6666-4666-8666-666666666666',
  expense_no: 'EXP-2083-0107',
  expense_date: '2026-08-04',
  amount: 4250.75,
  vendor_name: 'Shree Diesel Suppliers',
  description: 'Generator fuel for the Pokhara shoot',
  category_id: '77777777-7777-4777-8777-777777777777',
  branch_id: '88888888-8888-4888-8888-888888888888',
  status: 'Pending Approval' as const,
  booking_id: 'b2222222-2222-4222-8222-222222222222',
  receipt_url: 'https://example.invalid/receipt.pdf',
  receipt_size: 184320,
  created_at: '2026-08-04T11:02:00+00:00',
  expense_categories: { code: 'FUEL', name: 'Fuel & Power' },
  branches: { name: 'Thamel' },
  bookings: { booking_no: 'B-715' },
}

async function mapExpense(raw: unknown): Promise<ExpenseListRow> {
  db.state.rows = [raw]
  const { rows } = await listExpenses()
  const row = rows[0]
  if (!row) throw new Error('expected exactly one mapped expense')
  return row
}

describe('toExpenseRow — raw DB row → ExpenseListRow', () => {
  it('carries every column through unchanged', async () => {
    const row = await mapExpense(RAW_EXPENSE)
    expect(row.id).toBe(RAW_EXPENSE.id)
    expect(row.expenseNo).toBe('EXP-2083-0107')
    expect(row.expenseDateAd).toBe('2026-08-04')
    expect(row.vendorName).toBe('Shree Diesel Suppliers')
    expect(row.description).toBe('Generator fuel for the Pokhara shoot')
    expect(row.categoryId).toBe(RAW_EXPENSE.category_id)
    expect(row.branchId).toBe(RAW_EXPENSE.branch_id)
    expect(row.status).toBe('Pending Approval')
    expect(row.bookingId).toBe(RAW_EXPENSE.booking_id)
    expect(row.receiptUrl).toBe('https://example.invalid/receipt.pdf')
    expect(row.createdAtAd).toBe('2026-08-04T11:02:00+00:00')
  })

  it('converts the amount rupees → paisa, sub-rupee part intact', async () => {
    const row = await mapExpense(RAW_EXPENSE)
    expect(row.amount).toBe(425_075)
    expect(toRupees(row.amount)).toBe(4250.75)
  })

  it('keeps receipt_size in BYTES — it is a file size, not money', async () => {
    // ×100 here would report a 180 KB receipt as 18 MB and push it towards the
    // 50 MB CHECK for no reason.
    const row = await mapExpense(RAW_EXPENSE)
    expect(row.receiptSizeBytes).toBe(184320)
  })

  it('resolves the category and branch embeds', async () => {
    const row = await mapExpense(RAW_EXPENSE)
    expect(row.categoryCode).toBe('FUEL')
    expect(row.categoryName).toBe('Fuel & Power')
    expect(row.branchName).toBe('Thamel')
  })

  it('treats an unattributed expense as ordinary, not as a broken join', async () => {
    // expenses.booking_id is nullable — an operating expense with no booking is
    // the common case.
    const row = await mapExpense({ ...RAW_EXPENSE, booking_id: null, bookings: null })
    expect(row.bookingId).toBeNull()
    expect(row.bookingNo).toBeNull()
  })

  it('names a missing category or branch join, which can only be a bug', async () => {
    const row = await mapExpense({ ...RAW_EXPENSE, expense_categories: null, branches: null })
    expect(row.categoryCode).toBe('(category not joined)')
    expect(row.categoryName).toBe('(category not joined)')
    expect(row.branchName).toBe('(branch not joined)')
  })

  it('passes a missing receipt through as null', async () => {
    const row = await mapExpense({ ...RAW_EXPENSE, receipt_url: null, receipt_size: null })
    expect(row.receiptUrl).toBeNull()
    expect(row.receiptSizeBytes).toBeNull()
  })

  it('exposes no field the expenses table cannot source', async () => {
    // Law 1 of this brief: a field with no column behind it may not be invented.
    const row = await mapExpense(RAW_EXPENSE)
    const keys = Object.keys(row)
    for (const invented of ['method', 'paymentMethod', 'vat', 'vatAmount', 'billNo', 'budget', 'budgetVariance']) {
      expect(keys).not.toContain(invented)
    }
  })
})

describe('expense filter sets', () => {
  it('EXPENSE_STATUSES is the whole enum, in declaration order', () => {
    expect([...EXPENSE_STATUSES]).toEqual([
      'Draft',
      'Pending Approval',
      'Approved',
      'Paid',
      'Rejected',
      'Cancelled',
    ])
  })

  it('expensesAwaitingApproval asks for exactly one enum member, oldest first', () => {
    record(expensesAwaitingApproval())
    expect(chipCalls()['status']).toEqual(['Pending Approval'])
    expect(db.state.calls).toContainEqual(['order', 'expense_date', { ascending: true }])
  })

  it('expensesByStatus sends the selection it was given', () => {
    record(expensesByStatus(['Approved', 'Paid']))
    expect(chipCalls()['status']).toEqual(['Approved', 'Paid'])
  })

  it('expensesByStatus with an EMPTY selection means no constraint, never match-nothing', () => {
    // listQuery.ts:39-45 — the "All" chip clears the group rather than sending an
    // impossible `in(col, [])`, which would return zero rows.
    record(expensesByStatus([]))
    expect(chipCalls()['status']).toBeUndefined()
    expect(callsOfKind('in')).toEqual([])
  })

  it('expensesInPeriod compares a date column against bare dates, with no offset', () => {
    // expense_date is a `date` (0006:333): there is no instant in it to shift, so
    // attaching +05:45 here would be noise at best and a type mismatch at worst.
    record(expensesInPeriod('2026-08-01', '2026-08-31'))
    expect(db.state.calls).toContainEqual(['gte', 'expense_date', '2026-08-01'])
    expect(db.state.calls).toContainEqual(['lte', 'expense_date', '2026-08-31'])
  })

  it('expensesInPeriod still resolves an ISO instant to the Kathmandu day', () => {
    record(expensesInPeriod('2026-08-12T19:00:00Z', '2026-08-12T19:00:00Z'))
    expect(db.state.calls).toContainEqual(['gte', 'expense_date', '2026-08-13'])
    expect(db.state.calls).toContainEqual(['lte', 'expense_date', '2026-08-13'])
  })

  it('expensesForCategory, ForBranch and ForBooking narrow by uuid', () => {
    record(expensesForCategory('cat-1'))
    expect(chipCalls()['category_id']).toEqual(['cat-1'])

    record(expensesForBranch('br-1'))
    expect(chipCalls()['branch_id']).toEqual(['br-1'])

    record(expensesForBooking('b-1'))
    expect(chipCalls()['booking_id']).toEqual(['b-1'])
  })

  it('expensesByReceipt is a presence flag in both directions', () => {
    record(expensesByReceipt(true))
    expect(db.state.calls).toContainEqual(['not', 'receipt_url', 'is', null])

    record(expensesByReceipt(false))
    expect(db.state.calls).toContainEqual(['is', 'receipt_url', null])
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * Cross-cutting — the things every one of the three has to get right
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('every list query, uniformly', () => {
  it('appends a unique tiebreaker so offset paging cannot duplicate or drop a row', async () => {
    for (const list of [listInvoices, listPayments, listExpenses]) {
      db.reset()
      await list({ page: { index: 1, size: 20 } })
      const orders = callsOfKind('order')
      expect(orders[orders.length - 1]?.[1]).toBe('id')
      expect(db.state.calls).toContainEqual(['range', 20, 39])
    }
  })

  it('points the tiebreaker the same way as the primary sort, so a flipped column reverses exactly', async () => {
    for (const list of [listInvoices, listPayments, listExpenses]) {
      db.reset()
      await list({ sort: { column: 'created_at', ascending: true } })
      expect(callsOfKind('order')).toEqual([
        ['order', 'created_at', { ascending: true }],
        ['order', 'id', { ascending: true }],
      ])
    }
  })

  it('lets a caller override the search columns', async () => {
    await listInvoices({ search: 'x', searchColumns: ['invoice_no'] })
    expect(callsOfKind('or')[0]?.[1]).toBe('invoice_no.ilike.*x*')
  })

  it('sends no search filter at all for a blank or punctuation-only term', async () => {
    for (const term of ['', '   ', ' ,, ']) {
      db.reset()
      await listInvoices({ search: term })
      expect(callsOfKind('or')).toEqual([])
    }
  })

  it('reports the count only when one was asked for', async () => {
    db.state.count = 42
    await expect(listExpenses({ withCount: true })).resolves.toMatchObject({ total: 42 })

    db.reset()
    db.state.count = null
    await expect(listExpenses()).resolves.toMatchObject({ total: null })
  })

  it('returns { rows: [], total: null } — never throws — when RLS filters everything out', async () => {
    // This is exactly what a money-blind session sees, and it is indistinguishable
    // from a genuinely empty table at this layer. financeRestriction is the only
    // thing that can tell a screen which one it is.
    for (const list of [listInvoices, listPayments, listExpenses]) {
      db.reset()
      db.state.rows = []
      await expect(list()).resolves.toEqual({ rows: [], total: null })
    }
  })
})
