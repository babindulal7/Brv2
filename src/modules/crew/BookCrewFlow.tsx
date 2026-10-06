import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { formatGateError } from '../../lib/gates'
import { AssignCrewModal } from '../rentals/modals/AssignCrewModal'

interface OpenBooking {
  id: string
  booking_no: string
  pickup_at: string
  return_at: string
  stage: string
}

/**
 * Book-crew entry point for the Crew Assist screen (`/crew`).
 *
 * `bookCrew` assigns crew *onto a booking*, and this screen never knows one —
 * that missing subject is why the old header `Book Crew` button had to go (it
 * fired with a fabricated `['CRW-101']` fallback and a synchronous success
 * toast for a flow that never opened). So this flow asks the one honest
 * question first — *which booking?* — then hands off to the existing
 * `AssignCrewModal`, which already collects member, role, rate, call/wrap and
 * days and dispatches the real action. No second copy of that form lives here.
 */
export function BookCrewFlow({
  open,
  onClose,
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  onAssigned: () => void
}) {
  const [bookings, setBookings] = useState<OpenBooking[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [chosen, setChosen] = useState<OpenBooking | null>(null)

  // Reset the choice whenever the flow (re)opens so a stale booking from a
  // previous pass can never ride along into a new assignment.
  useEffect(() => {
    if (open) setChosen(null)
  }, [open ])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      setBookings([])
      try {
        const { data, error } = (await supabase
          .from('bookings')
          .select('id, booking_no, pickup_at, return_at, stage')
          .is('cancelled_at', null)
          .is('closed_at', null)
          .neq('stage', 'Closed')
          .order('pickup_at', { ascending: true })
          .limit(100)) as unknown as {
          data: OpenBooking[] | null
          error: { message: string } | null
        }
        if (cancelled) return
        if (error) {
          setLoadError(`Could not load open bookings: ${error.message}`)
        } else {
          setBookings(data ?? [])
        }
      } catch (err: unknown) {
        if (!cancelled) setLoadError(formatGateError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, version])

  // The assign modal owns its open state once a booking is chosen; closing it
  // returns to the picker rather than dropping the operator back on the list.
  if (chosen) {
    return (
      <AssignCrewModal
        isOpen={open}
        onClose={() => setChosen(null)}
        onSuccess={() => {
          onAssigned()
          onClose()
        }}
        bookingId={chosen.id}
        bookingNo={chosen.booking_no}
        pickupAt={chosen.pickup_at}
        returnAt={chosen.return_at}
        defaultDays={rentalDaysBetween(chosen.pickup_at, chosen.return_at)}
      />
    )
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Book crew — choose a booking"
      subtitle="Crew is assigned onto a booking. Pick the booking first; the assignment form follows."
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {loading ? (
        <p role="status">Loading open bookings…</p>
      ) : loadError ? (
        <div role="alert" style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
          <p style={{ color: 'var(--st-danger-fg)' }}>{loadError}</p>
          <div>
            <Button onClick={() => setVersion((v) => v + 1)}>Retry</Button>
          </div>
        </div>
      ) : bookings.length === 0 ? (
        <p>No open bookings. Crew can only be assigned onto a booking that is not cancelled or closed.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--sp-sm)' }}>
          {bookings.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setChosen(b)}
                className="press"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn)',
                  padding: '10px 12px',
                  minHeight: 44,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--sp-sm)',
                }}
              >
                <span style={{ fontWeight: 600 }}>{b.booking_no}</span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{b.stage}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
