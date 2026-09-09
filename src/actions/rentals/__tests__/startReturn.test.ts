import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { startReturnConfig, type StartReturnInput } from '../startReturn';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        stage: 'On Rent',
      },
    ],
    sessions: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        booking_id: '11111111-1111-4111-8111-111111111111',
        operation: 'Handover',
        session_no: 1,
        state: 'Completed',
      },
    ],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
  };

  const queryMock = () => {
    let currentTable = '';
    let orFilter = '';
    let eqFilters: Record<string, unknown> = {};

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        eqFilters = {};
        return chain;
      },
      select: () => chain,
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      eq: (field: string, val: unknown) => {
        eqFilters[field] = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (currentTable === 'bookings') {
          const match = state.bookings.find((b) =>
            (orFilter && (orFilter.includes(b.id) || orFilter.includes(b.booking_no))) ||
            (eqFilters.booking_no && b.booking_no === eqFilters.booking_no) ||
            (eqFilters.id && b.id === eqFilters.id)
          );
          return { data: match || null, error: null };
        }
        if (currentTable === 'operation_sessions') {
          // If checking for existing In Progress return session
          if (eqFilters.operation === 'Return' && eqFilters.state === 'In Progress') {
            const match = state.sessions.find((s) =>
              s.booking_id === eqFilters.booking_id &&
              s.operation === 'Return' &&
              s.state === 'In Progress'
            );
            return { data: match || null, error: null };
          }
          // If checking for last session to get max session_no
          const matches = state.sessions.filter((s) => s.booking_id === eqFilters.booking_id);
          if (matches.length > 0) {
            const sorted = [...matches].sort((a, b) => b.session_no - a.session_no);
            return { data: sorted[0] || null, error: null };
          }
          return { data: null, error: null };
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
    return { id: (row.client_uuid as string) || 'generated-session-id', ...row };
  },
  generateClientUuid: () => 'mocked-start-return-uuid',
}));

describe('startReturn', () => {
  const context: ActionContext = {
    userId: 'user-floor-1',
    role: 'Warehouse',
  };

  beforeEach(() => {
    db.state.insertCalls = [];
  });

  describe('validation', () => {
    it('throws when id is missing or empty', () => {
      expect(() =>
        startReturnConfig.validate!({ id: '' } as StartReturnInput)
      ).toThrow(/Booking ID or booking number is required/);

      expect(() =>
        startReturnConfig.validate!({} as unknown as StartReturnInput)
      ).toThrow(/Booking ID or booking number is required/);
    });

    it('passes on non-empty id', () => {
      expect(() =>
        startReturnConfig.validate!({ id: 'BK-2026-0001' })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('creates a new in-progress Return session with sequential session_no', async () => {
      const input: StartReturnInput = {
        id: 'BK-2026-0001',
        notes: 'Gear returned by courier',
        clientUuid: 'action-uuid-return-1',
      };

      const { result, events } = await startReturnConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.bookingNo).toBe('BK-2026-0001');
      expect(result.sessionNo).toBe(2); // previous Handover was session_no 1

      expect(db.state.insertCalls).toHaveLength(1);
      const insert = db.state.insertCalls[0]!;
      expect(insert.table).toBe('operation_sessions');
      expect(insert.options).toEqual({ returnRow: false });
      expect(insert.row).toMatchObject({
        client_uuid: 'action-uuid-return-1',
        booking_id: '11111111-1111-4111-8111-111111111111',
        operation: 'Return',
        state: 'In Progress',
        session_no: 2,
        notes: 'Gear returned by courier',
        created_by: 'user-floor-1',
      });

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.RENTAL_RETURN_STARTED);
      expect(events![0]!.payload).toMatchObject({
        id: '11111111-1111-4111-8111-111111111111',
        bookingNo: 'BK-2026-0001',
        sessionNo: 2,
        userId: 'user-floor-1',
      });
    });

    it('reuses existing in-progress return session if already open', async () => {
      // Add existing in-progress return session
      db.state.sessions.push({
        id: '33333333-3333-4333-8333-333333333333',
        booking_id: '11111111-1111-4111-8111-111111111111',
        operation: 'Return',
        session_no: 2,
        state: 'In Progress',
      });

      try {
        const input: StartReturnInput = {
          id: '11111111-1111-4111-8111-111111111111',
        };

        const { result, events } = await startReturnConfig.execute!(input, context);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe('33333333-3333-4333-8333-333333333333');
        expect(result.sessionNo).toBe(2);
        expect(db.state.insertCalls).toHaveLength(0); // reuses, doesn't insert
        expect(events![0]!.type).toBe(EVENT_TYPES.RENTAL_RETURN_STARTED);
      } finally {
        db.state.sessions.pop();
      }
    });

    it('throws error when booking is not found', async () => {
      const input: StartReturnInput = {
        id: 'NON-EXISTENT-BOOKING',
      };

      await expect(startReturnConfig.execute!(input, context)).rejects.toThrow(
        /Booking "NON-EXISTENT-BOOKING" not found/
      );
    });
  });
});
