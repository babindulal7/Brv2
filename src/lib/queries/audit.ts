import { supabase } from '../supabase'
import { getBusinessToday, NPT_OFFSET_MIN } from '../bs'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import { Constants } from '../../types/supabase'
import type { Database, Json } from '../../types/supabase'

/**
 * # The audit trail query — `audit_events`
 *
 * Law 2's Single Query Rule, applied to the append-only trail. Audit Log
 * (`modules/admin/AuditLog.tsx`) reads from here; no screen may hand-roll a
 * `supabase.from('audit_events')`.
 *
 * ## The table (0007_admin_security.sql:237-261)
 *
 * Written by `lib/audit.ts` `logAuditEvent` (every covered business verb) and
 * by the DB's own `log_audit_event()` trigger on the six trigger-covered
 * tables (0010). Every column this module selects was verified against the
 * generated `src/types/supabase.ts` `audit_events.Row`.
 *
 * ## Who can read it — RESTRICTED, NOT EMPTY
 *
 * The live SELECT policy is `audit_events_select` — `auth_user_role() in
 * ('Owner', 'Admin', 'Manager')` (0018:179-184, superseding 0011:199-203 which
 * named only Owner/Manager). INSERT is `with check (true)` (0011:205-207): every
 * session may append, three roles may read back.
 *
 * The route `/admin/audit-log` is reachable by five roles (the money-surface
 * gate admits Owner/Admin/Manager/Coordinator/Accounts), so a **Coordinator or
 * Accounts** session gets HTTP 200 and zero rows from this table. That is RLS,
 * not emptiness — handed straight to `PageBody` it would render "No audit
 * events yet", which claims the business has no history. Gate the screen with
 * `auditRestriction()` below, exactly as `queries/finance.ts` gates the money
 * ledgers with `financeRestriction()`.
 *
 * ## Law 4 — append-only, and this module offers no way to change a row
 *
 * `audit_events` is immutable at the API layer (`dataAccess.ts` lists it) and
 * backstopped in the DB (0046). There is no update, no delete and no archive
 * here, and there must never be one — §10.4 makes the screen view-only for
 * every role including Owner. `listAuditEvents` reads; that is the whole
 * surface.
 *
 * ## No money crosses this boundary
 *
 * The table has no money column, so nothing here calls `rupees()`/`toRupees()`.
 * `old_values`/`new_values` are `jsonb` snapshots of what a writer recorded —
 * historical record content rendered verbatim, never re-priced. Money-blind
 * roles cannot reach even those: the SELECT policy above excludes all four.
 *
 * ## Mock mode
 *
 * `audit_events` is not in the mock corpus (`lib/mock/corpus.ts` serves 13
 * tables; this is not one and is not in `UNSERVED` either). The mock engine
 * answers an unknown table with `[]` plus a console warning
 * (`lib/mock/client.ts:100-106`), so the screen renders an honest empty trail —
 * and rows written *this session* through `logAuditEvent` land in the mock
 * store's overlay and are served back.
 */

type AuditActionDb = Database['public']['Enums']['audit_action']
type AuditCategoryDb = Database['public']['Enums']['audit_category']
type AuditEventClassDb = Database['public']['Enums']['audit_event_class']
type AuditModuleDb = Database['public']['Enums']['audit_module']
type AuditSeverityDb = Database['public']['Enums']['audit_severity']
type AuditStatusDb = Database['public']['Enums']['audit_status']
type DeviceTypeDb = Database['public']['Enums']['device_type']
type SystemRoleDb = Database['public']['Enums']['system_role']

/* ═══════════════════════════════════════════════════════════════════════════
 * Restricted, not empty — the guard the Audit Log screen spreads
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The three roles `audit_events_select` admits (0018:179-184), and therefore
 * the three that receive any row at all. Derived from the live policy, never
 * invented — 'find the RLS policy and mirror it'. The same set appears as
 * `BACK_OFFICE` in `lib/rbac.ts:99`; kept as data here so the screen can gate
 * on the policy that actually governs this table.
 */
export const AUDIT_READ_ROLES = ['Owner', 'Admin', 'Manager'] as const satisfies readonly SystemRoleDb[]

/**
 * Why the surface is closed, in words, for `RestrictedState`. Says the session
 * may not read the trail — NOT that the trail is empty. The distinction is the
 * point: "restricted" and "no history" are different facts and only one is true.
 */
export const AUDIT_RESTRICTED_REASON =
  'The audit trail is an investigation record, and reading it requires Owner, Admin or Manager. ' +
  'This is not a statement about whether any entries exist.'

/** The least-senior role that qualifies — who a refused session should ask. */
export const AUDIT_REQUIRED_ROLE = 'Manager'

export interface AuditRestriction {
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
 * `financeRestriction()`.
 */
export function auditRestriction(role: SystemRoleDb | null | undefined): AuditRestriction {
  return {
    restricted: role == null || !(AUDIT_READ_ROLES as readonly string[]).includes(role),
    restrictedReason: AUDIT_RESTRICTED_REASON,
    restrictedRequiredRole: AUDIT_REQUIRED_ROLE,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Filter vocabularies — the generated enum arrays, never hand-listed
 * ═══════════════════════════════════════════════════════════════════════════ */

/** `audit_module` in declaration order — the `[entity ▾]` select's options. */
export const AUDIT_MODULES = Constants.public.Enums.audit_module

/**
 * `system_role` in declaration order — the `[user ▾]` select's options.
 *
 * The filter is by ROLE rather than by user name, honestly: `users` is
 * self-scoped (its only SELECT policy is `id = current_setting(...)`, 0020:55),
 * so an actor-name embed would resolve for exactly one row — the viewer's own —
 * and render "unknown" beside everyone else's entries. `actor_role` is stamped
 * on the event itself (the role held AT THE TIME, 0007:249) and needs no join.
 */
export const AUDIT_ACTOR_ROLES = Constants.public.Enums.system_role

/* ═══════════════════════════════════════════════════════════════════════════
 * The row
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * An audit event as the trail renders it. Every field maps to a column in
 * 0007:237-261; nothing is derived, computed or defaulted.
 */
export interface AuditEventListRow {
  id: string
  /** `created_at` — `timestamptz not null default now()` (0007:258), AD/UTC. BS is rendered, never stored (Law 7). */
  createdAtAd: string
  /** `actor_id` — nullable `users.id` (0007:248). `null` means a system write with no session actor. NOT resolved to a name — see `AUDIT_ACTOR_ROLES`. */
  actorId: string | null
  /** `actor_role` — the role held at the time of the act, not now (0007:249). Nullable on the same terms as `actorId`. */
  actorRole: SystemRoleDb | null
  action: AuditActionDb
  module: AuditModuleDb
  category: AuditCategoryDb
  eventClass: AuditEventClassDb
  severity: AuditSeverityDb
  status: AuditStatusDb
  /** `table_name` — which table the event is about (0007:246). The entity kind, in schema vocabulary. */
  tableName: string
  /** `record_id` — the row the event is about (0007:247). A uuid, not a document number. */
  recordId: string
  branchId: string | null
  /**
   * `ip_address` — `inet`, nullable (0007:251). PostgREST serialises it as
   * text; carried as a string or `null`, never parsed further here.
   */
  ipAddress: string | null
  userAgent: string | null
  deviceType: DeviceTypeDb
  /** `old_values` / `new_values` — `jsonb` snapshots as the writer recorded them (0007:254-255). `null` means the writer sent none. */
  oldValues: Json | null
  newValues: Json | null
  /** `diff` — `jsonb`, nullable (0007:256). Carried but not interpreted: no ruling fixes its shape, so screens derive their own before → after from the two snapshots. */
  diff: Json | null
  reason: string | null
}

/**
 * Columns the trail needs, named explicitly — `select('*')` is how a column
 * nobody reviewed leaks into the payload. No embeds: `actor_id` → `users` would
 * null out for every row but the viewer's own (see `AUDIT_ACTOR_ROLES`), and
 * nothing on this screen needs `branches`.
 */
const AUDIT_EVENT_COLUMNS =
  'id, created_at, event_class, category, module, action, severity, status, ' +
  'table_name, record_id, actor_id, actor_role, branch_id, ' +
  'ip_address, user_agent, device_type, old_values, new_values, diff, reason'

interface RawAuditEventRow {
  id: string
  created_at: string
  event_class: AuditEventClassDb
  category: AuditCategoryDb
  module: AuditModuleDb
  action: AuditActionDb
  severity: AuditSeverityDb
  status: AuditStatusDb
  table_name: string
  record_id: string
  actor_id: string | null
  actor_role: SystemRoleDb | null
  branch_id: string | null
  /** `inet` arrives as text over PostgREST; the generated type says `unknown`, so it is narrowed here, once. */
  ip_address: unknown
  user_agent: string | null
  device_type: DeviceTypeDb
  old_values: Json | null
  new_values: Json | null
  diff: Json | null
  reason: string | null
}

function toAuditEventRow(r: RawAuditEventRow): AuditEventListRow {
  return {
    id: r.id,
    createdAtAd: r.created_at,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    action: r.action,
    module: r.module,
    category: r.category,
    eventClass: r.event_class,
    severity: r.severity,
    status: r.status,
    tableName: r.table_name,
    recordId: r.record_id,
    branchId: r.branch_id,
    // `inet` over PostgREST is a string; anything else (or null) becomes null
    // rather than "[object Object]" in an investigation record.
    ipAddress: typeof r.ip_address === 'string' && r.ip_address.length > 0 ? r.ip_address : null,
    userAgent: r.user_agent,
    deviceType: r.device_type,
    oldValues: r.old_values,
    newValues: r.new_values,
    diff: r.diff,
    reason: r.reason,
  }
}

/**
 * What a free-text search would cover. Both are `text` columns on the table
 * (0007:246, :257). Declared for the module's contract; the Audit Log screen
 * itself offers no search box (§10.4 draws three selects and nothing typed).
 */
const AUDIT_SEARCH_COLUMNS = ['table_name', 'reason'] as const

export interface ListAuditEventsOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
}

/**
 * The audit trail, newest first.
 *
 * ⚠ Returns `{ rows: [], total: 0 }` for a Coordinator/Accounts session — that
 * is RLS, not emptiness. Read the header. Gate the screen with
 * `auditRestriction()`.
 */
export async function listAuditEvents(opts: ListAuditEventsOptions = {}): Promise<ListQueryResult<AuditEventListRow>> {
  const { withCount, ...filters } = opts

  const base = supabase
    .from('audit_events')
    .select(AUDIT_EVENT_COLUMNS, withCount ? { count: 'exact' } : undefined)

  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? AUDIT_SEARCH_COLUMNS,
    // Newest first: a trail is read from the most recent act backwards. The
    // table's own index agrees — `idx_audit_events_created_at ... desc` (0007:267).
    sort: filters.sort ?? { column: 'created_at', ascending: false },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `audit_events.id`
    // is `uuid not null default gen_random_uuid() primary key` (0007:238).
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawAuditEventRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listAuditEvents failed: ${error.message}`)

  return { rows: (data ?? []).map(toAuditEventRow), total: count ?? null }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Named filter sets
 * ═══════════════════════════════════════════════════════════════════════════ */

/** One record's own trail — `idx_audit_events_table_record` (0007:265) exists for exactly this. */
export function auditForRecord(tableName: string, recordId: string): ListFilters {
  return {
    chips: { table_name: [tableName], record_id: [recordId] },
    sort: { column: 'created_at', ascending: false },
  }
}

/**
 * The KPI strip's four counts, replacing the seed's hand-derived
 * Entries / Voided / Archived / Reversals.
 *
 * The old three cannot be asked of the real table: `audit_action` (0001) has no
 * 'Void' and no 'Reverse' member — those were the SEED file's own vocabulary.
 * These four are questions the schema answers directly, each an enum member
 * quoted from the generated types, none invented:
 *
 *  - `entries`  — the whole trail.
 *  - `failed`   — `status = 'Failed'`: writes that did not land.
 *  - `blocked`  — `status = 'Blocked'`: acts refused by policy.
 *  - `critical` — `severity = 'Critical'`: the entries an investigator reads first.
 *
 * Each set carries a one-row page: the caller passes it through `useList` with
 * `withCount: true` and reads `total`, so the cost is four counts, not four
 * lists — the `RENTAL_KPI_FILTERS` pattern, exactly.
 */
export const AUDIT_KPI_FILTERS: Record<'entries' | 'failed' | 'blocked' | 'critical', ListFilters> = {
  entries: { page: { index: 0, size: 1 } },
  failed: { chips: { status: ['Failed'] satisfies AuditStatusDb[] }, page: { index: 0, size: 1 } },
  blocked: { chips: { status: ['Blocked'] satisfies AuditStatusDb[] }, page: { index: 0, size: 1 } },
  critical: { chips: { severity: ['Critical'] satisfies AuditSeverityDb[] }, page: { index: 0, size: 1 } },
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The `[date ▾]` select — relative periods over `created_at`
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The periods the date select offers. Relative windows rather than a list of
 * days because the trail's days cannot be enumerated without a
 * `select distinct` this layer does not do — the seed built its day list from
 * six literal rows, which is exactly the pattern that dies against a table.
 */
export const AUDIT_PERIODS = ['All time', 'Today', 'Last 7 days', 'Last 30 days'] as const
export type AuditPeriod = (typeof AUDIT_PERIODS)[number]

/**
 * `+05:45`, FORMATTED from `bs.ts`'s number rather than typed again — the same
 * derivation as `queries/finance.ts:1475` and `queries/bookings.ts`, so there is
 * still exactly one copy of Nepal's offset in the product (`NPT_OFFSET_MIN`).
 */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
  2,
  '0',
)}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

const DAY_MS = 86_400_000

/**
 * Period → a `created_at` bound, or `{}` for 'All time'.
 *
 * `created_at` is a `timestamptz`, so the bound must be the INSTANT the Nepal
 * day began, not a bare `YYYY-MM-DD` — Postgres reads a bare date as midnight
 * UTC, which is 05:45 the same morning in Kathmandu, and "Today" would start
 * 5¾ hours late. The day itself comes from `getBusinessToday()` (the one
 * `today` in the product); windows are inclusive of today, so 'Last 7 days'
 * reaches back six calendar days and runs to now (no upper bound — the trail
 * cannot contain the future, and an appended row must not fall off "Today"
 * while the operator is reading it).
 *
 * @param now Override for tests, forwarded to `getBusinessToday`.
 */
export function auditPeriodFilters(period: AuditPeriod, now: Date = new Date()): ListFilters {
  if (period === 'All time') return {}
  const daysBack = period === 'Today' ? 0 : period === 'Last 7 days' ? 6 : 29
  const startDay = new Date(getBusinessToday(now).getTime() - daysBack * DAY_MS).toISOString().slice(0, 10)
  return {
    dateRange: { column: 'created_at', fromAd: `${startDay}T00:00:00.000${NPT_OFFSET}` },
  }
}
