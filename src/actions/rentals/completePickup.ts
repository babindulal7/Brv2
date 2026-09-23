import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';
import { runFloorVerb, type FloorLineInput } from './floorVerb';

/**
 * # RETIRED — 21 Sep 2026 (RULING / Audit-01 P1-03)
 *
 * This action walks a booking Booked → Packed → On Rent by running BOTH floor
 * verbs itself — and, worse, it hands the Handover verb
 * `governmentIdVerified: true` and `bookingAuthorizationVerified: true` that
 * NOBODY verified. A pickup completed through here carries two fabricated
 * compliance facts in an append-only operational record.
 *
 * There must be exactly one checkout path, and it is the Handover Workspace →
 * `runFloorVerb('Handover', …)`, where signatures, ID checks and the R-06
 * money gate are inputs the floor actually supplies. `MovementList.tsx` has
 * treated this action as the disabled stub it was meant to be; the flag below
 * now makes that true again. The dispatcher fails closed on anything that is
 * not `implemented: true` (core.ts), so this body is unreachable through the
 * app's action layer. It remains exported only because
 * `actions/rentals/index.ts` re-exports it and its pinned tests exercise the
 * shape; delete the file outright when that test file is retired.
 *
 * Revert (never silently): flip `implemented` back to `true` — and then
 * explain, in a new ruling, where `governmentIdVerified: true` came from.
 */

export type CompletePickupInput = {
  /** Target booking ID (UUID) or booking_no */
  rentalId: string;
  /** Optional equipment/unit IDs handed over */
  equipmentIds?: string[];
  /** Optional notes */
  notes?: string;
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type CompletePickupResult = {
  success: boolean;
  bookingId: string;
  bookingNo: string;
  stage: string;
};

export const completePickupConfig: ActionConfig<CompletePickupInput, CompletePickupResult> = {
  name: 'COMPLETE_PICKUP',
  permissions: ['rental.pickup'],
  // RULING 2026-09-21: retired (see the header). The dispatcher refuses this
  // action; checkout exists only through the Handover Workspace's floor verb.
  implemented: false,

  validate: (input) => {
    if (!input.rentalId || input.rentalId.trim().length === 0) {
      throw new Error('Rental ID is required.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.rentalId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTarget);

    const query = supabase
      .from('bookings')
      .select('id, booking_no, stage');

    const { data: booking } = isUuid
      ? await query.or(`id.eq.${rawTarget},booking_no.eq.${rawTarget}`).maybeSingle()
      : await query.eq('booking_no', rawTarget).maybeSingle();

    if (!booking) {
      throw new Error(`Booking "${rawTarget}" not found.`);
    }

    const bookingId = booking.id;
    const bookingNo = booking.booking_no;
    let currentStage = booking.stage;

    // If already On Rent or past pickup, idempotent return
    if (currentStage === 'On Rent' || currentStage === 'Returned' || currentStage === 'Closed') {
      return {
        result: {
          success: true,
          bookingId,
          bookingNo,
          stage: currentStage,
        },
        events: [],
      };
    }

    // If stage is Booked, we must Pack before Handover
    if (currentStage === 'Booked') {
      const { data: lines } = await supabase
        .from('booking_lines')
        .select('id, qty')
        .eq('booking_id', bookingId);

      const packLines: FloorLineInput[] = (lines || []).map((l) => ({
        bookingLineId: l.id,
        outcome: 'done',
        qty: l.qty,
      }));

      if (packLines.length > 0) {
        await runFloorVerb(
          'Pack',
          {
            bookingRef: bookingId,
            lines: packLines,
            notes: 'Packed via completePickup action',
            ...(input.clientUuid ? { clientUuid: `${input.clientUuid}-pack` } : {}),
          },
          ctx
        );
        currentStage = 'Packed';
      }
    }

    // Now execute Handover from Packed to On Rent
    const { data: lines } = await supabase
      .from('booking_lines')
      .select('id, qty')
      .eq('booking_id', bookingId);

    const handoverLines: FloorLineInput[] = (lines || []).map((l) => ({
      bookingLineId: l.id,
      outcome: 'done',
      qty: l.qty,
    }));

    if (handoverLines.length > 0) {
      const floorResult = await runFloorVerb(
        'Handover',
        {
          bookingRef: bookingId,
          lines: handoverLines,
          notes: input.notes?.trim() || 'Handed over via completePickup action',
          ...(input.clientUuid ? { clientUuid: `${input.clientUuid}-handover` } : {}),
          governmentIdVerified: true,
          bookingAuthorizationVerified: true,
        },
        ctx
      );
      currentStage = floorResult.stageHeldBy ? currentStage : 'On Rent';
    }

    const now = new Date().toISOString();
    const events = [
      {
        type: EVENT_TYPES.RENTAL_PICKED_UP,
        payload: {
          rentalId: bookingId,
          bookingNo,
          stage: currentStage,
          equipmentIds: input.equipmentIds,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        bookingId,
        bookingNo,
        stage: currentStage,
      },
      events,
    };
  },
};

export const completePickup = createAction<CompletePickupInput, CompletePickupResult>(completePickupConfig);
