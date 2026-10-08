import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'

/**
 * # EXTEND_RENTAL — Server-owned rental extension action
 *
 * ## Why direct table edits are guarded
 *
 * Extending a booking is not merely updating `bookings.return_at`:
 * - Increments `days` on active lines of `booking_lines`.
 * - Expands `period` on active `inventory_reservations`, triggering the
 *   GiST exclusion constraint (`no_double_booking`) and capacity ceiling.
 *   If another client booked the same gear during the extended dates, the
 *   database will refuse the extension with an exclusion violation.
 * - Reprices any draft invoice via `recalculate_invoice_totals`.
 * - Stated reason of >= 10 characters required.
 * - Records an immutable entry in `audit_events`.
 *
 * Executes the `extend_booking` RPC (migration 0111).
 */

export type ExtendRentalInput = {
  /**
   * `bookings.id` (UUID) or `bookings.booking_no` (e.g. `BK-2026-0001`).
   */
  id: string
  /**
   * Number of days to extend the booking (integer >= 1, default 1).
   */
  days?: number | undefined
  /**
   * Stated extension reason (minimum 10 characters).
   */
  reason?: string | null | undefined
  /** Law 8 idempotency key. */
  clientUuid?: string | undefined
}

export type ExtendRentalResult = {
  success: boolean
  bookingId: string
  bookingNo?: string | undefined
  oldReturnAt: string
  newReturnAt: string
  daysAdded: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const extendRentalConfig: ActionConfig<ExtendRentalInput, ExtendRentalResult> = {
  name: 'EXTEND_RENTAL',
  permissions: ['rental.extend'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('Booking ID is required.')
    }
    if (input.days !== undefined) {
      if (!Number.isInteger(input.days) || input.days < 1) {
        throw new Error('Extension days must be a whole number of at least 1.')
      }
    }
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error('Extension reason of at least ten characters is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.id.trim()
    const days = input.days ?? 1
    const reason = input.reason!.trim()

    let bookingId = rawId
    if (!UUID_RE.test(rawId)) {
      const { data, error } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_no', rawId)
        .maybeSingle()

      if (error || !data) {
        throw new Error(
          `Could not resolve booking number ${rawId} for extension: ${error?.message ?? 'no matching row'}`,
        )
      }
      bookingId = data.id
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('extend_booking', {
      p_payload: {
        booking_id: bookingId,
        days,
        reason,
        actor_id: ctx.userId ?? null,
        client_uuid: input.clientUuid ?? null,
      },
    })

    if (rpcError) {
      throw new Error(`Failed to extend booking: ${rpcError.message}`)
    }

    const res = rpcResult as {
      success: boolean
      booking_id: string
      booking_no?: string
      old_return_at: string
      new_return_at: string
      days_added: number
    }

    const events = [
      {
        type: EVENT_TYPES.RENTAL_EXTENDED,
        payload: {
          id: bookingId,
          bookingNo: res.booking_no,
          daysAdded: res.days_added,
          oldReturnAt: res.old_return_at,
          newReturnAt: res.new_return_at,
          reason,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        bookingId,
        bookingNo: res.booking_no,
        oldReturnAt: res.old_return_at,
        newReturnAt: res.new_return_at,
        daysAdded: res.days_added,
      },
      events,
    }
  },
}

export const extendRental = createAction<ExtendRentalInput, ExtendRentalResult>(extendRentalConfig)
