import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { reconcileStockCheckConfig, type ReconcileStockCheckInput } from '../reconcileStockCheck';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    audits: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        audit_no: 'AUD-2026-0001',
        status: 'In Progress',
        branch_id: 'branch-1',
        warehouse_id: 'wh-1',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        audit_no: 'AUD-2026-0002',
        status: 'Completed',
        branch_id: 'branch-1',
        warehouse_id: 'wh-1',
      },
    ],
    branches: [{ id: 'branch-uuid-1' }],
    warehouses: [{ id: 'wh-uuid-1' }],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined; options?: unknown }>,
    auditCount: 2,
  };

  const queryMock = () => {
    let currentTable = '';
    let orFilter = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        return chain;
      },
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) {
          return Promise.resolve({ count: state.auditCount, error: null });
        }
        return chain;
      },
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (currentTable === 'stock_audits') {
          if (orFilter.includes('id.eq.') || orFilter.includes('audit_no.eq.')) {
            const match = state.audits.find(
              (a) => orFilter.includes(a.id) || orFilter.includes(a.audit_no)
            );
            return { data: match || null, error: null };
          }
          if (orFilter.includes('status.eq.In Progress') || orFilter.includes('status.eq.Draft')) {
            const match = state.audits.find(
              (a) => a.status === 'In Progress' || a.status === 'Draft'
            );
            return { data: match || null, error: null };
          }
          return { data: null, error: null };
        }
        if (currentTable === 'branches') {
          return { data: state.branches[0] || null, error: null };
        }
        if (currentTable === 'warehouses') {
          return { data: state.warehouses[0] || null, error: null };
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
    return { id: (row.client_uuid as string) || 'generated-audit-uuid', ...row };
  },
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string, options?: unknown) => {
    db.state.updateCalls.push({ table, id, patch, clientUuid, options });
    return { data: patch, error: null };
  },
  generateClientUuid: () => 'generated-test-uuid',
}));

describe('reconcileStockCheck', () => {
  const context: ActionContext = {
    userId: 'user-floor-123',
    role: 'Warehouse',
  };

  beforeEach(() => {
    db.state.insertCalls = [];
    db.state.updateCalls = [];
  });

  describe('validation', () => {
    it('throws when scannedCount is missing or negative', () => {
      expect(() =>
        reconcileStockCheckConfig.validate!({ scannedCount: -1, totalCount: 10 } as ReconcileStockCheckInput)
      ).toThrow(/Scanned count must be a non-negative number/);

      expect(() =>
        reconcileStockCheckConfig.validate!({ totalCount: 10 } as unknown as ReconcileStockCheckInput)
      ).toThrow(/Scanned count must be a non-negative number/);
    });

    it('throws when totalCount is missing or negative', () => {
      expect(() =>
        reconcileStockCheckConfig.validate!({ scannedCount: 5, totalCount: -1 } as ReconcileStockCheckInput)
      ).toThrow(/Total count must be a non-negative number/);

      expect(() =>
        reconcileStockCheckConfig.validate!({ scannedCount: 5 } as unknown as ReconcileStockCheckInput)
      ).toThrow(/Total count must be a non-negative number/);
    });

    it('passes on valid counts', () => {
      expect(() =>
        reconcileStockCheckConfig.validate!({ scannedCount: 0, totalCount: 0 })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('reconciles and completes an existing audit by auditId', async () => {
      const input: ReconcileStockCheckInput = {
        auditId: '11111111-1111-4111-8111-111111111111',
        scannedCount: 45,
        totalCount: 50,
        notes: 'Some units missing cables',
      };

      const { result, events } = await reconcileStockCheckConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.auditId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.auditNo).toBe('AUD-2026-0001');
      expect(result.status).toBe('Completed');
      expect(result.scannedCount).toBe(45);
      expect(result.totalCount).toBe(50);

      expect(db.state.updateCalls).toHaveLength(1);
      const update = db.state.updateCalls[0]!;
      expect(update.table).toBe('stock_audits');
      expect(update.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(update.patch.status).toBe('Completed');
      expect(update.patch.total_expected).toBe(50);
      expect(update.patch.total_scanned).toBe(45);
      expect(update.patch.total_discrepancies).toBe(5);
      expect(update.patch.notes).toBe('Some units missing cables');
      expect(update.patch.audited_by).toBe('user-floor-123');

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.STOCK_RECONCILED);
      expect(events![0]!.payload).toMatchObject({
        auditId: '11111111-1111-4111-8111-111111111111',
        auditNo: 'AUD-2026-0001',
        scannedCount: 45,
        totalCount: 50,
        discrepanciesCount: 5,
        userId: 'user-floor-123',
      });
    });

    it('falls back to active in-progress audit when no target ID is supplied', async () => {
      const input: ReconcileStockCheckInput = {
        scannedCount: 20,
        totalCount: 20,
      };

      const { result, events } = await reconcileStockCheckConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.auditId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.auditNo).toBe('AUD-2026-0001');
      expect(db.state.updateCalls).toHaveLength(1);
      expect(db.state.updateCalls[0]!.patch.total_discrepancies).toBe(0);
      expect(events![0]!.type).toBe(EVENT_TYPES.STOCK_RECONCILED);
    });

    it('creates a new completed stock audit when no active audit is found', async () => {
      const origStatus = db.state.audits[0]!.status;
      db.state.audits[0]!.status = 'Completed';

      try {
        const input: ReconcileStockCheckInput = {
          scannedCount: 15,
          totalCount: 18,
          discrepanciesCount: 3,
          notes: 'Ad-hoc floor audit',
          clientUuid: 'custom-audit-uuid',
        };

        const { result, events } = await reconcileStockCheckConfig.execute!(input, context);

        expect(result.success).toBe(true);
        expect(result.auditNo).toMatch(/^AUD-\d{4}-\d{4}$/);
        expect(db.state.insertCalls).toHaveLength(1);

        const insert = db.state.insertCalls[0]!;
        expect(insert.table).toBe('stock_audits');
        expect(insert.row.client_uuid).toBe('custom-audit-uuid');
        expect(insert.row.status).toBe('Completed');
        expect(insert.row.total_scanned).toBe(15);
        expect(insert.row.total_expected).toBe(18);
        expect(insert.row.total_discrepancies).toBe(3);
        expect(insert.row.branch_id).toBe('branch-uuid-1');
        expect(insert.row.warehouse_id).toBe('wh-uuid-1');

        expect(events![0]!.type).toBe(EVENT_TYPES.STOCK_RECONCILED);
      } finally {
        db.state.audits[0]!.status = origStatus;
      }
    });

    it('uses custom discrepanciesCount if explicitly provided', async () => {
      const input: ReconcileStockCheckInput = {
        auditId: '11111111-1111-4111-8111-111111111111',
        scannedCount: 10,
        totalCount: 10,
        discrepanciesCount: 2,
      };

      const { result } = await reconcileStockCheckConfig.execute!(input, context);
      expect(result.success).toBe(true);
      expect(db.state.updateCalls[0]!.patch.total_discrepancies).toBe(2);
    });
  });
});
