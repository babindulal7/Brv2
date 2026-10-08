import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';
import { runFloorVerb, type FloorLineInput } from '../rentals/floorVerb';

export type ReadyForPickupInput = {
  /** Target booking ID (UUID or booking_no) or product unit ID */
  id: string;
  /** Optional staging bay / shelf location */
  stagingLocation?: string;
  /** Optional notes */
  notes?: string;
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type ReadyForPickupResult = {
  success: boolean;
  id: string;
  status: string;
  stage?: string;
};

export const readyForPickupConfig: ActionConfig<ReadyForPickupInput, ReadyForPickupResult> = {
  name: 'READY_FOR_PICKUP',
  permissions: ['inventory.ready'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim().length === 0) {
      throw new Error('ID is required.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTarget);

    // 1. Try finding a booking
    const bookingQuery = supabase
      .from('bookings')
      .select('id, booking_no, stage');

    const { data: booking } = isUuid
      ? await bookingQuery.or(`id.eq.${rawTarget},booking_no.eq.${rawTarget}`).maybeSingle()
      : await bookingQuery.eq('booking_no', rawTarget).maybeSingle();

    let resultingStage: string | undefined = undefined;

    if (booking) {
      resultingStage = booking.stage;

      // If at Booked, pack it to advance to Packed (the ready-for-pickup stage)
      if (booking.stage === 'Booked') {
        const { data: lines } = await supabase
          .from('booking_lines')
          .select('id, qty')
          .eq('booking_id', booking.id);

        const packLines: FloorLineInput[] = (lines || []).map((l) => ({
          bookingLineId: l.id,
          outcome: 'done',
          qty: l.qty,
        }));

        if (packLines.length > 0) {
          const floorResult = await runFloorVerb(
            'Pack',
            {
              bookingRef: booking.id,
              lines: packLines,
              notes: input.notes?.trim() || `Staged at ${input.stagingLocation || 'Floor Bay'}`,
              ...(input.clientUuid ? { clientUuid: input.clientUuid } : {}),
            },
            ctx
          );
          resultingStage = floorResult.stageHeldBy ? booking.stage : 'Packed';
        }
      }
    } else {
      // 2. Target is a product unit
      const unitQuery = supabase
        .from('product_units')
        .select('id, serial_number, unit_code');

      const { data: unit } = isUuid
        ? await unitQuery.or(`id.eq.${rawTarget},serial_number.eq.${rawTarget},unit_code.eq.${rawTarget}`).maybeSingle()
        : await unitQuery.or(`serial_number.eq.${rawTarget},unit_code.eq.${rawTarget}`).maybeSingle();

      if (!unit && !isUuid) {
        throw new Error(`Target booking or equipment "${rawTarget}" not found.`);
      }
    }

    const now = new Date().toISOString();
    const events = [
      {
        type: EVENT_TYPES.INVENTORY_AVAILABLE,
        payload: {
          id: booking?.id || rawTarget,
          targetRef: rawTarget,
          stagingLocation: input.stagingLocation,
          stage: resultingStage,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: booking?.id || rawTarget,
        status: 'Ready for Pickup',
        ...(resultingStage ? { stage: resultingStage } : {}),
      },
      events,
    };
  },
};

export const readyForPickup = createAction<ReadyForPickupInput, ReadyForPickupResult>(readyForPickupConfig);
