import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { safeUpdate } from '../../lib/dataAccess'

/**
 * # SAVE_DRAFT — Rental draft save action
 *
 * Handles both:
 * 1. Unpersisted NewRental drafts (`id === 'draft-new'`), acknowledging local draft
 *    state without touching the database and emitting `DRAFT_SAVED`.
 * 2. Persisted bookings / floor workspaces (`id` = UUID or `booking_no`), touching
 *    the booking record via `safeUpdate` with Law 8 idempotency.
 */

export type SaveDraftInput = {
  /**
   * `bookings.id` (UUID), `bookings.booking_no` (e.g. `900` or `BK-2026-0001`),
   * or `'draft-new'` for an unpersisted booking in the NewRental flow.
   */
  id: string
  /**
   * Optional updated operational notes.
   */
  notes?: string | null | undefined
  /** Law 8 idempotency key. */
  clientUuid?: string | undefined
}

export type SaveDraftResult = {
  success: boolean
  bookingId: string
  bookingNo?: string | undefined
  savedAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const saveDraftConfig: ActionConfig<SaveDraftInput, SaveDraftResult> = {
  name: 'SAVE_DRAFT',
  permissions: ['rental.draft'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim() === '') {
      throw new Error('Booking ID is required.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.id.trim()
    const now = new Date().toISOString()

    // 1. Unpersisted draft in NewRental screen
    if (rawId === 'draft-new') {
      return {
        result: {
          success: true,
          bookingId: 'draft-new',
          bookingNo: 'draft-new',
          savedAt: now,
        },
        events: [
          {
            type: EVENT_TYPES.DRAFT_SAVED,
            payload: {
              id: 'draft-new',
              timestamp: now,
              userId: ctx.userId,
            },
          },
        ],
      }
    }

    // 2. Persisted booking
    let bookingId = rawId
    let bookingNo: string | undefined

    if (!UUID_RE.test(rawId)) {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_no')
        .eq('booking_no', rawId)
        .maybeSingle()

      if (error || !data) {
        throw new Error(
          `Could not resolve booking number ${rawId} to save draft: ${error?.message ?? 'no matching row'}`,
        )
      }
      bookingId = data.id
      bookingNo = data.booking_no
    } else {
      const { data } = await supabase
        .from('bookings')
        .select('booking_no')
        .eq('id', bookingId)
        .maybeSingle()

      if (data) {
        bookingNo = data.booking_no
      }
    }

    const patch: { updated_at: string; notes?: string | null } = {
      updated_at: now,
    }
    if (input.notes !== undefined) {
      patch.notes = input.notes
    }

    await safeUpdate(
      'bookings',
      bookingId,
      patch as never,
      input.clientUuid,
      { returnRow: false },
    )

    return {
      result: {
        success: true,
        bookingId,
        bookingNo,
        savedAt: now,
      },
      events: [
        {
          type: EVENT_TYPES.DRAFT_SAVED,
          payload: {
            id: bookingId,
            bookingNo,
            timestamp: now,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const saveDraft = createAction<SaveDraftInput, SaveDraftResult>(saveDraftConfig)
