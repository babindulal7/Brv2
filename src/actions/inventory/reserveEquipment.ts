import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { supabase } from '../../lib/supabase';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { applyBookingTransition } from '../../lib/bookingTransition';
import type { BookingStatus } from '../../lib/workflow';

export type ReserveEquipmentInput = {
  /** Target booking ID (UUID or booking_no), booking line ID, or product unit ID */
  id: string;
  /** Optional specific booking line ID */
  bookingLineId?: string;
  /** Optional physical product unit ID */
  unitId?: string;
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type ReserveEquipmentResult = {
  success: boolean;
  id: string;
  bookingId?: string;
  unitId?: string;
  status: string;
};

export const reserveEquipmentConfig: ActionConfig<ReserveEquipmentInput, ReserveEquipmentResult> = {
  name: 'RESERVE_EQUIPMENT',
  permissions: ['inventory.reserve'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim().length === 0) {
      throw new Error('ID is required.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTarget);
    const actionUuid = input.clientUuid || generateClientUuid();
    const now = new Date().toISOString();

    let resolvedBookingId: string | undefined = undefined;
    let resolvedBookingNo: string | undefined = undefined;

    // 1. Check if target or provided IDs refer to a unit assignment on a booking line
    if (input.bookingLineId && input.unitId) {
      const assignmentRow = {
        client_uuid: actionUuid,
        booking_line_id: input.bookingLineId,
        product_unit_id: input.unitId,
        assigned_at: now,
        assigned_by: ctx.userId,
      };

      await idempotentInsert('booking_line_units' as never, assignmentRow as never);
    } else {
      // 2. Check if target resolves to a booking
      const bookingQuery = supabase
        .from('bookings')
        .select('id, booking_no, branch_id, stage');

      const { data: booking } = isUuid
        ? await bookingQuery.or(`id.eq.${rawTarget},booking_no.eq.${rawTarget}`).maybeSingle()
        : await bookingQuery.eq('booking_no', rawTarget).maybeSingle();

      if (booking) {
        resolvedBookingId = booking.id;
        resolvedBookingNo = booking.booking_no;

        // If booking is at Quote or Draft, transitioning to Booked writes reservations via DB trigger (R-26)
        if (booking.stage === 'Draft' || booking.stage === 'Quote') {
          await applyBookingTransition({
            bookingId: booking.id,
            branchId: booking.branch_id,
            from: booking.stage as BookingStatus,
            to: 'Booked',
            actorId: ctx.userId,
            actorRole: ctx.role,
            clientUuid: actionUuid,
            occurredAt: now,
            reason: 'Equipment reserved via reserveEquipment',
          });
        }
      } else {
        // 3. Target may be a booking line or product unit
        const { data: line } = isUuid
          ? await supabase.from('booking_lines').select('id, booking_id').eq('id', rawTarget).maybeSingle()
          : { data: null };

        if (line) {
          resolvedBookingId = line.booking_id;
        } else if (!isUuid) {
          throw new Error(`Target booking or line "${rawTarget}" not found.`);
        }
      }
    }

    const events = [
      {
        type: EVENT_TYPES.INVENTORY_RESERVED,
        payload: {
          id: input.id,
          bookingId: resolvedBookingId,
          bookingNo: resolvedBookingNo,
          unitId: input.unitId,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: input.id,
        ...(resolvedBookingId ? { bookingId: resolvedBookingId } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
        status: 'Reserved',
      },
      events,
    };
  },
};

export const reserveEquipment = createAction<ReserveEquipmentInput, ReserveEquipmentResult>(reserveEquipmentConfig);
