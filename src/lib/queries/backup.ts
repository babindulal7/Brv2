import { supabase } from '../supabase'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'

/**
 * # The backup history query — `backup_logs`
 *
 * Law 2's Single Query Rule, applied to the backup record. Backup & Restore
 * (`modules/admin/BackupRestore.tsx`) reads from here; no screen may hand-roll
 * a `supabase.from('backup_logs')`.
 *
 * ## The table (0007_admin_security.sql:294-313)
 *
 * "Immutable logs of database snapshots and encrypted backups" — the
 * migration's own words. Nothing in this build WRITES it yet: there is no
 * backup service, so rows appear only when one exists to record them. That is
 * exactly why the read must be real — the screen's old seed claimed 1,248
 * backups nobody ever took, on the one page whose whole job is to say whether
 * the data is protected.
 *
 * ## Who can read it — RESTRICTED, NOT EMPTY
 *
 * The live SELECT policy is `backup_logs_select` — `auth_user_role() in
 * ('Owner', 'Admin')` (0031:163-166, "same narrow tier as webhooks, not the
 * general config tier"). The route `/admin/backup` is reachable by five roles
 * (the money-surface gate admits Owner/Admin/Manager/Coordinator/Accounts), so
 * a **Manager, Coordinator or Accounts** session gets HTTP 200 and zero rows.
 * That is RLS, not emptiness — handed straight to `PageBody` it would render
 * "No backups yet", which claims the business has no backups. Gate the list
 * with `backupRestriction()` below, exactly as `queries/audit.ts` gates the
 * trail with `auditRestriction()`.
 *
 * ## Law 4 — immutable, and this module offers no way to change a row
 *
 * `backup_logs` carries update/delete reject triggers (0046:120-126). There is
 * no update, no delete and no insert here — a backup row is written by the
 * backup service when one exists, never by a screen. `listBackupLogs` reads;
 * that is the whole surface.
 *
 * ## No money crosses this boundary
 *
 * The table has no money column — `file_size_bytes` is a byte count, not an
 * amount — so nothing here calls `rupees()`/`toRupees()`. The Law 6 concern on
 * this surface is different and lives in the page: a backup FILE carries every
 * money column RLS withholds, which is why Download stays Owner-gated there.
 *
 * ## Mock mode
 *
 * `backup_logs` is not in the mock corpus (`lib/mock/corpus.ts` serves 13
 * tables; this is not one of them and is not in `UNSERVED` either). The mock
 * engine answers an unknown table with `[]` plus a console warning
 * (`lib/mock/client.ts:100-106`), so the screen renders an honest empty
 * history — which is also the truthful answer: no backup has ever been taken
 * of the mock corpus.
 */

type SystemRoleDb = Database['public']['Enums']['system_role']

/* ═══════════════════════════════════════════════════════════════════════════
 * Restricted, not empty — the guard the Backup screen spreads
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The two roles `backup_logs_select` admits (0031:163-166), and therefore the
 * two that receive any row at all. Derived from the live policy, never
 * invented — narrower than the trail's Owner/Admin/Manager because
 * `storage_location`/`checksum_sha256` describe backup infrastructure and
 * "nothing in this row is useful to non-admin staff" (0031's own comment).
 */
export const BACKUP_READ_ROLES = ['Owner', 'Admin'] as const satisfies readonly SystemRoleDb[]

/**
 * Why the surface is closed, in words, for `RestrictedState`. Says the session
 * may not read the backup record — NOT that no backups exist. "Restricted" and
 * "no backups" are different facts and only one is true.
 */
export const BACKUP_RESTRICTED_REASON =
  'The backup record describes backup infrastructure — storage locations and checksums — and reading it requires Owner or Admin. ' +
  'This is not a statement about whether any backups exist.'

/** The least-senior role that qualifies — who a refused session should ask. */
export const BACKUP_REQUIRED_ROLE = 'Admin'

export interface BackupRestriction {
  restricted: boolean
  restrictedReason: string
  restrictedRequiredRole: string
}

/**
 * The three `PageBody` props that turn an RLS-empty result into an honest
 * restricted state. Spread it; do not re-derive it.
 *
 * Returns a fixed shape unconditionally (the extra props are inert when
 * `restricted` is false) so `exactOptionalPropertyTypes` stays happy without a
 * conditional spread the caller could get wrong — same contract as
 * `auditRestriction()` and `financeRestriction()`.
 */
export function backupRestriction(role: SystemRoleDb | null | undefined): BackupRestriction {
  return {
    restricted: role == null || !(BACKUP_READ_ROLES as readonly string[]).includes(role),
    restrictedReason: BACKUP_RESTRICTED_REASON,
    restrictedRequiredRole: BACKUP_REQUIRED_ROLE,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The row
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A backup as the history list renders it. Every field maps to a column in
 * 0007:294-313; nothing is derived, computed or defaulted. Duration and a
 * human-readable size are the SCREEN's derivations from these facts, not this
 * module's — presentation stays out of the query layer.
 *
 * `checksum_sha256`, `client_uuid` and `created_at` exist on the table and are
 * deliberately not selected: no screen renders them, and `select('*')` is how
 * a column nobody reviewed leaks into the payload.
 */
export interface BackupLogListRow {
  id: string
  /** `backup_no` — the record's own number, unique (0007:309). The identifier the operator quotes. */
  backupNo: string
  /** `backup_type` — `text`, default 'Full' (0007:297). Free text at the schema, not an enum. */
  backupType: string
  /** `status` — `text`, default 'Completed' (0007:298). Free text at the schema; the page maps known values to tones and falls back to neutral. */
  status: string
  /** `storage_location` — where the file went (0007:299). Infrastructure detail; part of why RLS is Owner/Admin only. */
  storageLocation: string
  /** `file_size_bytes` — `bigint` (0007:300). A byte count, never money. PostgREST serialises bigint as a JS number. */
  fileSizeBytes: number
  /** `started_at` — `timestamptz not null` (0007:302), AD/UTC. BS is rendered, never stored (Law 7). */
  startedAtAd: string
  /** `completed_at` — `timestamptz not null` (0007:303), AD/UTC. */
  completedAtAd: string
  /** `initiated_by` — nullable `users.id` (0007:304). `null` means no session actor was recorded. NOT resolved to a name: `users` is self-scoped, so an embed would null out for every row but the viewer's own. */
  initiatedBy: string | null
  /** `error_message` — nullable (0007:305). Present when the backup did not complete cleanly. */
  errorMessage: string | null
}

const BACKUP_LOG_COLUMNS =
  'id, backup_no, backup_type, status, storage_location, file_size_bytes, ' +
  'started_at, completed_at, initiated_by, error_message'

interface RawBackupLogRow {
  id: string
  backup_no: string
  backup_type: string
  status: string
  storage_location: string
  file_size_bytes: number
  started_at: string
  completed_at: string
  initiated_by: string | null
  error_message: string | null
}

function toBackupLogRow(r: RawBackupLogRow): BackupLogListRow {
  return {
    id: r.id,
    backupNo: r.backup_no,
    backupType: r.backup_type,
    status: r.status,
    storageLocation: r.storage_location,
    fileSizeBytes: r.file_size_bytes,
    startedAtAd: r.started_at,
    completedAtAd: r.completed_at,
    initiatedBy: r.initiated_by,
    errorMessage: r.error_message,
  }
}

/**
 * What a free-text search would cover — both `text` columns an operator might
 * quote (0007:296, :299). Declared for the module's contract; the Backup
 * screen itself offers no search box.
 */
const BACKUP_SEARCH_COLUMNS = ['backup_no', 'storage_location'] as const

export interface ListBackupLogsOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
}

/**
 * The backup history, newest first.
 *
 * ⚠ Returns `{ rows: [], total: 0 }` for a Manager/Coordinator/Accounts
 * session — that is RLS, not emptiness. Read the header. Gate the list with
 * `backupRestriction()`.
 */
export async function listBackupLogs(opts: ListBackupLogsOptions = {}): Promise<ListQueryResult<BackupLogListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('backup_logs')
    .select(BACKUP_LOG_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? BACKUP_SEARCH_COLUMNS,
    // Newest first: a backup record is read from the most recent snapshot
    // backwards — the question is always "when were we last protected?".
    sort: filters.sort ?? { column: 'started_at', ascending: false },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `backup_logs.id`
    // is `uuid not null default gen_random_uuid() primary key` (0007:295).
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawBackupLogRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listBackupLogs failed: ${error.message}`)

  return { rows: (data ?? []).map(toBackupLogRow), total: count ?? null }
}
