import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type CompleteMaintenanceInput = {
  /** `maintenance_records.id` (UUID) or `record_no` (e.g. 'MNT-2026-0001'). */
  id: string;
  clientUuid?: string;
  findings?: string;
  actionsTaken?: string;
  cost?: number;
  completedAt?: string;
  status?: 'Completed' | 'Cancelled';
};

export type CompleteMaintenanceResult = {
  success: boolean;
  id: string;
  recordNo: string;
  status: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const completeMaintenanceConfig: ActionConfig<CompleteMaintenanceInput, CompleteMaintenanceResult> = {
  name: 'COMPLETE_MAINTENANCE',
  permissions: ['maintenance.complete'],
  implemented: true,

  validate: (input) => {
    if (!input.id || !input.id.trim()) {
      throw new Error('ID is required to complete maintenance.');
    }
    if (input.cost !== undefined && input.cost < 0) {
      throw new Error('Cost cannot be negative.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.id.trim();
    let resolvedId = rawId;
    let recordNo = rawId;

    if (UUID_RE.test(rawId)) {
      const { data, error } = await supabase
        .from('maintenance_records_v')
        .select('id, record_no, status')
        .eq('id', rawId)
        .maybeSingle();

      if (error || !data) {
        throw new Error(`Could not find maintenance record with ID: ${rawId}`);
      }
      resolvedId = data.id;
      recordNo = data.record_no;
    } else {
      const { data, error } = await supabase
        .from('maintenance_records_v')
        .select('id, record_no, status')
        .eq('record_no', rawId)
        .maybeSingle();

      if (error || !data) {
        throw new Error(`Could not find maintenance record with record number: ${rawId}`);
      }
      resolvedId = data.id;
      recordNo = data.record_no;
    }

    const actionUuid = input.clientUuid || generateClientUuid();
    const finalStatus = input.status || 'Completed';
    const completedAt = input.completedAt || new Date().toISOString();

    const patch: Record<string, unknown> = {
      status: finalStatus,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    };

    if (input.findings !== undefined) {
      patch.findings = input.findings.trim() || null;
    }
    if (input.actionsTaken !== undefined) {
      patch.actions_taken = input.actionsTaken.trim() || null;
    }
    if (input.cost !== undefined) {
      patch.cost = Number(input.cost);
    }

    // Law 6: returnRow: false prevents 42501 permission error on revoked money column 'cost'
    await safeUpdate('maintenance_records' as never, resolvedId, patch as never, actionUuid, {
      returnRow: false,
    });

    const events = [
      {
        type: EVENT_TYPES.MAINTENANCE_COMPLETED,
        payload: {
          id: resolvedId,
          recordNo,
          status: finalStatus,
          completedAt,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: resolvedId,
        recordNo,
        status: finalStatus,
      },
      events,
    };
  },
};

export const completeMaintenance = createAction<CompleteMaintenanceInput, CompleteMaintenanceResult>(completeMaintenanceConfig);
