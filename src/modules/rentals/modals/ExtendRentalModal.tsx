import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { extendRental } from '../../../actions/rentals/extendRental'
import { useAuth } from '../../../lib/auth'

interface ExtendRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (extension: { days: number; extraAmountPaisa: Paisa; newReturnDate: string; reason: string }) => void
  bookingId: string
  client: string
  currentReturnDate?: string
}

export function ExtendRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  client,
  currentReturnDate,
}: ExtendRentalModalProps) {
  const { user } = useAuth()

  /*
   * ⛔ Was `useState<number>(2)` and `useState<number>(15000)`.
   *
   * Two literals multiplied together and rendered as "Additional Rental
   * Charge: Rs 30,000" — the same figure, on every booking, before the
   * operator typed anything. No rate table, no booking line and no Settings
   * value produced it.
   *
   * TODO(decision): where does an extension's daily rate come from — the
   * booking's own line rates (what the original days were priced at), or a
   * named extension rate in Settings ▸ Finance? This modal is handed only
   * `bookingId`, `client` and a return date, so it can derive neither, and
   * guessing one here would be inventing a product decision. Until it is
   * ruled and passed in, the field opens EMPTY and the operator types it.
   */
  const [days, setDays] = useState<number>(0)
  const [dailyRate, setDailyRate] = useState<number>(0)
  const [reason, setReason] = useState('')
  /*
   * ⛔ Was `useState(true)`. "Client has authorized the extension and
   * additional charges" arrived pre-ticked — the screen attesting on the
   * client's behalf to a conversation that may never have happened — and
   * `handleSubmit` never read it, so it was decoration sitting on top of a
   * false claim. It starts unticked, and the submit guard now requires it.
   */
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extraAmount = days * dailyRate

  /*
   * ⛔ `currentReturnDate` defaulted to the literal `'2026-08-12'`, and
   * `BookingDetail` — its only caller — does not pass it. So the subtitle read
   * "Current Return: 2026-08-12" for every booking in the system, and the
   * projection below counted the extension days from that invented date.
   *
   * No default now: `null` means "this dialog was not told", which the notice
   * and the submit guard both state. A projection is only offered when there
   * is a real date to project from.
   */
  const newReturnDateStr = ((): string | null => {
    if (!currentReturnDate || days <= 0) return null
    const base = new Date(currentReturnDate)
    if (Number.isNaN(base.getTime())) return null
    base.setDate(base.getDate() + days)
    return base.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  })()

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!Number.isFinite(days) || days <= 0) {
      setError('Extension days must be at least 1.')
      return
    }
    /*
     * The rate field opens empty (see the state initialiser), so this guard is
     * the only thing between an untouched form and a Rs 0 charge.
     * `Number.isFinite` is not decoration: `NaN <= 0` is `false`, so a
     * non-finite entry would slip past a bare `<= 0` and reach `rupees()`.
     */
    if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
      setError(
        'Enter the daily extension rate in rupees. This dialog is not given the booking’s own rate, so it cannot fill it in for you.',
      )
      return
    }
    if (!reason.trim()) {
      setError('Please specify a reason for the extension.')
      return
    }
    if (!confirmed) {
      setError('Confirm that the client has authorized the extension and its additional charges before recording it.')
      return
    }
    if (!newReturnDateStr) {
      setError(
        'This dialog was not given the booking’s current return date, so the new return date cannot be worked out. ' +
          'Nothing has been changed — report this rather than retrying.',
      )
      return
    }
    /*
     * ⛔ The dispatch below read `{ userId: 'USR-001', role: 'Manager' }` — an
     * invented staff id, and a role the business-9 migration retired. Every
     * extension this screen attempted was attributed to somebody who does not
     * exist. No session, no extension: refusing is the only honest branch, and
     * it is inline because `useToast()` exposes successes only (Law 12).
     */
    if (!user) {
      setError('You are not signed in, so this extension cannot be attributed to anyone. Sign in and try again.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /*
       * `extendRental` is still a stub — `implemented` is unset in
       * `actions/rentals/extendRental.ts`, so `createAction` refuses it before
       * validate, execute, events or audit and the operator reads
       * "EXTEND_RENTAL is not connected to the database yet, so nothing was
       * saved." That refusal is the point: it is the truth, and `onSuccess`
       * below (which fires BookingDetail's "Rental Extended" toast) is never
       * reached on this path.
       *
       * ⚠ `ExtendRentalInput` is `{ id: string }` — its own comment calls it a
       * "Placeholder for actual input schema". So the days, the rate, the
       * charge and the reason the operator typed have nowhere to go. That is
       * survivable only while the action refuses; whoever sets
       * `implemented: true` must widen the input FIRST, or this screen will
       * report an extension that saved a booking id and nothing else. Left
       * un-widened here because `src/actions/` is not this pass's file.
       */
      await extendRental({ id: bookingId }, { userId: user.id, role: user.role })

      /*
       * The screen-level `DomainEvents.emit(RENTAL_EXTENDED, …)` that stood
       * here is gone. `createAction` emits that event itself, after `execute`
       * returns — events follow the write, never precede it. A second emit
       * from the screen announced an extension the engine had not necessarily
       * made, and would double-count once the action lands.
       */
      onSuccess({
        days,
        extraAmountPaisa: rupees(extraAmount),
        newReturnDate: newReturnDateStr,
        reason: reason.trim(),
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to extend rental')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Extend Rental — ${bookingId}`}
      /* The "Current Return: …" clause is only stated when there is a real
         date behind it. It used to state the `'2026-08-12'` default as fact. */
      subtitle={`Client: ${client}${currentReturnDate ? ` · Current Return: ${currentReturnDate}` : ''}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Extending...' : 'Confirm Extension'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          /*
            ⛔ Was `var(--danger-bg, #fee2e2)` / `var(--danger-text, #991b1b)`.
            Neither token exists — `styles/theme.css` declares `--st-danger-bg`
            and `--st-danger-fg` — so BOTH fell through to the raw hex, which
            is a §5 Conventions violation ("never a hex value in a component")
            AND a real theming bug: the light-theme pink stayed pink in dark
            mode, where the token resolves to `#4b1515`.

            Law 12 — errors are inline and persistent, so this also carries
            `role="alert"` rather than relying on the operator noticing it.
          */
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sp-sm)',
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--danger)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        {/*
          Law 12 — stated when the dialog opens, not sprung on the operator at
          submit. The caller does not pass `currentReturnDate`, so this is
          currently always on: better a visible gap than the invented
          '2026-08-12' that used to fill it.
        */}
        {!currentReturnDate && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
            }}
          >
            This dialog was not given the booking’s current return date, so it cannot work out the new one. The
            extension cannot be recorded until it is.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Additional Days <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              /* 0 renders as an empty box, never a typed-looking "0": the state
                 must be a number for the guards, but the operator has to see a
                 field they are required to fill, not a figure this screen chose. */
              value={days === 0 ? '' : days}
              onChange={(e) => {
                const next = Number(e.target.value)
                setDays(Number.isFinite(next) ? next : 0)
              }}
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
              Daily Extension Rate (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={dailyRate === 0 ? '' : dailyRate}
              onChange={(e) => {
                const next = Number(e.target.value)
                setDailyRate(Number.isFinite(next) ? next : 0)
              }}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Extension <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Weather delay, shoot extension requested by director..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
          {/* An em dash, never a date or a "Rs 0", while the inputs behind
              these figures are incomplete — a rendered zero reads as a figure
              the form is holding, which is the defect this pass removes. */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>New Projected Return Date:</span>
            <span style={{ fontWeight: 700, color: 'var(--nav-active-accent)' }}>{newReturnDateStr ?? '—'}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Additional Rental Charge:</span>
            <span style={{ fontWeight: 700 }}>
              {days > 0 && dailyRate > 0 ? formatMoney(rupees(extraAmount)) : '—'}
            </span>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Client has authorized the extension and additional charges.
        </label>
      </form>
    </Modal>
  )
}
