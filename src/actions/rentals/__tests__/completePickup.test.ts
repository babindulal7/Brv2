import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { completePickupConfig, type CompletePickupInput } from '../completePickup';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        stage: 'Packed',
      },
    ],
    lines: [
      {
        id: 'line-1',
        booking_id: '11111111-1111-4111-8111-111111111111',
        qty: 1,
      },
    ],
    floorVerbCalls: [] as Array<{ verb: string; input: unknown }>,
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
      maybeSingle: async () => {
        if (currentTable === 'bookings') {
          const match = state.bookings.find((b) =>
            (orFilter && (orFilter.includes(b.id) || orFilter.includes(b.booking_no))) ||
            (eqFilters.booking_no && b.booking_no === eqFilters.booking_no) ||
            (eqFilters.id && b.id === eqFilters.id)
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (val: unknown) => unknown) => {
        if (currentTable === 'booking_lines') {
          const matches = state.lines.filter((l) => l.booking_id === eqFilters.booking_id);
          return Promise.resolve(resolve({ data: matches, error: null }));
        }
        return Promise.resolve(resolve({ data: null, error: null }));
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

vi.mock('../floorVerb', () => ({
  runFloorVerb: async (verb: string, input: unknown) => {
    db.state.floorVerbCalls.push({ verb, input });
    return {
      session: { id: 'mocked-floor-session-id' },
      stageHeldBy: null,
    };
  },
}));

describe('completePickup', () => {
  const context: ActionContext = {
    userId: 'user-floor-1',
    role: 'Warehouse',
  };

  beforeEach(() => {
    db.state.floorVerbCalls = [];
  });

  describe('validation', () => {
    it('throws when rentalId is missing or empty', () => {
      expect(() =>
        completePickupConfig.validate!({ rentalId: '' } as CompletePickupInput)
      ).toThrow(/Rental ID is required/);

      expect(() =>
        completePickupConfig.validate!({} as unknown as CompletePickupInput)
      ).toThrow(/Rental ID is required/);
    });

    it('passes on non-empty rentalId', () => {
      expect(() =>
        completePickupConfig.validate!({ rentalId: 'BK-2026-0001' })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('executes Handover floor verb on a Packed booking and returns On Rent stage', async () => {
      const input: CompletePickupInput = {
        rentalId: 'BK-2026-0001',
        notes: 'Handed over to client directly',
        clientUuid: 'pickup-action-uuid',
      };

      const { result, events } = await completePickupConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.bookingNo).toBe('BK-2026-0001');
      expect(result.stage).toBe('On Rent');

      expect(db.state.floorVerbCalls).toHaveLength(1);
      expect(db.state.floorVerbCalls[0]!.verb).toBe('Handover');

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.RENTAL_PICKED_UP);
      expect(events![0]!.payload).toMatchObject({
        rentalId: '11111111-1111-4111-8111-111111111111',
        bookingNo: 'BK-2026-0001',
        stage: 'On Rent',
      });
    });

    it('packs first then handovers when booking is currently Booked', async () => {
      db.state.bookings[0]!.stage = 'Booked';

      try {
        const input: CompletePickupInput = {
          rentalId: '11111111-1111-4111-8111-111111111111',
        };

        const { result } = await completePickupConfig.execute!(input, context);

        expect(result.success).toBe(true);
        expect(db.state.floorVerbCalls).toHaveLength(2);
        expect(db.state.floorVerbCalls[0]!.verb).toBe('Pack');
        expect(db.state.floorVerbCalls[1]!.verb).toBe('Handover');
      } finally {
        db.state.bookings[0]!.stage = 'Packed';
      }
    });

    it('returns idempotently without calling floorVerb if already On Rent', async () => {
      db.state.bookings[0]!.stage = 'On Rent';

      try {
        const input: CompletePickupInput = {
          rentalId: '11111111-1111-4111-8111-111111111111',
        };

        const { result, events } = await completePickupConfig.execute!(input, context);

        expect(result.success).toBe(true);
        expect(result.stage).toBe('On Rent');
        expect(db.state.floorVerbCalls).toHaveLength(0);
        expect(events).toHaveLength(0);
      } finally {
        db.state.bookings[0]!.stage = 'Packed';
      }
    });

    it('throws error when booking is not found', async () => {
      const input: CompletePickupInput = {
        rentalId: 'UNKNOWN-ID',
      };

      await expect(completePickupConfig.execute!(input, context)).rejects.toThrow(
        /Booking "UNKNOWN-ID" not found/
      );
    });
  });
});
