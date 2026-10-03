import { supabase } from '../../lib/supabase'
import { generateClientUuid, safeUpdate } from '../../lib/dataAccess'
import { applyBookingTransition } from '../../lib/bookingTransition'
import { logAuditEvent } from '../../lib/audit'
import { NON_PACKABLE_LINE_TYPES } from '../../lib/bookingLineTypes'
import { canWriteBookingDesk } from '../../lib/rbac'
import type { ActionContext } from '../core'
import type { BookingStatus } from '../../lib/workflow'

export interface FulfillServiceInput {
  bookingNo: string
  clientUuid?: string
  occurredAt?: string
  notes?: string
}

export interface FulfillServiceResult {
  success: true
  bookingId: string
  bookingNo: string
  fromStage: BookingStatus
  toStage: BookingStatus
}

/**
 * Action metadata for dispatcher accounting and capability tracking.
 */
export const fulfillServiceRentalConfig = {
  name: 'rentals.fulfillService',
  capability: 'rental.return',
  implemented: true,
}

/**
 * Fulfills a service-only booking (bookings with NO physical equipment lines).
 * RULING 2026-10-03 (§4.59 / OPEN_DECISIONS.md #6):
 * Bookings containing only non-physical lines (Service, Sub-rental, Manual item)
 * have no physical gear to pack, scan, or return. This action advances the booking
 * to 'Returned' so it can be invoiced and closed without fabricating fake
 * equipment movements or empty warehouse sessions.
 */
export async function fulfillServiceRental(
  input: FulfillServiceInput,
  ctx: ActionContext,
): Promise<FulfillServiceResult> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not fulfilled — an active authenticated session is required.')
  }
  if (!canWriteBookingDesk(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to fulfill service rentals.`)
  }
  if (!input.bookingNo || input.bookingNo.trim() === '') {
    throw new Error('A booking number is required.')
  }

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, booking_no, branch_id, stage, cancelled_at, closed_at')
    .eq('booking_no', input.bookingNo.trim())
    .maybeSingle()

  if (bErr) throw new Error(`Could not read booking ${input.bookingNo}: ${bErr.message}`)
  if (!booking) throw new Error(`No booking matches ${input.bookingNo}.`)

  if (booking.cancelled_at !== null) {
    throw new Error(`${booking.booking_no} is cancelled. Fulfill does not run on cancelled bookings.`)
  }
  if (booking.closed_at !== null || booking.stage === 'Closed') {
    throw new Error(`${booking.booking_no} is Closed. Closed is final — nothing further is recorded.`)
  }

  // Verify that booking has NO physical equipment lines
  const { data: lines, error: lErr } = await supabase
    .from('booking_lines')
    .select('id, line_type')
    .eq('booking_id', booking.id)
    .is('voided_at', null)

  if (lErr) throw new Error(`Could not read lines for ${input.bookingNo}: ${lErr.message}`)
  const allLines = lines ?? []
  if (allLines.length === 0) {
    throw new Error(`Booking ${booking.booking_no} has no lines.`)
  }

  const hasPhysicalLines = allLines.some((l) => !NON_PACKABLE_LINE_TYPES.has(l.line_type))
  if (hasPhysicalLines) {
    throw new Error(
      `Booking ${booking.booking_no} contains physical equipment lines and must follow warehouse Pack, Handover, and Return workflows.`,
    )
  }

  const initialStage = booking.stage as BookingStatus
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const baseUuid = input.clientUuid ?? generateClientUuid()

  // Forward transition sequence for service-only booking:
  // Can advance from Booked -> Packed -> On Rent -> Returned,
  // or if already at Packed: Packed -> On Rent -> Returned,
  // or if already at On Rent: On Rent -> Returned.
  let currentStage = initialStage

  if (currentStage === 'Returned') {
    return {
      success: true,
      bookingId: booking.id,
      bookingNo: booking.booking_no,
      fromStage: initialStage,
      toStage: 'Returned',
    }
  }

  const transitionSteps: Array<{ from: BookingStatus; to: BookingStatus }> = []
  if (currentStage === 'Booked') {
    transitionSteps.push({ from: 'Booked', to: 'Packed' })
    transitionSteps.push({ from: 'Packed', to: 'On Rent' })
    transitionSteps.push({ from: 'On Rent', to: 'Returned' })
  } else if (currentStage === 'Packed') {
    transitionSteps.push({ from: 'Packed', to: 'On Rent' })
    transitionSteps.push({ from: 'On Rent', to: 'Returned' })
  } else if (currentStage === 'On Rent') {
    transitionSteps.push({ from: 'On Rent', to: 'Returned' })
  } else {
    throw new Error(
      `Booking ${booking.booking_no} is at stage ${currentStage}. Fulfill service runs on Booked, Packed, or On Rent bookings.`,
    )
  }

  let stepIndex = 0
  for (const step of transitionSteps) {
    // Generate deterministic client UUID per step
    const stepUuid = `${baseUuid.slice(0, 32)}${(stepIndex++).toString().padStart(4, '0')}`
    const res = await applyBookingTransition({
      bookingId: booking.id,
      branchId: booking.branch_id,
      from: step.from,
      to: step.to,
      actorId: ctx.userId,
      actorRole: ctx.role,
      clientUuid: stepUuid,
      occurredAt,
      reason: input.notes ?? 'Service fulfilled without physical equipment custody transfer',
    })
    if (!res.ok) {
      throw new Error(`Failed to advance from ${step.from} to ${step.to}: ${res.plan.blockers.join('; ')}`)
    }
    currentStage = step.to
  }

  // Stamp actual_return_at at Returned
  await safeUpdate('bookings', booking.id, { actual_return_at: occurredAt, updated_at: occurredAt }, baseUuid)

  await logAuditEvent({
    eventClass: 'session',
    category: 'Rentals',
    module: 'Operations',
    action: 'Update',
    severity: 'Informational',
    tableName: 'bookings',
    recordId: booking.id,
    actorId: ctx.userId,
    actorRole: ctx.role,
    branchId: booking.branch_id,
    reason: input.notes ?? 'Service-only rental fulfilled',
    newValues: { stage: 'Returned', serviceFulfilled: true, linesCount: allLines.length },
  })

  return {
    success: true,
    bookingId: booking.id,
    bookingNo: booking.booking_no,
    fromStage: initialStage,
    toStage: 'Returned',
  }
}
