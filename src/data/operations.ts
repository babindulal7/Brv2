import { formatAd } from '../lib/bs'
import { operationQueue, type BookingListRow } from '../lib/queries/bookings'
import type { ListFilters } from '../lib/queries/listQuery'
import { JOBS, JOB_ORDER, type BookingStatus, type JobName } from '../lib/workflow'

/**
 * # Operations Queues — the queue definitions and the row mapping
 *
 * ⚠ This file used to be **seed data**: a `QUEUES` array carrying hand-typed
 * counts, a 7-row `JOBS` array of invented bookings, and a `CREW_LOAD` array of
 * invented workloads. All three are gone. What is left is the part that is
 * genuinely this screen's own knowledge — which floor verb runs at which stage,
 * which date column that verb is due on, and how a `BookingListRow` becomes a
 * row in the job table.
 *
 * Every fact below is DERIVED from `lib/workflow.ts`'s `JOBS` table rather than
 * typed a second time, so the queue strip cannot drift from §1.5 the way the old
 * counts drifted from the table underneath them.
 *
 * ## What was removed, and why
 *
 * - **`QUEUES[].count`** — a literal. The Packing card said `8` directly above a
 *   table header that said "Packing — 2 jobs", because the two numbers came from
 *   two unrelated constants. The count is now `useList`'s `total` for that
 *   queue's own `operationQueue()` set: one number, one source.
 * - **`QUEUES[].overdue`** — a literal with no query behind it. "Overdue" is a
 *   §1.9 FLAG with a definition (`queries/bookings.ts`'s `overdue()`: On Rent,
 *   past `return_at`, `actual_return_at` still null) that applies to exactly one
 *   of the four queues. There is no stated definition of a late Pack, Handover
 *   or Reset, so a per-queue overdue count cannot be computed without inventing
 *   one. The card no longer claims a number it cannot produce.
 *   TODO(decision): what "late" means for the Pack, Handover and Reset queues.
 * - **`JOBS`** — seven invented bookings. Replaced by the real list query.
 * - **`Job.kit`** (`'RED Komodo X Package'`) — no column. `bookings` has
 *   `project` (0002:28) and nothing that names a package; the equipment on a
 *   booking is `booking_lines`, which the list query embeds only as
 *   `(id, qty)`. The table now shows `project`, under its own name.
 * - **`Job.assignee`** (`'Ramesh'`) — no column, on `bookings` or reachable from
 *   it. Nothing assigns a warehouse job to a person: `booking_crew_lines`
 *   (0002:314) is priced crew hired *for the shoot*, and
 *   `cleaning_queue_entries.assigned_to` (0003:873) covers cleaning only and is
 *   not joined by `listBookings`. The column is gone rather than dashed.
 * - **`CREW_LOAD`** — four invented people with invented open/capacity figures.
 *   It needs exactly the per-person job assignment that does not exist, so the
 *   seed is gone. The **card** followed it on 30 Aug: the Alerts panel moved
 *   from the Dashboard into `OperationsQueues.tsx`'s `railContent`, taking the
 *   rail slot the Crew Load empty state held. The GAP the card named — no
 *   per-person job assignment anywhere in the schema — is still real and still
 *   recorded here; a future crew-load panel needs that source first, exactly
 *   as Rulings §8's "renders 'not tracked yet' until a real source exists"
 *   requires of the figure.
 */

/* ── The five chips ────────────────────────────────────────────────────────
 *
 * Four floor verbs plus Cases. `Queue.job` is `JobName | 'Cases'`, so the strip
 * cannot grow a fifth verb without `lib/workflow.ts` growing one first.
 */

export interface Queue {
  /** §1.5 — a queue is a **job**, not a status. `'Cases'` is the one escape hatch; see CASES below. */
  job: JobName | 'Cases'
  title: string
  /** What the operator actually does here. */
  action: string
  icon: 'box' | 'checklist' | 'truck' | 'return_arrow' | 'eye' | 'sparkles'
}

export const QUEUES: Queue[] = [
  { job: 'Pack', title: 'Pack', action: 'Pack against the list', icon: 'box' },
  { job: 'Handover', title: 'Handover', action: 'Complete pickup', icon: 'truck' },
  { job: 'Return', title: 'Return', action: 'Receive, count and inspect', icon: 'return_arrow' },
  { job: 'Reset', title: 'Reset', action: 'Clean, reset, re-shelf', icon: 'sparkles' },
  { job: 'Cases', title: 'Cases', action: 'Resolve missing and damage', icon: 'eye' },
]

/* ── CASES · the chip with no mapping ─────────────────────────────────────
 *
 * `operationQueue`'s parameter is `'packing' | 'handover' | 'return' | 'reset'`
 * and there cannot be a fifth arm: a Case is not a booking stage and does not
 * live in `bookings`. So Cases has no filter set, no count query and no row in
 * `QUEUE_KEY` below — the screen swaps in `<CasesQueue />` wholesale instead,
 * and its card renders an explicit non-value where the other four render a
 * queried total.
 */

/** The queue keys `operationQueue()` accepts, read off its own signature so the two cannot drift. */
export type QueueKey = Parameters<typeof operationQueue>[0]

/** Floor verb → the `operationQueue()` key that selects its stage. */
export const QUEUE_KEY: Record<JobName, QueueKey> = {
  Pack: 'packing',
  Handover: 'handover',
  Return: 'return',
  Reset: 'reset',
}

/**
 * The URL is the state — `?queue=packing` — so a queue is linkable, shareable
 * and survives a reload, and the sidebar child and the chip cannot disagree
 * about which queue is open. Built from `QUEUE_KEY` plus the one extra member,
 * rather than re-typed, so the param vocabulary follows the queue vocabulary.
 */
export const URL_KEY: Record<JobName | 'Cases', string> = { ...QUEUE_KEY, Cases: 'cases' }

const PARAM_TO_QUEUE = new Map<string, JobName | 'Cases'>(
  (Object.keys(URL_KEY) as Array<JobName | 'Cases'>).map((job) => [URL_KEY[job], job]),
)

/** `?queue=` → the chip it names, or `null` for absent and for anything unrecognised. */
export function queueFromParam(param: string | null): JobName | 'Cases' | null {
  return (param && PARAM_TO_QUEUE.get(param)) || null
}

/* ── The two grouping chips ────────────────────────────────────────────────
 *
 * "Pickup Today" and "Return Today" group the two queues that put gear OUT
 * against the two that bring it BACK. Despite the labels they are **not** a date
 * filter — this screen has no date control at all, which is why
 * `operationQueue`'s optional `fromAd`/`toAd` are never passed. They are a stage
 * union, and they are expressed as one: a single chips group naming both stages,
 * evaluated by Postgres, not by filtering fetched rows.
 */

export type JobGroup = 'pickup' | 'return'

export const GROUP_JOBS: Record<JobGroup, readonly JobName[]> = {
  pickup: ['Pack', 'Handover'],
  return: ['Return', 'Reset'],
}

export const GROUP_LABEL: Record<JobGroup, string> = {
  pickup: 'Pickup Today',
  return: 'Return Today',
}

/** `?quick=` → the group it names, or `null`. */
export function groupFromParam(param: string | null): JobGroup | null {
  return param === 'pickup' || param === 'return' ? param : null
}

/* ── Which date a job is due on ────────────────────────────────────────────
 *
 * The same split `operationQueue` already makes for its sort column: the two
 * jobs that put gear out are due at `pickup_at`, the two that bring it back at
 * `return_at`. Named once here and read by both the row mapping (which instant
 * the Due cell shows) and the group filter sets (which column they order by), so
 * a row's Due value and its list's ordering cannot disagree.
 */
export const DUE_COLUMN: Record<JobName, 'pickup_at' | 'return_at'> = {
  Pack: 'pickup_at',
  Handover: 'pickup_at',
  Return: 'return_at',
  Reset: 'return_at',
}

/**
 * A group's due column. Both jobs in a group share one — that is what makes the
 * grouping expressible as a single ordered query — so each entry names one of
 * the pair rather than restating the column, and `operationsQueues.test.ts` pins
 * that the other half of each pair agrees.
 */
const GROUP_DUE_COLUMN: Record<JobGroup, 'pickup_at' | 'return_at'> = {
  pickup: DUE_COLUMN.Pack,
  return: DUE_COLUMN.Return,
}

/**
 * §1.5 read backwards: the job that runs while a booking sits at this stage.
 *
 * Derived from `JOBS[j].runsAt`, which is the same lookup
 * `modules/operations/OperationsShell.tsx:62` and `data/operationsShell.ts:98`
 * already make. `Quote` and `Closed` are reached by decisions and by §1.7's
 * gates rather than by a job, so both answer `null`.
 */
export function jobForStage(stage: BookingStatus): JobName | null {
  return JOB_ORDER.find((j) => JOBS[j].runsAt === stage) ?? null
}

/* ── Filter sets ───────────────────────────────────────────────────────────
 *
 * Every set here goes to the server. Nothing on this screen filters a fetched
 * array.
 */

function unionFilters(jobs: readonly JobName[], sortColumn: 'pickup_at' | 'return_at'): ListFilters {
  return {
    // The stage union, server-side. Stages are read off `JOBS[j].runsAt` rather
    // than listed, so this cannot name a retired stage: a string outside the
    // canonical six does not error, it matches nothing and renders a plausible
    // empty queue.
    chips: { stage: jobs.map((j) => JOBS[j].runsAt) },
    // Law 3 / 0015 — 'Cancelled' is a flag, not a stage. Same baseline every
    // named set in `queries/bookings.ts` carries.
    presence: { cancelled_at: false },
    sort: { column: sortColumn, ascending: true },
  }
}

/**
 * The job table's filter set.
 *
 * Three shapes, in the precedence the URL already enforces (setting either
 * chip clears the other):
 *
 *  1. **a group** — the stage union of its two jobs, ordered by the due column
 *     both of them share.
 *  2. **a single queue** — `operationQueue()`, unchanged and undecorated. This
 *     is the whole mapping: packing→['Booked'], handover→['Packed'],
 *     return→['On Rent'], reset→['Returned'].
 *  3. **neither** — all four verbs at once.
 *
 * ⚠ Case 3 mixes the two halves, and they are due on *different* columns, so
 * there is no single due column to order by. It orders by `pickup_at` — the
 * booking's own start, `not null` on every row (0002:30) — and selecting either
 * side restores that side's own due order. The alternative, ordering by a column
 * half the rows are not due on, would be the same claim made less visibly.
 */
export function jobListFilters(active: JobName | null, group: JobGroup | null): ListFilters {
  if (group) return unionFilters(GROUP_JOBS[group], GROUP_DUE_COLUMN[group])
  if (active) return operationQueue(QUEUE_KEY[active])
  return unionFilters(JOB_ORDER, 'pickup_at')
}

/**
 * One queue's count.
 *
 * The same `operationQueue()` set the table would use, plus a one-row page: the
 * card wants `total`, not the rows, and `withCount: true` reports the full
 * matching count regardless of the range. Paging is deliberately not part of
 * `jobListFilters` — `narrowingKey` ignores `page` anyway, so this cannot make a
 * card read as "filtered".
 */
export function queueCountFilters(job: JobName): ListFilters {
  return { ...operationQueue(QUEUE_KEY[job]), page: { index: 0, size: 1 } }
}

/* ── The row ───────────────────────────────────────────────────────────────── */

export interface JobRow {
  /** The booking's uuid — the React key. `bookingNo` is what the operator reads. */
  id: string
  bookingNo: string
  clientId: string
  clientName: string
  /** `bookings.project`, nullable (0002:28). `null` renders as an explicit non-value, never as a kit name. */
  project: string | null
  stage: BookingStatus
  /** Which verb this row is, derived from `stage`. */
  job: JobName
  /** Units across the booking's live lines — `sum(qty)`, not a row count. */
  itemCount: number
  /** The instant the job is due: `pickup_at` for Pack/Handover, `return_at` for Return/Reset. AD, UTC. */
  dueAtAd: string
  /**
   * The due instant has passed.
   *
   * ⚠ Deliberately NOT called "overdue". §1.9's `Overdue` flag is a specific
   * thing — `queries/bookings.ts`'s `overdue()` defines it as On Rent, past
   * `return_at`, with `actual_return_at` still null — and this is a weaker,
   * purely visual claim about the one instant the row already displays: it is
   * past, and the job is still sitting in the queue. It sets emphasis on the Due
   * cell and nothing else. No count, no filter and no badge is derived from it.
   */
  isPastDue: boolean
}

/**
 * Raw list row → job row.
 *
 * Returns `null` when the booking's stage carries no job. The chips make that
 * unreachable — every set above names only the four stages a verb runs at — so
 * a `null` here means the query returned something it was not asked for, and
 * dropping the row is the honest response: there is no verb to label it with,
 * no route to open it in, and inventing either is exactly what a queue screen
 * must not do.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the mapping stays
 * pure and testable; the screen resolves it once per render.
 */
export function toJobRow(row: BookingListRow, nowMs: number): JobRow | null {
  const job = jobForStage(row.stage)
  if (!job) return null

  const dueAtAd = DUE_COLUMN[job] === 'pickup_at' ? row.pickupAtAd : row.returnAtAd

  return {
    id: row.id,
    bookingNo: row.bookingNo,
    clientId: row.clientId,
    clientName: row.clientName,
    project: row.project,
    stage: row.stage,
    job,
    itemCount: row.itemCount,
    dueAtAd,
    isPastDue: Date.parse(dueAtAd) < nowMs,
  }
}

/**
 * The job's full-screen workspace route (§4.3 — "operations are full-screen
 * routes, never modals").
 *
 * ⛔ This replaces a `resolveJobRoute(booking, job: string)` that lowercased the
 * verb and matched it against five string arms, two of which were unreachable
 * (`'cases'` and `'evidence'` are not `JobName`s) — and one of which was wrong:
 *
 *     if (jLower === 'evidence' || jLower === 'return') return `/rentals/${b}/evidence`
 *
 * Every Return row therefore opened **EvidenceWorkspace**, and
 * `/rentals/:bookingNo/return` — `ReturnWorkspace`, `App.tsx:201-211` — was
 * unreachable from this screen. That is a bug rather than a shortcut: Return is
 * the verb that receives, counts and inspects the gear and sets the booking to
 * `Returned` (`JOBS.Return.sets`), which is precisely what `ReturnWorkspace`
 * does; `EvidenceWorkspace` is a photo surface that sets no stage. It is not
 * orphaned by this change either — `PackingWorkspace` and `ReturnWorkspace` both
 * link to `/rentals/:id/evidence` from inside the workspace, which is where a
 * photo review belongs.
 *
 * A `Record<JobName, …>` rather than a chain of string tests, so the two dead
 * arms are unrepresentable and a fifth verb would fail to compile.
 *
 * The segments coincide with `QUEUE_KEY`'s values today, and are deliberately
 * not shared with it: one is a route the router owns, the other a query-set key
 * `queries/bookings.ts` owns. They are free to diverge.
 */
const JOB_ROUTE_SEGMENT: Record<JobName, string> = {
  Pack: 'packing',
  Handover: 'handover',
  Return: 'return',
  Reset: 'reset',
}

export function jobRoute(bookingNo: string, job: JobName): string {
  return `/rentals/${bookingNo}/${JOB_ROUTE_SEGMENT[job]}`
}

/**
 * The Due cell — "14 Aug · 09:00", rendered in Kathmandu.
 *
 * Law 7: the instant is stored AD/UTC and only ever RENDERED in NPT. The date is
 * shown as well as the time because this screen has no date filter, so a queue
 * can hold jobs from more than one day and a bare "09:00" would not say which.
 */
export function formatDueAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = formatAd(d)
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kathmandu',
  })
  return `${day} · ${time}`
}

/**
 * Warehouse sees no money — Foundation, and one of the rules `CLAUDE.md` calls
 * most easily broken. This screen is warehouse-facing, so it carries **no**
 * monetary column anywhere, and — the part the note cannot say on its own — it
 * never passes `withDeposit` to `listBookings`. `bookings.deposit_required` is
 * unmasked on the base table and `bookings_select` is `auth_is_staff()`, which
 * includes Warehouse, Technician and Driver, so the query refusing to ask is the
 * only thing standing between the floor and a rupee figure.
 */
export const NO_MONEY_NOTE = 'Warehouse view — no monetary values are shown or requested on this screen.'
