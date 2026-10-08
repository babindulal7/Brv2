import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { reserveEquipmentConfig, type ReserveEquipmentInput } from '../reserveEquipment';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        stage: 'Draft',
      },
    ],
    lines: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        booking_id: '11111111-1111-4111-8111-111111111111',
      },
    ],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
    transitionCalls: [] as Array<{ bookingId: string; stage: string }>,
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
        if (currentTable === 'booking_lines') {
          const match = state.lines.find((l) =>
            (eqFilters.id && l.id === eqFilters.id)
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
    return { id: (row.client_uuid as string) || 'generated-assign-id', ...row };
  },
  generateClientUuid: () => 'mocked-reserve-uuid',
}));

vi.mock('../../../lib/bookingTransition', () => ({
  applyBookingTransition: async (req: { bookingId: string; to: string }) => {
    db.state.transitionCalls.push({ bookingId: req.bookingId, stage: req.to });
    return { ok: true };
  },
}));

describe('reserveEquipment', () => {
  const context: ActionContext = {
    userId: 'user-coordinator-1',
    role: 'Coordinator',
  };

  beforeEach(() => {
    db.state.insertCalls = [];
    db.state.transitionCalls = [];
  });

  describe('validation', () => {
    it('throws when id is missing or empty', () => {
      expect(() =>
        reserveEquipmentConfig.validate!({ id: '' } as ReserveEquipmentInput)
      ).toThrow(/ID is required/);

      expect(() =>
        reserveEquipmentConfig.validate!({} as unknown as ReserveEquipmentInput)
      ).toThrow(/ID is required/);
    });

    it('passes on non-empty id', () => {
      expect(() =>
        reserveEquipmentConfig.validate!({ id: 'BK-2026-0001' })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('assigns a physical unit to a booking line via booking_line_units', async () => {
      const input: ReserveEquipmentInput = {
        id: '22222222-2222-4222-8222-222222222222',
        bookingLineId: '22222222-2222-4222-8222-222222222222',
        unitId: 'unit-uuid-1',
        clientUuid: 'assign-client-uuid',
      };

      const { result, events } = await reserveEquipmentConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.unitId).toBe('unit-uuid-1');
      expect(result.status).toBe('Reserved');

      expect(db.state.insertCalls).toHaveLength(1);
      expect(db.state.insertCalls[0]!.table).toBe('booking_line_units');
      expect(db.state.insertCalls[0]!.row).toMatchObject({
        client_uuid: 'assign-client-uuid',
        booking_line_id: '22222222-2222-4222-8222-222222222222',
        product_unit_id: 'unit-uuid-1',
        assigned_by: 'user-coordinator-1',
      });

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.INVENTORY_RESERVED);
    });

    it('transitions a Draft booking to Booked, triggering database reservations (R-26)', async () => {
      const input: ReserveEquipmentInput = {
        id: 'BK-2026-0001',
      };

      const { result, events } = await reserveEquipmentConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.bookingId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.status).toBe('Reserved');

      expect(db.state.transitionCalls).toHaveLength(1);
      expect(db.state.transitionCalls[0]).toEqual({
        bookingId: '11111111-1111-4111-8111-111111111111',
        stage: 'Booked',
      });

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.INVENTORY_RESERVED);
    });

    it('throws error when target cannot be resolved and is not a valid UUID', async () => {
      const input: ReserveEquipmentInput = {
        id: 'NON-EXISTENT-BOOKING',
      };

      await expect(reserveEquipmentConfig.execute!(input, context)).rejects.toThrow(
        /Target booking or line "NON-EXISTENT-BOOKING" not found/
      );
    });
  });
});
