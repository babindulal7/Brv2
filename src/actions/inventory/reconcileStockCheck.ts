import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, safeUpdate, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type ReconcileStockCheckInput = {
  /** Target stock_audits.id (UUID) or audit_no */
  auditId?: string;
  /** Alias for auditId */
  sessionId?: string;
  /** Number of units scanned/verified */
  scannedCount: number;
  /** Total expected units */
  totalCount: number;
  /** Total count of discrepancies */
  discrepanciesCount?: number;
  /** Optional reconciliation notes */
  notes?: string;
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type ReconcileStockCheckResult = {
  success: boolean;
  auditId: string;
  auditNo: string;
  scannedCount: number;
  totalCount: number;
  status: string;
};

export const reconcileStockCheckConfig: ActionConfig<ReconcileStockCheckInput, ReconcileStockCheckResult> = {
  name: 'RECONCILE_STOCK_CHECK',
  permissions: ['inventory.audit'],
  implemented: true,

  validate: (input) => {
    if (input.scannedCount === undefined || input.scannedCount === null || input.scannedCount < 0) {
      throw new Error('Scanned count must be a non-negative number.');
    }
    if (input.totalCount === undefined || input.totalCount === null || input.totalCount < 0) {
      throw new Error('Total count must be a non-negative number.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = (input.auditId || input.sessionId || '').trim();
    let resolvedAudit: { id: string; audit_no: string; branch_id?: string; warehouse_id?: string } | null = null;

    if (rawTarget) {
      const { data } = await supabase
        .from('stock_audits')
        .select('id, audit_no, branch_id, warehouse_id')
        .or(`id.eq.${rawTarget},audit_no.eq.${rawTarget}`)
        .maybeSingle();

      if (data) {
        resolvedAudit = data;
      }
    }

    // If no target or not found by target, look for the current In Progress / Draft audit
    if (!resolvedAudit) {
      const { data } = await supabase
        .from('stock_audits')
        .select('id, audit_no, branch_id, warehouse_id')
        .or('status.eq.In Progress,status.eq.Draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        resolvedAudit = data;
      }
    }

    const now = new Date().toISOString();
    const actionUuid = input.clientUuid || generateClientUuid();
    const discrepancies = input.discrepanciesCount !== undefined
      ? input.discrepanciesCount
      : Math.max(0, input.totalCount - input.scannedCount);

    let auditId: string;
    let auditNo: string;

    if (resolvedAudit) {
      auditId = resolvedAudit.id;
      auditNo = resolvedAudit.audit_no;

      const patch: Record<string, unknown> = {
        status: 'Completed',
        completed_at: now,
        audited_by: ctx.userId,
        total_expected: input.totalCount,
        total_scanned: input.scannedCount,
        total_discrepancies: discrepancies,
        updated_at: now,
        updated_by: ctx.userId,
      };
      if (input.notes !== undefined) {
        patch.notes = input.notes.trim() || null;
      }

      await safeUpdate('stock_audits' as never, auditId, patch as never, actionUuid, {
        returnRow: false,
      });
    } else {
      // Create new reconciled stock audit
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('stock_audits')
        .select('*', { count: 'exact', head: true });
      const nextSeq = (count ?? 0) + 1;
      auditNo = `AUD-${year}-${String(nextSeq).padStart(4, '0')}`;

      // Resolve branch and warehouse
      const { data: branch } = await supabase.from('branches').select('id').limit(1).maybeSingle();
      const { data: warehouse } = await supabase.from('warehouses').select('id').limit(1).maybeSingle();

      const branchId = branch?.id || '00000000-0000-0000-0000-000000000001';
      const warehouseId = warehouse?.id || '00000000-0000-0000-0000-000000000001';

      const newAuditRow = {
        client_uuid: actionUuid,
        audit_no: auditNo,
        branch_id: branchId,
        warehouse_id: warehouseId,
        scope: 'Full warehouse',
        status: 'Completed',
        scheduled_date: now.split('T')[0],
        started_at: now,
        completed_at: now,
        audited_by: ctx.userId,
        total_expected: input.totalCount,
        total_scanned: input.scannedCount,
        total_discrepancies: discrepancies,
        notes: input.notes ? input.notes.trim() : 'Stock check reconciliation',
        created_by: ctx.userId,
        updated_by: ctx.userId,
      };

      const inserted = await idempotentInsert('stock_audits' as never, newAuditRow as never, {
        returnRow: false,
      });
      auditId = (inserted as { id?: string })?.id || actionUuid;
    }

    const events = [
      {
        type: EVENT_TYPES.STOCK_RECONCILED,
        payload: {
          auditId,
          auditNo,
          scannedCount: input.scannedCount,
          totalCount: input.totalCount,
          discrepanciesCount: discrepancies,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        auditId,
        auditNo,
        scannedCount: input.scannedCount,
        totalCount: input.totalCount,
        status: 'Completed',
      },
      events,
    };
  },
};

export const reconcileStockCheck = createAction<ReconcileStockCheckInput, ReconcileStockCheckResult>(reconcileStockCheckConfig);
