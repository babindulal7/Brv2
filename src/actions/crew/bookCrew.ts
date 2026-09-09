import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type BookCrewInput = {
  /** Target booking ID (UUID) or booking_no */
  bookingId?: string;
  /** List of crew member IDs (UUID or crew_code) */
  crewIds: string[];
  /** Optional role on shoot override (defaults to primary_role) */
  role?: string;
  /** Call time (ISO timestamp) */
  callTime?: string;
  /** Wrap time (ISO timestamp) */
  wrapTime?: string;
  /** Daily rate in Rupees */
  dailyRate?: number;
  /** Number of days */
  days?: number;
  /** Assignment notes */
  notes?: string;
  /** Client-side idempotency UUID (Law 8) */
  clientUuid?: string;
};

export type BookCrewResult = {
  success: boolean;
  count: number;
  assignmentIds: string[];
};

export const bookCrewConfig: ActionConfig<BookCrewInput, BookCrewResult> = {
  name: 'BOOK_CREW',
  permissions: ['crew.assign'],
  implemented: true,

  validate: (input) => {
    if (!input.crewIds || !Array.isArray(input.crewIds) || input.crewIds.length === 0) {
      throw new Error('At least one crew ID must be selected.');
    }
    if (input.days !== undefined && (typeof input.days !== 'number' || input.days < 1)) {
      throw new Error('Days must be a positive integer greater than or equal to 1.');
    }
    if (input.dailyRate !== undefined && (typeof input.dailyRate !== 'number' || input.dailyRate < 0)) {
      throw new Error('Daily rate must be a non-negative number.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawBooking = (input.bookingId || '').trim();
    let resolvedBooking: {
      id: string;
      booking_no: string;
      pickup_at?: string;
      return_at?: string;
      duration_days?: number;
    } | null = null;

    if (rawBooking) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawBooking);
      const query = supabase
        .from('bookings')
        .select('id, booking_no, pickup_at, return_at, duration_days');

      const { data } = isUuid
        ? await query.or(`id.eq.${rawBooking},booking_no.eq.${rawBooking}`).maybeSingle()
        : await query.eq('booking_no', rawBooking).maybeSingle();

      if (data) {
        resolvedBooking = data;
      } else if (isUuid) {
        resolvedBooking = {
          id: rawBooking,
          booking_no: rawBooking,
        };
      }
    }

    // If no booking provided or found, look up most recent active booking as fallback
    if (!resolvedBooking) {
      const { data } = await supabase
        .from('bookings')
        .select('id, booking_no, pickup_at, return_at, duration_days')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        resolvedBooking = data;
      }
    }

    if (!resolvedBooking) {
      throw new Error(
        rawBooking
          ? `Booking "${rawBooking}" not found.`
          : 'A target booking is required to assign crew.'
      );
    }

    const now = new Date().toISOString();
    const assignmentIds: string[] = [];
    const resolvedCrewMembers: Array<{ id: string; role: string; name?: string | undefined }> = [];

    const callTime = input.callTime || resolvedBooking.pickup_at || now;
    const wrapTime = input.wrapTime || resolvedBooking.return_at || null;
    const days = input.days ? Math.max(1, Math.floor(input.days)) : Math.max(1, resolvedBooking.duration_days || 1);

    for (let i = 0; i < input.crewIds.length; i++) {
      const rawCrewId = (input.crewIds[i] ?? '').trim();
      if (!rawCrewId) continue;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCrewId);
      let crewData: {
        id: string;
        crew_code: string;
        primary_role: string;
        full_name?: string;
        daily_rate?: number;
      } | null = null;

      const query = supabase
        .from('crew_profiles_v2')
        .select('id, crew_code, primary_role, full_name, daily_rate');

      const { data } = isUuid
        ? await query.or(`id.eq.${rawCrewId},crew_code.eq.${rawCrewId}`).maybeSingle()
        : await query.eq('crew_code', rawCrewId).maybeSingle();

      if (data) {
        crewData = data;
      }

      const crewId = crewData?.id || rawCrewId;
      const roleOnShoot = input.role || crewData?.primary_role || 'Crew Member';
      const dailyRate = input.dailyRate !== undefined
        ? input.dailyRate
        : (crewData?.daily_rate ? Number(crewData.daily_rate) : 0);
      const lineTotal = dailyRate * days;

      const clientUuid = input.clientUuid
        ? (input.crewIds.length === 1 ? input.clientUuid : `${input.clientUuid}-${i}`)
        : generateClientUuid();

      const assignmentRow = {
        client_uuid: clientUuid,
        booking_id: resolvedBooking.id,
        crew_id: crewId,
        role_on_shoot: roleOnShoot,
        call_time: callTime,
        wrap_time: wrapTime,
        daily_rate: dailyRate,
        days,
        line_total: lineTotal,
        notes: input.notes ? input.notes.trim() : null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      // Law 6: daily_rate and line_total are revoked from authenticated select.
      // Must use returnRow: false to avoid 42501 permission error.
      const inserted = await idempotentInsert('crew_assignments' as never, assignmentRow as never, {
        returnRow: false,
      });

      const assignmentId = (inserted as { id?: string })?.id || clientUuid;
      assignmentIds.push(assignmentId);
      resolvedCrewMembers.push({
        id: crewId,
        role: roleOnShoot,
        name: crewData?.full_name,
      });
    }

    const events = [
      {
        type: EVENT_TYPES.CREW_ASSIGNED,
        payload: {
          bookingId: resolvedBooking.id,
          bookingNo: resolvedBooking.booking_no,
          crewIds: resolvedCrewMembers.map((c) => c.id),
          crewCount: resolvedCrewMembers.length,
          role: input.role,
          days,
          dailyRate: input.dailyRate,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        count: assignmentIds.length,
        assignmentIds,
      },
      events,
    };
  },
};

export const bookCrew = createAction<BookCrewInput, BookCrewResult>(bookCrewConfig);
