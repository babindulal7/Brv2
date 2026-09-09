import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type CreateMaintenanceJobInput = {
  /** Optional client-side idempotency UUID (Law 8). */
  clientUuid?: string;
  /** `product_units.id` (UUID). */
  productUnitId?: string;
  /** Or serial number (e.g. 'SN-001') to resolve to product_unit_id */
  serialNo?: string;
  /** 'Preventive Service' | 'Repair' | 'Calibration' | 'Routine Inspection' (default: 'Preventive Service') */
  maintenanceType?: string;
  /** 'Normal' | 'Urgent' | 'Low' (default: 'Normal') */
  priority?: string;
  /** 'Scheduled' | 'In Progress' (default: 'Scheduled') */
  status?: string;
  /** Detailed description of required work */
  description: string;
  /** Scheduled date in YYYY-MM-DD (defaults to current_date) */
  scheduledDate?: string;
  /** Optional vendor or service partner name */
  vendorName?: string;
  /** Estimated or actual cost in rupees (numeric(14,2)) */
  cost?: number;
  /** User UUID of technician assigned */
  performedBy?: string;
  /** Custom record number (e.g. 'MNT-2026-0001') */
  recordNo?: string;
};

export type CreateMaintenanceJobResult = {
  success: boolean;
  id: string;
  recordNo: string;
};

export const createMaintenanceJobConfig: ActionConfig<CreateMaintenanceJobInput, CreateMaintenanceJobResult> = {
  name: 'CREATE_MAINTENANCE_JOB',
  permissions: ['maintenance.create'],
  implemented: true,

  validate: (input) => {
    if (!input.description || !input.description.trim()) {
      throw new Error('Description is required for maintenance job.');
    }
    if (!input.productUnitId && !input.serialNo) {
      throw new Error('Either productUnitId or serialNo is required to identify the equipment unit.');
    }
    if (input.cost !== undefined && input.cost < 0) {
      throw new Error('Cost cannot be negative.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    let resolvedUnitId = input.productUnitId;
    let serialNumber = input.serialNo;

    // Resolve productUnitId if only serialNo was passed
    if (!resolvedUnitId && input.serialNo) {
      const { data: unit, error: unitError } = await supabase
        .from('product_units')
        .select('id, serial_number')
        .or(`serial_number.eq.${input.serialNo},unit_code.eq.${input.serialNo}`)
        .maybeSingle();

      if (unitError || !unit) {
        throw new Error(`Could not find equipment unit with serial/code: ${input.serialNo}`);
      }
      resolvedUnitId = unit.id;
      serialNumber = unit.serial_number ?? input.serialNo;
    }

    if (!resolvedUnitId) {
      throw new Error('Equipment unit id could not be resolved.');
    }

    // Generate record_no if not provided
    let recordNo = input.recordNo?.trim();
    if (!recordNo) {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('maintenance_records')
        .select('*', { count: 'exact', head: true });
      const nextSeq = (count ?? 0) + 1;
      recordNo = `MNT-${year}-${String(nextSeq).padStart(4, '0')}`;
    }

    const clientUuid = input.clientUuid || generateClientUuid();
    const maintenanceType = input.maintenanceType || 'Preventive Service';
    const priority = input.priority || 'Normal';
    const status = input.status || 'Scheduled';
    const scheduledDate = input.scheduledDate || new Date().toISOString().split('T')[0];

    const row = {
      client_uuid: clientUuid,
      record_no: recordNo,
      product_unit_id: resolvedUnitId,
      maintenance_type: maintenanceType,
      priority,
      status,
      description: input.description.trim(),
      scheduled_date: scheduledDate,
      vendor_name: input.vendorName ? input.vendorName.trim() : null,
      cost: input.cost !== undefined ? Number(input.cost) : 0,
      performed_by: input.performedBy || null,
      created_by: ctx.userId,
    };

    // Law 6: return explicit granted columns, avoiding revoked 'cost' echo
    const inserted = await idempotentInsert('maintenance_records' as never, row as never, {
      returningColumns: 'id, record_no, status, product_unit_id',
    });

    const insertedId = (inserted as { id?: string })?.id || clientUuid;

    const events = [
      {
        type: EVENT_TYPES.MAINTENANCE_STARTED,
        payload: {
          id: insertedId,
          recordNo,
          productUnitId: resolvedUnitId,
          serialNo: serialNumber,
          type: maintenanceType,
          priority,
          status,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: insertedId,
        recordNo,
      },
      events,
    };
  },
};

export const createMaintenanceJob = createAction<CreateMaintenanceJobInput, CreateMaintenanceJobResult>(createMaintenanceJobConfig);
