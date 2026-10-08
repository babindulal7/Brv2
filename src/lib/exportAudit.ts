import { supabase } from './supabase'
import { logAuditEvent } from './audit'
import type { AuditModule } from '../types/database'

/**
 * One audit row per export (Booqable adoption spec G5/G6). Booqable logs none; a file that leaves the
 * building is the one thing worth knowing who took.
 *
 * Fire-and-forget on purpose: an audit outage must not stop an export (PLAN.md §4.36 — the database is the
 * audit of record for writes; an export writes nothing, so this row is the only record and a failure is
 * reported to monitoring by `logAuditEvent`, not thrown at the person clicking Export).
 *
 * `table_name` is `export:<list>` and `record_id` is the export's own id, so the Audit log can filter on it.
 * RULING 2026-10-07: namespaced action `export.created` lives in `new_values.event`.
 */
export interface ExportAuditInput {
  /** Screen the file came from — `rentals`, `inventory`, `finance.invoices`, … */
  list: string
  module: AuditModule
  rowCount: number
  /** The columns the file actually carries, in order. */
  columns?: readonly string[]
  /** The active filter / query string, so "which rows" is answerable later. */
  filter?: string
  /** True when the file carries phone, email or tax-id of a client. */
  includesPii?: boolean
}

export function recordExport(input: ExportAuditInput): void {
  void (async () => {
    let actorId: string | null = null
    try {
      const { data } = await supabase.auth.getSession()
      actorId = data.session?.user.id ?? null
    } catch {
      actorId = null
    }
    await logAuditEvent({
      category: 'Uncategorised',
      module: input.module,
      action: 'Export',
      severity: input.includesPii ? 'Medium' : 'Informational',
      tableName: `export:${input.list}`,
      recordId: crypto.randomUUID(),
      actorId,
      newValues: {
        event: 'export.created',
        list: input.list,
        rowCount: input.rowCount,
        columns: input.columns ? [...input.columns] : null,
        filter: input.filter ?? null,
        includesPii: input.includesPii ?? false,
      },
    })
  })()
}
