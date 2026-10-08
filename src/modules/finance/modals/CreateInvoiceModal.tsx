import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { BsAdDate } from '../../../components/ui/BsAdDate'
import { Unavailable } from '../../../components/ui/Unavailable'
import { useToast } from '../../../components/ui/Toast'
import { formatMoney, price, rupees } from '../../../lib/money'
import { getSetting } from '../../../lib/settingsStore'
import { previewInvoiceForBooking } from '../../../lib/queries/invoicePreview'
import type { InvoicePreview } from '../../../lib/queries/invoicePreview'
import { createInvoice } from '../../../actions/finance/createInvoice'
import type { CreateInvoiceResult } from '../../../actions/finance/createInvoice'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { newClientUuid } from '../../../lib/supabase'

/*
 * ── This is a PREVIEW of the invoice `createInvoice` will write ────────────
 *
 * ## What stood here, and why it could not be wired
 *
 * A free-form line editor — client name, booking number, due date and a list of
 * hand-typed `{ description, amount }` rows — followed by a refusal that
 * dispatched nothing. The refusal was correct at the time and its reason was
 * exact: `createInvoice` **derives its lines from the booking**, so calling it
 * from that form would have silently discarded every row the operator typed and
 * billed something else. The question was filed as `PLAN.md` §4.46 — *does the
 * invoice bill the booking, or what the operator typed?*
 *
 * ## §4.46(a) follows from rulings that were already binding
 *
 * It is not a new product decision, which is why it can be settled here rather
 * than waited on. Three documents, none of them ambiguous:
 *
 *  · `RULINGS-2026-09-04.md` **R-03** — *"Append as lines to the **Draft**
 *    invoice. One invoice per rental (21 Jul ruling, unchanged)."* Damage and
 *    late fees append to lines produced by the return session; there is nothing
 *    for them to append to on a bill someone typed by hand at creation time.
 *  · `docs/SPEC-P0-1-INVOICING.md` **§3.1** — *"Then one `invoice_lines` row per
 *    `booking_lines` row"*, and *"**Lines are a snapshot, not a join.** The rate
 *    card is pinned per booking; the invoice must not silently re-price when a
 *    product's rate changes."*
 *  · `RULINGS-2026-09-04.md` **R-02** — the invoice is Draft for the whole
 *    rental and *"issued once, at return, when the final figure is known"*. A
 *    form filled in at creation cannot hold a figure that is not known yet; the
 *    booking can, because the return session writes back to it.
 *
 * So the free-form editor was never one of two ruled options. It was a third
 * shape both documents exclude. This screen therefore shows the operator the
 * bill that is about to be raised — the booking's own lines, at the booking's
 * own rates — and Confirm dispatches the action. Nothing on it is editable,
 * because nothing on an invoice raised this way is the screen's to choose.
 *
 * ## The number is still assigned elsewhere, and now it is not assigned at all
 *
 * The header this file used to carry argued at length that a client-side
 * `INV-…` is known-wrong and that numbering belongs to
 * `next_document_number('invoice')`. That argument stands and has been
 * strengthened by **R-15**: *"a Draft carries no `invoice_no`. It is minted by
 * `next_document_number('invoice')` at the moment of issue, inside the same
 * transaction."* `createInvoice` omits the column entirely, so this modal shows
 * "Minted when the invoice is issued" rather than any number at all.
 *
 * ## What this screen does NOT compute
 *
 * Nothing. `lib/queries/invoicePreview.ts` reads the lines (mirroring the
 * action's own reads, table for table) and `lib/money.ts`'s `price()` totals
 * them — PLAN.md §0, pages never implement business logic. The VAT rate is read
 * from Settings ▸ Finance, never hardcoded, and is re-read on every open so a
 * rate changed mid-session applies to the next invoice and not to one already
 * on screen.
 *
 * ⚠ The totals shown are the ENGINE's. The invoice's stored figures are the
 * database's, derived by `recalculate_invoice_totals()`, and the live trigger is
 * known to disagree with the engine by up to Rs 0.98 per invoice until
 * `0098_invoice_totals_match_engine` lands (SPEC-P0-1 §2.2). The panel says so
 * rather than presenting the preview as the receipt.
 */

export interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * The booking to bill, by its `B-…` number.
   *
   * Supplied by Booking Detail, which knows it. Omitted by Finance, whose
   * header launcher has no booking in hand — there the operator names one and
   * the preview loads against it. R-01 makes those the two entry points and
   * nothing else creates an invoice.
   */
  bookingNo?: string
  /**
   * Called once, after `createInvoice` has resolved — so it fires for an invoice
   * Postgres has confirmed, never for one this screen hoped for.
   *
   * The payload is the ACTION's own result, unchanged: `invoiceId` is the row's
   * uuid, `status` is always `'Draft'` (R-02), and there is no invoice number
   * because a Draft has none (R-15). Callers refetch; none of them may prepend
   * a row, because every finance list is read from the database and a row put on
   * screen by hand vanishes at the next read with no explanation.
   */
  onSuccess: (created: CreateInvoiceResult) => void
}

/** The label for an invoice that has not been issued and so carries no number. */
export const DRAFT_NO_NUMBER = 'Draft (no number)'

const fieldStyle = {
  minHeight: 'var(--tap)',
  padding: '0 12px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
} as const

const labelStyle = {
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--text)',
} as const

const panelStyle = {
  padding: 'var(--sp-md)',
  borderRadius: 'var(--r-btn)',
  background: 'var(--card2)',
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 'var(--t-meta)',
} as const

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-md)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function CreateInvoiceModal({ isOpen, onClose, bookingNo, onSuccess }: CreateInvoiceModalProps) {
  const { user } = useAuth()
  const isOnline = useNetwork()
  const { showSuccessToast } = useToast()

  /**
   * What the operator has typed into the booking box, and what the preview is
   * actually loaded against. They are separate on purpose: typing a booking
   * number must not fire a read per keystroke, so the reference is COMMITTED —
   * by the Load button, by Enter, or by the `bookingNo` prop when a caller
   * already knows it.
   */
  const [bookingRef, setBookingRef] = useState(bookingNo ?? '')
  const [committedRef, setCommittedRef] = useState(bookingNo ?? '')
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [loading, setLoading] = useState(false)
  /** `invoices.notes` — the one field on this form that is the operator's. */
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Law 12 — inline and persistent. There is no error toast and none is invented. */
  const [error, setError] = useState<string | null>(null)

  /*
   * The VAT rate is configuration, read from Settings ▸ Finance and pinned onto
   * the invoice at creation (SPEC-P0-1 §3.1). `lib/money.ts:94` states the rule
   * on `PriceInput.vatPercent` itself — "from Settings ▸ Finance, never
   * hardcoded" — and `lib/settingsStore` validates it 0-100 on both write and
   * read, so a hand-edited value falls back to the spec default rather than
   * reaching an invoice.
   */
  const [vatRatePercent, setVatRatePercent] = useState(() => Number(getSetting('vatRatePercent')))

  /**
   * **Law 8 — minted when the modal OPENS, not when Confirm is pressed.**
   *
   * The key belongs to the ATTEMPT, not to the press. A Confirm pressed again
   * after a dropped response must carry the SAME uuid so
   * `invoices_client_uuid_key` rejects the duplicate and the operator gets the
   * invoice the first attempt already wrote — a key minted per press raises two
   * invoices for one booking, and R-03 says a rental has one. Re-minted only
   * after a CONFIRMED success, so a screen that keeps this modal mounted across
   * two bookings cannot post the second under the first one's key.
   */
  const [clientUuid, setClientUuid] = useState<string>(() => newClientUuid())

  useEffect(() => {
    if (!isOpen) return
    setClientUuid(newClientUuid())
    setError(null)
    setNotes('')
    setVatRatePercent(Number(getSetting('vatRatePercent')))
    setBookingRef(bookingNo ?? '')
    setCommittedRef(bookingNo ?? '')
  }, [isOpen, bookingNo])

  /*
   * The preview read. Cancelled on close and on a change of booking so a slow
   * answer for one booking cannot land on another — a stale bill is the one
   * thing worse here than no bill.
   */
  useEffect(() => {
    if (!isOpen || committedRef.trim() === '') {
      setPreview(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setPreview(null)
    // The role is passed for ONE reason: `booking_transport_v` excludes Manager
    // and Accounts, so an empty transport read means different things to
    // different sessions. It is not a permission check — the mount already
    // carries `rbac.canIssueInvoice`. See the module's TRANSPORT block.
    previewInvoiceForBooking(committedRef, user?.role ?? null)
      .then((p) => {
        if (cancelled) return
        setPreview(p)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(
          `${committedRef} could not be read, so nothing can be previewed and nothing was created: ` +
            (err instanceof Error ? err.message : String(err)),
        )
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, committedRef, user?.role])

  /*
   * The engine, once. Every figure in the totals panel is `price()`'s own
   * output, already in paisa — never re-derived here and never re-rounded.
   * `payments: 0` is a statement, not a placeholder: an invoice being raised has
   * had nothing paid against it, so Outstanding is the total and is not shown.
   */
  const totals = useMemo(() => {
    if (preview?.kind !== 'preview') return null
    return price({
      equipment: preview.buckets.equipment,
      subRental: preview.buckets.subRental,
      services: preview.buckets.services,
      crew: preview.buckets.crew,
      transport: preview.buckets.transport,
      discountPercent: preview.discountPercent,
      vatPercent: vatRatePercent,
      payments: rupees(0),
    })
  }, [preview, vatRatePercent])

  const commitRef = useCallback(() => {
    setError(null)
    setCommittedRef(bookingRef.trim())
  }, [bookingRef])

  const handleConfirm = useCallback(async () => {
    if (!preview || preview.kind !== 'preview') return

    /*
     * No session, no invoice. An invoice raised under an invented identity is
     * attributed to somebody who does not exist, and `invoices.created_by` is
     * the only record of who billed the client.
     */
    if (!user) {
      setError('You are not signed in, so this invoice cannot be attributed to anyone. Sign in and raise it again.')
      return
    }
    /*
     * Offline is refused here as well as inside the action, and the duplication
     * is the point: the dispatcher reports every denial as "Your role (Owner)
     * cannot perform CREATE_INVOICE", which would blame the role for a network
     * problem. The action's own guard is the backstop for any other caller.
     */
    if (!isOnline) {
      setError(
        'This device is offline. An invoice is not queued for later — its totals are computed by the database, so a ' +
          'queued one is a promise of an invoice rather than an invoice. Raise it once you are back online.',
      )
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const created = await createInvoice(
        {
          bookingNo: preview.bookingNo,
          vatPercent: vatRatePercent,
          clientUuid,
          // `exactOptionalPropertyTypes` — an absent note is an absent KEY, not
          // an explicit `undefined`.
          ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
        },
        { userId: user.id, role: user.role, isOnline },
      )

      // A new key for the next attempt. Only a completed write ends an attempt,
      // so this is re-minted here and not in `finally`, where a failed Confirm
      // would lose its own retry protection.
      setClientUuid(newClientUuid())

      /*
       * Law 12 — a toast for a success, and only after the action resolved. The
       * screen does NOT emit `invoice.created`: events follow the write and the
       * dispatcher emits them after `execute` returns, never a page ahead of it.
       */
      showSuccessToast(
        'Draft invoice created',
        `${created.bookingNo} — ${created.linesWritten} line${created.linesWritten === 1 ? '' : 's'}, ` +
          `${formatMoney(created.totalPaisa)}. It stays a Draft until it is issued at return, and takes its number then.`,
      )
      onSuccess(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The invoice could not be created.')
    } finally {
      setIsSubmitting(false)
    }
  }, [preview, user, isOnline, vatRatePercent, clientUuid, notes, showSuccessToast, onSuccess, onClose])

  /**
   * Why Confirm is not offered, when it is not. Every branch returns a sentence
   * an operator can act on — the `Unavailable` pattern this codebase already
   * applies: grey it out, but say why, and say why on a touch device too.
   */
  const unavailableReason: string | null = (() => {
    if (committedRef.trim() === '') return 'Name the booking to be invoiced, then load it.'
    if (loading) return 'Reading the booking’s lines.'
    if (!preview) return 'The booking’s lines have not been read, so there is nothing to raise.'
    if (preview.kind === 'refused') return preview.reason
    if (preview.kind === 'already-invoiced') {
      return (
        `${preview.bookingNo} already has an invoice, and a rental has one. Damage and late fees append as ` +
        'lines to that Draft; a correction after issue is Void + Credit Note.'
      )
    }
    if (!user) return 'You are not signed in, so an invoice cannot be attributed to anyone.'
    if (!isOnline) return 'This device is offline, and an invoice’s totals are computed by the database.'
    return null
  })()

  const confirmButton = (
    <Button variant="primary" onClick={() => void handleConfirm()} disabled={isSubmitting || unavailableReason !== null}>
      {isSubmitting ? 'Creating…' : 'Create Draft Invoice'}
    </Button>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Invoice"
      subtitle="A Draft invoice for this booking’s own lines. Nothing is issued and no number is minted."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {unavailableReason === null ? (
            confirmButton
          ) : (
            <Unavailable reason={unavailableReason}>{confirmButton}</Unavailable>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              /* The status pair, never a raw hex and never a light-theme
                 fallback that stays pink in dark mode. */
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Which booking ───────────────────────────────────────────────── */}
        {bookingNo ? (
          <div style={panelStyle}>
            <Row label="Booking" value={bookingNo} strong />
            {preview && preview.kind !== 'refused' && <Row label="Client" value={preview.clientName} />}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle} htmlFor="create-invoice-booking">
              Booking <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
              <input
                id="create-invoice-booking"
                type="text"
                placeholder="Booking number"
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitRef()
                  }
                }}
                style={{ ...fieldStyle, flex: 1 }}
              />
              <Button variant="secondary" onClick={commitRef} disabled={bookingRef.trim() === '' || isSubmitting}>
                Load booking
              </Button>
            </div>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              An invoice bills a booking’s own lines, so the booking is the only thing this form asks for. Everything
              below is read from it.
            </span>
          </div>
        )}

        {loading && (
          <div style={{ ...panelStyle, color: 'var(--muted)' }}>Reading {committedRef}’s lines…</div>
        )}

        {/* ── Already invoiced — show that invoice, do not offer a second ─── */}
        {preview?.kind === 'already-invoiced' && (
          <div style={panelStyle}>
            <Row
              label="Existing invoice"
              value={preview.existing.invoiceNo ?? DRAFT_NO_NUMBER}
              strong
            />
            <Row label="Client" value={preview.clientName} />
            <Row label="Status" value={preview.existing.isVoid ? `${preview.existing.status} · voided` : preview.existing.status} />
            <Row label="Total" value={formatMoney(preview.existing.totalPaisa)} />
            <Row label="Received" value={formatMoney(preview.existing.paidPaisa)} />
            <Row label="Outstanding" value={formatMoney(preview.existing.outstandingPaisa)} strong />
            <Row label="Due" value={<BsAdDate date={preview.existing.dueDateAd} layout="inline" />} />
            <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>
              One invoice per rental. Damage and late fees append as lines to this Draft, and a correction after it is
              issued is a Void plus a Credit Note — never a second invoice.
            </p>
          </div>
        )}

        {/* ── Refused — the reason, inline and persistent ──────────────────── */}
        {preview?.kind === 'refused' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-warn-bg)',
              color: 'var(--st-warn-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {preview.reason}
          </div>
        )}

        {/* ── The preview itself ───────────────────────────────────────────── */}
        {preview?.kind === 'preview' && totals && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              <span style={{ ...labelStyle, fontWeight: 700 }}>
                What will be billed — {preview.lines.length} line{preview.lines.length === 1 ? '' : 's'} from{' '}
                {preview.bookingNo}
              </span>
              <DataTableShell ariaLabel="Invoice lines preview">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '4px 8px 4px 0', fontWeight: 600 }}>Line</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>Kind</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Days</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '4px 0 4px 8px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={line.key} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px 6px 0' }}>{line.description}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{line.kind}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{line.qty}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{line.days}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatMoney(line.ratePaisa)}</td>
                        <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(line.netPaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Read from the booking and copied onto the invoice as a snapshot — a later change to a product’s rate
                does not re-price this bill. Nothing here is editable from this screen: a charge is added by editing
                the booking, and damage and late fees append at return.
                {!preview.transportKnown && ' Transport lines are missing from this list because your role cannot read them.'}
              </span>
            </div>

            {/*
              ⚠ When transport could not be read, NO figure here is the invoice's
              total, and none of them is labelled as though it were. Manager and
              Accounts are excluded by `booking_transport_v` (and by the base
              table's only SELECT policy) while R-05 lets both raise an invoice,
              so their transport read comes back empty whether or not the booking
              has any — and `create_invoice`, which is SECURITY DEFINER, bills it
              regardless. A total short by a delivery charge, presented as the
              total, is the confidently-wrong number this whole screen exists to
              stop. The invoice is still correct and can still be raised; it is
              this preview that is partial, and it says so.
            */}
            {!preview.transportKnown && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r-btn)',
                  background: 'var(--st-warn-bg)',
                  color: 'var(--st-warn-fg)',
                  fontSize: 'var(--t-meta)',
                }}
              >
                Transport charges are not readable by your role, so the figures below leave them out and none of them
                is the invoice total. The invoice itself will include any delivery and fuel charges on this booking.
                Raise it if the equipment and crew above are right, and check the total on Finance afterwards.
              </div>
            )}

            <div style={panelStyle}>
              <Row
                label={preview.transportKnown ? 'Pre-VAT subtotal' : 'Pre-VAT subtotal, transport excluded'}
                value={formatMoney(totals.subtotal)}
              />
              <Row
                label={`Booking discount (${preview.discountPercent}%)`}
                value={`− ${formatMoney(totals.discount)}`}
              />
              <Row label="Taxable" value={formatMoney(totals.taxable)} />
              <Row label={`IRD VAT (${vatRatePercent}%)`} value={formatMoney(totals.vat)} />
              <div style={{ paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <Row
                  label={preview.transportKnown ? 'Invoice total' : 'Total of what is shown — NOT the invoice total'}
                  value={formatMoney(totals.rentalTotal)}
                  strong
                />
              </div>
              <span style={{ color: 'var(--muted)' }}>
                Computed by the money engine. The invoice’s stored figures are the database’s, derived when the lines
                land, and the two can differ by up to a rupee until a pending totals alignment lands — so the saved
                invoice is read back from the ledger, never assumed from here.
              </span>
            </div>

            <div style={panelStyle}>
              <Row label="Status on creation" value="Draft" strong />
              <Row label="Invoice number" value="Minted when the invoice is issued" />
              <Row label="Payment terms" value={preview.paymentTerms} />
              <Row label="Due" value={<BsAdDate date={preview.dueDateAd} layout="inline" />} />
              <span style={{ color: 'var(--muted)' }}>
                An invoice is created as a Draft and stays a Draft for the whole rental, so damage and late fees can
                still be added to it. A Draft carries no number — it is minted at issue, so the numbering has no gap
                for a draft that was abandoned.
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle} htmlFor="create-invoice-notes">
                Notes (optional)
              </label>
              <textarea
                id="create-invoice-notes"
                rows={2}
                placeholder="Anything that belongs on the invoice itself…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  resize: 'vertical',
                }}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
