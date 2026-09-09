import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { createSubRentalConfig, type CreateSubRentalInput } from '../createSubRental';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    bookings: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        booking_no: 'BK-2026-0001',
        duration_days: 3,
      },
    ],
    suppliers: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        supplier_code: 'SUP-001',
        name: 'Cine Gear Nepal',
      },
    ],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
    subrentalCount: 1,
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
      select: (_cols?: string, _opts?: { count?: string; head?: boolean }) => {
        return chain;
      },
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      eq: (field: string, val: unknown) => {
        eqField = field;
        eqValue = val;
        return chain;
      },
      then: (resolve: (val: unknown) => unknown) => {
        return Promise.resolve(resolve({ count: state.subrentalCount, error: null }));
      },
      maybeSingle: async () => {
        if (currentTable === 'bookings') {
          const match = state.bookings.find((b) =>
            (orFilter && (orFilter.includes(b.id) || orFilter.includes(b.booking_no))) ||
            (eqField === 'booking_no' && b.booking_no === eqValue) ||
            (eqField === 'id' && b.id === eqValue)
          );
          return { data: match || null, error: null };
        }
        if (currentTable === 'suppliers') {
          const match = state.suppliers.find((s) =>
            (orFilter && (orFilter.includes(s.id) || orFilter.includes(s.supplier_code))) ||
            (eqField === 'supplier_code' && s.supplier_code === eqValue) ||
            (eqField === 'id' && s.id === eqValue)
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
    return { id: (row.client_uuid as string) || 'generated-line-id', ...row };
  },
  generateClientUuid: () => 'mocked-client-uuid',
}));

describe('createSubRental', () => {
  const context: ActionContext = {
    userId: 'user-coordinator-1',
    role: 'Coordinator',
  };

  beforeEach(() => {
    db.state.insertCalls = [];
  });

  describe('validation', () => {
    it('throws when itemDescription is empty or missing', () => {
      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: '' } as CreateSubRentalInput)
      ).toThrow(/Item description is required/);

      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: '   ' } as CreateSubRentalInput)
      ).toThrow(/Item description is required/);
    });

    it('throws when costPaisa is negative', () => {
      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: 'ARRI Alexa', costPaisa: -100 })
      ).toThrow(/Cost amount must be a non-negative number/);
    });

    it('throws when chargePaisa is negative', () => {
      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: 'ARRI Alexa', chargePaisa: -100 })
      ).toThrow(/Client charge amount must be a non-negative number/);
    });

    it('throws when days or qty is less than 1', () => {
      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: 'ARRI Alexa', days: 0 })
      ).toThrow(/Days must be greater than or equal to 1/);

      expect(() =>
        createSubRentalConfig.validate!({ itemDescription: 'ARRI Alexa', qty: 0 })
      ).toThrow(/Quantity must be greater than or equal to 1/);
    });
  });

  describe('execute', () => {
    it('creates a standalone sub-rental reference without booking', async () => {
      const input: CreateSubRentalInput = {
        itemDescription: 'Sony FX9 Package',
        costPaisa: 3500000,
        vendorName: 'External Rental Studio',
      };

      const { result, events } = await createSubRentalConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.subRentalId).toMatch(/^SR-\d{4}-\d{4}$/);
      expect(result.lineId).toBeUndefined();
      expect(db.state.insertCalls).toHaveLength(0);

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.SUBRENTAL_CREATED);
      expect(events![0]!.payload).toMatchObject({
        subRentalId: result.subRentalId,
        itemDescription: 'Sony FX9 Package',
        costPaisa: 3500000,
        vendorName: 'External Rental Studio',
        userId: 'user-coordinator-1',
      });
    });

    it('creates sub-rental attached to a booking with booking_lines insertion', async () => {
      const input: CreateSubRentalInput = {
        bookingId: 'BK-2026-0001',
        vendorId: 'SUP-001',
        vendorName: 'Cine Gear Nepal',
        itemDescription: 'ARRI Alexa Mini Body',
        costPaisa: 3500000, // Rs 35,000
        chargePaisa: 4500000, // Rs 45,000
        days: 3,
        qty: 1,
        clientUuid: 'subrental-line-uuid-1',
      };

      const { result, events } = await createSubRentalConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.lineId).toBe('subrental-line-uuid-1');

      expect(db.state.insertCalls).toHaveLength(1);
      const insert = db.state.insertCalls[0]!;
      expect(insert.table).toBe('booking_lines');
      expect(insert.options).toEqual({ returnRow: false });
      expect(insert.row).toMatchObject({
        client_uuid: 'subrental-line-uuid-1',
        booking_id: '11111111-1111-4111-8111-111111111111',
        line_type: 'Sub-rental',
        description: 'ARRI Alexa Mini Body',
        qty: 1,
        days: 3,
        rate: 45000,
        supplier_id: '22222222-2222-4222-8222-222222222222',
        supplier_cost: 35000,
        markup_amount: 100000, // (45000 * 3) - 35000 = 135000 - 35000 = 100000
        created_by: 'user-coordinator-1',
      });

      expect(events![0]!.payload).toMatchObject({
        bookingId: '11111111-1111-4111-8111-111111111111',
        bookingNo: 'BK-2026-0001',
        lineId: 'subrental-line-uuid-1',
        vendorId: 'SUP-001',
        itemDescription: 'ARRI Alexa Mini Body',
      });
    });
  });
});
