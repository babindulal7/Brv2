import { issue } from './numbering'

/**
 * **Activity log seed — `10_TOOLS.md` §10.5.**
 *
 * > `● 10:42  who │ did what, where` — *timeline, newest first*, filtered by
 * > `[user ▾][module ▾][date ▾]`.
 *
 * Distinct from `data/auditLog.ts`, and the distinction is the point: the audit
 * trail records **state mutations** (before → after, append-only, 7-year
 * retention); this records **usage** — views, exports, sign-ins, prints. A
 * failed sign-in belongs here and nowhere in the audit trail, because nothing
 * changed.
 *
 * Same two rules as its sibling:
 *
 *  · **Identifiers are issued, not typed.** A row carries a sequence code and a
 *    counter; `issue()` renders it. Rulings §2.2 — no module hardcodes a prefix.
 *    The previous version of this file wrote `'Booking B-713'` as a literal.
 *  · **Every figure is derived.** `ACTIVITY_METRICS` used to hand-type
 *    `totalActivities: 14502` and `uniqueUsers: 18` beside three rows. Both are
 *    now counted from `ACTIVITY_ROWS`, so the strip and the timeline cannot
 *    disagree. Rulings §8.
 */

/** §10.5's `[module ▾]`. Mirrors the nav's modules, which is where activity happens. */
export const ACTIVITY_MODULES = [
  'Rentals',
  'Finance',
  'Inventory',
  'Clients',
  'Crew Assist',
  'Operations',
  'Tools',
  'Settings',
  'Authentication',
] as const
export type ActivityModule = (typeof ACTIVITY_MODULES)[number]

export type ActivityStatus = 'Success' | 'Failed'

export interface ActivityTarget {
  kind: string
  /** A `data/numbering.ts` sequence code, or `null` for something unnumbered. */
  code: string | null
  number?: number
  label?: string
}

export interface ActivityRow {
  id: string
  /** AD instant, UTC — Law 7. */
  timestamp: string
  user: string
  /** The verb, as the operator would say it: "Viewed", "Exported", "Signed in". */
  action: string
  module: ActivityModule
  target: ActivityTarget | null
  /** *"did what, **where**"* — the screen the action happened on. */
  where: string
  status: ActivityStatus
  ip: string
  location: string
}

/** `'Booking B-713'`, through the registry. See `auditLog.ts` for why `atIso`. */
export function targetLabel(target: ActivityTarget | null, atIso?: string): string {
  if (!target) return ''
  if (target.code === null) return target.label ? `${target.kind} ${target.label}` : target.kind
  const year = atIso?.slice(0, 4)
  return `${target.kind} ${issue(target.code, target.number ?? 0, year ? { year } : undefined)}`
}

/** Seeded newest-first, and `ACTIVITY_TIMELINE` below re-sorts so it stays so. */
export const ACTIVITY_ROWS: readonly ActivityRow[] = [
  {
    id: 'ACT-001',
    timestamp: '2026-08-09T14:22:00Z',
    user: 'Bishal Thapa',
    action: 'Viewed',
    module: 'Rentals',
    target: { kind: 'Booking', code: 'BK', number: 713 },
    where: 'Booking detail',
    status: 'Success',
    ip: '110.44.112.5',
    location: 'Kathmandu, NP',
  },
  {
    id: 'ACT-002',
    timestamp: '2026-08-09T14:15:00Z',
    user: 'Sushant Shrestha',
    action: 'Exported',
    module: 'Finance',
    target: null,
    where: 'Reports ▸ Expenses',
    status: 'Success',
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'ACT-003',
    timestamp: '2026-08-09T13:45:00Z',
    user: 'Unknown',
    action: 'Sign-in attempt',
    module: 'Authentication',
    target: null,
    where: 'Sign in',
    status: 'Failed',
    ip: '45.22.11.9',
    location: 'Pokhara, NP',
  },
  {
    id: 'ACT-004',
    timestamp: '2026-08-09T11:58:00Z',
    user: 'Riya Maharjan',
    action: 'Opened',
    module: 'Tools',
    target: null,
    where: 'Tools ▸ Numbering',
    status: 'Success',
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'ACT-005',
    timestamp: '2026-08-09T10:31:00Z',
    user: 'Bishal Thapa',
    action: 'Scanned',
    module: 'Inventory',
    target: { kind: 'Unit', code: null, label: 'FX6-0124' },
    where: 'Stock Check',
    status: 'Success',
    ip: '110.44.112.5',
    location: 'Kathmandu, NP',
  },
  {
    id: 'ACT-006',
    timestamp: '2026-08-09T09:58:00Z',
    user: 'Riya Maharjan',
    action: 'Printed',
    module: 'Finance',
    target: { kind: 'Invoice', code: 'INV', number: 492 },
    where: 'Finance ▸ Documents',
    status: 'Success',
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'ACT-007',
    timestamp: '2026-08-08T18:04:00Z',
    user: 'Sushant Shrestha',
    action: 'Changed a setting',
    module: 'Settings',
    target: { kind: 'Setting', code: null, label: 'Session timeout' },
    where: 'Settings ▸ Security',
    status: 'Success',
    ip: '27.34.20.1',
    location: 'Lalitpur, NP',
  },
  {
    id: 'ACT-008',
    timestamp: '2026-08-08T16:47:00Z',
    user: 'Bishal Thapa',
    action: 'Export refused',
    module: 'Clients',
    target: null,
    where: 'Clients directory',
    status: 'Failed',
    ip: '110.44.112.5',
    location: 'Kathmandu, NP',
  },
]

/** §10.5 — *"timeline, newest first"*, enforced here rather than trusted of the seed. */
export const ACTIVITY_TIMELINE: readonly ActivityRow[] = [...ACTIVITY_ROWS].sort((a, b) =>
  b.timestamp.localeCompare(a.timestamp),
)

/* ── derived headline figures ──────────────────────────────────────────── */

export const ACTIVITY_METRICS = {
  totalActivities: ACTIVITY_ROWS.length,
  failed: ACTIVITY_ROWS.filter((r) => r.status === 'Failed').length,
  uniqueUsers: new Set(ACTIVITY_ROWS.map((r) => r.user)).size,
  modulesTouched: new Set(ACTIVITY_ROWS.map((r) => r.module)).size,
} as const

/**
 * The old seed carried a `critical: 12` metric. Nothing in this build assigns a
 * severity to an activity row, so the card is gone rather than showing a number
 * with no derivation — Rulings §8, *"never a plausible default, never zero"*.
 */
export const RETENTION_NOTE = 'Retention policy: 90 days. This build shows the seeded activity only.'

/* ── filter vocabularies, derived ──────────────────────────────────────── */

export const ACTIVITY_USERS: readonly string[] = [...new Set(ACTIVITY_ROWS.map((r) => r.user))].sort((a, b) =>
  a.localeCompare(b),
)

/** Only the modules that actually appear — a filter listing an empty module lies. */
export const ACTIVITY_MODULES_PRESENT: readonly ActivityModule[] = ACTIVITY_MODULES.filter((m) =>
  ACTIVITY_ROWS.some((r) => r.module === m),
)

export const ACTIVITY_DAYS: readonly string[] = [
  ...new Set(ACTIVITY_ROWS.map((r) => r.timestamp.slice(0, 10))),
].sort((a, b) => b.localeCompare(a))
