import { supabase } from '../supabase'
import { rupees } from '../money'
import type { Paisa } from '../money'
import type { LineKind, SystemRole } from '../../types/database'

/**
 * # What `createInvoice` will write for a booking, read before it writes it
 *
 * Law 2's read module for the Create Invoice screen. One reason to exist:
 * **`CreateInvoiceModal` must show the operator the bill that is about to be
 * raised, and it must be the same bill.** A preview assembled from anything
 * other than the action's own sources is a second opinion about a client's
 * money, and the screen would be the last place anyone noticed they disagreed.
 *
 * ## §4.46(a) — the invoice bills the BOOKING
 *
 * This module exists because the question `PLAN.md` §4.46 recorded — *does an
 * invoice bill the booking, or what the operator typed?* — is answered by the
 * rulings that were already binding, not by a new decision:
 *
 *  - `RULINGS-2026-09-04.md` **R-03**: *"Append as lines to the **Draft**
 *    invoice. One invoice per rental (21 Jul ruling, unchanged)."* Damage and
 *    late fees append to lines that already exist, in the units the return
 *    session produces — booking lines. There is nothing for them to append to
 *    on a hand-typed bill.
 *  - `docs/SPEC-P0-1-INVOICING.md` **§3.1**: *"Then one `invoice_lines` row per
 *    `booking_lines` row"* and *"**Lines are a snapshot, not a join.** The rate
 *    card is pinned per booking; the invoice must not silently re-price when a
 *    product's rate changes."*
 *  - `RULINGS-2026-09-04.md` **R-02**: the invoice is created as Draft and
 *    *"issued once, at return, when the final figure is known"* — a figure the
 *    booking carries and a form filled in at creation time cannot.
 *
 * So the free-form line editor that stood on the modal was not an unruled
 * alternative; it was a third answer neither document allows. The modal is a
 * preview, and this module is what it previews.
 *
 * ## It MIRRORS `actions/finance/createInvoice.ts`, deliberately and by hand
 *
 * ⚠ Every read below is the same table, the same column list, the same filter
 * and the same shaping as `createInvoice.execute`. That duplication is not an
 * oversight and it is not free — **the two must be changed together.** The
 * alternative was to have the action import this module, which would have meant
 * editing `createInvoice.ts`; that file is being changed elsewhere in the same
 * window and a merge there costs more than this comment does. Fold this into the
 * action the moment both are quiet.
 * TODO(refactor): have `createInvoice` build its lines from `billableLines()`.
 *
 * The differences, both stated rather than silent:
 *
 *  1. **Every read goes through the `_v` view, never the base table**, and that
 *     is a grant fact rather than a preference. Probed on the live project on
 *     7 Sep 2026 and independently recorded in `0096_create_invoice_rpc.sql`'s
 *     header: 0062 revoked table-level SELECT on `booking_lines` and
 *     `booking_transport` and granted back only the non-money columns, so
 *     `has_column_privilege('authenticated','booking_lines','rate','SELECT')` is
 *     **false for every signed-in session, Owner included**. A browser read of
 *     the base table cannot see a rate at all. The action reaches those columns
 *     through a SECURITY DEFINER function; a screen cannot and must not.
 *  2. **Nothing here writes.** No `client_uuid` is minted, no row is inserted,
 *     and the totals are the ENGINE's (`lib/money.ts`), not the database's.
 *
 * ## ⚠ TRANSPORT IS NOT READABLE BY TWO OF THE FOUR ROLES THAT MAY INVOICE
 *
 * `booking_transport_v` ends in
 *
 *     where auth_user_role() = any (array['Owner','Admin','Coordinator',
 *                                         'Warehouse','Driver'])
 *
 * and the base table's only SELECT policy, `booking_transport_driver_read`,
 * carries the identical list. **Manager and Accounts are in neither**, and both
 * are named by R-05 as roles that may raise an invoice. A Manager's read of
 * transport therefore returns zero rows — which is indistinguishable, from the
 * browser, from a booking that has no transport.
 *
 * The invoice itself is still correct: `create_invoice` is SECURITY DEFINER and
 * bills the delivery and fuel charges regardless. So the danger is entirely on
 * this side: a preview that showed a total short by the transport charge would
 * be a confidently wrong number on a money screen, and the operator would only
 * discover it on the invoice.
 *
 * So this module reports `transportKnown` and the modal renders accordingly —
 * the lines it can see, and a stated omission where the total would be. Not a
 * number with a caveat attached. Re-cutting that policy and that view is a Law 6
 * grant-contract change (SEC-04 / DB-02) and is not this module's business;
 * `TRANSPORT_VISIBLE_ROLES` below is the one place the list is written down.
 *
 * ## The totals are an estimate, and the modal must say so
 *
 * `recalculate_invoice_totals()` owns the invoice's stored figures, and the live
 * trigger is known to disagree with `lib/money.ts` by up to Rs 0.98 per invoice
 * (SPEC-P0-1 §2.2 / P1-4 — the trigger rounds to 2 dp and hardcodes 0.13, the
 * engine rounds to the whole rupee at each step). Foundation rules the app's
 * arithmetic canonical, so the trigger is what changes; until `0098` lands, the
 * figure this module feeds the engine and the figure the row comes back with can
 * differ in the last rupee. The modal states that rather than implying the
 * preview is the receipt.
 *
 * ⚠ It also mirrors one thing the action does that `lib/bookingQuery.ts` does
 * NOT: a `Service` line with `service_basis = 'Flat'` is multiplied by `days`
 * here, because `createInvoice` multiplies it by `days` when it writes
 * `line_total`. `bookingQuery.lineNetTotal` charges a Flat service once. That is
 * a real disagreement about a real charge and it belongs on the action, not on
 * the preview — a preview that quietly "corrected" it would hide the defect
 * behind a screen that looked right. Filed, not papered over.
 * TODO(decision) — `PLAN.md` §4: which of the two is the ruled arithmetic for a
 * Flat service line, and fix the loser.
 */

/** The `booking_line_type` → `line_kind` map, copied from `createInvoice.ts`. */
const LINE_KIND_BY_TYPE: Record<string, LineKind> = {
  Equipment: 'Equipment Rental',
  Bundle: 'Equipment Rental',
  Accessory: 'Equipment Rental',
  'Manual item': 'Equipment Rental',
  Service: 'Services',
  'Sub-rental': 'Sub-Rental',
}

/**
 * The roles `booking_transport_v` and `booking_transport_driver_read` admit.
 *
 * Copied from the policy, verbatim, and it is deliberately NOT the R-05 set: the
 * whole point is that the two lists differ. Manager and Accounts may raise an
 * invoice and may not read its transport rows. See the block above.
 *
 * ⚠ If that policy is re-cut (SEC-04 / DB-02), this constant is what changes —
 * and it must change in the same commit, or the preview starts claiming an
 * omission that no longer exists.
 */
export const TRANSPORT_VISIBLE_ROLES: readonly SystemRole[] = [
  'Owner',
  'Admin',
  'Coordinator',
  'Warehouse',
  'Driver',
]

/** `clients.payment_terms` → days. Copied from `createInvoice.ts`. */
const TERM_DAYS: Record<string, number> = {
  Immediate: 0,
  '7 days': 7,
  '15 days': 15,
  '30 days': 30,
}

/** One row the invoice will carry, priced exactly as the action will write it. */
export interface InvoicePreviewLine {
  /**
   * The source row's `client_uuid` — which is also the Law 8 key
   * `createInvoice` writes that line under, so it is stable across a retry and
   * unique per line. Used as the React key; never rendered.
   */
  key: string
  kind: LineKind
  description: string
  qty: number
  days: number
  ratePaisa: Paisa
  /** The LINE's own discount (rupees on `booking_lines`), not the booking's percentage. */
  discountPaisa: Paisa
  /** `qty × days × rate − discount`, floored at 0 — what lands in `invoice_lines.line_total`. */
  netPaisa: Paisa
  sortOrder: number
}

/** The invoice a booking already has. R-03: there may be at most one. */
export interface ExistingInvoiceSummary {
  id: string
  /** `null` on a Draft — R-15 mints the number at issue, not at creation. */
  invoiceNo: string | null
  status: string
  isVoid: boolean
  totalPaisa: Paisa
  paidPaisa: Paisa
  outstandingPaisa: Paisa
  dueDateAd: string
}

/** The engine's buckets, in `PriceInput`'s own vocabulary. */
export interface InvoicePreviewBuckets {
  equipment: Paisa
  subRental: Paisa
  services: Paisa
  crew: Paisa
  transport: Paisa
}

export type InvoicePreview =
  /** A bill can be previewed and `createInvoice` should be offered. */
  | {
      kind: 'preview'
      bookingNo: string
      bookingId: string
      clientName: string
      /** AD, `YYYY-MM-DD`. What `createInvoice` will write to `due_date`. */
      dueDateAd: string
      paymentTerms: string
      /** From `booking_discounts.percent`. R-17: a percentage, never an amount. */
      discountPercent: number
      lines: InvoicePreviewLine[]
      buckets: InvoicePreviewBuckets
      /**
       * Whether the transport read could be trusted to be complete.
       *
       * `false` for Manager and Accounts, whom `booking_transport_v` excludes —
       * their read returns zero rows whether or not the booking has transport,
       * so `buckets.transport` is Rs 0 for an unknown reason and no total built
       * on it may be presented as the invoice total. See TRANSPORT above.
       */
      transportKnown: boolean
    }
  /**
   * The booking already has an invoice. `createInvoice` refuses a second one
   * (R-03), so the modal shows this one instead of offering a create that would
   * be turned down after the operator committed to it.
   */
  | {
      kind: 'already-invoiced'
      bookingNo: string
      clientName: string
      existing: ExistingInvoiceSummary
    }
  /**
   * No invoice can be raised, and the sentence says why. Every one of these is a
   * refusal `createInvoice` would itself make — reached here first, before the
   * operator presses anything.
   */
  | { kind: 'refused'; bookingNo: string; reason: string }

interface RawBookingRow {
  id: string
  booking_no: string
  client_id: string
  stage: string
  cancelled_at: string | null
  clients: { name: string } | null
}

interface RawLineRow {
  client_uuid: string
  line_type: string
  description: string | null
  qty: number | null
  days: number | null
  rate: number | string | null
  discount_amount: number | string | null
  sort_order: number | null
  voided_at: string | null
}

interface RawCrewRow {
  client_uuid: string
  name: string | null
  crew_role: string | null
  day_rate: number | string | null
  days: number | string | null
  overtime: number | string | null
  accommodation: number | string | null
  meals: number | string | null
  voided_at: string | null
}

interface RawTransportRow {
  client_uuid: string
  vehicle: string | null
  delivery_charge: number | string | null
  fuel_charge: number | string | null
}

interface RawExistingInvoiceRow {
  id: string
  invoice_no: string | null
  status: string
  voided_at: string | null
  total_amount: number | string | null
  paid_amount: number | string | null
  outstanding_amount: number | string | null
  due_date: string
}

/** numeric RUPEES (postgrest-js may hand it back as a string) → paisa. */
const toPaisa = (v: number | string | null | undefined): Paisa => Math.round(Number(v ?? 0) * 100) as Paisa

/**
 * `date` arithmetic in UTC — Law 7 stores AD in UTC and renders BS. Copied from
 * `createInvoice.dueDateFrom` so the date the preview shows is the date the
 * action writes.
 */
function dueDateFrom(issuedAd: Date, termDays: number): string {
  const due = new Date(issuedAd.getTime())
  due.setUTCDate(due.getUTCDate() + termDays)
  return due.toISOString().slice(0, 10)
}

/**
 * Build the bill `createInvoice` would raise for `bookingNo`, or the reason it
 * would not raise one.
 *
 * Throws only on a genuine read failure, carrying the database's own message —
 * a screen must be able to tell "the query broke" from "this booking cannot be
 * invoiced", and the previous generation of finance screens could not.
 *
 * `now` is injectable so the due date a test asserts is not the clock's.
 */
export async function previewInvoiceForBooking(
  bookingNo: string,
  /**
   * The signed-in role, used for exactly one thing: deciding whether an empty
   * transport read means "no transport" or "you may not see it". `null` is
   * treated as the cautious answer.
   *
   * It is NOT a permission check — nothing here is gated on it, and the modal's
   * own mount already carries `rbac.canIssueInvoice`. It is a statement about
   * how much of the answer this session was able to read.
   */
  role: SystemRole | null = null,
  now: Date = new Date(),
): Promise<InvoicePreview> {
  const ref = bookingNo.trim()
  if (ref === '') {
    return { kind: 'refused', bookingNo: ref, reason: 'Name the booking to be invoiced.' }
  }

  /* ── The booking, its client and its stage ─────────────────────────────── */
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_no, client_id, stage, cancelled_at, clients ( name )')
    .eq('booking_no', ref)
    .maybeSingle()

  if (bookingError) {
    throw new Error(`Could not look up booking ${ref}: ${bookingError.message}`)
  }
  if (!bookingData) {
    return {
      kind: 'refused',
      bookingNo: ref,
      reason: `No booking numbered ${ref} exists, so there is nothing to invoice.`,
    }
  }

  const booking = bookingData as unknown as RawBookingRow
  // Both parents are NOT NULL + FK, so a missing join is a query bug rather than
  // a data state — say so instead of printing a dash that hides it, exactly as
  // `queries/finance.ts` does.
  const clientName = booking.clients?.name ?? '(client not joined)'

  /*
   * A cancelled booking is not invoiced from here — the same refusal, in the
   * same words, that `createInvoice.resolveInvoiceTarget` makes. Whether a
   * cancelled booking may still be settled is PLAN.md §4.16 and is not decided
   * by a preview screen.
   */
  if (booking.cancelled_at !== null) {
    return {
      kind: 'refused',
      bookingNo: ref,
      reason:
        `${booking.booking_no} was cancelled on ${booking.cancelled_at}. Whether a cancellation carries a fee is ` +
        'an open ruling (PLAN.md §4.16), so no invoice can be raised for it.',
    }
  }

  /* ── R-03 · one invoice per rental, checked before anything is offered ──── */
  const { data: existingRows, error: existingError } = await supabase
    .from('invoices')
    .select('id, invoice_no, status, voided_at, total_amount, paid_amount, outstanding_amount, due_date')
    .eq('booking_id', booking.id)

  if (existingError) {
    throw new Error(`Could not check whether ${ref} is already invoiced: ${existingError.message}`)
  }

  const prior = ((existingRows ?? []) as unknown as RawExistingInvoiceRow[])[0]
  if (prior) {
    /*
     * Mirrors `createInvoice`'s precondition exactly, INCLUDING its strictness:
     * the action refuses on ANY existing invoice, a voided one included, because
     * its line keys are the booking lines' own `client_uuid`s and a second
     * invoice would collide on `invoice_lines_client_uuid_key`. Offering a
     * create the action will refuse is the shape this rewrite exists to remove,
     * so the preview refuses on the same set rather than a friendlier one.
     */
    return {
      kind: 'already-invoiced',
      bookingNo: booking.booking_no,
      clientName,
      existing: {
        id: prior.id,
        invoiceNo: prior.invoice_no,
        status: prior.status,
        isVoid: prior.voided_at !== null,
        totalPaisa: toPaisa(prior.total_amount),
        paidPaisa: toPaisa(prior.paid_amount),
        outstandingPaisa: toPaisa(prior.outstanding_amount),
        dueDateAd: prior.due_date,
      },
    }
  }

  /* ── The payment terms, which set the due date ──────────────────────────── */
  const { data: clientRow, error: clientError } = await supabase
    .from('clients_v')
    .select('id, payment_terms')
    .eq('id', booking.client_id)
    .maybeSingle()

  if (clientError) {
    throw new Error(`Could not read the payment terms for ${ref}: ${clientError.message}`)
  }
  // NOT NULL DEFAULT 'Immediate' — a missing value means the read was masked,
  // not that the client has no terms. Immediate is the safe direction: due
  // today, which is visible and correctable, rather than 30 days of credit
  // nobody agreed to. Same reasoning as `createInvoice`.
  const paymentTerms = (clientRow as unknown as { payment_terms?: string } | null)?.payment_terms ?? 'Immediate'

  /* ── Equipment, bundles, accessories, services, sub-rentals ─────────────── */
  const { data: lineRows, error: linesError } = await supabase
    .from('booking_lines_v')
    .select('client_uuid, line_type, description, qty, days, rate, discount_amount, sort_order, voided_at')
    .eq('booking_id', booking.id)
    .order('sort_order', { ascending: true })

  if (linesError) {
    throw new Error(`Could not read the lines of ${ref}: ${linesError.message}`)
  }

  const liveLines = ((lineRows ?? []) as unknown as RawLineRow[]).filter((l) => l.voided_at === null)

  /*
   * Law 6 — a masked rate arrives as `null`, never as 0. Refuse rather than
   * showing a bill short by whatever this session cannot see. Unreachable for
   * the four roles `invoice.create` admits, and kept because the view is what
   * decides that, not this module.
   *
   * ⚠ Tested on `rate` ALONE, deliberately. `0019:153` masks `rate` and
   * `discount_amount` in the same view definition for the same four roles, so
   * `rate === null` is the sufficient test for "this session is money-blind" —
   * and `discount_amount` cannot be tested here, because the mock corpus omits
   * that column entirely (`lib/mock/corpus.ts` builds `booking_lines` without
   * it) and the mimic returns `null` for any column a row does not carry. A
   * null discount is therefore read as Rs 0, exactly as `createInvoice` reads
   * it (`Number(l.discount_amount ?? 0)`), so the preview and the write agree.
   */
  if (liveLines.some((l) => l.rate === null)) {
    return {
      kind: 'refused',
      bookingNo: ref,
      reason:
        `The rates on ${booking.booking_no} are not visible to this account, so the invoice cannot be previewed. ` +
        'Raising it would bill a total this screen cannot verify. Ask an Owner, Admin, Manager or Accounts user to raise it.',
    }
  }

  const equipmentLines: InvoicePreviewLine[] = liveLines.map((l, i) => {
    const qty = Math.max(1, Number(l.qty))
    const days = Math.max(1, Number(l.days))
    const rate = Number(l.rate)
    const discount = Number(l.discount_amount ?? 0)
    return {
      key: l.client_uuid,
      kind: LINE_KIND_BY_TYPE[l.line_type] ?? 'Equipment Rental',
      // `booking_lines.description` is nullable and `invoice_lines.description`
      // is NOT NULL. The line type is the fallback the action uses — it says
      // what the charge is for without inventing a product name nobody typed.
      description: l.description?.trim() || l.line_type,
      qty,
      days,
      ratePaisa: rupees(rate),
      discountPaisa: rupees(discount),
      netPaisa: rupees(Math.max(0, qty * days * rate - discount)),
      sortOrder: l.sort_order ?? i,
    }
  })

  /* ── Crew — `booking_crew_lines_v`, a different table from the lines ────── */
  const { data: crewRows, error: crewError } = await supabase
    .from('booking_crew_lines_v')
    .select('client_uuid, name, crew_role, day_rate, days, overtime, accommodation, meals, voided_at')
    .eq('booking_id', booking.id)

  if (crewError) {
    throw new Error(`Could not read the crew lines of ${ref}: ${crewError.message}`)
  }

  const crewLines: InvoicePreviewLine[] = ((crewRows ?? []) as unknown as RawCrewRow[])
    .filter((c) => c.voided_at === null)
    .map((c, i) => {
      const days = Math.max(1, Number(c.days))
      // Overtime, accommodation and meals are per-engagement totals, not per
      // day, so the action folds them into the unit rate to keep
      // qty × days × rate equal to the crew member's true cost. Mirrored.
      const extras = Number(c.overtime ?? 0) + Number(c.accommodation ?? 0) + Number(c.meals ?? 0)
      const rate = Number(c.day_rate) + extras / days
      return {
        key: c.client_uuid,
        kind: 'Crew Charges' as LineKind,
        description: [c.name, c.crew_role].filter(Boolean).join(' - ') || 'Crew',
        qty: 1,
        days,
        ratePaisa: rupees(rate),
        discountPaisa: rupees(0),
        netPaisa: rupees(Math.max(0, days * rate)),
        sortOrder: 1000 + i,
      }
    })

  /* ── Transport — readable by five roles, two of which may not invoice ───── */
  const transportKnown = role !== null && TRANSPORT_VISIBLE_ROLES.includes(role)
  const { data: transportRows, error: transportError } = await supabase
    .from('booking_transport_v')
    .select('client_uuid, vehicle, delivery_charge, fuel_charge')
    .eq('booking_id', booking.id)

  if (transportError) {
    throw new Error(`Could not read the transport of ${ref}: ${transportError.message}`)
  }

  const transportLines: InvoicePreviewLine[] = ((transportRows ?? []) as unknown as RawTransportRow[])
    .map((t, i) => {
      const rate = Number(t.delivery_charge ?? 0) + Number(t.fuel_charge ?? 0)
      return {
        key: t.client_uuid,
        kind: 'Transport' as LineKind,
        description: t.vehicle ? `Transport - ${t.vehicle}` : 'Transport',
        qty: 1,
        days: 1,
        ratePaisa: rupees(rate),
        discountPaisa: rupees(0),
        netPaisa: rupees(rate),
        sortOrder: 2000 + i,
      }
    })
    // A transport row carrying no charge is a logistics record, not a bill line.
    .filter((t) => t.netPaisa > 0)

  const lines = [...equipmentLines, ...crewLines, ...transportLines]

  if (lines.length === 0) {
    /*
     * "Nothing to bill" and "nothing this session can SEE to bill" are different
     * answers, and only one of them is a reason to send the operator back to the
     * booking. A delivery-only job read by a Manager lands here with an empty
     * list and a transport read that was never allowed to return anything — the
     * invoice would bill it correctly, so refusing with "add the lines first"
     * would send them to fix a booking that is already right.
     */
    return {
      kind: 'refused',
      bookingNo: booking.booking_no,
      reason: transportKnown
        ? `${booking.booking_no} has no billable lines, so an invoice would bill nothing and keep zero totals ` +
          'permanently. Add the lines to the booking first.'
        : `${booking.booking_no} has no equipment or crew lines, and transport is not readable by your role — so ` +
          'this screen cannot tell whether there is anything to bill. The invoice itself would bill any transport ' +
          'correctly. Ask an Owner, Admin or Coordinator to check the booking before raising it.',
    }
  }

  /* ── The booking's discount — R-17, a percentage and never an amount ────── */
  const { data: discountRow, error: discountError } = await supabase
    .from('booking_discounts')
    .select('percent, discount_source')
    .eq('booking_id', booking.id)
    .maybeSingle()

  if (discountError) {
    throw new Error(`Could not read the discount on ${ref}: ${discountError.message}`)
  }
  const discountPercent = Number((discountRow as unknown as { percent?: number } | null)?.percent ?? 0)

  /*
   * The engine's buckets. Assigned from `line_kind` — the same value the action
   * writes to `invoice_lines.line_kind` — so the preview's engine input and the
   * invoice's rows partition the money identically.
   */
  const buckets: InvoicePreviewBuckets = {
    equipment: rupees(0),
    subRental: rupees(0),
    services: rupees(0),
    crew: rupees(0),
    transport: rupees(0),
  }
  for (const line of lines) {
    switch (line.kind) {
      case 'Sub-Rental':
        buckets.subRental = (buckets.subRental + line.netPaisa) as Paisa
        break
      case 'Services':
        buckets.services = (buckets.services + line.netPaisa) as Paisa
        break
      case 'Crew Charges':
        buckets.crew = (buckets.crew + line.netPaisa) as Paisa
        break
      case 'Transport':
        buckets.transport = (buckets.transport + line.netPaisa) as Paisa
        break
      default:
        buckets.equipment = (buckets.equipment + line.netPaisa) as Paisa
    }
  }

  return {
    kind: 'preview',
    bookingNo: booking.booking_no,
    bookingId: booking.id,
    clientName,
    dueDateAd: dueDateFrom(now, TERM_DAYS[paymentTerms] ?? 0),
    paymentTerms,
    discountPercent,
    lines,
    buckets,
    transportKnown,
  }
}
