import { createAction, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import type { Paisa } from '../../lib/money'

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
 * ## This file is now a DISPATCHER, not a writer (DB-03 / DATA-01)
 *
 * It used to sequence the whole invoice from the browser: read the booking,
 * read `booking_lines`, `booking_crew_lines`, `booking_transport` and
 * `booking_discounts`, insert the header, then loop one `invoice_lines` insert
 * per line. Two defects killed that shape, and both were structural rather than
 * fixable in place:
 *
 * **DATA-01 — the money reads were refused for everybody.** `0062` revoked
 * table-level SELECT on `booking_lines` and `booking_transport` and granted
 * back only the non-money columns, so `rate`, `discount_amount`,
 * `delivery_charge` and `fuel_charge` are ungranted to every signed-in session.
 * Every user of this application is the same Postgres role, `authenticated`, so
 * *Owner included*: the first line read returned `42501`. The masking views are
 * the usual answer, but `booking_transport_v` and the base table's only SELECT
 * policy both admit Owner, Admin, Coordinator, Warehouse and Driver —
 * **Manager and Accounts are in neither**, and those are two of the four roles
 * R-05 names. Read through the views, a Manager's invoice would silently carry
 * no delivery and no fuel charge.
 *
 * **DB-03 — the write shape could not be made safe.** PostgREST gives a browser
 * no transaction, so a failure between the header and the last line left a
 * header with some of its lines. This file's own error text used to tell the
 * operator to *void it rather than retry*, which is an admission that the shape
 * was wrong: both close gates read `outstanding_amount`, so a header with no
 * lines reads as fully paid and a rental closes unbilled.
 *
 * Both are answered by `supabase/migrations/0096_create_invoice_rpc.sql`, which
 * puts the snapshot and both writes inside one server-side transaction that
 * reads the money columns where they live. This file now mints the Law 8 key's
 * payload, dispatches one `.rpc('create_invoice')`, and maps the refusal. It
 * names no money column at all, which is what makes DATA-01 unrepeatable here.
 *
 * ## Built to the 4 September rulings, not to the schema it found
 *
 * `RULINGS-2026-09-04.md` is binding and outranks PLAN.md (R-00). Three of its
 * rulings shape this path, and each contradicted the live database, so each
 * needed a migration to become possible at all:
 *
 * | Ruling | The RPC | Migration it needed |
 * |---|---|---|
 * | R-15 · a Draft carries no number | `invoice_no` and `issue_date` omitted entirely | `0086` — both were `NOT NULL` |
 * | R-05 · rights are Owner/Admin/Manager/Accounts | `invoice.create` → `canIssueInvoice`, and the same four checked server-side | `0086` — live said Coordinator, not Accounts |
 * | R-02 · Draft for the whole rental | `status: 'Draft'`, never a caller's choice | `0080` — the payment trigger flipped it |
 *
 * A fourth is invisible until you try it: **`invoice_lines` had no INSERT
 * policy at all**, so every line raised `42501` for every role including Owner.
 * `0086` adds it. **None of these migrations is applied** — PHASE-0-PLAN.md
 * Step 0 (live dump, restore test, token rotation) must land first, and
 * CLAUDE.md forbids applying without explicit approval regardless. Until they
 * do, this action fails loudly rather than writing something wrong, and the
 * `42883` branch below says which half is missing.
 *
 * ## R-01 · manual only
 *
 * Nothing generates an invoice at Confirm. The entry points are Finance ▸ Create
 * Invoice and Booking Detail ▸ Create Invoice, both operator-initiated.
 *
 * ## R-03 · one invoice per rental
 *
 * Enforced inside `create_invoice`, in the same transaction as the write, so it
 * cannot be raced by two operators pressing at once — which is exactly what a
 * client-side precondition could not promise. Damage and late fees **append as
 * lines to the existing Draft** (`addInvoiceLine`, SPEC-P0-1 §3.2), and
 * corrections after issue are Void + Credit Note (R-04) — never a second
 * invoice.
 *
 * ## TOTALS — owned by the database, deliberately
 *
 * `recalculate_invoice_totals()` fires on every `invoice_lines` write and
 * derives `subtotal` (as `sum(line_total)`), `discount_amount`,
 * `taxable_amount`, `vat_amount`, `total_amount` and `outstanding_amount`. The
 * RPC re-reads that row and returns it, so every figure below is what Postgres
 * computed rather than a second opinion formed in the browser — the exact
 * failure §4.42 tracks.
 *
 * ⚠ The live trigger rounds to 2 dp and hardcodes `0.13`, where `lib/money`
 * rounds to the whole rupee at each step (Rs 0.98 per invoice on the §2.8
 * reference case). Foundation rules the app's arithmetic canonical, so **the
 * trigger changes** — `0098_invoice_totals_match_engine`, SPEC-P0-1 §2.2. When
 * it lands, these figures follow it without a change here.
 *
 * ## R-17 · percentage discounts only
 *
 * The RPC reads `discount_percent` from `booking_discounts` and writes it to the
 * header. `discount_amount` is **derived** by the trigger and never written — a
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
  /**
   * **Law 8.** `true` when this call found an invoice already carrying the same
   * `clientUuid` and wrote nothing — the retry of a press that had in fact
   * landed. Optional because it is additive: a caller that does not distinguish
   * "created" from "you already did this" is still correct, it just says
   * "created" twice.
   */
  replayed?: boolean
}

/** numeric (which postgrest-js may hand back as a string) in RUPEES → paisa. */
const paisa = (v: number | string | null | undefined): Paisa => Math.round(Number(v ?? 0) * 100) as Paisa

/** The jsonb `create_invoice` returns. Every money field is a numeric in RUPEES. */
type CreateInvoiceRow = {
  invoice_id?: unknown
  invoice_no?: unknown
  status?: unknown
  booking_id?: unknown
  booking_no?: unknown
  client_id?: unknown
  due_date?: unknown
  line_count?: unknown
  subtotal?: unknown
  discount_amount?: unknown
  taxable_amount?: unknown
  vat_amount?: unknown
  total?: unknown
  replayed?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | string | null =>
  typeof v === 'number' || typeof v === 'string' ? v : null

export const createInvoice = createAction<CreateInvoiceInput, CreateInvoiceResult>({
  name: 'CREATE_INVOICE',
  permissions: ['invoice.create'],

  /**
   * `true` because `execute` dispatches `create_invoice`, which writes the
   * header and every line in one transaction, **verifies the function came back
   * with an id Postgres minted**, and returns the totals the trigger derived.
   * See the PERSISTENCE CHECK block.
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

    /*
     * The payload `0096` reads. It carries no line data at all: the RPC
     * snapshots the booking's own rows server-side, which is both the DATA-01
     * fix (the money never has to reach the browser to be written back) and the
     * SPEC-P0-1 §3.1 rule that the invoice bills the booking rather than
     * whatever was typed into a form.
     *
     * `p_payload` is the function's named parameter. Passing the payload
     * directly instead is refused with "client_uuid is required" — a real
     * confusion worth naming, because the message points at the wrong thing.
     */
    const { data, error } = await supabase.rpc('create_invoice', {
      p_payload: {
        client_uuid: input.clientUuid,
        created_by: ctx.userId,
        booking_no: bookingNo,
        // numeric(5,4) — a FRACTION, not a percentage. 13 → 0.1300.
        vat_rate: input.vatPercent / 100,
        notes: input.notes?.trim() || null,
      },
    })

    if (error) {
      const code = (error as { code?: string }).code
      const message = (error as { message?: string }).message ?? String(error)

      /*
       * The two "this backend is not ready" codes get a sentence naming which
       * migration is missing, because the raw Postgres text points at the
       * symptom rather than the cause and this path has three drafted
       * dependencies.
       */
      if (code === '42883') {
        throw new Error(
          `The invoice for ${bookingNo} was not created: create_invoice() does not exist on this backend. ` +
            '`0096_create_invoice_rpc.sql` is written but parked unapplied; the local store implements it. ' +
            `The database said: ${message}`,
        )
      }
      if (code === '23502' && message.includes('invoice_no')) {
        throw new Error(
          `The invoice for ${bookingNo} was not created: this database still requires an invoice number at ` +
            'creation. R-15 mints it at issue, and `0086_invoice_write_rights_and_draft_without_number.sql` ' +
            'is the migration that makes a Draft numberless. It is written but not applied.',
        )
      }
      if (code === '42501') {
        throw new Error(
          `The invoice for ${bookingNo} was not created: ${message} ` +
            '(If this names row-level security rather than a role, `0086` has not been applied and ' +
            '`invoice_lines` still has no write policy.)',
        )
      }

      throw new Error(`The invoice for ${bookingNo} could not be written, so treat it as not raised: ${message}`)
    }

    /* ── PERSISTENCE CHECK ────────────────────────────────────────────────────
     *
     * `create_invoice` returns the row it wrote. A null or shapeless answer
     * means something reported success having written nothing — the exact class
     * this action layer was rebuilt to stop reporting. `id` in particular is
     * filled by Postgres and by nothing else, so its presence is the evidence.
     */
    const row = (data ?? null) as CreateInvoiceRow | null
    if (!row || typeof row.invoice_id !== 'string') {
      throw new Error(
        `create_invoice returned no invoice for ${bookingNo}, so treat this as NOT created even though no error ` +
          `was raised. Received: ${JSON.stringify(data)}`,
      )
    }

    const invoiceId = row.invoice_id
    const replayed = row.replayed === true

    /*
     * R-02 — an invoice is created as a Draft and stays one for the whole
     * rental. The only way this is anything else is a REPLAY whose key was
     * reused after the invoice had been issued, months later; an already-issued
     * invoice is not something that can be "created", and returning it typed as
     * a Draft would be a lie the caller renders as one. Refused by name.
     */
    const status = str(row.status)
    if (status !== 'Draft') {
      throw new Error(
        `${bookingNo} already has an invoice and it is no longer a Draft (${status || 'unknown status'}). ` +
          'Corrections after issue are Void + Credit Note (R-04), never a second invoice. Nothing was created.',
      )
    }

    const linesWritten = Number(row.line_count ?? 0)
    const dueDateAd = str(row.due_date)

    const events = [
      {
        type: EVENT_TYPES.INVOICE_CREATED,
        payload: {
          invoiceId,
          // R-15 — a Draft has no number yet. Stated rather than omitted so a
          // subscriber cannot mistake `undefined` for a missing field.
          invoiceNo: null,
          status: 'Draft',
          bookingId: str(row.booking_id),
          bookingNo: str(row.booking_no) || bookingNo,
          clientId: str(row.client_id),
          totalPaisa: paisa(num(row.total)),
          dueDateAd,
          linesWritten,
          replayed,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        invoiceId,
        bookingId: str(row.booking_id),
        bookingNo: str(row.booking_no) || bookingNo,
        clientId: str(row.client_id),
        status: 'Draft' as const,
        dueDateAd,
        linesWritten,
        subtotalPaisa: paisa(num(row.subtotal)),
        discountPaisa: paisa(num(row.discount_amount)),
        taxablePaisa: paisa(num(row.taxable_amount)),
        vatPaisa: paisa(num(row.vat_amount)),
        totalPaisa: paisa(num(row.total)),
        replayed,
      },
      events,
    }
  },
})
