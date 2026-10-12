/**
 * src/modules/rentals/modals/RentalSummaryModal.tsx — Babin Rentals OS
 *
 * Pop-up Summary Modal for completed rentals / reset operations.
 *
 * Displays:
 * - Rental identification and client info
 * - Physical equipment disposition:
 *   Separates booking stage from individual item state (e.g. returned units,
 *   available reset units, and active maintenance/damage holds).
 * - Custody completion timestamps.
 * - Non-financial clearance indicator (Law 6 money-blindness).
 */

import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import Icon from '../../../components/ui/Icon'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { LoadingSkeleton, ErrorBanner } from '../../../components/ui/StateViews'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../../lib/queries/bookings'
import { formatAdDateTime } from '../../../lib/bs'
import { formatBookingNo } from '../../../lib/format'

export interface RentalSummaryModalProps {
  isOpen: boolean
  onClose: () => void
  bookingNo: string
}

export function RentalSummaryModal({ isOpen, onClose, bookingNo }: RentalSummaryModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<FloorBooking | null>(null)

  useEffect(() => {
    if (!isOpen || !bookingNo) return

    let active = true
    setLoading(true)
    setError(null)

    fetchFloorBooking(bookingNo)
      .then((data) => {
        if (!active) return
        if (!data) {
          setError(`Rental ${bookingNo} could not be found.`)
        } else {
          setBooking(data)
        }
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load rental summary.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, bookingNo])

  if (!isOpen) return null

  // Calculate physical item disposition
  const lines = booking?.lines ?? []
  let totalUnits = 0
  let returnedUnits = 0
  let readyUnits = 0
  let damagedUnits = 0

  for (const line of lines) {
    totalUnits += line.qty
    const lineReturned = line.units.filter((u) => u.unitState === 'Returned').length
    returnedUnits += lineReturned
    if (line.units && line.units.length > 0) {
      for (const u of line.units) {
        if (u.damaged || u.unitState === 'Damaged') {
          damagedUnits += 1
        } else if (u.unitState === 'Returned') {
          readyUnits += 1
        }
      }
    } else {
      readyUnits += lineReturned
    }
  }

  const availableUnits = Math.max(0, returnedUnits - damagedUnits)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`Rental Summary · ${formatBookingNo(bookingNo)}`}
      subtitle={booking?.clientName ? `Client: ${booking.clientName}` : undefined}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} style={{ minHeight: 44, padding: '0 20px' }}>
            Close Summary
          </Button>
        </div>
      }
    >
      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : booking ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Overview Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
              padding: 14,
              borderRadius: 'var(--r-card, 8px)',
              background: 'var(--card-subtle, var(--hover-card))',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontWeight: 600 }}>STATUS</div>
              <div style={{ marginTop: 4 }}>
                <Badge tone="in" label={booking.stage} size="sm" />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontWeight: 600 }}>TOTAL ITEMS</div>
              <div style={{ fontSize: 'var(--t-h3, 18px)', fontWeight: 700, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                {totalUnits}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontWeight: 600 }}>RETURNED</div>
              <div style={{ fontSize: 'var(--t-h3, 18px)', fontWeight: 700, marginTop: 2, color: 'var(--success, #16a34a)', fontFamily: 'var(--font-mono)' }}>
                {returnedUnits}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontWeight: 600 }}>RESET & AVAILABLE</div>
              <div style={{ fontSize: 'var(--t-h3, 18px)', fontWeight: 700, marginTop: 2, color: 'var(--primary, #2563eb)', fontFamily: 'var(--font-mono)' }}>
                {availableUnits}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontWeight: 600 }}>DAMAGE / HOLDS</div>
              <div style={{ fontSize: 'var(--t-h3, 18px)', fontWeight: 700, marginTop: 2, color: damagedUnits > 0 ? 'var(--danger, #dc2626)' : 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                {damagedUnits}
              </div>
            </div>
          </div>

          {/* Separation of Booking Stage vs Physical Equipment Disposition Note */}
          {damagedUnits > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 'var(--r-sm, 6px)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--danger, #dc2626)',
                fontSize: 'var(--t-meta, 13px)',
              }}
            >
              <Icon name="alert_circle" size={16} />
              <span>
                <strong>Physical Hold Active:</strong> {damagedUnits} item(s) are held in maintenance/damage custody and excluded from available inventory, while {availableUnits} inspected items have returned to available stock.
              </span>
            </div>
          )}

          {/* Equipment Lines Breakdown */}
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 'var(--t-body, 14px)', fontWeight: 600 }}>
              Equipment Disposition Checklist
            </h4>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-card, 8px)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta, 13px)' }}>
                <thead>
                  <tr style={{ background: 'var(--header-bg, var(--hover-card))', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Equipment / Line</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600, width: 80, textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600, width: 90, textAlign: 'center' }}>Returned</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600, width: 120 }}>Unit Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: FloorLine) => {
                    const lineReturned = l.units.filter((u) => u.unitState === 'Returned').length
                    const isAllReturned = lineReturned >= l.qty
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                          <div>{l.productName || l.description || 'Equipment Item'}</div>
                          {l.units && l.units.length > 0 && (
                            <div style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                              {l.units.map((u) => u.serial || u.assetTag || u.assetId).filter(Boolean).join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                          {l.qty}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, color: isAllReturned ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
                          {lineReturned}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {isAllReturned ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success, #16a34a)', fontSize: 'var(--t-caption, 12px)', fontWeight: 600 }}>
                              <Icon name="check" size={13} /> Reset & Ready
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: 'var(--t-caption, 12px)', fontWeight: 600 }}>
                              Pending Return
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Custody Schedule & Verification Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 'var(--r-card, 8px)',
              border: '1px solid var(--border)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            <div>
              <span style={{ color: 'var(--muted)' }}>Pickup Schedule: </span>
              <strong>{booking.pickupAtAd ? formatAdDateTime(booking.pickupAtAd) : '—'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Return Schedule: </span>
              <strong>{booking.returnAtAd ? formatAdDateTime(booking.returnAtAd) : '—'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Actual Return: </span>
              <strong>{booking.actualReturnAtAd ? formatAdDateTime(booking.actualReturnAtAd) : 'Recorded'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Delivery Type: </span>
              <strong>{booking.deliveryType || 'Client Pickup'}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

export default RentalSummaryModal
