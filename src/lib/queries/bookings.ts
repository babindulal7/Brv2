import { supabase } from '../supabase'
import { kathmanduCivil, NPT_OFFSET_MIN } from '../bs'
import { rupees, type Paisa } from '../money'
import { applyListFilters, type ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'

/**
 * # The bookings list query
 *
 * Law 2, the Single Query Rule, is a hard acceptance gate: one booking query
 * serves every surface. This is the LIST counterpart — the one Rentals, Today
 * and Operation all read.
 *
 * Those three screens today each hold their own constant array and filter it
 * locally, which is how Today's "Outgoing" count and Rentals' "On Rent" chip
 * can disagree while both look right. One query removes the possibility rather
 * than the symptom.
 *
 * ## What is NOT here
 *
 * No rental money. A booking row carries stage, dates, client and item count —
 * the figures come from the detail screen, computed through the financial
 * engine. Putting a total on the list row would mean two places compute money,
 * which is the drift Law 1 exists to prevent. `deposit_required` is available
 * but **opt-in and role-gated** — see the DEPOSIT section below, which is the
 * most dangerous thing in this file.
 *
 * ## Schema provenance — read before changing a column name here
 *
 * Every column below was verified on 12 Aug 2026 against
 * `supabase/migrations/0002_bookings.sql` (the `create table bookings`
 * statement, lines 21-69) and cross-checked against the GENERATED types in
 * `src/types/supabase.ts` (`bookings.Row`, line 1314). Those two agree.
 *
 * ⚠ `src/types/database.ts` and `src/lib/bookingQuery.ts` DO NOT agree with
 * either. That hand-written type declares `pickup_datetime`, `return_datetime`,
 * `days`, `stage_number`, `project_title`, `warehouse_id` and
 * `delivery_method` on `bookings`; **not one of those columns exists.**
 * `bookingQuery.ts` reads them, which is one more reason for the
 * "DO NOT USE THIS MODULE YET" banner at its head. Do not "make this file
 * consistent" with those two — they are the ones that are wrong. Use
 * `src/types/supabase.ts`, which is generated from the schema.
 */

type BookingStageDb = Database['public']['Enums']['booking_stage']
type DeliveryTypeDb = Database['public']['Enums']['delivery_type']

export interface BookingListRow {
  id: string
  bookingNo: string
  clientId: string
  clientName: string
  project: string | null
  stage: BookingStageDb
  pickupAtAd: string
  returnAtAd: string
  actualReturnAtAd: string | null
  /**
   * `bookings.delivery_type`, the `delivery_type` enum
   * ('Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party').
   * NOT `delivery_method` — see DELIVERY below.
   */
  deliveryType: DeliveryTypeDb
  /**
   * `bookings.pickup_location` — `text` **nullable** (0002:35). Free text, not a
   * branch FK: `branch_id` is the owning branch, this is where the goods are
   * collected from, and the two are different columns for a reason. `null` means
   * none was recorded, which is an ordinary state and must render as an explicit
   * non-value, never as the branch's name.
   */
  pickupLocation: string | null
  /** `bookings.return_location` — `text` nullable (0002:36). Same shape as `pickupLocation`. */
  returnLocation: string | null
  /**
   * `bookings.quote_expires_at` — `timestamptz` **nullable** (0002:37), AD/UTC.
   *
   * `null` means no expiry was set, NOT "expired" and NOT "never expires":
   * 0002:37 carries a `TODO(decision)` recording that whether a quote lapses at
   * all, automatically or otherwise, is unspecified. Nothing in the schema acts
   * on this date. Render it as a date; do not derive a lapsed/valid verdict from
   * it here.
   */
  quoteExpiresAtAd: string | null
  /**
   * `bookings.created_at` — `timestamptz not null default now()` (0002:46),
   * AD/UTC. This is the row's insert instant, which is what "Booked 12 Jul"
   * renders. It is NOT the Booked-stage transition time: stage history lives in
   * `booking_stage_transitions` (0002:81 — `stage` is that table's read model),
   * so a booking created as a Quote and confirmed a week later shows the quote's
   * date here. Named `createdAtAd` rather than `bookedOnAd` so the gap is
   * visible at the call site instead of being asserted by the name.
   */
  createdAtAd: string
  /**
   * Total UNITS across the booking's live (non-voided) lines — `sum(qty)`, not
   * the number of lines. "Alexa Mini ×5" is 5, not 1. See ITEM COUNT below.
   */
  itemCount: number
  /**
   * **`null` means "this caller did not ask for it", not "no deposit".**
   * Only ever non-null when `listBookings` was called with
   * `{ withDeposit: true }`, which a money-blind surface must never do.
   */
  depositRequired: Paisa | null
  isCancelled: boolean
  isClosed: boolean
}

/* ── DELIVERY · delivery_type vs delivery_method, settled ─────────────────
 *
 * Both names are real, and they are different things. `0001_enums.sql` declares
 * TWO enums with identical member sets:
 *   - `delivery_method` (0001:33) — used by `operation_sessions.delivery_method`
 *     (0003:61), the Handover session's record of how the goods actually left.
 *   - `delivery_type`   (0001:279) — used by `bookings.delivery_type`
 *     (0002:34), the booking's agreed delivery mode.
 *
 * There is NO `bookings.delivery_method` column: not in the create table, and
 * no `alter table bookings` anywhere adds one (0015 touches `stage` only, 0042
 * adds foreign keys only — grep of all 54 migrations). `0002:88` states the
 * intent outright: delivery_type is "the single home for delivery mode".
 *
 * So `src/lib/bookingQuery.ts`'s `booking.delivery_method` reads a column that
 * does not exist and would come back `undefined`, which matters because it
 * gates `transport: … === 'Customer Pickup' ? rupees(0) : …`. Flagged there,
 * not fixed from here — that file is a separate module with its own banner.
 */

/* ── DEPOSIT · why this is opt-in and off by default ──────────────────────
 *
 * ⛔⛔ `bookings.deposit_required` IS UNMASKED MONEY ON A BASE TABLE. ⛔⛔
 *
 * `0019_column_level_money_masking.sql` protects money by revoking the columns
 * from `authenticated` and re-serving them through a `*_v` view that NULLs them
 * unless `auth_can_view_money()` passes. It covers `products`, `product_units`
 * and `booking_lines`; later migrations extend the same pattern to eleven more
 * tables (0034-0039). **`bookings` is in none of them.** Verified: no
 * `revoke select (...) on bookings` exists in any migration, and there is no
 * `bookings_v` view anywhere in 0001-0054.
 *
 * Meanwhile `bookings_select` (0020:102) is `using (auth_is_staff())`, and
 * `auth_is_staff()` (0014:70) is `auth_user_role() <> 'Client'`. So all seven
 * internal roles — **including the three Law 6 declares money-blind: Warehouse,
 * Technician, Driver** — can read every booking row. Naming
 * `deposit_required` in a select therefore hands a real rupee figure to the
 * warehouse floor. Postgres will not stop it; nothing will.
 *
 * (Client is the one role the row policy does exclude, so a Client session gets
 * no bookings at all through this query, deposit or not.)
 *
 * Until a `bookings_v` exists, the ONLY protection is this module refusing to
 * ask for the column. Hence: opt-in, default off, and callers must gate on
 * `useCanViewMoney()` (`src/lib/moneyVisibility.ts`) — which mirrors
 * `auth_can_view_money()` — before passing `withDeposit`.
 *
 * TODO(persistence): add `bookings_v` masking `deposit_required` the way 0019
 * masks `booking_lines.rate`, then make this unconditional and delete the flag.
 * That is a migration, deliberately not written here.
 */

/* ── ITEM COUNT · units, not rows; and voided lines ───────────────────────
 *
 * ⛔ This used to be `booking_lines.length` — a count of ROWS. A booking whose
 * single line reads "Alexa Mini ×5" reported **1 item**. `booking_lines.qty`
 * exists (`0002:134`, `qty integer not null default 1` under
 * `booking_lines_qty_positive check (qty > 0)`) and was neither selected nor
 * read, so the number was wrong on every row that carries a quantity — and
 * wrong DOWNWARD, which is the dangerous direction: a packing list that says 1
 * when five units must come off the shelf sends the crew out four short. So the
 * embed selects `qty` and `toRow` sums it.
 *
 * Selecting `qty` is safe under Law 6. 0019's revoked set on `booking_lines` is
 * exactly (rate, discount_amount, supplier_cost, markup_amount) — `qty` is not
 * money and is not in it, so a Warehouse session reads it without a 403 and
 * without seeing a rupee figure.
 *
 * The sum still respects the live-lines filter for free: PostgREST applies
 * `booking_lines.voided_at is null` to the embed IN PLACE, so the array that
 * arrives already holds only live lines and summing it cannot pick up a voided
 * one. That is the same mechanism `.length` relied on; nothing about the filter
 * changed, only what is added up.
 *
 * TODO(decision): a Bundle line and its children are separate rows (0002:130,
 * `parent_line_id` self-FK; children price at 0 and the parent carries the
 * rate), so `sum(qty)` over every line counts a bundle's parent row IN ADDITION
 * TO the units inside it, and counts Service and Accessory lines as "items"
 * too. Whether the list's item count means "units to physically pull"
 * (children only, no services) or "priced lines' units" (all of them) is a
 * product call, not an implementation detail — it changes what the packing
 * queue's number means. Every line is summed until it is ruled; that is
 * strictly closer than counting rows, and stated here rather than assumed.
 *
 * `booking_lines.voided_at` is how a removed line is recorded — Law 3, nothing
 * is deleted (0002:139, "The Remove row action sets this"). Counting voided
 * lines would report more items than the booking actually carries, so the
 * embed filters them out. PostgREST filters an embedded resource in place: the
 * booking row still comes back, with only its live lines.
 *
 * The embed itself is legal: `booking_lines.booking_id references bookings (id)`
 * (0002:124) is the single FK between the two tables, so PostgREST has one
 * unambiguous relationship to resolve. Same for `clients`:
 * `bookings_client_id_fk` (0042:19) is the only FK from `bookings` to
 * `clients` — `contact_id` and `authorized_contact_id` point at
 * `client_contacts`, a different table, so there is no ambiguity to
 * disambiguate. `clients.name` is the real column name (0005:44); there is no
 * `client_name`.
 *
 * Neither embed names a revoked column — `booking_lines`' revoked set is
 * (rate, discount_amount, supplier_cost, markup_amount) and `clients`' is
 * (approved_credit_limit, payment_terms) — so selecting `id`, `qty` and `name`
 * from them does not 403. Both are row-gated on `auth_is_staff()` (0019:129,
 * 0020:117), the same predicate as `bookings` itself, so any session that sees
 * the booking sees its lines and its client.
 */

/**
 * Columns the list needs, named explicitly — `select('*')` on a joined query is
 * how a masked column leaks back in.
 *
 * `pickup_location`, `return_location`, `quote_expires_at` and `created_at` were
 * added on 12 Aug 2026, each verified twice before being named here: in
 * `supabase/migrations/0002_bookings.sql` (`:35`, `:36`, `:37`, `:46`) and in
 * the GENERATED `src/types/supabase.ts` `bookings.Row`. They are safe under
 * Law 6 — 0019 and 0034-0039 revoke only money columns, and a grep of all 54
 * migrations finds no `revoke select (...) on bookings` at all; the only
 * column-level revoke touching this table is `revoke update (stage, closed_at)`
 * (0021:199), which is a WRITE grant. None of the four is money, so none needs
 * the `withDeposit` treatment below.
 */
const BASE_COLUMNS =
  'id, booking_no, client_id, project, stage, pickup_at, return_at, actual_return_at, ' +
  'delivery_type, pickup_location, return_location, quote_expires_at, ' +
  'cancelled_at, closed_at, created_at, ' +
  'clients ( name ), booking_lines ( id, qty )'

/** The money variant. Never reached unless the caller passed `withDeposit`. */
const COLUMNS_WITH_DEPOSIT = `${BASE_COLUMNS}, deposit_required`

interface RawBookingRow {
  id: string
  booking_no: string
  client_id: string
  project: string | null
  stage: BookingStageDb
  pickup_at: string
  return_at: string
  actual_return_at: string | null
  delivery_type: DeliveryTypeDb
  /** `text` nullable (0002:35). */
  pickup_location: string | null
  /** `text` nullable (0002:36). */
  return_location: string | null
  /** `timestamptz` nullable (0002:37). AD, UTC. */
  quote_expires_at: string | null
  /** `numeric(14,2)` — RUPEES. Absent from the row unless `withDeposit` was set. */
  deposit_required?: number | null
  cancelled_at: string | null
  closed_at: string | null
  /** `timestamptz not null default now()` (0002:46). AD, UTC. */
  created_at: string
  clients: { name: string } | null
  /** `qty` is `integer not null default 1` with `check (qty > 0)` (0002:134, :151). */
  booking_lines: Array<{ id: string; qty: number }> | null
}

/**
 * Units on the booking, not rows. See ITEM COUNT above for why this is a sum.
 *
 * `qty` is NOT NULL and `> 0` by CHECK constraint, so no per-line fallback is
 * needed or wanted: coalescing a missing `qty` to 0 or to 1 would silently
 * re-introduce the same under-count this replaced, from a row shape that cannot
 * occur. If the field is ever absent the sum becomes NaN, which is visible.
 */
function sumQty(lines: RawBookingRow['booking_lines']): number {
  return (lines ?? []).reduce((total, line) => total + line.qty, 0)
}

/**
 * `numeric` → `Paisa`.
 *
 * The database stores money as `numeric(14,2)` in **rupees** — 0002's own
 * header says so ("Money is numeric(14,2)") and `0002:181` spells it out on the
 * sibling column: `booking_lines.rate` is "Rupees, no sub-rupee values stored".
 * `lib/money.ts` §2.3 works in integer paisa. So rupees → paisa, multiplying by
 * 100, is the correct direction at this boundary — the same conversion
 * `queries/clients.ts:109` (`toPaisa`) already performs on the directory view's
 * numeric money columns. Doing it the other way would render every deposit
 * 100x too small; skipping it would render it 100x too large.
 */
function toPaisa(n: number | null | undefined): Paisa | null {
  return n === null || n === undefined ? null : rupees(n)
}

function toRow(r: RawBookingRow): BookingListRow {
  return {
    id: r.id,
    bookingNo: r.booking_no,
    clientId: r.client_id,
    // A booking always has a client (NOT NULL + FK), so a missing join is a
    // query bug, not a data state. Say so rather than printing a friendly dash
    // that hides it.
    clientName: r.clients?.name ?? '(client not joined)',
    project: r.project,
    stage: r.stage,
    pickupAtAd: r.pickup_at,
    returnAtAd: r.return_at,
    actualReturnAtAd: r.actual_return_at,
    deliveryType: r.delivery_type,
    // The three nullable columns pass through as `null`. Deliberately NOT
    // coalesced to '' or to the branch name: an empty string reads as "recorded
    // as blank" and a branch name would be an invented figure. The screen
    // renders the non-value; the query does not manufacture one.
    pickupLocation: r.pickup_location,
    returnLocation: r.return_location,
    quoteExpiresAtAd: r.quote_expires_at,
    createdAtAd: r.created_at,
    itemCount: sumQty(r.booking_lines),
    depositRequired: toPaisa(r.deposit_required),
    isCancelled: r.cancelled_at !== null,
    isClosed: r.closed_at !== null,
  }
}

/**
 * The columns a free-text search covers. Both exist on `bookings` (0002:29, 23).
 *
 * Client name is deliberately NOT searched. Matching it needs a second `or`
 * scoped with `{ referencedTable: 'clients' }` plus `clients!inner(name)` so the
 * join filters the parent rather than the embed — `applyListFilters` builds one
 * unscoped `or` and has no way to express that. Stated here so the next reader
 * does not assume typing a client's name into the Rentals search box works; it
 * silently returns nothing today.
 */
const SEARCH_COLUMNS = ['booking_no', 'project'] as const

export interface BookingListOptions extends ListFilters {
  /** Ask for the total matching count. Costs an extra planner pass, so it is opt-in. */
  withCount?: boolean
  /**
   * Include `deposit_required`. **Money.** Read the DEPOSIT block above before
   * setting this: the column is unmasked on the base table, so asking for it on
   * a Warehouse / Technician / Driver session breaches Law 6 and nothing in the
   * database will object. Gate on `useCanViewMoney()` at the call site.
   */
  withDeposit?: boolean
}

export async function listBookings(opts: BookingListOptions = {}): Promise<ListQueryResult<BookingListRow>> {
  const { withCount, withDeposit, ...filters } = opts

  const base = supabase
    .from('bookings')
    .select(withDeposit ? COLUMNS_WITH_DEPOSIT : BASE_COLUMNS, withCount ? { count: 'exact' } : undefined)
    // Law 3: a removed line is voided, never deleted, so it must not be counted.
    .is('booking_lines.voided_at', null)

  /*
   * ⛔ This call used to read `applyListFilters(base as never, …)`.
   *
   * `never` is assignable to every type, so the cast satisfied
   * `T extends FilterBuilder<T>` without ever comparing the two — which threw
   * away the entire justification for `listQuery.ts` existing. That module is
   * structurally typed precisely so it never imports supabase-js, and this is
   * its only real call site (the rest are test doubles); with the cast in place,
   * `FilterBuilder` drifting from the actual builder would have compiled
   * cleanly and failed at runtime, on all 34 screens at once.
   *
   * No cast is needed. Checked against the installed postgrest-js 2.112.0
   * (`dist/index.d.mts`), whose signatures are already structurally compatible
   * — `gte(column: string, value: unknown): this` (:1958), `lte` (:2054),
   * `is(column: string, value: boolean | null): this` (:2264),
   * `not(column: string, operator: string, value: unknown): this` (:3156),
   * `or(filters: string, opts?: { foreignTable?, referencedTable? }): this`
   * (:3308), the `order(column: string, options?)` overload (:1168) and
   * `range(from: number, to: number, opts?): this` (:1351). Every one returns
   * `this`, which is what makes the `T extends FilterBuilder<T>` self-reference
   * resolve. `.in()` (:2324) is generic over the column name but unconstrained
   * (`ColumnName extends string`), so it matches too.
   *
   * Removing the cast therefore costs nothing and buys the check back: if a
   * future postgrest-js renames an argument shape, `tsc` says so HERE, once,
   * instead of on the floor.
   */
  const query = applyListFilters(base, {
    ...filters,
    searchColumns: filters.searchColumns ?? SEARCH_COLUMNS,
    sort: filters.sort ?? { column: 'pickup_at', ascending: true },
    // Deterministic paging — see PAGINATION in `listQuery.ts`. `bookings.id` is
    // `uuid not null default gen_random_uuid() primary key` (0002:22), so it is
    // unique and never null, which is the whole requirement. Defaulted rather
    // than hardcoded so a caller that knows better can override it, but no
    // caller should need to.
    tiebreak: filters.tiebreak ?? 'id',
  })

  const { data, error, count } = (await query) as unknown as {
    data: RawBookingRow[] | null
    error: { message: string } | null
    count: number | null
  }

  if (error) throw new Error(`listBookings failed: ${error.message}`)

  return { rows: (data ?? []).map(toRow), total: count ?? null }
}

/**
 * ## Named filter sets
 *
 * The three screens differ only in which filters they pass. Naming them here
 * rather than in each screen is what stops Today and Operation drifting apart:
 * change "what counts as today's outgoing" once, and both move.
 *
 * Every stage literal below is a member of the canonical six —
 * Quote · Booked · Packed · On Rent · Returned · Closed — established by
 * `0015_canonical_six_stages.sql` (which rebuilt `booking_stage` from the
 * thirteen retired values) and confirmed in three independent places:
 * `src/types/supabase.ts:12607` (generated), `src/types/database.ts:51`
 * (`BookingStage`) and `src/lib/workflow.ts:31` (`BookingStatus`). All four
 * lists agree.
 *
 * ### What a non-member stage actually does — corrected 12 Aug 2026
 *
 * This comment used to claim that a stage string outside the six "does not
 * error — `stage IN ('Ready')` simply matches nothing, and the screen renders a
 * plausible empty day." **That is false**, and a reader who believed it would
 * look for a silent-empty-list bug that cannot happen.
 *
 * `bookings.stage` is `USER-DEFINED` over the real Postgres enum
 * `booking_stage`, whose labels are exactly Quote · Booked · Packed · On Rent ·
 * Returned · Closed (both verified against the live database, 12 Aug 2026).
 * Postgres never coerces the literal, so there is nothing left to match:
 *
 *     select count(*) from public.bookings where stage in ('Ready');
 *     ERROR:  22P02: invalid input value for enum booking_stage: "Ready"
 *
 * PostgREST returns that as a 400 with the same message, `listBookings` above
 * rethrows it as `listBookings failed: …`, `useList` stores it (useList.ts:195)
 * and `PageBody` renders its error state. So the real failure mode is a **whole
 * broken screen, loudly** — not a plausible empty day. That is better than
 * silence and still bad enough to be worth pinning, which is why the suite
 * asserts every literal these sets emit is a member of the six.
 *
 * 'Cancelled' is NOT a stage (0015 header: it is a flag). That is why every set
 * below excludes cancellations with `presence: { cancelled_at: false }` rather
 * than by filtering the stage column.
 */

/** Today ▸ Outgoing — pickups on a given AD day that have not left yet. */
export function todaysOutgoing(dayAd: string): ListFilters {
  return {
    dateRange: { column: 'pickup_at', fromAd: startOfDay(dayAd), toAd: endOfDay(dayAd) },
    chips: { stage: ['Booked', 'Packed'] satisfies BookingStageDb[] },
    presence: { cancelled_at: false },
    sort: { column: 'pickup_at', ascending: true },
  }
}

/** Today ▸ Incoming — returns due on a given AD day, still out. */
export function todaysIncoming(dayAd: string): ListFilters {
  return {
    dateRange: { column: 'return_at', fromAd: startOfDay(dayAd), toAd: endOfDay(dayAd) },
    chips: { stage: ['On Rent'] satisfies BookingStageDb[] },
    presence: { cancelled_at: false, actual_return_at: false },
    sort: { column: 'return_at', ascending: true },
  }
}

/**
 * Floors an ISO instant to the start of its minute.
 *
 * ## Why this exists: without it, "now" is a refetch loop
 *
 * `useList` keys its fetch effect on `filterKey(filters)`, recomputed on every
 * render — it has to, because a screen builds its filter object fresh each time
 * and a reference dependency would never settle.
 *
 * A filter set built from `new Date().toISOString()` therefore has a DIFFERENT
 * key on every render. Fetch → setState → render → new key → fetch, forever,
 * against Postgres, as fast as the network allows. The two helpers below are the
 * only ones in this module that take "now", so they are the only ones exposed to
 * it — and both of their doc comments used to say "pass `new Date().toISOString()`",
 * which is precisely the input that loops.
 *
 * Flooring to the minute makes the key stable for up to 60 seconds, so the loop
 * cannot form, while the list stays accurate to the minute. That is well inside
 * what these two questions need: a booking becomes visibly overdue up to 59
 * seconds late, and a quote lapses up to 59 seconds late. Neither is a decision
 * anyone would want made differently — if a screen ever needs second-accuracy it
 * should say so explicitly rather than inherit a loop.
 *
 * Done HERE rather than left to callers on purpose. The old guidance made
 * correctness the screen's job, and 34 screens are about to be written against
 * this module; one of them forgetting to memoise is a database-hammering bug
 * that looks like nothing on the client.
 */
function toMinute(instantAd: string): string {
  const t = Date.parse(instantAd)
  if (Number.isNaN(t)) {
    // Don't silently pass a bad value to Postgres — a malformed instant there is
    // a 400 the operator cannot act on, surfaced far from its cause.
    throw new Error(
      `Expected a full ISO instant, received "${instantAd}". ` +
        `overdue() and quotesExpiring() compare against a timestamptz, not a day.`,
    )
  }
  return new Date(Math.floor(t / 60_000) * 60_000).toISOString()
}

/**
 * Overdue — due back before now and not actually returned.
 *
 * Deliberately takes an INSTANT, not a day: no day boundary is involved, so
 * none of the timezone reasoning below applies here. `nowAd` must be a full
 * ISO instant (`new Date().toISOString()`), never a `YYYY-MM-DD` — a bare date
 * is parsed by Postgres as midnight UTC, which in Kathmandu is 05:45 the same
 * morning, and the query would then miss everything due earlier today.
 *
 * Passing `new Date().toISOString()` directly IS safe here: the instant is
 * floored to its minute by `toMinute`, so the filter key is stable between
 * renders and `useList` does not loop. See `toMinute` for why that matters.
 */
export function overdue(nowAd: string): ListFilters {
  return {
    dateRange: { column: 'return_at', toAd: toMinute(nowAd) },
    chips: { stage: ['On Rent'] satisfies BookingStageDb[] },
    presence: { cancelled_at: false, actual_return_at: false },
    sort: { column: 'return_at', ascending: true },
  }
}

/**
 * Quotes expiring — still a Quote, and `quote_expires_at` has already passed.
 *
 * Like `overdue`, this takes an **INSTANT**, not a day: `quote_expires_at` is a
 * `timestamptz` (0002:37), no day boundary is involved, and passing a bare
 * `YYYY-MM-DD` would be read by Postgres as midnight UTC — 05:45 that morning in
 * Kathmandu — so every quote that lapsed earlier the same day would be missed.
 * Pass `new Date().toISOString()`; it is floored to the minute by `toMinute`, so
 * the filter key is stable between renders and `useList` does not loop.
 *
 * Three things this deliberately does NOT do:
 *
 *  - **It does not decide that an expired quote is dead.** 0002:37 carries a
 *    `TODO(decision)` recording that whether a quote lapses, and whether
 *    automatically, is unspecified, and nothing in the schema acts on the date.
 *    This set answers "which quotes are past their stated date", which is what
 *    the Quote intel card's "valid until" and the 'Quote expiring' alert read.
 *    It does not transition anything.
 *  - **It does not reach quotes with no expiry date.** The column is nullable,
 *    and `lte` on a NULL is NULL, not true, so a Quote with no date set is
 *    simply absent — correct, since "expiring" is meaningless without a date,
 *    and the alternative would be claiming every undated quote had lapsed.
 *  - **It does not include a lead time.** "Expiring within 3 days" is a
 *    different question and belongs to whoever picks the window; pass the
 *    instant you mean.
 *
 * `presence: { cancelled_at: false }` for the same reason as every set here:
 * Law 3 / 0015 — 'Cancelled' is a flag, not a stage.
 */
export function quotesExpiring(nowAd: string): ListFilters {
  return {
    dateRange: { column: 'quote_expires_at', toAd: toMinute(nowAd) },
    chips: { stage: ['Quote'] satisfies BookingStageDb[] },
    presence: { cancelled_at: false },
    sort: { column: 'quote_expires_at', ascending: true },
  }
}

/**
 * Operation ▸ a queue chip. The floor verbs map to stages, not to a separate
 * queue table.
 *
 * `fromAd` / `toAd` are **days**, and they are the only dates in this module a
 * user picks by hand. They are normalised through `startOfDay` / `endOfDay` like
 * every other day boundary here — see the note on those two.
 *
 * ⛔ They used to be copied straight into `dateRange`. So the ONE helper fed
 * user input was the one helper that did not normalise it: a picker emitting
 * `2026-08-12` became `pickup_at >= '2026-08-12'`, which Postgres reads as
 * midnight UTC = 05:45 that morning in Kathmandu, and `<= '2026-08-12'`, which
 * cut the day off at 05:45 rather than at midnight. A one-day range therefore
 * matched a 0-second window at one end and lost the first 5h45m at the other,
 * while `todaysOutgoing` three functions above got it right. Same picker, same
 * day, two different answers.
 */
export function operationQueue(
  queue: 'packing' | 'handover' | 'return' | 'reset',
  fromAd?: string,
  toAd?: string,
): ListFilters {
  const stageFor: Record<typeof queue, readonly BookingStageDb[]> = {
    packing: ['Booked'],
    handover: ['Packed'],
    return: ['On Rent'],
    // TODO(decision): 'Returned' is now THREE retired stages in a trench coat.
    // `0015_canonical_six_stages.sql:114-116` collapses Inspection, Cleaning and
    // Completed all onto 'Returned' — and 0015's own "WHAT THIS FILE DOES NOT
    // DO" section records that the job-state axis it mapped them to
    // (Return:'In Progress', Reset:'In Progress') "has no storage anywhere in
    // this schema today", so nothing distinguishes them after the fact. The
    // reset queue therefore now shows a booking still being inspected, one
    // already cleaned, and one marked Completed, as one undifferentiated list.
    // Which of those three belong on the floor's reset queue is a product call
    // — plausibly all three, plausibly only the un-cleaned ones — and it cannot
    // be answered from the schema because the schema no longer knows. Left as
    // the literal 0015 produced; NOT guessed. Answering it likely needs the job
    // -state storage 0015 flagged, which is a migration, not an edit here.
    reset: ['Returned'],
  }

  const dateColumn = queue === 'return' || queue === 'reset' ? 'return_at' : 'pickup_at'

  const f: ListFilters = {
    chips: { stage: [...stageFor[queue]] },
    presence: { cancelled_at: false },
    sort: { column: dateColumn, ascending: true },
  }
  if (fromAd || toAd) {
    f.dateRange = {
      column: dateColumn,
      // Inclusive at both ends, matching `applyListFilters`' contract and how a
      // "1–7 Aug" picker reads: from the first instant of the first day to the
      // last of the last.
      ...(fromAd ? { fromAd: startOfDay(fromAd) } : {}),
      ...(toAd ? { toAd: endOfDay(toAd) } : {}),
    }
  }
  return f
}

/* ── Day boundaries ───────────────────────────────────────────────────────
 *
 * ⛔ These used to end in `Z`, i.e. midnight UTC. That is the wrong day.
 *
 * Law 7 stores AD in UTC, and Foundation §3.1 renders in Asia/Kathmandu
 * (UTC+05:45). Midnight UTC is 05:45 in Kathmandu, so a UTC-bounded "today"
 * runs 05:45 this morning to 05:45 tomorrow — every pickup booked before 05:45
 * fell into yesterday's list and every one after 23:59:59 NPT into tomorrow's.
 * Today ▸ Outgoing would have been silently short by exactly the bookings the
 * early shift cares about most.
 *
 * `src/lib/bs.ts` already made this exact correction for the same reason (see
 * `kathmanduCivil` — it "used to truncate on getUTCDate(), which is a different
 * date for 5 hours 45 minutes of every day"). This is that fix applied to the
 * query side, so the day a screen FILTERS by is the same day it LABELS.
 *
 * The strings below carry an explicit `+05:45` offset rather than `Z`.
 * Postgres accepts the offset in a `timestamptz` comparison, so the boundary is
 * resolved by the database with no client-side arithmetic to get wrong. Nepal
 * has no daylight saving and has not changed offset since 1986, so a fixed
 * offset is exact here in a way it would not be elsewhere.
 *
 * There are TWO ways to get a day boundary wrong and this block only ever fixed
 * one of them. Attaching the right offset to the wrong DATE is just as wrong as
 * attaching the wrong offset to the right date — see `nepalDay` below, which
 * closes the second half.
 *
 * TODO(decision): the rental day runs 06:00→06:00, so "today's pickups"
 * arguably means 06:00 today to 06:00 tomorrow rather than midnight to
 * midnight — Kathmandu midnight or otherwise. That changes which bookings
 * appear on the Today screen at 5am and at 11pm, so it is a product call, not
 * an implementation detail. Calendar midnight **in Kathmandu** is used until it
 * is ruled — stated here rather than assumed silently.
 */

/**
 * `+05:45`, FORMATTED FROM `bs.ts`'s `NPT_OFFSET_MIN` rather than typed again.
 *
 * It used to be a second string literal here. `Calendar.md` §4.2 calls holding
 * more than one copy of Nepal's offset "the highest-priority correctness bug in
 * the product" — the app once held three at once and rendered the same AD day as
 * two different BS days — so the query side reads the render side's number
 * instead of agreeing with it by hand.
 */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
  2,
  '0',
)}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/** A bare calendar date, `YYYY-MM-DD` — what a date picker emits. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The **Nepal** calendar day an argument names.
 *
 * ⛔ This used to be `dayAd.slice(0, 10)`, and those ten characters are the UTC
 * calendar date. For 5 hours 45 minutes of every day that is a DIFFERENT day
 * from Nepal's: `2026-08-12T19:00:00Z` is already 13 Aug in Kathmandu, so the
 * correct `+05:45` boundary below was stamped onto 12 Aug — right offset, wrong
 * date, which is worse than a wrong offset because it moves a whole day's
 * bookings into the neighbouring list rather than a few edge cases.
 *
 * Two argument shapes reach here and they need opposite handling:
 *
 *  - **`YYYY-MM-DD`** — a date picker's output. It is ALREADY a calendar date,
 *    and the calendar the operator was reading is Nepal's, so it is returned
 *    untouched. Parsing it to a `Date` first would be wrong in principle (it
 *    becomes midnight UTC, an instant that only incidentally lands on the same
 *    Nepal day) even though it happens to round-trip.
 *  - **a full ISO instant** — `new Date().toISOString()`, or a `timestamptz`
 *    read back from Postgres. Converted through `bs.ts`'s `kathmanduCivil`,
 *    which is the function the render side already uses to decide which day an
 *    instant belongs to. Sharing it is the point: the day a screen FILTERS by
 *    and the day it LABELS now come from the same arithmetic, so they cannot
 *    disagree.
 *
 * An instant must carry an offset (`Z` or `+05:45`). `2026-08-12T09:00:00` with
 * no offset is parsed by JavaScript as LOCAL time — harmless on a Kathmandu
 * machine, a day out on a machine set to Auckland. That is a JS `Date` rule this
 * function cannot repeal; it is named here so a caller does not build one.
 *
 * A string that is neither shape throws rather than producing `Invalid Date` →
 * `NaN-NaN-NaN`, which Postgres would answer with a 400 the operator cannot act
 * on.
 *
 * **Where that throw actually lands.** Not in `useList`'s error state — the
 * named filter sets (`todaysOutgoing`, `operationQueue`, `overdue`, …) are
 * called by a screen while it RENDERS, to build the object it then hands to
 * `useList`. So this throws during render, above the hook, and is caught by
 * `components/shell/ErrorBoundary` rather than surfacing as the inline
 * persistent error of Law 12. That is the right trade for this input: a
 * malformed day is a programming mistake at a fixed call site, not a runtime
 * condition an operator can do anything about, and failing at the call site
 * beats a 400 five layers away. It is written down because the opposite was
 * once claimed here, and a reader who believes the throw is caught by `useList`
 * will build a screen that swallows it.
 */
function nepalDay(dayAd: string): string {
  if (DATE_ONLY.test(dayAd)) return dayAd

  const t = Date.parse(dayAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected an AD day (YYYY-MM-DD) or a full ISO instant, got ${JSON.stringify(dayAd)}`)
  }
  // `kathmanduCivil` returns midnight UTC of the Kathmandu civil date, so the
  // first ten characters of its ISO form are that date exactly.
  return new Date(kathmanduCivil(new Date(t))).toISOString().slice(0, 10)
}

function startOfDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T00:00:00.000${NPT_OFFSET}`
}

/**
 * The last instant of the day, to a millisecond.
 *
 * `applyListFilters` compares `toAd` with `lte`, so the bound has to be the last
 * value INSIDE the day rather than the first value after it. `timestamptz`
 * resolves to microseconds, so a row written at 23:59:59.9995 NPT would slip
 * past this by half a millisecond. Accepted knowingly: pickup and return times
 * are entered by hand at minute granularity, and closing the gap properly means
 * a half-open range (`lt` next midnight), which is a change to the shared
 * `dateRange` contract — "inclusive at both ends" — and to every caller of it,
 * not something to do quietly from one query module.
 */
function endOfDay(dayAd: string): string {
  return `${nepalDay(dayAd)}T23:59:59.999${NPT_OFFSET}`
}
