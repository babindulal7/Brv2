import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import type { Paisa } from '../../lib/money'
import type { LineKind } from '../../types/database'

/**
 * # CREATE_INVOICE — SPEC-P0-1 §3.1, closing the first half of P0-1
 *
 * ## What this replaced
 *
 * Nothing, which is the point. `CreateInvoiceModal` refused honestly and named
 * both blockers: *"There is nothing to dispatch … and there is no
 * `invoice.create` rule."* The live project holds 0 invoices, 0 invoice lines
 * and 0 payments, and `recordPayment` refuses without an invoice — so the
 * business could book, pack, hand over and receive gear and never bill for it.
 *
 * ## Built to the 4 September rulings, not to the schema it found
 *
 * `RULINGS-2026-09-04.md` is binding and outranks PLAN.md (R-00). Three of its
 * rulings shape this file, and each contradicted the live database, so each
 * needed a migration to become possible at all:
 *
 * | Ruling | This action | Migration it needed |
 * |---|---|---|
 * | R-15 · a Draft carries no number | `invoice_no` and `issue_date` omitted entirely | `0086` — both were `NOT NULL` |
 * | R-05 · rights are Owner/Admin/Manager/Accounts | `invoice.create` → `canIssueInvoice` | `0086` — live said Coordinator, not Accounts |
 * | R-02 · Draft for the whole rental | `status: 'Draft'`, never a caller's choice | `0080` — the payment trigger flipped it |
 *
 * A fourth is invisible until you try it: **`invoice_lines` had no INSERT
 * policy at all**, so the lines below raise `42501` for every role including
 * Owner. `0086` adds it. **None of these three migrations is applied** —
 * PHASE-0-PLAN.md Step 0 (live dump, restore test, token rotation) must land
 * first, and CLAUDE.md forbids applying without explicit approval regardless.
 * Until they do, this action fails loudly rather than writing something wrong.
 *
 * ## R-01 · manual only
 *
 * Nothing generates an invoice at Confirm. The entry points are Finance ▸ Create
 * Invoice and Booking Detail ▸ Create Invoice, both operator-initiated.
 *
 * ## R-03 · one invoice per rental
 *
 * The precondition below refuses a second invoice for a booking that already has
 * one. Damage and late fees **append as lines to the existing Draft**
 * (`addInvoiceLine`, SPEC-P0-1 §3.2), and corrections after issue are Void +
 * Credit Note (R-04) — never a second invoice.
 *
 * ## TOTALS — owned by the database, deliberately
 *
 * `recalculate_invoice_totals()` fires on every `invoice_lines` write and
 * derives `subtotal` (as `sum(line_total)`), `discount_amount`,
 * `taxable_amount`, `vat_amount`, `total_amount` and `outstanding_amount`. So
 * the header is inserted with those columns at their zero defaults and this
 * action re-reads them afterwards. Computing them here as well would create a
 * second writer for one number — the exact failure §4.42 tracks.
 *
 * ⚠ The live trigger rounds to 2 dp and hardcodes `0.13`, where `lib/money`
 * rounds to the whole rupee at each step (Rs 0.98 per invoice on the §2.8
 * reference case). Foundation rules the app's arithmetic canonical, so **the
 * trigger changes** — `0081_invoice_totals_match_engine`, SPEC-P0-1 §2.2, which
 * absorbs the drafted `0079`. Not written here: it is Step 1.2 of the plan and
 * wants the reference case as a pgTAP test alongside it.
 *
 * ## R-17 · percentage discounts only
 *
 * `discount_percent` is read from `booking_discounts` and written to the header.
 * `discount_amount` is **derived** by the trigger and never written here — a
 * fixed-rupee discount cannot survive a line change, which is why R-17 exists.
 */

export type CreateInvoiceInput = {
  /** The booking to bill, by its number. */
  bookingNo: string
  /**
   * VAT rate as a percentage (13 means 13%), pinned onto the invoice at
   * creation (SPEC-P0-1 §3.1). Read from Settings by the caller.
   *
   * Passed in rather than read here because the rate lives in
   * `lib/settingsStore`, a browser store — an action must not reach into UI
   * state. That store is itself `localStorage`-only (FORMS-09 / AUTHSEC-02), so
   * two devices can hold different rates; backing it with `system_settings` is
   * open work. Pinning the value onto the row at creation is what stops a later
   * settings change from silently re-pricing an existing invoice.
   */
  vatPercent: number
  /** **Law 8** for the header row. Minted where the operator acted. */
  clientUuid: string
  /** `invoices.notes` — optional free text. */
  notes?: string
}

export type CreateInvoiceResult = {
  invoiceId: string
  bookingId: string
  bookingNo: string
  clientId: string
  /** Always `'Draft'` (R-02). Stated in the result so a caller cannot assume otherwise. */
  status: 'Draft'
  /** `date`, AD. Derived from the client's payment terms. */
  dueDateAd: string
  linesWritten: number
  /** Every figure below is what POSTGRES computed, re-read after the lines landed. */
  subtotalPaisa: Paisa
  discountPaisa: Paisa
  taxablePaisa: Paisa
  vatPaisa: Paisa
  totalPaisa: Paisa
}

/**
 * `clients.payment_terms` → days. The live enum's four values, each mapped to
 * the number its own label states. Not a policy — the label IS the rule.
 */
const TERM_DAYS: Record<string, number> = {
  Immediate: 0,
  '7 days': 7,
  '15 days': 15,
  '30 days': 30,
}

/**
 * `booking_lines.line_type` → `invoice_lines.line_kind`.
 *
 * Two different enums over the same idea, so the mapping is explicit rather than
 * a cast. Anything unmapped falls to `Equipment Rental`, the column default.
 *
 * ⚠ `line_kind` has **no `Damage` and no `Missing` value**, though
 * `charges.invoice_line_id`'s own comment promises `line_kind = 'Damage'`. A
 * damage charge therefore cannot become an invoice line at all today (P1-12).
 * Widening the enum is a ruling — it decides deposit-versus-invoice precedence
 * too — and `addInvoiceLine` (SPEC-P0-1 §3.2) is blocked behind it.
 */
/*
 * Keyed on the REAL `booking_line_type` enum — Equipment | Bundle | Accessory |
 * Service | Sub-rental | Manual item.
 *
 * It previously carried `Crew` and `Transport` keys, which are **not** members of
 * that enum, so those two entries could never fire. Meanwhile `Bundle`,
 * `Accessory` and `Manual item` — which ARE members — had no entry and fell
 * through a `?? 'Equipment Rental'` fallback, so an accessory or an ad-hoc line
 * was billed as equipment rental with nothing said about it.
 *
 * Every member is now named. The three that used to take the fallback keep the
 * value the fallback gave them, so no existing invoice changes shape; the
 * difference is that an unmapped type is now impossible rather than silent.
 *
 * Crew and transport are not booking_lines at all — they live in their own
 * tables and are read separately below.
 */
const LINE_KIND_BY_TYPE: Record<string, LineKind> = {
  Equipment: 'Equipment Rental',
  Bundle: 'Equipment Rental',
  Accessory: 'Equipment Rental',
  'Manual item': 'Equipment Rental',
  Service: 'Services',
  'Sub-rental': 'Sub-Rental',
}

type InvoiceTarget = {
  bookingId: string
  clientId: string
  branchId: string
  bookingNo: string
  termDays: number
}

/** A line ready to be written, whatever table it came from. */
type BillableLine = {
  client_uuid: string
  line_kind: LineKind
  description: string
  qty: number
  days: number
  rate: number
  discount_amount: number
  sort_order: number
}

type CrewLineRow = {
  client_uuid: string
  name: string | null
  crew_role: string | null
  day_rate: number | string
  days: number | string
  overtime: number | string | null
  accommodation: number | string | null
  meals: number | string | null
  voided_at: string | null
}

type TransportChargeRow = {
  client_uuid: string
  vehicle: string | null
  delivery_charge: number | string | null
  fuel_charge: number | string | null
}

type BookingLineRow = {
  id: string
  client_uuid: string
  line_type: string
  description: string | null
  qty: number
  days: number
  rate: number | string
  discount_amount: number | string
  sort_order: number
  voided_at: string | null
}

/**
 * Resolve a booking number to the FK set and the client's payment terms.
 *
 * Two reads rather than one PostgREST embed: an embed depends on the FK being
 * exposed AND on `payment_terms` surviving Law 6's column grants for the
 * caller's role, and a failure in either surfaces as a null column rather than
 * an error. Two explicit single-row reads fail where they fail, with a sentence
 * naming which one.
 *
 * ⚠ Same note `recordPayment.resolvePaymentTarget` carries: the long-term home
 * is `lib/queries/bookings.ts` (Law 2's Single Query Rule).
 * TODO(refactor): hoist to `queries/bookings.ts` as `invoiceTargetByNo()`.
 */
async function resolveInvoiceTarget(bookingNo: string): Promise<InvoiceTarget> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_no, client_id, branch_id, stage, cancelled_at')
    .eq('booking_no', bookingNo)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not look up booking ${bookingNo}, so no invoice was created: ${error.message}`)
  }
  if (!data) {
    throw new Error(`No booking numbered ${bookingNo} exists, so there is nothing to invoice and nothing was created.`)
  }

  const booking = data as unknown as {
    id: string
    booking_no: string
    client_id: string
    branch_id: string
    stage: string
    cancelled_at: string | null
  }

  /*
   * A cancelled booking is not invoiced from here. §1.3 keeps Cancelled
   * orthogonal to the six stages, and whether a cancelled booking may still be
   * walked to Closed for settlement is explicitly UNRULED (PLAN.md §4.16) — so
   * this refuses rather than deciding it. If a cancellation fee turns out to be
   * billable, that is a ruling and it arrives here as an explicit input flag.
   */
  if (booking.cancelled_at !== null) {
    throw new Error(
      `${booking.booking_no} was cancelled on ${booking.cancelled_at}. Whether a cancellation carries a fee is an ` +
        'open ruling (PLAN.md §4.16), so no invoice was created.',
    )
  }

  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select('id, payment_terms')
    .eq('id', booking.client_id)
    .maybeSingle()

  if (clientError) {
    throw new Error(
      `Could not read the payment terms for ${booking.booking_no}'s client, so the invoice has no due date and ` +
        `nothing was created: ${clientError.message}`,
    )
  }

  /*
   * `payment_terms` is `NOT NULL DEFAULT 'Immediate'`, so a missing value here
   * means the read was masked rather than that the client has no terms. Falling
   * back to Immediate is the safe direction: it makes the invoice due today,
   * which is visible and correctable, rather than silently granting 30 days of
   * credit nobody agreed to.
   */
  const terms = (clientRow as unknown as { payment_terms?: string } | null)?.payment_terms ?? 'Immediate'

  return {
    bookingId: booking.id,
    clientId: booking.client_id,
    branchId: booking.branch_id,
    bookingNo: booking.booking_no,
    termDays: TERM_DAYS[terms] ?? 0,
  }
}

/** `date` arithmetic in UTC (Law 7 — AD is stored in UTC; BS is rendered only). */
function dueDateFrom(issuedAd: Date, termDays: number): string {
  const due = new Date(issuedAd.getTime())
  due.setUTCDate(due.getUTCDate() + termDays)
  return due.toISOString().slice(0, 10)
}

/** numeric (which postgrest-js may hand back as a string) in RUPEES → paisa. */
const paisa = (v: number | string | null | undefined): Paisa => Math.round(Number(v ?? 0) * 100) as Paisa

export const createInvoice = createAction<CreateInvoiceInput, CreateInvoiceResult>({
  name: 'CREATE_INVOICE',
  permissions: ['invoice.create'],

  /**
   * `true` because `execute` inserts `invoices` and then `invoice_lines`
   * through `lib/dataAccess`'s `idempotentInsert`, **verifies each came back
   * from Postgres**, and re-reads the computed totals. See the PERSISTENCE
   * CHECK blocks.
   */
  implemented: true,

  validate: (input) => {
    if (!input.bookingNo || input.bookingNo.trim() === '') {
      throw new Error('An invoice must name the booking it bills.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      // Law 8. Not defaulted: a key minted at send time gives a replayed submit
      // a DIFFERENT key, which is how one invoice becomes two.
      throw new Error('This invoice carries no idempotency key, so a retry could raise it twice. Nothing was sent.')
    }
    if (!Number.isFinite(input.vatPercent) || input.vatPercent < 0 || input.vatPercent > 100) {
      throw new Error('The VAT rate must be a percentage between 0 and 100.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused here as well as in rbac, and the duplication is the
     * point. Creating an invoice reads the booking, its lines and its discount,
     * then writes two tables whose totals a trigger derives. A queued version of
     * that is not an invoice, it is a promise of one.
     */
    if (ctx.isOnline === false) {
      throw new Error(
        'Creating an invoice needs a connection — its totals are computed by the database. Nothing was created.',
      )
    }

    const bookingNo = input.bookingNo.trim()
    const target = await resolveInvoiceTarget(bookingNo)

    /* ── R-03 · one invoice per rental ───────────────────────────────────────
     *
     * Checked BEFORE anything is written. Note this refuses on ANY existing
     * invoice, including a voided one, which is stricter than SPEC-P0-1 §3.1's
     * "no non-Void invoice". The reason is the line keys below: they are the
     * booking lines' own `client_uuid`s, so a second invoice over the same
     * booking would collide on `invoice_lines_client_uuid_key` and write a
     * partial invoice. Re-invoicing after a void needs its own key strategy and
     * its own ruling; refusing is the honest interim.
     * TODO(decision) — re-invoicing a booking whose only invoice was voided.
     */
    const { data: existing, error: existingError } = await supabase
      .from('invoices')
      .select('id, invoice_no, status, voided_at')
      .eq('booking_id', target.bookingId)

    if (existingError) {
      throw new Error(
        `Could not check whether ${bookingNo} is already invoiced, so nothing was created: ${existingError.message}`,
      )
    }
    const priorInvoices = (existing ?? []) as unknown as Array<{
      invoice_no: string | null
      status: string
      voided_at: string | null
    }>
    if (priorInvoices.length > 0) {
      const prior = priorInvoices[0]!
      const label = prior.invoice_no ?? 'a Draft'
      throw new Error(
        `${bookingNo} already has an invoice (${label}, ${prior.status}). One invoice per rental — damage and late ` +
          'fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. ' +
          'Nothing was created.',
      )
    }

    /* ── The lines to snapshot ───────────────────────────────────────────────
     *
     * SPEC-P0-1 §3.1: *"Lines are a snapshot, not a join. The rate card is
     * pinned per booking; the invoice must not silently re-price when a
     * product's rate changes."* So the figures are copied here and never
     * re-derived from `products` afterwards.
     *
     * Voided booking lines are excluded — Law 3 keeps the row, but a voided line
     * is not billable.
     */
    const { data: lineRows, error: linesError } = await supabase
      .from('booking_lines')
      .select('id, client_uuid, line_type, description, qty, days, rate, discount_amount, sort_order, voided_at')
      .eq('booking_id', target.bookingId)
      .order('sort_order', { ascending: true })

    if (linesError) {
      throw new Error(`Could not read the lines of ${bookingNo}, so no invoice was created: ${linesError.message}`)
    }

    const equipmentLines: BillableLine[] = ((lineRows ?? []) as unknown as BookingLineRow[])
      .filter((l) => l.voided_at === null)
      .map((l, i) => ({
        client_uuid: l.client_uuid,
        line_kind: LINE_KIND_BY_TYPE[l.line_type] ?? 'Equipment Rental',
        // `booking_lines.description` is nullable and `invoice_lines.description`
        // is NOT NULL. The line type is the honest fallback — it says what the
        // charge is for without inventing a product name nobody typed.
        description: l.description?.trim() || l.line_type,
        qty: Math.max(1, Number(l.qty)),
        days: Math.max(1, Number(l.days)),
        rate: Number(l.rate),
        discount_amount: Number(l.discount_amount ?? 0),
        sort_order: l.sort_order ?? i,
      }))

    /*
     * -- Crew and transport: a P0, because they were never billed at all -------
     *
     * Crew charges live in `booking_crew_lines` and transport in
     * `booking_transport`, NOT in `booking_lines`. This function only ever read
     * `booking_lines`, so every crew day and every delivery charge was dropped
     * from the invoice silently and the client was billed for equipment alone.
     * Measured on the reference corpus: 120 crew lines worth NPR 2,817,300 across
     * 79 bookings, none of which could reach an invoice.
     *
     * `line_kind` already has `Crew Charges` and `Transport` members, so nothing
     * was missing schema-side — only the read.
     */
    const { data: crewRows, error: crewError } = await supabase
      .from('booking_crew_lines')
      .select('client_uuid, name, crew_role, day_rate, days, overtime, accommodation, meals, voided_at')
      .eq('booking_id', target.bookingId)

    if (crewError) {
      throw new Error(
        `Could not read the crew lines of ${bookingNo}, so the invoice would have under-billed the job and ` +
          `nothing was created: ${crewError.message}`,
      )
    }

    const crewLines: BillableLine[] = ((crewRows ?? []) as unknown as CrewLineRow[])
      .filter((c) => c.voided_at === null)
      .map((c, i) => {
        const days = Math.max(1, Number(c.days))
        /*
         * Overtime, accommodation and meals are per-engagement totals, not per
         * day. Folding them into the unit rate keeps quantity x days x rate equal
         * to the crew member's true cost, which is the arithmetic the recalc
         * trigger applies to every line without exception.
         */
        const extras = Number(c.overtime ?? 0) + Number(c.accommodation ?? 0) + Number(c.meals ?? 0)
        return {
          client_uuid: c.client_uuid,
          line_kind: 'Crew Charges' as LineKind,
          description: [c.name, c.crew_role].filter(Boolean).join(' - ') || 'Crew',
          qty: 1,
          days,
          rate: Number(c.day_rate) + extras / days,
          discount_amount: 0,
          sort_order: 1000 + i,
        }
      })

    const { data: transportRows, error: transportError } = await supabase
      .from('booking_transport')
      .select('client_uuid, vehicle, delivery_charge, fuel_charge')
      .eq('booking_id', target.bookingId)

    if (transportError) {
      throw new Error(
        `Could not read the transport of ${bookingNo}, so the invoice would have under-billed the job and ` +
          `nothing was created: ${transportError.message}`,
      )
    }

    const transportLines: BillableLine[] = ((transportRows ?? []) as unknown as TransportChargeRow[])
      .map((t, i) => ({
        client_uuid: t.client_uuid,
        line_kind: 'Transport' as LineKind,
        description: t.vehicle ? `Transport - ${t.vehicle}` : 'Transport',
        qty: 1,
        days: 1,
        rate: Number(t.delivery_charge ?? 0) + Number(t.fuel_charge ?? 0),
        discount_amount: 0,
        sort_order: 2000 + i,
      }))
      // A transport row carrying no charge is a logistics record, not a bill line.
      .filter((t) => t.rate > 0)

    const billable: BillableLine[] = [...equipmentLines, ...crewLines, ...transportLines]

    if (billable.length === 0) {
      throw new Error(
        `${bookingNo} has no billable lines, so an invoice would bill nothing and keep zero totals permanently. ` +
          'Add the lines to the booking first. Nothing was created.',
      )
    }

    // ── The booking's discount (R-17 — a percentage, never an amount) ───────
    const { data: discountRow, error: discountError } = await supabase
      .from('booking_discounts')
      .select('percent, discount_source')
      .eq('booking_id', target.bookingId)
      .maybeSingle()

    if (discountError) {
      throw new Error(
        `Could not read the discount on ${bookingNo}, so the invoice would have priced it wrongly and nothing was ` +
          `created: ${discountError.message}`,
      )
    }
    const discountPercent = Number((discountRow as unknown as { percent?: number } | null)?.percent ?? 0)

    const now = new Date()
    const dueDateAd = dueDateFrom(now, target.termDays)

    /* ── The header ──────────────────────────────────────────────────────────
     *
     * R-15: `invoice_no` and `issue_date` are OMITTED, not set to null — the
     * column list is what documents the intent, and 0086 makes both nullable
     * and adds `invoices_issued_together` so a half-issued row cannot exist.
     *
     * Money columns are left at their zero defaults; the trigger owns them.
     * `discount_amount` in particular is never written (R-17).
     */
    const headerResult = await idempotentInsert('invoices', {
      client_uuid: input.clientUuid,
      booking_id: target.bookingId,
      client_id: target.clientId,
      branch_id: target.branchId,
      status: 'Draft',
      due_date: dueDateAd,
      currency: 'NPR',
      discount_percent: discountPercent,
      // numeric(5,4) — a FRACTION, not a percentage. 13 → 0.1300.
      vat_rate: input.vatPercent / 100,
      notes: input.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })

    /* ── PERSISTENCE CHECK · the header ──────────────────────────────────────
     *
     * `idempotentInsert` returns `{ data, error: null }` on success, but two of
     * its branches return successfully having written nothing — the offline
     * queue (guarded above) and the 'Failed to fetch'/408 branch, which can fire
     * even when `navigator.onLine` is true. Both echo the payload that was SENT,
     * which carries no `id`; only Postgres fills that column.
     */
    if (headerResult.error) {
      throw new Error(
        `The invoice could not be written, so treat it as not raised: ${
          (headerResult.error as { message?: string }).message ?? String(headerResult.error)
        }`,
      )
    }
    const header = headerResult.data as { id?: string } | null
    if (!header || typeof header.id !== 'string') {
      throw new Error(
        `The invoice for ${bookingNo} was queued rather than written — the ledger has not confirmed it. ` +
          'Check the connection and create it again.',
      )
    }
    const invoiceId = header.id

    /* ── The lines ───────────────────────────────────────────────────────────
     *
     * **Law 8, per line.** `invoice_lines.client_uuid` is UNIQUE, so each line
     * needs its own key. Each reuses the BOOKING line's key, which is unique per
     * line and stable across retries — so a replayed create writes the same rows
     * rather than a second set. That coupling is what the R-03 precondition
     * above protects; see the TODO(decision) there.
     *
     * `line_total` carries the booking line's NET figure (qty × days × rate less
     * its own discount), because `recalculate_invoice_totals` derives the
     * invoice subtotal as `sum(line_total)`. The booking-level percentage is
     * applied on top by the trigger, from the header's `discount_percent`.
     * `invoice_lines.discount_percent` stays 0: the line's discount is already
     * inside its total, and double-counting it here would discount twice.
     */
    let linesWritten = 0
    for (const [index, line] of billable.entries()) {
      const gross = Number(line.qty) * Number(line.days) * Number(line.rate)
      const net = Math.max(0, gross - Number(line.discount_amount ?? 0))

      const lineResult = await idempotentInsert('invoice_lines', {
        client_uuid: line.client_uuid,
        invoice_id: invoiceId,
        // Resolved where the line was built: equipment lines through the enum
        // map, crew and transport from their own tables.
        line_kind: line.line_kind,
        description: line.description,
        quantity: line.qty,
        days: line.days,
        unit_rate: line.rate,
        line_total: net,
        discount_percent: 0,
        sort_order: line.sort_order ?? index,
      })

      /*
       * A failed line is NOT retried and NOT swallowed. The header already
       * exists, so the operator is told exactly that and told to void rather
       * than retry — a retry would raise a second invoice for the same work
       * while the first sits with partial lines.
       *
       * Until 0086 applies this is the branch every call takes, in PostgREST's
       * own words: "new row violates row-level security policy for table
       * invoice_lines".
       */
      if (lineResult.error) {
        throw new Error(
          `The invoice for ${bookingNo} was created but line ${index + 1} could not be written, so it is incomplete ` +
            `and its totals are wrong. Void it rather than retrying. The database said: ${
              (lineResult.error as { message?: string }).message ?? String(lineResult.error)
            }`,
        )
      }
      const persistedLine = lineResult.data as { id?: string } | null
      if (!persistedLine || typeof persistedLine.id !== 'string') {
        throw new Error(
          `The invoice for ${bookingNo} was created but line ${index + 1} was queued rather than written, so the ` +
            'invoice is incomplete and its totals are wrong. Void it rather than retrying.',
        )
      }
      linesWritten += 1
    }

    /* ── The totals, as POSTGRES computed them ───────────────────────────────
     *
     * Re-read rather than derived — see TOTALS. A caller rendering its own
     * figure is showing an estimate; this is the row.
     */
    const { data: totalsRow, error: totalsError } = await supabase
      .from('invoices')
      .select('subtotal, discount_amount, taxable_amount, vat_amount, total_amount, due_date, status')
      .eq('id', invoiceId)
      .maybeSingle()

    if (totalsError || !totalsRow) {
      throw new Error(
        `The invoice for ${bookingNo} was written but its totals could not be read back, so check it on the Finance ` +
          `screen before sending it${totalsError ? `: ${totalsError.message}` : '.'}`,
      )
    }

    const totals = totalsRow as unknown as {
      subtotal: number | string
      discount_amount: number | string
      taxable_amount: number | string
      vat_amount: number | string
      total_amount: number | string
      due_date: string
    }

    const events = [
      {
        type: EVENT_TYPES.INVOICE_CREATED,
        payload: {
          invoiceId,
          // R-15 — a Draft has no number yet. Stated rather than omitted so a
          // subscriber cannot mistake `undefined` for a missing field.
          invoiceNo: null,
          status: 'Draft',
          bookingId: target.bookingId,
          bookingNo: target.bookingNo,
          clientId: target.clientId,
          totalPaisa: paisa(totals.total_amount),
          dueDateAd: totals.due_date,
          linesWritten,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        invoiceId,
        bookingId: target.bookingId,
        bookingNo: target.bookingNo,
        clientId: target.clientId,
        status: 'Draft' as const,
        dueDateAd: totals.due_date,
        linesWritten,
        subtotalPaisa: paisa(totals.subtotal),
        discountPaisa: paisa(totals.discount_amount),
        taxablePaisa: paisa(totals.taxable_amount),
        vatPaisa: paisa(totals.vat_amount),
        totalPaisa: paisa(totals.total_amount),
      },
      events,
    }
  },
})
