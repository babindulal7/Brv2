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
 * The outcome of an audit write, so the caller can *know*.
 *
 * ⛔ This used to be `Promise<void>` with the failure going to `console.error`
 * and nowhere else, which is `BUG_SWEEP_ENGINES` `R3-5` / `PLAN.md` §4.36. The
 * damage was invisible by construction: a **Warehouse** actor completing a
 * return got `operation_sessions`, `return_lines` and the movements committed,
 * a success screen — and **no audit row anywhere**, because `operation_sessions`
 * is not one of the six trigger-covered tables. Nothing afterwards could
 * reconstruct who did it.
 *
 * Returning the outcome is the half that needs no ruling. What the caller then
 * DOES about a failure — proceed, fail the business verb with it, or queue the
 * row and warn until it drains — is **§4.36, still open**. Do not decide it here
 * and do not decide it at a call site; every current caller deliberately
 * proceeds, exactly as before, so this change is observably behaviour-neutral
 * until the ruling lands.
 */
export type AuditWriteResult = { ok: true; error: null } | { ok: false; error: Error }

/**
 * Dispatches an append-only audit event.
 *
 * Never throws — an audit outage must not become an unhandled rejection inside
 * a business verb. It reports instead, and the caller decides (see §4.36).
 */
export async function logAuditEvent(params: LogAuditParams): Promise<AuditWriteResult> {
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
    },
    /* An audit row is append-only and its id is never read by any caller, so
       there is nothing to read back — and asking for it required a SELECT that
       `audit_events` grants to Owner/Admin/Manager only, which is what made
       every Warehouse audit write fail. See `InsertOptions.returnRow`. */
    { returnRow: false })
    return { ok: true, error: null }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    // Kept: the console line is still the fastest signal in a dev session. It
    // is no longer the ONLY signal, which was the defect.
    console.error('[AuditEngine] Failed to write audit event:', error)
    return { ok: false, error }
  }
}
