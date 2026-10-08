import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type StartReturnInput = {
  /** Target booking ID (UUID) or booking_no */
  id: string;
  /** Optional session notes */
  notes?: string;
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type StartReturnResult = {
  success: boolean;
  sessionId: string;
  bookingId: string;
  bookingNo: string;
  sessionNo: number;
};

export const startReturnConfig: ActionConfig<StartReturnInput, StartReturnResult> = {
  name: 'START_RETURN',
  permissions: ['rental.return'],
  implemented: true,

  validate: (input) => {
    if (!input.id || input.id.trim().length === 0) {
      throw new Error('Booking ID or booking number is required to start return.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.id.trim();
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

    // Check if an In Progress return session already exists for this booking
    const { data: existingSession } = await supabase
      .from('operation_sessions')
      .select('id, session_no, state')
      .eq('booking_id', booking.id)
      .eq('operation', 'Return')
      .eq('state', 'In Progress')
      .maybeSingle();

    const now = new Date().toISOString();
    let sessionId: string;
    let sessionNo: number;

    if (existingSession) {
      sessionId = existingSession.id;
      sessionNo = existingSession.session_no;
    } else {
      // Find the highest session_no for this booking
      const { data: lastSession } = await supabase
        .from('operation_sessions')
        .select('session_no')
        .eq('booking_id', booking.id)
        .order('session_no', { ascending: false })
        .limit(1)
        .maybeSingle();

      sessionNo = (lastSession?.session_no ?? 0) + 1;
      const actionUuid = input.clientUuid || generateClientUuid();

      const newSession = {
        client_uuid: actionUuid,
        booking_id: booking.id,
        session_no: sessionNo,
        operation: 'Return',
        state: 'In Progress',
        notes: input.notes?.trim() || null,
        started_at: now,
        created_by: ctx.userId,
      };

      const inserted = await idempotentInsert('operation_sessions' as never, newSession as never, {
        returnRow: false,
      });

      sessionId = (inserted as { id?: string })?.id || actionUuid;
    }

    const events = [
      {
        type: EVENT_TYPES.RENTAL_RETURN_STARTED,
        payload: {
          id: booking.id,
          bookingNo: booking.booking_no,
          sessionId,
          sessionNo,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        sessionId,
        bookingId: booking.id,
        bookingNo: booking.booking_no,
        sessionNo,
      },
      events,
    };
  },
};

export const startReturn = createAction<StartReturnInput, StartReturnResult>(startReturnConfig);
