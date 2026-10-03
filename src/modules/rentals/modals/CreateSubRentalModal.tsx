import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { rupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { createSubRental } from '../../../actions/subrentals/createSubRental'
import { useAuth } from '../../../lib/auth'
import { formatGateError } from '../../../lib/gates'

interface CreateSubRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (subRental: {
    vendor: string
    itemName: string
    vendorCostPaisa: Paisa
    clientChargePaisa: Paisa
    marginPaisa: Paisa
  }) => void
  bookingId: string
}

export function CreateSubRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
}: CreateSubRentalModalProps) {
  const { user } = useAuth()

  /*
   * ⛔ Every one of these four opened pre-filled: vendor "Cine Gear Nepal",
   * item "ARRI Alexa Mini Body", Rs 35,000 cost against a Rs 45,000 client
   * charge — a whole sub-rental, vendor and margin included, that no vendor
   * quoted and no operator entered. And NOTHING was dispatched: `handleSubmit`
   * emitted `DomainEvents.emit('subrental.created', …)` — an in-memory bus
   * whose only subscriber is a console logger — then called `onSuccess()`
   * unconditionally, firing BookingDetail's "Sub-Rental Created" toast. No
   * vendor PO existed, the charge never reached the client's invoice, and the
   * payable was invisible to Finance.
   *
   * All four open empty now. The operator states the deal; the screen states
   * nothing.
   */
  const [vendor, setVendor] = useState('')
  const [itemName, setItemName] = useState('')
  const [vendorCost, setVendorCost] = useState<number>(0)
  const [clientCharge, setClientCharge] = useState<number>(0)
  const [returnByDate, setReturnByDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const margin = clientCharge - vendorCost
  const figuresEntered = vendorCost > 0 && clientCharge > 0

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!itemName.trim() || !vendor.trim()) {
      setError('Vendor and Item Name are required.')
      return
    }
    if (!returnByDate) {
      setError('Vendor return-by date is required.')
      return
    }
    if (!Number.isFinite(vendorCost) || vendorCost <= 0 || !Number.isFinite(clientCharge) || clientCharge <= 0) {
      setError('Cost and charge amounts must be greater than 0.')
      return
    }
    /*
     * No session, no sub-rental. `createAction` refuses a call with no context
     * rather than acting as somebody, but the operator has to read the reason
     * here — inline and persistent, because `useToast()` exposes successes
     * only (Law 12).
     */
    if (!user) {
      setError('You are not signed in, so this sub-rental cannot be attributed to anyone. Sign in and try again.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /* The action writes the booking line and emits SUBRENTAL_CREATED only after
         persistence. Vendor text is not passed as a supplier UUID. */
      await createSubRental(
        {
          bookingId,
          vendorName: vendor.trim(),
          itemDescription: itemName.trim(),
          returnByDate,
          costPaisa: rupees(vendorCost),
          chargePaisa: rupees(clientCharge),
        },
        { userId: user.id, role: user.role },
      )

      onSuccess({
        vendor: vendor.trim(),
        itemName: itemName.trim(),
        vendorCostPaisa: rupees(vendorCost),
        clientChargePaisa: rupees(clientCharge),
        marginPaisa: rupees(margin),
      })
      onClose()
    } catch (err: unknown) {
      setError(formatGateError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Create External Sub-Rental — ${bookingId}`}
      subtitle="Source unstocked equipment from external rental partners."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Sub-Rental'}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              External Vendor <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Cine Gear Nepal"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
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
              Equipment Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. ARRI Alexa Mini"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
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
          <label htmlFor="subrental-return-by" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Vendor Return-By Date <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="subrental-return-by"
            type="date"
            required
            value={returnByDate}
            onChange={(e) => setReturnByDate(e.target.value)}
            style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 'var(--t-meta)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Vendor Sub-Rental Cost (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {/* 0 renders as an empty box, never a typed-looking "0": the state
                must be a number for the guards and `rupees()`, but the operator
                has to see a field they are required to fill. */}
            <input
              type="number"
              min={1}
              value={vendorCost === 0 ? '' : vendorCost}
              onChange={(e) => {
                const next = Number(e.target.value)
                setVendorCost(Number.isFinite(next) ? next : 0)
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
              Client Charge Price (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={clientCharge === 0 ? '' : clientCharge}
              onChange={(e) => {
                const next = Number(e.target.value)
                setClientCharge(Number.isFinite(next) ? next : 0)
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
          {/* Em dashes until BOTH figures are entered — a rendered "Rs 0", and
              worse a "Rs 0 margin", reads as a deal the form is holding. */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Vendor Cost:</span>
            <span>{vendorCost > 0 ? formatMoney(rupees(vendorCost)) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Client Charge:</span>
            <span>{clientCharge > 0 ? formatMoney(rupees(clientCharge)) : '—'}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid var(--border)',
              fontWeight: 700,
            }}
          >
            <span>Sub-Rental Net Margin:</span>
            {/* Never colour alone (Law 14) — the sign is in the text, so a
                negative margin does not depend on red being perceived. */}
            <span style={{ color: !figuresEntered ? 'var(--text2)' : margin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {figuresEntered ? `${margin < 0 ? '−' : ''}${formatMoney(rupees(Math.abs(margin)))}` : '—'}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  )
}
