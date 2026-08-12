import { issue } from './numbering'

/**
 * **Audit log seed — `10_TOOLS.md` §10.4.**
 *
 * > *Append-only. View-only for every role including Owner. No edit, no delete,
 * > no bulk action anywhere on this page.*
 *
 * Three properties this file is built to hold:
 *
 * **1 · Identifiers are issued, never typed.** `WIREFRAME_RULINGS_2026-08-12.md`
 * §2.2 — *"the prefixes are configuration, not constants. No module may hardcode
 * a prefix."* A row therefore carries a sequence **code** and a **number**, and
 * the display string comes from `numbering.ts`'s `issue()`. The previous version
 * of this file wrote `'Invoice INV-45'` as a literal; if the Invoice prefix is
 * ever edited in Settings ▸ Numbering, that string becomes a quiet lie in an
 * append-only record, which is the worst place in the product for one.
 *
 * **2 · Every headline figure is derived.** The old `AUDIT_METRICS` hand-typed
 * `totalMutations: 1240` beside three rows. Rulings §8: *"never fabricate a
 * figure … never a plausible default."* The counts below are computed from
 * `AUDIT_ROWS`, so the strip cannot claim more history than the table shows.
 * `RETENTION_NOTE` states the policy without pretending the seed contains it.
 *
 * **3 · No mutation surface exists, at any layer.** There is no update, delete,
 * archive or bulk helper in this file and none is to be added. §10.4 makes the
 * screen view-only for *every* role, so the absence starts here rather than
 * being enforced by a disabled button somebody can re-enable.
 */

/** The sequence a referenced entity is numbered by, plus its counter. */
export interface AuditEntityRef {
  /** Entity kind as the operator reads it — "Invoice", "Asset", "Booking". */
  kind: string
  /** A `data/numbering.ts` sequence code, or `null` for a thing with no sequence. */
  code: string | null
  /** The counter inside that sequence. Ignored when `code` is null. */
  number?: number
  /** For an unnumbered entity (an asset tag, a settings key), its own label. */
  label?: string
}

/** §10.4's `action` column. Law 3's vocabulary — nothing here is a delete. */
export type AuditAction = 'Create' | 'Update' | 'Void' | 'Reverse' | 'Retire' | 'Archive' | 'Cancel' | 'Close'

export interface AuditFieldChange {
  field: string
  before: string
  after: string
}

export interface AuditRow {
  id: string
  /** AD instant, UTC — Law 7. BS is rendered, never stored. */
  timestamp: string
  user: string
  /** The role the actor held at the time, not the role they hold now. */
  role: string
  action: AuditAction
  entity: AuditEntityRef
  /** §10.4's `▸` diff. One or more fields; the row shows the first, the
   *  disclosure shows all of them. */
  changes: AuditFieldChange[]
  ip: string
  location: string
}

/**
 * `'Invoice INV-492'` — built through the registry, never concatenated.
 *
 * `atIso` matters for the sequences whose format still carries a `YYYY` token
 * (PAY, EXP, MT, CASE — none of them ruled by §2, so none renamed). An audit row
 * is a historical fact; rendering last year's payment with this year's segment
 * because `issue()` defaulted to the clock would misname a record in the one
 * place in the product that must never misname anything.
 */
export function entityLabel(ref: AuditEntityRef, atIso?: string): string {
  if (ref.code === null) return ref.label ? `${ref.kind} ${ref.label}` : ref.kind
  const year = atIso?.slice(0, 4)
  return `${ref.kind} ${issue(ref.code, ref.number ?? 0, year ? { year } : undefined)}`
}

export const AUDIT_ROWS: readonly AuditRow[] = [
  {
    id: 'AUD-001',
    timestamp: '2026-08-09T11:20:00Z',
    user: 'Bishal Thapa',
    role: 'Manager',
    action: 'Update',
    entity: { kind: 'Asset', code: null, label: 'CAM-001' },
    changes: [{ field: 'Status', before: 'In Stock', after: 'Maintenance' }],
    ip: '110.44.112.5',
    location: 'Kathmandu, NP',
  },
  {
    id: 'AUD-002',
    timestamp: '2026-08-08T16:10:00Z',
    user: 'Riya Maharjan',
    role: 'Accountant',
    action: 'Void',
    entity: { kind: 'Invoice', code: 'INV', number: 45 },
    changes: [
      { field: 'Status', before: 'Draft', after: 'Voided' },
      { field: 'Void reason', before: '—', after: 'Issued against the wrong client' },
    ],
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'AUD-003',
    timestamp: '2026-08-07T09:30:00Z',
    user: 'Sushant Shrestha',
    role: 'Owner',
    action: 'Retire',
    entity: { kind: 'Asset', code: null, label: 'LEN-012' },
    changes: [{ field: 'Status', before: 'Maintenance', after: 'Retired' }],
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'AUD-004',
    timestamp: '2026-08-06T14:05:00Z',
    user: 'Riya Maharjan',
    role: 'Accountant',
    action: 'Reverse',
    entity: { kind: 'Payment', code: 'PAY', number: 6101 },
    changes: [
      { field: 'Reversal of', before: '—', after: 'Duplicate receipt captured twice at the counter' },
      { field: 'Original', before: 'Recorded', after: 'Reversed by a new row' },
    ],
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'AUD-005',
    timestamp: '2026-08-05T08:48:00Z',
    user: 'Bishal Thapa',
    role: 'Manager',
    action: 'Cancel',
    entity: { kind: 'Booking', code: 'BK', number: 702 },
    changes: [
      { field: 'Status', before: 'Booked', after: 'Cancelled' },
      { field: 'Cancellation reason', before: '—', after: 'Client postponed the shoot' },
    ],
    ip: '110.44.112.5',
    location: 'Kathmandu, NP',
  },
  {
    id: 'AUD-006',
    timestamp: '2026-08-04T17:32:00Z',
    user: 'Sushant Shrestha',
    role: 'Owner',
    action: 'Archive',
    entity: { kind: 'Client', code: 'CL', number: 34 },
    changes: [{ field: 'Status', before: 'Active', after: 'Archived' }],
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
]

/* ── derived headline figures ──────────────────────────────────────────── */

function countAction(...actions: AuditAction[]): number {
  return AUDIT_ROWS.filter((r) => actions.includes(r.action)).length
}

/**
 * Counted from the rows above, never typed beside them.
 *
 * `totalMutations` is deliberately the length of the seed and nothing else. If
 * the real trail is later wired in, this number moves with it; until then it
 * cannot claim 1,240 entries the screen has never seen.
 */
export const AUDIT_METRICS = {
  totalMutations: AUDIT_ROWS.length,
  voids: countAction('Void'),
  archives: countAction('Archive'),
  reversals: countAction('Reverse'),
} as const

/** Stated policy, not a count — the seed holds days of history, not years. */
export const RETENTION_NOTE = 'Retention policy: 7 years. This build shows the seeded trail only.'

/* ── filter vocabularies, derived from the rows ────────────────────────── */

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

/** §10.4's `[entity ▾]` — the kinds actually present, never a fixed menu. */
export const AUDIT_ENTITY_KINDS: readonly string[] = unique(AUDIT_ROWS.map((r) => r.entity.kind))

/** §10.4's `[user ▾]`. */
export const AUDIT_USERS: readonly string[] = unique(AUDIT_ROWS.map((r) => r.user))

/** §10.4's `[date ▾]`, as ISO `YYYY-MM-DD` day keys, newest first. */
export const AUDIT_DAYS: readonly string[] = [
  ...new Set(AUDIT_ROWS.map((r) => r.timestamp.slice(0, 10))),
].sort((a, b) => b.localeCompare(a))
