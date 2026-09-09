import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'

/**
 * # CANCEL_RENTAL — Server-owned cancellation action
 *
 * ## Why direct table edits are forbidden
 *
 * Migration 0094:159-171 locks `cancelled_at`, `cancelled_by`, and
 * `cancellation_reason` on `bookings` against direct client PATCH writes:
 * "Cancellation is a recorded act, not a column edit... it must reach these
 * columns the way stage moves do — through a SECURITY DEFINER writer or a
 * recorded transition."
 *
 * This action executes the `cancel_booking` RPC (migration 0109):
 *   - Verifies permissions: Coordinator, Manager, Admin, Owner (C+) before Packed;
 *     Manager, Admin, Owner (M+) if Packed.
 *   - Refuses if On Rent, Returned, Closed, or if units are already picked up.
 *   - Requires a stated reason of >= 10 characters.
 *   - Automatically releases inventory reservations in the same transaction
 *     via `trg_reservations_released_on_cancellation` (migration 0100).
 *   - Writes an immutable audit event to `audit_events`.
 */

export type CancelRentalInput = {
  /**
   * `bookings.id` (UUID) or `bookings.booking_no` (e.g. `BK-2026-0001`),
   * or `'draft-new'` for an unpersisted booking in the creation flow.
   */
  id: string
  /**
   * Stated cancellation reason (minimum 10 characters for persisted bookings).
   */
  reason?: string | null | undefined
  /** Law 8 idempotency key. */
  clientUuid?: string | undefined
}

export type CancelRentalResult = {
  success: boolean
  bookingId: string
  bookingNo?: string | undefined
  cancelledAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const cancelRentalConfig: ActionConfig<CancelRentalInput, CancelRentalResult> = {
  name: 'CANCEL_RENTAL',
  permissions: ['rental.cancel'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('Booking ID is required.')
    }
    if (input.id.trim() !== 'draft-new') {
      if (!input.reason || input.reason.trim().length < 10) {
        throw new Error('Cancellation reason of at least ten characters is required.')
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.id.trim()

    // 1. Handling unpersisted draft in NewRental creation flow
    if (rawId === 'draft-new') {
      const now = new Date().toISOString()
      return {
        result: {
          success: true,
          bookingId: 'draft-new',
          bookingNo: 'draft-new',
          cancelledAt: now,
        },
        events: [
          {
            type: EVENT_TYPES.RENTAL_CANCELLED,
            payload: {
              id: 'draft-new',
              reason: input.reason?.trim() ?? null,
              timestamp: now,
              userId: ctx.userId,
            },
          },
        ],
      }
    }

    // 2. Resolve booking UUID if human booking_no was passed
    let bookingId = rawId
    let bookingNo: string | undefined

    if (UUID_RE.test(rawId)) {
      bookingId = rawId
    } else {
      const { data: bookingRow, error: lookupError } = await supabase
        .from('bookings')
        .select('id, booking_no')
        .eq('booking_no', rawId)
        .maybeSingle()

      if (lookupError) {
        throw new Error(`Failed to resolve booking '${rawId}': ${lookupError.message}`)
      }
      if (!bookingRow) {
        throw new Error(`No booking with reference '${rawId}' exists.`)
      }
      bookingId = (bookingRow as { id: string }).id
      bookingNo = (bookingRow as { booking_no: string }).booking_no
    }

    // 3. Call cancel_booking RPC
    const { data, error } = await supabase.rpc('cancel_booking', {
      p_payload: {
        booking_id: bookingId,
        reason: input.reason?.trim() ?? '',
        actor_id: ctx.userId,
        client_uuid: input.clientUuid,
      },
    })

    if (error) {
      throw new Error(`Failed to cancel booking: ${error.message}`)
    }

    const rpcResult = data as unknown as {
      booking_id: string
      booking_no: string
      cancelled_at: string
    }

    const cancelledAt = rpcResult?.cancelled_at ?? new Date().toISOString()
    const resolvedNo = rpcResult?.booking_no ?? bookingNo ?? rawId

    // 4. Emit domain events
    const events = [
      {
        type: EVENT_TYPES.RENTAL_CANCELLED,
        payload: {
          id: bookingId,
          bookingNo: resolvedNo,
          reason: input.reason?.trim() ?? null,
          timestamp: cancelledAt,
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        bookingId,
        bookingNo: resolvedNo,
        cancelledAt,
      },
      events,
    }
  },
}

export const cancelRental = createAction<CancelRentalInput, CancelRentalResult>(cancelRentalConfig)
