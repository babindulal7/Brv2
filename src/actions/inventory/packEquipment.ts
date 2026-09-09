import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';
import { runFloorVerb, type FloorLineInput } from '../rentals/floorVerb';

export type PackEquipmentInput = {
  /** Target booking ID (UUID or booking_no) or product unit ID */
  id: string;
  /** Optional specific equipment unit IDs */
  equipmentIds?: string[];
  /** Optional packing notes */
  notes?: string;
  /** Law 8 idempotency key */
  clientUuid?: string;
};

export type PackEquipmentResult = {
  success: boolean;
  id: string;
  packedCount: number;
  stage?: string;
};

export const packEquipmentConfig: ActionConfig<PackEquipmentInput, PackEquipmentResult> = {
  name: 'PACK_EQUIPMENT',
  permissions: ['inventory.pack'],
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

    let packedCount = 1;
    let resultingStage: string | undefined = undefined;

    if (booking) {
      resultingStage = booking.stage;

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

        packedCount = packLines.reduce((acc, curr) => acc + (curr.qty || 1), 0);

        if (packLines.length > 0) {
          const floorResult = await runFloorVerb(
            'Pack',
            {
              bookingRef: booking.id,
              lines: packLines,
              notes: input.notes?.trim() || 'Packed via packEquipment action',
              ...(input.clientUuid ? { clientUuid: input.clientUuid } : {}),
            },
            ctx
          );
          resultingStage = floorResult.stageHeldBy ? booking.stage : 'Packed';
        }
      }
    } else {
      // 2. Target is a product unit or serial
      const unitQuery = supabase
        .from('product_units')
        .select('id, serial_number, unit_code');

      const { data: unit } = isUuid
        ? await unitQuery.or(`id.eq.${rawTarget},serial_number.eq.${rawTarget},unit_code.eq.${rawTarget}`).maybeSingle()
        : await unitQuery.or(`serial_number.eq.${rawTarget},unit_code.eq.${rawTarget}`).maybeSingle();

      if (!unit && !isUuid) {
        throw new Error(`Target booking or equipment "${rawTarget}" not found.`);
      }

      packedCount = 1;
    }

    const now = new Date().toISOString();
    const events = [
      {
        type: EVENT_TYPES.INVENTORY_PACKED,
        payload: {
          id: booking?.id || rawTarget,
          targetRef: rawTarget,
          packedCount,
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
        packedCount,
        ...(resultingStage ? { stage: resultingStage } : {}),
      },
      events,
    };
  },
};

export const packEquipment = createAction<PackEquipmentInput, PackEquipmentResult>(packEquipmentConfig);
