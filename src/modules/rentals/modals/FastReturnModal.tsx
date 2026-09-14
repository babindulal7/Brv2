import { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import Icon from '../../../components/ui/Icon'
import { completeReturn } from '../../../actions/rentals/returnRental'
import { fetchFloorBooking, type FloorBooking } from '../../../lib/queries/bookings'
import type { FloorLineInput } from '../../../actions/rentals/floorVerb'
import type { ItemCondition, NotReturnedDecision } from '../../../types/database'
import { useAuth } from '../../../lib/auth'
import { canPerformOperations } from '../../../lib/rbac'
import { newClientUuid, supabase } from '../../../lib/supabase'

interface FastReturnModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (bookingId: string) => void
  initialBookingRef?: string
}

interface ActiveBookingOption {
  id: string
  booking_no: string
  client_name?: string | undefined
  starts_at?: string | undefined
  ends_at?: string | undefined
  stage: string
}

interface ReturnItemState {
  key: string
  lineId: string
  unitId: string | null
  assetId: string | null
  name: string
  serial: string | null
  qty: number
  alreadyReturned: boolean
  selected: boolean
  condition: ItemCondition
  missingReason: string
  missingDecision: NotReturnedDecision
}

const CONDITIONS: readonly ItemCondition[] = ['Good', 'Fair', 'Damaged', 'Lost']
const DECISIONS: readonly NotReturnedDecision[] = [
  'Still expected',
  'Charge replacement',
  'Insurance claim',
  'Write off',
]

function worstCondition(conds: readonly ItemCondition[]): ItemCondition {
  let worst: ItemCondition = 'Good'
  for (const c of conds) {
    if (CONDITIONS.indexOf(c) > CONDITIONS.indexOf(worst)) worst = c
  }
  return worst
}

export function FastReturnModal({
  isOpen,
  onClose,
  onSuccess,
  initialBookingRef = '',
}: FastReturnModalProps) {
  const { user } = useAuth()
  const isAuthorized = user ? canPerformOperations(user.role) : false

  const [bookingRef, setBookingRef] = useState(initialBookingRef)
  const [activeBookings, setActiveBookings] = useState<ActiveBookingOption[]>([])
  const [loadedBooking, setLoadedBooking] = useState<FloorBooking | null>(null)
  const [items, setItems] = useState<ReturnItemState[]>([])
  const [loadingBooking, setLoadingBooking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  // 1. Fetch active bookings strictly in 'On Rent' stage
  useEffect(() => {
    if (!isOpen) return
    setBookingRef(initialBookingRef)
    setLoadedBooking(null)
    setItems([])
    setError(null)
    setNotes('')

    let cancelled = false
    supabase
      .from('bookings')
      .select('id, booking_no, starts_at, ends_at, stage, client_id, clients:client_id (name)')
      .eq('stage', 'On Rent')
      .is('cancelled_at', null)
      .order('ends_at', { ascending: true })
      .limit(10)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data) return
        setActiveBookings(
          (data as unknown as Array<{
            id: string
            booking_no: string
            starts_at: string
            ends_at: string
            stage: string
            clients?: { name?: string } | null
          }>).map((b) => ({
            id: b.id,
            booking_no: b.booking_no,
            client_name: b.clients?.name,
            starts_at: b.starts_at,
            ends_at: b.ends_at,
            stage: b.stage,
          }))
        )
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, initialBookingRef])

  // 2. Load booking lines & units when a booking is targeted
  const loadBookingDetails = useCallback(async (refToLoad: string) => {
    const trimmed = refToLoad.trim()
    if (!trimmed) {
      setLoadedBooking(null)
      setItems([])
      return
    }

    setLoadingBooking(true)
    setError(null)

    try {
      const booking = await fetchFloorBooking(trimmed)
      if (!booking) {
        setLoadedBooking(null)
        setItems([])
        setError(`Booking "${trimmed}" was not found.`)
        return
      }

      if (booking.isCancelled) {
        setLoadedBooking(null)
        setItems([])
        setError(`Booking ${booking.bookingNo} is cancelled — no return can be recorded against it.`)
        return
      }

      if (booking.stage !== 'On Rent') {
        setLoadedBooking(null)
        setItems([])
        setError(
          `Booking ${booking.bookingNo} is in "${booking.stage}" stage. Fast Return only accepts bookings that are currently On Rent.`
        )
        return
      }

      if (booking.lines.length === 0) {
        setLoadedBooking(null)
        setItems([])
        setError(`Booking ${booking.bookingNo} has no rental equipment lines to return.`)
        return
      }

      // Build checklist rows
      const rows: ReturnItemState[] = []
      for (const line of booking.lines) {
        const lineName = line.productName ?? line.description ?? `${line.lineType} line`
        if (line.unitsPresence === 'present' && line.units.length > 0) {
          line.units.forEach((u, i) => {
            const already = u.unitState === 'Returned'
            rows.push({
              key: u.id,
              lineId: line.id,
              unitId: u.id,
              assetId: u.assetId,
              name: line.units.length > 1 ? `${lineName} · unit ${i + 1}` : lineName,
              serial: u.serial ?? u.assetTag,
              qty: 1,
              alreadyReturned: already,
              selected: !already,
              condition: 'Good',
              missingReason: '',
              missingDecision: 'Still expected',
            })
          })
        } else {
          rows.push({
            key: `line:${line.id}`,
            lineId: line.id,
            unitId: null,
            assetId: null,
            name: lineName,
            serial: null,
            qty: line.qty,
            alreadyReturned: false,
            selected: true,
            condition: 'Good',
            missingReason: '',
            missingDecision: 'Still expected',
          })
        }
      }

      setLoadedBooking(booking)
      setItems(rows)
    } catch (err: unknown) {
      setLoadedBooking(null)
      setItems([])
      const message = err instanceof Error ? err.message : 'Failed to load booking equipment.'
      setError(message)
    } finally {
      setLoadingBooking(false)
    }
  }, [])

  // Auto-load if initialBookingRef is provided
  useEffect(() => {
    if (isOpen && initialBookingRef.trim()) {
      void loadBookingDetails(initialBookingRef)
    }
  }, [isOpen, initialBookingRef, loadBookingDetails])

  const handleSelectBooking = (selectedNo: string) => {
    setBookingRef(selectedNo)
    void loadBookingDetails(selectedNo)
  }

  const toggleItemSelection = (key: string) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, selected: !item.selected } : item))
    )
  }

  const updateItemCondition = (key: string, condition: ItemCondition) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, condition } : item))
    )
  }

  const updateItemMissingReason = (key: string, missingReason: string) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, missingReason } : item))
    )
  }

  const updateItemMissingDecision = (key: string, missingDecision: NotReturnedDecision) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, missingDecision } : item))
    )
  }

  const unreturnedItems = useMemo(() => items.filter((i) => !i.alreadyReturned), [items])
  const selectedCount = useMemo(() => unreturnedItems.filter((i) => i.selected).length, [unreturnedItems])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!isAuthorized) {
      setError('You do not have permission to perform rental returns.')
      return
    }

    if (!loadedBooking) {
      setError('Please load and select an On Rent booking first.')
      return
    }

    if (unreturnedItems.length === 0) {
      setError('All equipment on this booking has already been returned.')
      return
    }

    // Check validation on missing items
    for (const item of unreturnedItems) {
      if (!item.selected) {
        if (item.missingReason.trim().length < 10) {
          setError(
            `Missing item "${item.name}" requires a reason of at least 10 characters.`
          )
          return
        }
        if (!item.missingDecision) {
          setError(`Missing item "${item.name}" requires a triage decision.`)
          return
        }
      }
    }

    // Build FloorLineInput[]
    const payload: FloorLineInput[] = []
    const extraNotes: string[] = []

    for (const line of loadedBooking.lines) {
      const lineItems = items.filter((i) => i.lineId === line.id && !i.alreadyReturned)
      if (lineItems.length === 0) continue

      const returned = lineItems.filter((i) => i.selected)
      const missing = lineItems.filter((i) => !i.selected)

      if (returned.length === 0 && missing.length === 0) continue

      if (returned.length === 0) {
        // Line entirely missing
        const decisions = [...new Set(missing.map((m) => m.missingDecision))]
        payload.push({
          bookingLineId: line.id,
          outcome: 'missing',
          reason: missing.map((m) => m.missingReason.trim()).join('; '),
          notReturnedDecision: decisions[0] ?? 'Still expected',
        })
      } else {
        // Line returned (or partially returned)
        const scannedAssets = returned.filter((r) => r.assetId !== null)
        const worst = worstCondition(returned.map((r) => r.condition))
        const returnedQty = returned.reduce((sum, r) => sum + r.qty, 0)

        payload.push({
          bookingLineId: line.id,
          outcome: 'done',
          ...(scannedAssets.length > 0
            ? {
                unitIds: scannedAssets.map((r) => r.assetId as string),
                serials: scannedAssets.map((r) => r.serial ?? ''),
              }
            : {}),
          qty: returnedQty,
          condition: worst,
        })

        if (missing.length > 0) {
          extraNotes.push(
            `Line ${line.productName ?? line.description}: ${missing.length} unit(s) not returned: ` +
              missing.map((m) => `${m.name} (${m.missingDecision}: ${m.missingReason.trim()})`).join(', ')
          )
        }
      }
    }

    if (payload.length === 0) {
      setError('No equipment items have been selected for return or triage.')
      return
    }

    setSubmitting(true)
    setError(null)

    const finalNotes = [notes.trim(), ...extraNotes].filter(Boolean).join('\n')

    try {
      await completeReturn(
        {
          rentalId: loadedBooking.id,
          lines: payload,
          clientUuid: newClientUuid(),
          occurredAt: new Date().toISOString(),
          ...(finalNotes ? { notes: finalNotes } : {}),
        },
        user ? { userId: user.id, role: user.role } : undefined
      )

      onSuccess(loadedBooking.id)
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete return.'
      setError(message)
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
          Quickly check in equipment for a booking currently <strong>On Rent</strong>.
        </p>

        {!isAuthorized && (
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
            <span>You do not have permission to perform rental returns.</span>
          </div>
        )}

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
            Booking number
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                id="fast-return-booking-ref"
                type="text"
                autoFocus
                placeholder="e.g. B-00042"
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void loadBookingDetails(bookingRef)
                  }
                }}
                style={{
                  width: '100%',
                  minHeight: 'var(--tap)',
                  padding: '0 12px',
                  borderRadius: 'var(--r-input)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
            <Button
              type="button"
              onClick={() => void loadBookingDetails(bookingRef)}
              disabled={loadingBooking || !bookingRef.trim()}
              style={{ minHeight: 'var(--tap)', flexShrink: 0 }}
            >
              {loadingBooking ? 'Loading…' : 'Find Booking'}
            </Button>
          </div>
        </div>

        {/* Quick select from currently active On Rent bookings */}
        {activeBookings.length > 0 && !loadedBooking && (
          <div>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Recent On-Rent Bookings
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {activeBookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="tap"
                  onClick={() => handleSelectBooking(b.booking_no)}
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
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>(On Rent)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loaded booking equipment checklist */}
        {loadedBooking && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 12, background: 'var(--card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                  {loadedBooking.bookingNo}
                </strong>
                {loadedBooking.clientName && (
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 8 }}>
                    · {loadedBooking.clientName}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {selectedCount} of {unreturnedItems.length} items to return
              </span>
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 8, paddingRight: 4 }}>
              {items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    background: item.alreadyReturned
                      ? 'var(--surface-muted, rgba(0,0,0,0.03))'
                      : item.selected
                      ? 'var(--surface-active, rgba(0,128,0,0.04))'
                      : 'var(--danger-bg, #fef2f2)',
                    border: `1px solid ${
                      item.alreadyReturned
                        ? 'var(--border)'
                        : item.selected
                        ? 'var(--border)'
                        : 'var(--danger-border, #f87171)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: item.alreadyReturned ? 'default' : 'pointer',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled={item.alreadyReturned}
                        checked={item.selected}
                        onChange={() => toggleItemSelection(item.key)}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                        {item.name}
                        {item.serial && (
                          <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
                            ({item.serial})
                          </span>
                        )}
                        {item.qty > 1 && (
                          <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
                            × {item.qty}
                          </span>
                        )}
                      </span>
                    </label>

                    {item.alreadyReturned ? (
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Already Returned</span>
                    ) : item.selected ? (
                      <select
                        value={item.condition}
                        onChange={(e) => updateItemCondition(item.key, e.target.value as ItemCondition)}
                        aria-label={`Condition for ${item.name}`}
                        style={{
                          height: 28,
                          padding: '0 6px',
                          fontSize: '12px',
                          borderRadius: 'var(--r-xs)',
                          border: '1px solid var(--input-border)',
                          background: 'var(--input-bg)',
                          color: 'var(--text)',
                        }}
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c} Condition
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--danger)' }}>
                        Not Returned
                      </span>
                    )}
                  </div>

                  {/* If marked unreturned / missing, require reason and decision */}
                  {!item.alreadyReturned && !item.selected && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6, paddingLeft: 24 }}>
                      <input
                        type="text"
                        placeholder="Reason missing (min 10 chars, e.g. Left on site)..."
                        value={item.missingReason}
                        onChange={(e) => updateItemMissingReason(item.key, e.target.value)}
                        style={{
                          width: '100%',
                          height: 28,
                          padding: '0 8px',
                          fontSize: '12px',
                          borderRadius: 'var(--r-input)',
                          border: '1px solid var(--danger-border, #f87171)',
                          background: 'var(--input-bg)',
                          color: 'var(--text)',
                        }}
                      />
                      <select
                        value={item.missingDecision}
                        onChange={(e) =>
                          updateItemMissingDecision(item.key, e.target.value as NotReturnedDecision)
                        }
                        aria-label={`Decision for ${item.name}`}
                        style={{
                          width: '100%',
                          height: 28,
                          padding: '0 8px',
                          fontSize: '12px',
                          borderRadius: 'var(--r-input)',
                          border: '1px solid var(--input-border)',
                          background: 'var(--input-bg)',
                          color: 'var(--text)',
                        }}
                      >
                        {DECISIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
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
            disabled={submitting || !loadedBooking || !isAuthorized}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '0 18px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid transparent',
              background: submitting || !loadedBooking || !isAuthorized ? 'var(--disabled)' : 'var(--primary)',
              color: submitting || !loadedBooking || !isAuthorized ? 'var(--muted)' : 'var(--on-brand)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              cursor: submitting || !loadedBooking || !isAuthorized ? 'not-allowed' : 'pointer',
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
