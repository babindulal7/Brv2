import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMaintenanceJobConfig, type CreateMaintenanceJobInput } from '../createMaintenanceJob';
import { completeMaintenanceConfig, type CompleteMaintenanceInput } from '../completeMaintenance';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    units: [
      { id: '11111111-1111-4111-8111-111111111111', serial_number: 'SN-001', unit_code: 'CAM-A1' },
    ],
    maintenanceRecords: [
      { id: '22222222-2222-4222-8222-222222222222', record_no: 'MNT-2026-0001', status: 'Scheduled' },
    ],
    insertCalls: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }>,
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined; options?: unknown }>,
    insertCount: 0,
  };

  const queryMock = () => {
    let currentTable = '';
    let filterField = '';
    let filterValue: unknown = '';
    let orFilter = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        return chain;
      },
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) {
          return Promise.resolve({ count: state.insertCount, error: null });
        }
        return chain;
      },
      eq: (field: string, val: unknown) => {
        filterField = field;
        filterValue = val;
        return chain;
      },
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      maybeSingle: async () => {
        if (currentTable === 'product_units') {
          const match = state.units.find(
            (u) =>
              (orFilter && (orFilter.includes(u.serial_number) || orFilter.includes(u.unit_code))) ||
              (filterField && (u as Record<string, unknown>)[filterField] === filterValue)
          );
          return { data: match || null, error: null };
        }
        if (currentTable === 'maintenance_records_v') {
          const match = state.maintenanceRecords.find(
            (m) => (filterField && (m as Record<string, unknown>)[filterField] === filterValue)
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
    };

    return chain;
  };

  const qInstance = queryMock();

  return {
    state,
    supabase: {
      from: (t: string) => qInstance.from(t),
    },
    idempotentInsert: async (table: string, row: Record<string, unknown>, options?: unknown) => {
      state.insertCalls.push({ table, row, options });
      state.insertCount++;
      return { id: (row.client_uuid as string) || 'generated-id-1', ...(row as object) };
    },
    safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string, options?: unknown) => {
      state.updateCalls.push({ table, id, patch, clientUuid, options });
      return { data: null, error: null };
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: db.idempotentInsert,
  safeUpdate: db.safeUpdate,
  generateClientUuid: () => 'generated-uuid-mock',
}));

describe('Maintenance Actions', () => {
  beforeEach(() => {
    db.state.insertCalls = [];
    db.state.updateCalls = [];
    db.state.insertCount = 0;
  });

  describe('CREATE_MAINTENANCE_JOB', () => {
    it('declares implemented: true and permissions: [maintenance.create]', () => {
      expect(createMaintenanceJobConfig.implemented).toBe(true);
      expect(createMaintenanceJobConfig.permissions).toEqual(['maintenance.create']);
    });

    it('validates input: requires description', () => {
      expect(() =>
        createMaintenanceJobConfig.validate({
          description: '',
          productUnitId: '11111111-1111-4111-8111-111111111111',
        })
      ).toThrow(/Description is required/);
    });

    it('validates input: requires productUnitId or serialNo', () => {
      expect(() =>
        createMaintenanceJobConfig.validate({
          description: 'Routine sensor cleaning',
        })
      ).toThrow(/Either productUnitId or serialNo is required/);
    });

    it('validates input: rejects negative cost', () => {
      expect(() =>
        createMaintenanceJobConfig.validate({
          description: 'Sensor cleaning',
          serialNo: 'SN-001',
          cost: -50,
        })
      ).toThrow(/Cost cannot be negative/);
    });

    it('creates maintenance record with productUnitId and emits EVENT_TYPES.MAINTENANCE_STARTED', async () => {
      const input: CreateMaintenanceJobInput = {
        productUnitId: '11111111-1111-4111-8111-111111111111',
        description: 'Check optical prism alignment',
        maintenanceType: 'Preventive Service',
        priority: 'Urgent',
        cost: 3500,
        clientUuid: 'action-uuid-mnt-1',
      };

      const res = await createMaintenanceJobConfig.execute(input, {
        userId: 'tech-user-1',
        role: 'Technician',
      });

      expect(res.result.success).toBe(true);
      expect(res.result.id).toBe('action-uuid-mnt-1');
      expect(res.result.recordNo).toMatch(/^MNT-\d{4}-\d{4}$/);

      expect(db.state.insertCalls).toHaveLength(1);
      const call = db.state.insertCalls[0]!;
      expect(call.table).toBe('maintenance_records');
      expect(call.row.product_unit_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(call.row.maintenance_type).toBe('Preventive Service');
      expect(call.row.priority).toBe('Urgent');
      expect(call.row.cost).toBe(3500);
      expect(call.row.created_by).toBe('tech-user-1');
      // Law 6 check: explicit returning columns avoiding revoked money column echo
      expect(call.options).toEqual({ returningColumns: 'id, record_no, status, product_unit_id' });

      expect(res.events).toHaveLength(1);
      expect(res.events[0]!.type).toBe(EVENT_TYPES.MAINTENANCE_STARTED);
      expect(res.events[0]!.payload).toMatchObject({
        id: 'action-uuid-mnt-1',
        productUnitId: '11111111-1111-4111-8111-111111111111',
        type: 'Preventive Service',
        priority: 'Urgent',
        userId: 'tech-user-1',
      });
    });

    it('resolves unit by serial number when productUnitId is not given', async () => {
      const input: CreateMaintenanceJobInput = {
        serialNo: 'SN-001',
        description: 'Lubricate zoom gears',
      };

      const res = await createMaintenanceJobConfig.execute(input, {
        userId: 'tech-user-2',
        role: 'Warehouse',
      });

      expect(res.result.success).toBe(true);
      expect(db.state.insertCalls).toHaveLength(1);
      expect(db.state.insertCalls[0]!.row.product_unit_id).toBe('11111111-1111-4111-8111-111111111111');
    });
  });

  describe('COMPLETE_MAINTENANCE', () => {
    it('declares implemented: true and permissions: [maintenance.complete]', () => {
      expect(completeMaintenanceConfig.implemented).toBe(true);
      expect(completeMaintenanceConfig.permissions).toEqual(['maintenance.complete']);
    });

    it('validates input: requires id', () => {
      expect(() => completeMaintenanceConfig.validate({ id: '' })).toThrow(/ID is required/);
    });

    it('validates input: rejects negative cost', () => {
      expect(() =>
        completeMaintenanceConfig.validate({
          id: '22222222-2222-4222-8222-222222222222',
          cost: -100,
        })
      ).toThrow(/Cost cannot be negative/);
    });

    it('completes maintenance by UUID with Law 6 safeUpdate and emits EVENT_TYPES.MAINTENANCE_COMPLETED', async () => {
      const input: CompleteMaintenanceInput = {
        id: '22222222-2222-4222-8222-222222222222',
        findings: 'Prism had 0.2mm tilt',
        actionsTaken: 'Recalibrated optical axis and tightened mounting bracket',
        cost: 4200,
        status: 'Completed',
        clientUuid: 'action-uuid-complete-1',
      };

      const res = await completeMaintenanceConfig.execute(input, {
        userId: 'tech-user-1',
        role: 'Technician',
      });

      expect(res.result.success).toBe(true);
      expect(res.result.id).toBe('22222222-2222-4222-8222-222222222222');
      expect(res.result.recordNo).toBe('MNT-2026-0001');
      expect(res.result.status).toBe('Completed');

      expect(db.state.updateCalls).toHaveLength(1);
      const updateCall = db.state.updateCalls[0]!;
      expect(updateCall.table).toBe('maintenance_records');
      expect(updateCall.id).toBe('22222222-2222-4222-8222-222222222222');
      expect(updateCall.patch).toMatchObject({
        status: 'Completed',
        findings: 'Prism had 0.2mm tilt',
        actions_taken: 'Recalibrated optical axis and tightened mounting bracket',
        cost: 4200,
        updated_by: 'tech-user-1',
      });
      // Law 6: returnRow: false prevents 42501 on revoked money column
      expect(updateCall.options).toEqual({ returnRow: false });

      expect(res.events).toHaveLength(1);
      expect(res.events[0]!.type).toBe(EVENT_TYPES.MAINTENANCE_COMPLETED);
      expect(res.events[0]!.payload).toMatchObject({
        id: '22222222-2222-4222-8222-222222222222',
        recordNo: 'MNT-2026-0001',
        status: 'Completed',
        userId: 'tech-user-1',
      });
    });

    it('completes maintenance by record_no', async () => {
      const input: CompleteMaintenanceInput = {
        id: 'MNT-2026-0001',
        actionsTaken: 'Routine test passed',
      };

      const res = await completeMaintenanceConfig.execute(input, {
        userId: 'tech-user-1',
        role: 'Technician',
      });

      expect(res.result.success).toBe(true);
      expect(res.result.id).toBe('22222222-2222-4222-8222-222222222222');
      expect(res.result.recordNo).toBe('MNT-2026-0001');
      expect(db.state.updateCalls[0]!.id).toBe('22222222-2222-4222-8222-222222222222');
    });
  });
});
