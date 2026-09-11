import { useState, useEffect } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import Icon from '../../../components/ui/Icon'
import { completeReturn } from '../../../actions/rentals/returnRental'
import { useAuth } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'

interface FastReturnModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (bookingId: string) => void
  initialBookingRef?: string
}

interface ActiveBookingOption {
  id: string
  booking_no: string
  client_name?: string
  starts_at?: string
  ends_at?: string
  stage: string
}

export function FastReturnModal({
  isOpen,
  onClose,
  onSuccess,
  initialBookingRef = '',
}: FastReturnModalProps) {
  const { user } = useAuth()
  const [bookingRef, setBookingRef] = useState(initialBookingRef)
  const [activeBookings, setActiveBookings] = useState<ActiveBookingOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setBookingRef(initialBookingRef)
    setError(null)
    setNotes('')

    // Fetch active bookings that are currently On Rent
    let cancelled = false
    supabase
      .from('bookings')
      .select('id, booking_no, starts_at, ends_at, stage, client_id, clients:client_id (name)')
      .in('stage', ['On Rent', 'Booked', 'Packed'])
      .order('ends_at', { ascending: true })
      .limit(10)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) return
        if (data) {
          setActiveBookings(
            data.map((b: any) => ({
              id: b.id,
              booking_no: b.booking_no,
              client_name: b.clients?.name,
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              stage: b.stage,
            }))
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, initialBookingRef])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const targetRef = bookingRef.trim()
    if (!targetRef) {
      setError('Please enter or select a booking number to return.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await completeReturn(
        {
          rentalId: targetRef,
          occurredAt: new Date().toISOString(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        user ? { userId: user.id, role: user.role } : undefined
      )

      onSuccess(targetRef)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to complete return. Ensure the booking is currently On Rent.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Fast Check-in / Return"
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', color: 'var(--text2)' }}>
          Scan or enter a booking reference number to rapidly check in returning gear.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--danger-bg, #fef2f2)',
              border: '1px solid var(--danger-border, #f87171)',
              color: 'var(--danger, #dc2626)',
              fontSize: 'var(--t-meta)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_triangle" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label
            htmlFor="fast-return-booking-ref"
            style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}
          >
            Booking Reference / Barcode
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="fast-return-booking-ref"
              type="text"
              autoFocus
              placeholder="e.g. B-00042"
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              style={{
                width: '100%',
                minHeight: 'var(--tap)',
                padding: '0 40px 0 12px',
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-body)',
                fontFamily: 'inherit',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                pointerEvents: 'none',
              }}
            >
              <Icon name="queues" size={16} />
            </span>
          </div>
        </div>

        {/* Quick select from currently active bookings */}
        {activeBookings.length > 0 && (
          <div>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Recent Active Bookings
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeBookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="tap"
                  onClick={() => setBookingRef(b.booking_no)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 34,
                    padding: '0 10px',
                    borderRadius: 'var(--r-badge)',
                    border: bookingRef === b.booking_no ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: bookingRef === b.booking_no ? 'var(--hover-card)' : 'transparent',
                    color: bookingRef === b.booking_no ? 'var(--primary)' : 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <strong>{b.booking_no}</strong>
                  {b.client_name && <span style={{ color: 'var(--muted)' }}>· {b.client_name}</span>}
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>({b.stage})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="fast-return-notes"
            style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}
          >
            Check-in / Condition Notes (optional)
          </label>
          <textarea
            id="fast-return-notes"
            rows={2}
            placeholder="Equipment returned in clean condition, all accessories verified."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--sp-sm)',
            marginTop: 'var(--sp-sm)',
            borderTop: '1px solid var(--border)',
            paddingTop: 'var(--sp-md)',
          }}
        >
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <button
            type="submit"
            className="press tap"
            disabled={submitting || !bookingRef.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 18px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid transparent',
              background: submitting || !bookingRef.trim() ? 'var(--disabled)' : 'var(--primary)',
              color: submitting || !bookingRef.trim() ? 'var(--muted)' : 'var(--on-brand)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              cursor: submitting || !bookingRef.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon name="return_arrow" size={15} />
            <span>{submitting ? 'Checking in…' : 'Complete Fast Return'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
