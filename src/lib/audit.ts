/**
 * Audit Engine — Append-only audit logger
 *
 * Dispatches immutable audit records across all state changes, financial movements,
 * permission changes, and security events.
 */

import { idempotentInsert } from './dataAccess'
import type {
  AuditEventClass,
  AuditCategory,
  AuditModule,
  AuditAction,
  AuditSeverity,
  SystemRole,
  Json,
} from '../types/database'

export interface LogAuditParams {
  eventClass?: AuditEventClass
  category?: AuditCategory
  module: AuditModule
  action: AuditAction
  severity?: AuditSeverity
  status?: string
  tableName: string
  recordId: string
  actorId?: string | null
  actorRole?: SystemRole | null
  branchId?: string | null
  oldValues?: Json | null
  newValues?: Json | null
  reason?: string | null
}

/**
 * Dispatches an append-only audit event.
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
  try {
    await idempotentInsert('audit_events', {
      event_class: params.eventClass || 'status change',
      category: params.category || 'Rentals',
      module: params.module,
      action: params.action,
      severity: params.severity || 'Informational',
      status: params.status || 'Success',
      table_name: params.tableName,
      record_id: params.recordId,
      actor_id: params.actorId || null,
      actor_role: params.actorRole || null,
      branch_id: params.branchId || null,
      old_values: params.oldValues || null,
      new_values: params.newValues || null,
      reason: params.reason || null,
      device_type: 'Web / Desktop',
    })
  } catch (err) {
    console.error('[AuditEngine] Failed to write audit event:', err)
  }
}
