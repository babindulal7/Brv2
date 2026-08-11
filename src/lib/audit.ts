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
  DeviceType,
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
  /**
   * Device CLASS the action was taken on. Omitted falls back to `'Desktop'`, which is
   * the column's own DB default (`0007_admin_security.sql:253`), not a guess made here.
   * Law 13 — this is a capability fact the caller knows, never branched on in here.
   */
  deviceType?: DeviceType
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
      // `'Web / Desktop'` was not a member of `device_type` (0001_enums.sql:1402 —
      // Desktop | Mobile | Tablet), so every audit write Postgres ever saw would have
      // been rejected with an invalid-enum error and swallowed by the catch below.
      device_type: params.deviceType ?? 'Desktop',
    })
  } catch (err) {
    console.error('[AuditEngine] Failed to write audit event:', err)
  }
}
