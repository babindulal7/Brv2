import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { readyForPickupConfig, type ReadyForPickupInput } from '../readyForPickup';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        stage: 'Booked',
      },
    ],
    lines: [
      {
        id: 'line-1',
        booking_id: '11111111-1111-4111-8111-111111111111',
        qty: 1,
      },
    ],
    units: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        serial_number: 'SN-001',
        unit_code: 'CAM-A1',
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
        if (currentTable === 'product_units') {
          const match = state.units.find((u) =>
            (orFilter && (orFilter.includes(u.id) || orFilter.includes(u.serial_number) || orFilter.includes(u.unit_code))) ||
            (eqFilters.serial_number && u.serial_number === eqFilters.serial_number) ||
            (eqFilters.unit_code && u.unit_code === eqFilters.unit_code) ||
            (eqFilters.id && u.id === eqFilters.id)
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

vi.mock('../../rentals/floorVerb', () => ({
  runFloorVerb: async (verb: string, input: unknown) => {
    db.state.floorVerbCalls.push({ verb, input });
    return {
      session: { id: 'mocked-pack-session-id' },
      stageHeldBy: null,
    };
  },
}));

describe('readyForPickup', () => {
  const context: ActionContext = {
    userId: 'user-floor-1',
    role: 'Warehouse',
  };

  beforeEach(() => {
    db.state.floorVerbCalls = [];
  });

  describe('validation', () => {
    it('throws when id is missing or empty', () => {
      expect(() =>
        readyForPickupConfig.validate!({ id: '' } as ReadyForPickupInput)
      ).toThrow(/ID is required/);

      expect(() =>
        readyForPickupConfig.validate!({} as unknown as ReadyForPickupInput)
      ).toThrow(/ID is required/);
    });

    it('passes on valid id', () => {
      expect(() =>
        readyForPickupConfig.validate!({ id: 'BK-2026-0001' })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('stages booking and advances stage to Packed', async () => {
      const input: ReadyForPickupInput = {
        id: 'BK-2026-0001',
        stagingLocation: 'Bay 3',
        notes: 'Waiting for client driver',
        clientUuid: 'ready-uuid-1',
      };

      const { result, events } = await readyForPickupConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.status).toBe('Ready for Pickup');
      expect(result.stage).toBe('Packed');

      expect(db.state.floorVerbCalls).toHaveLength(1);
      expect(db.state.floorVerbCalls[0]!.verb).toBe('Pack');

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.INVENTORY_AVAILABLE);
      expect(events![0]!.payload).toMatchObject({
        id: '11111111-1111-4111-8111-111111111111',
        stagingLocation: 'Bay 3',
        stage: 'Packed',
      });
    });

    it('stages standalone product unit by serial number', async () => {
      const input: ReadyForPickupInput = {
        id: 'SN-001',
        stagingLocation: 'Counter Shelf',
      };

      const { result, events } = await readyForPickupConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.id).toBe('SN-001');
      expect(result.status).toBe('Ready for Pickup');
      expect(events![0]!.type).toBe(EVENT_TYPES.INVENTORY_AVAILABLE);
    });

    it('throws error when target cannot be found', async () => {
      const input: ReadyForPickupInput = {
        id: 'NON-EXISTENT-TARGET',
      };

      await expect(readyForPickupConfig.execute!(input, context)).rejects.toThrow(
        /Target booking or equipment "NON-EXISTENT-TARGET" not found/
      );
    });
  });
});
