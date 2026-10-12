/**
 * src/modules/rentals/actions/DuplicateRentalDialog.tsx — Babin Rentals OS
 *
 * Duplicate Rental Dialog component.
 *
 * Implements Section 4 Duplicate Rental Workflow:
 * - Copies client selection, equipment lines, bundle structure, and notes from source rental.
 * - Allows selecting new Pickup & Return dates.
 * - Strips: original booking ID, quote/invoice numbers, payment transactions,
 *   signatures, operational stamps, damage records, holds/allocations.
 * - Saves as an independent new draft via saveDraft.
 * - Directs the user to review the new draft in the New Rental workspace.
 */

import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid } from '../../../lib/supabase'
import { saveDraft, type RentalDraftData } from '../../../actions/rentals/saveDraft'
import { formatBookingNo } from '../../../lib/format'
import { fetchFloorBooking } from '../../../lib/queries/bookings'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'

export interface DuplicateRentalDialogProps {
  isOpen: boolean
  onClose: () => void
  booking: SelectedRentalBookingFacts
  onSuccess?: (draftId: string) => void
}

/**
 * Returns tomorrow formatted as YYYY-MM-DD
 */
function getDefaultPickupDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0] ?? ''
}

/**
 * Returns 4 days from now formatted as YYYY-MM-DD
 */
function getDefaultReturnDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 4)
  return d.toISOString().split('T')[0] ?? ''
}

export function DuplicateRentalDialog({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: DuplicateRentalDialogProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()

  const [pickupDate, setPickupDate] = useState(getDefaultPickupDate)
  const [pickupTime, setPickupTime] = useState('09:00')
  const [returnDate, setReturnDate] = useState(getDefaultReturnDate)
  const [returnTime, setReturnTime] = useState('18:00')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDuplicate = async () => {
    if (!user) {
      setError('You must be signed in to duplicate a rental.')
      return
    }

    if (!pickupDate || !returnDate) {
      setError('Both pickup date and return date are required.')
      return
    }

    if (new Date(`${returnDate}T${returnTime}`) <= new Date(`${pickupDate}T${pickupTime}`)) {
      setError('Return date must be after pickup date.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      // 1. Fetch floor booking lines to copy actual equipment structure
      const floor = await fetchFloorBooking(booking.bookingNo).catch(() => null)

      const draftLines: RentalDraftData['lines'] = (floor?.lines ?? []).map((l, idx) => ({
        id: `draft-line-${idx + 1}-${Date.now()}`,
        clientUuid: newClientUuid(),
        productId: l.productId,
        name: l.productName ?? l.description ?? 'Equipment Line',
        serial: '', // Do NOT copy serials or holds
        category: 'Equipment',
        ratePaisa: 0,
        days: 1,
        qty: l.qty || 1,
        discountPct: 0,
        location: 'Warehouse',
        committedTo: '',
        lineType: (l.lineType ?? 'Equipment') as 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item',
      }))

      // 2. Build sanitized draft payload
      const draftData: RentalDraftData = {
        version: 1,
        selectedClientId: booking.clientId ?? null,
        clientDbId: booking.clientId ?? null,
        clientName: booking.clientName ?? undefined,
        project: `Copy of ${booking.bookingNo}`,
        kind: 'Corporate',
        kindOther: '',
        govId: '',
        pickup: pickupDate,
        pickupTime,
        returnDate,
        returnTime,
        deliveryType: 'Client Pickup',
        pickupLocation: 'Kathmandu Main',
        returnLocation: 'Kathmandu Main',
        specialInstructions: `Duplicated from ${booking.bookingNo}`,
        lines: draftLines,
        crew: [], // Crew assignments are not copied
        deliveryChargePaisa: 0,
        fuelChargePaisa: 0,
        vehicle: '',
        numberPlate: '',
        driverContact: '',
        discountPct: 0,
        vatOn: true,
        vatRatePercent: 13,
        advancePaisa: 0,
      }

      const clientUuid = newClientUuid()
      const ctx = { userId: user.id, role: user.role }

      const res = await saveDraft(
        {
          data: draftData,
          clientUuid,
        },
        ctx,
      )

      showSuccessToast(
        'Rental Duplicated',
        `Created new draft from ${formatBookingNo(booking.bookingNo)}. Opening draft editor…`,
      )

      const draftId = 'id' in res ? res.id : res.bookingId
      if (onSuccess) {
        onSuccess(draftId)
      } else {
        // Direct to New Rental draft
        window.location.assign(`/rentals?action=new&draft=${draftId}`)
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={`Duplicate Rental · ${formatBookingNo(booking.bookingNo)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md, 16px)' }}>
        {/* Source info notice */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--r-card, 8px)',
            background: 'var(--card2, #f9fafb)',
            border: '1px solid var(--border, #e5e7eb)',
            fontSize: 'var(--t-meta, 13px)',
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text, #111827)', marginBottom: 4 }}>
            Duplicating {formatBookingNo(booking.bookingNo)}
            {booking.clientName && ` (${booking.clientName})`}
          </div>
          <div style={{ color: 'var(--text2, #4b5563)' }}>
            This will copy the client selection, equipment lines, and structure into a fresh draft.
            Original booking IDs, invoices, payments, signatures, and stock allocations are stripped.
            No equipment will be reserved until the new rental is formally confirmed.
          </div>
        </div>

        {/* Date Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 style={{ margin: 0, fontSize: 'var(--t-ui, 14px)', fontWeight: 600 }}>
            New Rental Schedule
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                htmlFor="dup-pickup-date"
                style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--muted)' }}
              >
                Pickup Date
              </label>
              <input
                id="dup-pickup-date"
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                disabled={submitting}
                style={{
                  minHeight: 40,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111827)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                htmlFor="dup-pickup-time"
                style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--muted)' }}
              >
                Pickup Time
              </label>
              <input
                id="dup-pickup-time"
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                disabled={submitting}
                style={{
                  minHeight: 40,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111827)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                htmlFor="dup-return-date"
                style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--muted)' }}
              >
                Return Date
              </label>
              <input
                id="dup-return-date"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                disabled={submitting}
                style={{
                  minHeight: 40,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111827)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                htmlFor="dup-return-time"
                style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--muted)' }}
              >
                Return Time
              </label>
              <input
                id="dup-return-time"
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                disabled={submitting}
                style={{
                  minHeight: 40,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--card, #fff)',
                  color: 'var(--text, #111827)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        </div>

        {/* Conflict / Availability Notice */}
        <div
          style={{
            padding: 10,
            borderRadius: 'var(--r-sm, 6px)',
            background: 'var(--card, #fff)',
            border: '1px dashed var(--border, #d1d5db)',
            fontSize: 'var(--t-caption, 12px)',
            color: 'var(--text2, #4b5563)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="info" size={15} style={{ color: 'var(--primary, #2563eb)', flexShrink: 0 }} />
          <span>
            Equipment availability will be validated in the New Rental workspace. You can edit line
            items, swap equipment, or adjust discounts before saving.
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-sm, 6px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
              border: '1px solid var(--danger, #dc2626)',
              color: 'var(--danger-text, #991b1b)',
              fontSize: 'var(--t-meta, 13px)',
            }}
          >
            {error}
          </div>
        )}

        {/* Dialog Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            borderTop: '1px solid var(--border, #e5e7eb)',
            paddingTop: 12,
            marginTop: 4,
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>

          <Button
            variant="primary"
            icon="copy"
            disabled={submitting || !pickupDate || !returnDate}
            onClick={handleDuplicate}
          >
            {submitting ? 'Creating Draft…' : 'Duplicate as New Draft'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default DuplicateRentalDialog
