import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney, price } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { getSetting } from '../../../lib/settingsStore'

/*
 * ── This modal does not mint an invoice number, and must not ───────────────
 *
 * Two earlier shapes stood here and both were wrong:
 *
 *   1. `INV-2026-${Math.floor(1000 + Math.random() * 9000)}` — a random figure
 *      with a hardcoded prefix and a year segment the 12 Aug ruling retired.
 *   2. `issue('INV', ++mintedCounter)` against a module-scope counter seeded
 *      from `data/numbering.ts`. Better-shaped, still client-side: two browser
 *      tabs both start at 492 and both mint `INV-493`, and a reload restarts
 *      the counter, so the same number is issued twice.
 *
 * **Numbering belongs to the database, and the path already exists.**
 * `next_document_number(p_sequence_key text)` — `0007_admin_security.sql:359`,
 * rewritten by `0055_ruled_identifier_formats.sql:104` — takes a row lock
 * (`select … for update`) and increments under it, which is the only way two
 * concurrent invoices cannot collide. It is not theoretical: `recordPayment.ts`
 * (~308) and `createClient.ts` (~338) both call it by RPC for `payment_no` and
 * `client_code`, and this modal must do the same the day an invoice write
 * exists.
 *
 * A client-side prediction is not merely risky here, it is **known wrong**.
 * `number_sequences.current_value` for `'invoice'` is seeded at **0**
 * (`0012_seed_data.sql:24`), so the first number the database hands out is
 * `INV-1`. `data/numbering.ts`'s INV counter is 492 — the figure printed on the
 * Settings ▸ Numbering *render*, not the database's counter — so the modal
 * would tell an operator `INV-493` while the ledger issues `INV-1`. The
 * operator then puts `INV-493` on a payment reference that nothing will ever
 * match. (0055 is written and **not applied**; until it is, the function still
 * year-formats invoices, so today's real answer would be `INV-2026-0001`.
 * Three different strings — the exact reason a screen may not guess one.)
 *
 * So the number is assigned on save, by whatever action eventually performs the
 * insert, and the form says so instead of displaying a fabricated one.
 */

interface LineItem {
  id: string
  desc: string
  /** **Rupees, as the operator types them.** `rupees()` converts at the boundary. */
  amount: number
}

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Called only when an invoice has genuinely been written. Nothing calls it
   * today — see `handleSubmit` — but the contract is stated in the shape the
   * write will hand back, so the seam does not have to be redesigned later.
   *
   * `id` is the number **the database assigned**, never one this screen chose.
   *
   * ⚠ Every money field is `Paisa`. It used to be `amount: string`, built as
   * `Rs ${grandTotal.toLocaleString('en-IN')}` and read back downstream with
   * `parseInt(inv.amount.replace(/[^0-9]/g, ''))`. That round trip multiplies a
   * fractional total by ten: `Rs 1,39,506.5` loses its decimal point and parses
   * as **13,95,065**. Money crosses this boundary as integer paisa and is
   * formatted only at render — `lib/money.ts` §2.3.
   */
  onSuccess: (invoice: {
    id: string
    client: string
    booking: string
    subtotalPaisa: Paisa
    vatPaisa: Paisa
    totalPaisa: Paisa
    due: string
    status: 'Sent' | 'Draft'
    lines: Array<{ desc: string; amountPaisa: Paisa }>
  }) => void
}

/*
 * `onSuccess` is deliberately NOT destructured: nothing in this file may call
 * it while no invoice write exists, and `noUnusedLocals` would flag a binding
 * that is only there to look wired. The prop stays on the interface —
 * `Finance.tsx` already passes a handler, and the contract above is the shape
 * the eventual write hands back — but the only honest number of call sites
 * today is zero. See `handleSubmit`.
 */
type InvoiceDraftStatus = 'Sent' | 'Draft'

export function CreateInvoiceModal({ isOpen, onClose }: CreateInvoiceModalProps) {
  const [client, setClient] = useState('')
  /*
   * ── Nothing on this form starts pre-filled ────────────────────────────────
   *
   * `booking` was `'B-720'` and `dueDate` was `'15 Aug 2026'`. Neither is data
   * this modal has: there is no booking picker behind that text box and no
   * terms rule behind that date, so both were figures the SCREEN chose,
   * displayed as though the operator had chosen them. `B-720` is a booking
   * number the form would have attached an invoice to for a client nobody
   * named, and the date would have gone stale into an invoice's payment terms.
   * Same defect class as the line items below.
   *
   * Both are required at submit, and that is a schema fact rather than a
   * product decision: `invoices.booking_id` is `uuid NOT NULL` and
   * `invoices.due_date` is `date NOT NULL` (`0006_finance.sql:73-80`), so an
   * invoice with neither cannot exist to be written.
   */
  const [booking, setBooking] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [includeVat, setIncludeVat] = useState(true)
  const [status, setStatus] = useState<InvoiceDraftStatus>('Sent')
  /*
   * ── The form opens with ONE EMPTY line, not two invented ones ─────────────
   *
   * What stood here:
   *
   *     { id: '1', desc: 'Camera Package Rental', amount: 150000 },
   *     { id: '2', desc: 'Grip & Lighting Gear',  amount: 35000  },
   *
   * Rs 1,85,000 of billing nobody entered, pre-typed onto a money form and
   * carried straight into the Grand Total panel below, which rendered
   * `Rs 2,09,050` (with VAT) the instant the modal opened. An operator who
   * filled in the client and pressed `Issue Invoice` would have billed that.
   * It is the same defect as the Rs 50,000 refund default and the Rs 5,000
   * payment: an invented figure on a money form, presented as real.
   *
   * **Empty, not derived.** Deriving the lines from the booking would be the
   * better answer and this modal genuinely cannot do it: `booking` is a free
   * text box holding a booking NUMBER, there is no lookup behind it, and
   * `booking_lines` is not read anywhere in this file. Inventing a derivation
   * would put a different fabrication where this one was.
   *
   * One blank row rather than zero: the row is where the operator types, and
   * `handleRemoveLine` keeps at least one so the form can never become a
   * dead-end with no input and no "+ Add Item" target. It holds no description
   * and no amount, so it contributes nothing to the total and the submit guard
   * refuses it — an empty row is not a line item.
   */
  const [lines, setLines] = useState<LineItem[]>([{ id: '1', desc: '', amount: 0 }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddLine = () => {
    setLines((prev) => [...prev, { id: Date.now().toString(), desc: '', amount: 0 }])
  }

  const handleRemoveLine = (id: string) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)))
  }

  /**
   * `val` is always `e.target.value`, i.e. a string — it was typed `any`, which
   * is what let the amount branch put `NaN` into state unchecked.
   *
   * ⚠ That was not theoretical. `Number('')` is 0, but `Number('1e')`,
   * `Number('-')` and `Number('1.2.3')` are all `NaN`, and a `NaN` amount
   * propagates: `rupees(NaN)` is `NaN`, so `price()` returns a `NaN` subtotal,
   * `formatMoney` renders **"Rs NaN"** in the totals panel, and — the part that
   * matters — `NaN <= 0` is `false`, so the "total must be greater than 0"
   * guard below would have let it through. Non-finite input lands as 0, the
   * same coercion `RecordPaymentModal.tsx` ~295-301 does at its own field.
   */
  const handleLineChange = (id: string, field: 'desc' | 'amount', val: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        if (field === 'amount') {
          const next = Number(val)
          return { ...l, amount: Number.isFinite(next) ? next : 0 }
        }
        return { ...l, desc: val }
      }),
    )
  }

  /*
   * ── The VAT rate is configuration, read from Settings ▸ Finance ───────────
   *
   * This was `Math.round(taxableSubtotal * 0.13)`: a rate typed into a page and
   * a rounding rule invented beside it. `lib/money.ts:94` states the rule on
   * `PriceInput.vatPercent` itself — *"from Settings ▸ Finance, never
   * hardcoded"* — and `PLAN.md` §0 says pages never implement business logic.
   * A rate change in Settings then moved every other screen and left this one
   * billing 13%, silently, on real invoices.
   *
   * `lib/settingsStore.ts` is that Settings ▸ Finance: `vatRatePercent`, a
   * **percent** (13, not 0.13), validated 0-100 on both write and read, so a
   * hand-edited or stale value falls back to the spec default rather than
   * reaching an invoice. No `TODO(decision)` is needed — the configured source
   * genuinely exists.
   *
   * Re-read whenever the modal opens, so a rate changed mid-session applies to
   * the next invoice drafted and not to one already half-typed.
   */
  const [vatRatePercent, setVatRatePercent] = useState(() => Number(getSetting('vatRatePercent')))
  useEffect(() => {
    if (isOpen) setVatRatePercent(Number(getSetting('vatRatePercent')))
  }, [isOpen])

  /*
   * ── The engine computes the totals; this page does not ────────────────────
   *
   * `price()` owns §2.1's order and §2.4's half-up-at-each-step rounding, and
   * its reference case is asserted at module load. Summing per-line *paisa* —
   * rather than summing rupees and converting once — is what keeps a line typed
   * as `1234.567` from drifting: each line is rounded to paisa exactly where
   * the operator's figure enters the system.
   *
   * `discountPercent: 0` is not a placeholder. The booking-level discount lives
   * in `booking_discounts` (0002:575) and is entered against the booking, with
   * its own cap, reason and approver enforced as table CHECKs. This form offers
   * no discount control, so there is no discount — writing 0 states that, and
   * inventing a field here would route round those CHECKs.
   *
   * `payments: 0` likewise: an invoice being raised has had nothing paid
   * against it yet. `outstanding` is therefore the total, and is not displayed.
   */
  const totals = useMemo(
    () =>
      price({
        equipment: lines.reduce((sum, l) => sum + rupees(l.amount || 0), 0) as Paisa,
        discountPercent: 0,
        vatPercent: includeVat ? vatRatePercent : 0,
        payments: rupees(0),
      }),
    [lines, includeVat, vatRatePercent],
  )

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!client.trim()) {
      setError('Client name is required.')
      return
    }
    /*
     * `invoices.booking_id` is `uuid NOT NULL` and `invoices.due_date` is
     * `date NOT NULL` (0006:73, :80). Both boxes used to open with a value the
     * screen invented, so neither was ever empty and neither was ever checked.
     */
    if (!booking.trim()) {
      setError('Name the booking this invoice bills. An invoice always belongs to a booking.')
      return
    }
    if (!dueDate.trim()) {
      setError('A due date is required — it is the invoice’s payment term, not an optional note.')
      return
    }

    /*
     * ── An invoice is its lines, so the lines are checked before the total ───
     *
     * Only `totals.rentalTotal <= 0` stood here, and while the form opened with
     * two invented lines it could not fail: the fabrication satisfied the one
     * guard that existed. With the rows empty it does fail — but "Invoice total
     * must be greater than 0" describes a symptom, and the operator has to work
     * out which of five rows is the problem.
     *
     * The three checks below are ordered so the most specific one speaks first:
     *
     *  1. **No rows at all.** Unreachable today by construction —
     *     `handleRemoveLine` refuses to drop the last row and there is no other
     *     path that empties the array — and kept anyway, because it is the one
     *     the brief names and because a later change to that helper would
     *     otherwise re-open a silent Rs 0 invoice. Cheap, and it does not
     *     pretend to be load-bearing.
     *  2. **An incomplete row**, named by its position. A row with an amount and
     *     no description is an unexplained charge on a client's bill; a row with
     *     a description and no amount is a line the total silently ignores.
     *     Neither is a line item, and neither is silently dropped — dropping a
     *     row the operator typed into would be this screen editing the invoice.
     *     `Number.isFinite` is repeated here even though `handleLineChange`
     *     coerces, because state can also arrive from the initialiser.
     *  3. **The total**, kept as the backstop it always was.
     *
     * A negative amount fails (2) rather than being accepted as a credit line.
     * That is not a new rule: a reduction on a booking is a discount, it lives
     * in `booking_discounts` with its own cap, reason and approver enforced as
     * table CHECKs, and this form deliberately offers no discount control — see
     * the `discountPercent: 0` note on `totals` below.
     */
    if (lines.length === 0) {
      setError('An invoice needs at least one line item. Add the work or equipment being billed.')
      return
    }
    const incomplete = lines.findIndex(
      (l) => !l.desc.trim() || !Number.isFinite(l.amount) || l.amount <= 0,
    )
    if (incomplete !== -1) {
      setError(
        `Line ${incomplete + 1} is incomplete — every line item needs a description and an amount greater than 0. ` +
          'Fill it in or remove the row; an empty row is not billed and a nameless amount is an unexplained charge.',
      )
      return
    }
    if (totals.rentalTotal <= 0) {
      setError('Invoice total must be greater than 0.')
      return
    }

    setIsSubmitting(true)

    /*
     * ── Nothing writes an invoice, so this refuses rather than pretending ────
     *
     * What stood here: mint a number, `DomainEvents.emit(INVOICE_CREATED)`,
     * `onSuccess(...)`, `onClose()`. No action dispatched — so no `implemented`
     * gate, no permission check and no identity — and yet the modal closed and
     * handed the caller a fully-formed invoice object. That is the
     * success-fabrication `actions/core.ts` was rebuilt to make impossible:
     * *"A UI that reports success for work it did not do is worse than one that
     * is visibly unbuilt."* The screen-level emit compounded it by announcing
     * `invoice.created` for an invoice that does not exist — and events follow
     * the write, emitted by the dispatcher after `execute` returns, never by a
     * page ahead of it.
     *
     * ⚠ STALE AS OF 5 SEP 2026 — the two blockers this comment named are BOTH
     * resolved, and the one that remains is different from either:
     *
     *   · `src/actions/finance/createInvoice.ts` now exists and is implemented,
     *     taking its number from `next_document_number('invoice')` exactly as
     *     described below.
     *   · `invoice.create` IS mapped — `actions/core.ts:231` routes it to
     *     `canIssueInvoice` (R-05: Owner · Admin · Manager · Accounts).
     *
     * What actually blocks the wiring now is a PRODUCT question, not plumbing:
     * **this form collects hand-typed lines, and `createInvoice` derives its
     * lines from the booking** (`booking_lines` plus crew and transport, which is
     * what R-03 requires when damage and late fees append to the Draft). Calling
     * the action from here today would silently discard every row the operator
     * typed and bill something else instead — which is the same
     * success-fabrication this comment was written to prevent, wearing different
     * clothes.
     *
     * So the refusal stays until someone rules whether raising an invoice bills
     * THE BOOKING (and this form becomes a read-only preview of its lines) or
     * bills WHAT THE OPERATOR TYPED (and the action grows an explicit lines
     * input). Filed as `PLAN.md` §4.46. Do not wire this without that answer.
     *
     * So the refusal is stated inline and persistently (Law 12 — and
     * `useToast()` exposes only `showSuccessToast`, which is the wrong shape for
     * this by definition). The modal deliberately does NOT close and does NOT
     * clear the form: everything the operator typed is still on screen to copy
     * out or correct.
     *
     * TODO(decision) — one thing is now needed before this can be wired, and it
     * is not this screen's to rule (`PLAN.md` §4.46): whether an invoice bills the BOOKING's lines
     * (crew and transport included) or the lines typed on this form. See the
     * note above; the write and the capability both exist already.
     */
    setError(
      'Invoice creation is not connected to the database, so nothing was saved. No invoice number was issued and no ' +
        'client has been billed — the number is assigned on save, by the database, not by this form. Everything you ' +
        'typed is still here; report this rather than retrying.',
    )
    setIsSubmitting(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Invoice"
      subtitle="Generate an official VAT/PAN invoice for a booking."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Issue Invoice'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              /*
                ⛔ Was `var(--danger-bg, #fee2e2)` / `var(--danger-text, #991b1b)`.
                The same correction landed on the three rentals modals
                (AssignCrewModal, CreateSubRentalModal, ExtendRentalModal) in an
                earlier pass; these three were missed by it and kept the hexes.

                Two things were wrong. A raw hex in a component is a §3
                violation on its own ("screens use var(--…), never a literal").
                And the pair is a LIGHT-theme pink: when the fallback fired it
                stayed pink in dark mode, where the status pair resolves to a
                deep `#4b1515`-family red instead.

                `--danger-bg` exists again as of the v4.1 repaint, so the
                fallbacks are now dead rather than active — but a dead fallback
                carrying the wrong colour is a trap for whoever next removes an
                alias. Using the status pair directly removes the question.
              */
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Client Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Manaslu Motion Pictures Pvt. Ltd."
              value={client}
              onChange={(e) => setClient(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Associated Booking Ref <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {/* A placeholder, not a value: the box no longer opens holding
                `B-720`, a booking this screen had no reason to pick. */}
            <input
              type="text"
              placeholder="Booking number"
              value={booking}
              onChange={(e) => setBooking(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Due Date <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {/* A format hint, not a date. It opened holding `15 Aug 2026` — a
                payment term the screen chose, which would also have gone stale
                silently as the date passed. */}
            <input
              type="text"
              placeholder="dd Mmm yyyy"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Initial Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceDraftStatus)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            >
              <option value="Sent">Sent</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              Line Items Breakdown
            </label>
            <button
              type="button"
              onClick={handleAddLine}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--nav-active-accent)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Item
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={line.id} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={`Item #${idx + 1} Description`}
                value={line.desc}
                onChange={(e) => handleLineChange(line.id, 'desc', e.target.value)}
                style={{
                  flex: 1,
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                }}
              />
              <input
                type="number"
                min={0}
                placeholder="Amount (Rs)"
                value={line.amount || ''}
                onChange={(e) => handleLineChange(line.id, 'amount', e.target.value)}
                style={{
                  width: 130,
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                }}
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove line ${idx + 1}`}
                  onClick={() => handleRemoveLine(line.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 'var(--t-meta)',
          }}
        >
          {/* Every figure below is `price()`'s own output, already in paisa —
              never re-derived here, and never re-rounded. `rupees()` no longer
              appears in this panel: it used to wrap page-computed rupee
              subtotals, which is what let a local VAT rule and a local rounding
              rule exist at all. */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pre-VAT Subtotal:</span>
            <span style={{ fontWeight: 600 }}>{formatMoney(totals.subtotal)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeVat}
                onChange={(e) => setIncludeVat(e.target.checked)}
              />
              {/* The label states the configured rate. It read "Include 13% IRD
                  VAT" beside a hardcoded 0.13, so raising the rate in Settings
                  would have left the checkbox still promising 13% while the
                  engine charged something else. */}
              Include {vatRatePercent}% IRD VAT
            </label>
            <span style={{ color: 'var(--muted)' }}>{formatMoney(totals.vat)}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
              fontWeight: 700,
              fontSize: 'var(--t-body)',
            }}
          >
            <span>Grand Total:</span>
            <span style={{ color: 'var(--nav-active-accent)' }}>{formatMoney(totals.rentalTotal)}</span>
          </div>

          {/* The number, stated as an open question rather than guessed. See the
              header: a client-side prediction here is known to disagree with
              `next_document_number('invoice')`, and the operator would be the
              one to discover it, on a payment reference. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
              color: 'var(--muted)',
            }}
          >
            <span>Invoice number:</span>
            <span>Assigned by the database on save</span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
