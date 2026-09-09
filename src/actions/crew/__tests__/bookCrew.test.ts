import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { bookCrewConfig, type BookCrewInput } from '../bookCrew';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        pickup_at: '2026-09-10T09:00:00Z',
        return_at: '2026-09-12T18:00:00Z',
        duration_days: 3,
      },
    ],
    crewProfiles: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        crew_code: 'CRW-0001',
        full_name: 'Babin Sound Specialist',
        primary_role: 'Sound Recordist',
        daily_rate: 6500,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        crew_code: 'CRW-0002',
        full_name: 'Grip Master',
        primary_role: 'Grip',
        daily_rate: 4500,
      },
    ],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
  };

  const queryMock = () => {
    let currentTable = '';
    let orFilter = '';
    let eqField = '';
    let eqValue: unknown = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        return chain;
      },
      select: () => chain,
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      eq: (field: string, val: unknown) => {
        eqField = field;
        eqValue = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (currentTable === 'bookings') {
          const match = state.bookings.find((b) =>
            (orFilter && (orFilter.includes(b.id) || orFilter.includes(b.booking_no))) ||
            (eqField === 'booking_no' && b.booking_no === eqValue) ||
            (eqField === 'id' && b.id === eqValue)
          );
          return { data: match || null, error: null };
        }
        if (currentTable === 'crew_profiles_v2') {
          const match = state.crewProfiles.find((c) =>
            (orFilter && (orFilter.includes(c.id) || orFilter.includes(c.crew_code))) ||
            (eqField === 'crew_code' && c.crew_code === eqValue) ||
            (eqField === 'id' && c.id === eqValue)
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  return {
    state,
    supabase: {
      from: (table: string) => queryMock().from(table),
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, row: Record<string, unknown>, options?: unknown) => {
    db.state.insertCalls.push({ table, row, options });
    return { id: (row.client_uuid as string) || 'generated-crew-assign-id', ...row };
  },
  generateClientUuid: () => 'mocked-client-uuid',
}));

describe('bookCrew', () => {
  const context: ActionContext = {
    userId: 'user-coordinator-1',
    role: 'Coordinator',
  };

  beforeEach(() => {
    db.state.insertCalls = [];
  });

  describe('validation', () => {
    it('throws when crewIds is missing or empty', () => {
      expect(() =>
        bookCrewConfig.validate!({ crewIds: [] } as unknown as BookCrewInput)
      ).toThrow(/At least one crew ID must be selected/);

      expect(() =>
        bookCrewConfig.validate!({} as unknown as BookCrewInput)
      ).toThrow(/At least one crew ID must be selected/);
    });

    it('throws when days is less than 1', () => {
      expect(() =>
        bookCrewConfig.validate!({ crewIds: ['CRW-0001'], days: 0 })
      ).toThrow(/Days must be a positive integer greater than or equal to 1/);
    });

    it('throws when dailyRate is negative', () => {
      expect(() =>
        bookCrewConfig.validate!({ crewIds: ['CRW-0001'], dailyRate: -500 })
      ).toThrow(/Daily rate must be a non-negative number/);
    });

    it('passes on valid input', () => {
      expect(() =>
        bookCrewConfig.validate!({ crewIds: ['CRW-0001'], days: 2, dailyRate: 5000 })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('successfully assigns a crew member to a booking by booking_no and crew_code', async () => {
      const input: BookCrewInput = {
        bookingId: 'BK-2026-0001',
        crewIds: ['CRW-0001'],
        role: 'Lead Sound Specialist',
        dailyRate: 7000,
        days: 3,
        notes: 'Includes wireless kit',
        clientUuid: 'assign-uuid-1',
      };

      const { result, events } = await bookCrewConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.assignmentIds).toHaveLength(1);

      expect(db.state.insertCalls).toHaveLength(1);
      const insert = db.state.insertCalls[0]!;
      expect(insert.table).toBe('crew_assignments');
      expect(insert.options).toEqual({ returnRow: false });
      expect(insert.row).toMatchObject({
        client_uuid: 'assign-uuid-1',
        booking_id: '11111111-1111-4111-8111-111111111111',
        crew_id: '22222222-2222-4222-8222-222222222222',
        role_on_shoot: 'Lead Sound Specialist',
        call_time: '2026-09-10T09:00:00Z',
        wrap_time: '2026-09-12T18:00:00Z',
        daily_rate: 7000,
        days: 3,
        line_total: 21000,
        notes: 'Includes wireless kit',
        created_by: 'user-coordinator-1',
        updated_by: 'user-coordinator-1',
      });

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.CREW_ASSIGNED);
      expect(events![0]!.payload).toMatchObject({
        bookingId: '11111111-1111-4111-8111-111111111111',
        bookingNo: 'BK-2026-0001',
        crewIds: ['22222222-2222-4222-8222-222222222222'],
        role: 'Lead Sound Specialist',
        days: 3,
        dailyRate: 7000,
        userId: 'user-coordinator-1',
      });
    });

    it('defaults daily rate and role from crew profile when not overridden', async () => {
      const input: BookCrewInput = {
        bookingId: '11111111-1111-4111-8111-111111111111',
        crewIds: ['22222222-2222-4222-8222-222222222222'],
      };

      const { result } = await bookCrewConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(db.state.insertCalls).toHaveLength(1);
      const insert = db.state.insertCalls[0]!;
      expect(insert.row.role_on_shoot).toBe('Sound Recordist');
      expect(insert.row.daily_rate).toBe(6500);
      expect(insert.row.days).toBe(3); // from booking duration_days
      expect(insert.row.line_total).toBe(19500);
    });

    it('supports batch booking multiple crew members', async () => {
      const input: BookCrewInput = {
        bookingId: 'BK-2026-0001',
        crewIds: ['CRW-0001', 'CRW-0002'],
        days: 2,
      };

      const { result, events } = await bookCrewConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(db.state.insertCalls).toHaveLength(2);
      expect((events![0]!.payload as { crewIds: string[] }).crewIds).toHaveLength(2);
    });

    it('throws error when booking cannot be found', async () => {
      const origBookings = db.state.bookings;
      db.state.bookings = [];

      try {
        const input: BookCrewInput = {
          bookingId: 'NON-EXISTENT-BOOKING',
          crewIds: ['CRW-0001'],
        };

        await expect(bookCrewConfig.execute!(input, context)).rejects.toThrow(
          /Booking "NON-EXISTENT-BOOKING" not found/
        );
      } finally {
        db.state.bookings = origBookings;
      }
    });
  });
});
