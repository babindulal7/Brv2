-- =============================================================================
-- 0076 — Operational-stage corpus: Booked and Packed bookings, dated from the
--        clock at APPLY time.
--
-- ✅ APPLIED to the live project 31 Aug 2026, registered as
--    `20260831141204 0076_seed_operational_stage_corpus`. Applied on Babin's
--    explicit instruction ("apply 0074"), after the renumber below.
--    Result, measured immediately after: bookings 200 → 246 · booking_lines
--    0 → 92 · Packed 16 · Booked 30 · Today ▸ Going out **0 → 6**, Tomorrow 9,
--    Next 7 days 26. Seeded rows are B-900 … B-945.
--
-- ⚠ APPLIED ON 31 AUG. The dates below were resolved from `current_date` on
--   that day, so this corpus is centred on 31 Aug 2026 and will age exactly the
--   way `seed.ts`'s frozen anchor did — just from a later start. It is not
--   self-refreshing. When Today ▸ Going out empties again, the fix is a fresh
--   migration of this shape, not an edit to this one (it is already applied and
--   its rows cannot be deleted — see the retreat at the foot of the file).
--
-- ⚠ RENUMBERED 0074 → 0076 on 31 Aug at 19:10, before applying. This file was
--   written as 0074 at 17:57; by then a DIFFERENT `0074_drop_discount_gate` had
--   already been written (17:33) by a concurrent session and applied to the live
--   project at 12:42, with `0075_drop_invoice_lines_discount_gate` applied at
--   13:19. Two files therefore carried each of 0074 and 0075 on disk. Verified
--   against `supabase_migrations.schema_migrations` rather than the filenames,
--   which is the only way to see this — the header of a draft cannot know what
--   landed beside it.
--   0076 is the first free number. `0075_law6_arm_the_four_unarmed_tables.sql`
--   (the I5 follow-up) still collides with the applied 0075 and needs the same
--   treatment before IT is applied.
--
-- ## What this fixes
--
-- Backlog I6 (`docs/booqable/CAPTURE-BACKLOG.md` §5): the Dashboard's
-- **Going out** panel is structurally empty on every date, and cannot be
-- demoed or evaluated.
--
-- `queries/bookings.ts` → `todaysOutgoing(day)` selects
--   stage IN ('Booked','Packed')  AND  pickup_at within the operational day
--   AND cancelled_at IS NULL
-- The live corpus (200 bookings) holds **zero rows in either stage** and no
-- pickup later than 29 Aug 2026. Both halves of the predicate miss.
--
-- ## Why the existing seed does not fix it
--
-- `src/lib/seed.ts` ALREADY generates 30 Booked + 16 Packed, with Packed
-- deliberately at 0–2 days out — see its `STAGE_PLAN`. Two reasons it does not
-- help here:
--
--   1. **Its anchor is frozen a month in the past.**
--      `const ANCHOR = kathmandu(2026, 6, 31, 6, 0)` — 31 Jul 2026 (month is
--      0-indexed). Its doc comment justifies the freeze by citing "`bs.ts`'s
--      `TODAY`, 31 Jul 2026" — but that constant NO LONGER EXISTS. `bs.ts:255`
--      records that `export const TODAY = new Date(Date.UTC(2026, 6, 31))` was
--      replaced by `getBusinessToday()`, which reads the real clock, precisely
--      because "every overdue chip, ageing count and days-left figure derived
--      from it was measuring distance from a day in the past".
--      The app was un-frozen. The seed was not. They have drifted one month
--      apart, and regenerating `0047` today would still emit Packed pickups
--      dated 31 Jul – 2 Aug.
--
--   2. **The live corpus is not the seed corpus.** 200 bookings, 0 rows in
--      `external_refs` for any of them, 0 rows in `booking_stage_transitions`
--      — bulk-inserted directly, bypassing both the Booqable bridge and the
--      transition machinery. Its stage spread (Returned 130 · Closed 60 ·
--      Quote 7 · On Rent 3) mirrors the Booqable account, and Booqable cannot
--      produce these two stages: `reserved → Booked` exists but that account
--      holds only 2 Reserved orders, and **`Packed` has no Booqable
--      equivalent at all** — "OS-only, never pushed"
--      (`src/lib/booqable/map/orders.ts:168`). This is ruling R3 in effect.
--
-- ## Why the dates are computed here rather than written down
--
-- `0047_seed_reference_corpus.sql` is a GENERATED file whose figures come out
-- of the engines, and it hard-codes instants. That is right for a reproducible
-- reference corpus and wrong for the one thing this file exists to do: put rows
-- under a panel that asks "what moves TODAY".
--
-- Every timestamp below is derived from `current_date` AT APPLY TIME, so this
-- migration cannot go stale the way the frozen anchor did. Applying it on any
-- future date produces a corpus centred on that date.
--
-- ⚠ The consequence, stated plainly: **this file is not byte-reproducible.**
-- Applying it twice on different days yields different instants. That is a
-- deliberate trade and it is why it is numbered as its own migration rather
-- than folded into the generated 0047.
--
-- ## The operational day
--
-- D4 (ruled 30 Aug) sets the operational day to 06:00 Asia/Kathmandu, as a
-- setting (`operationalDayStart`, default "06:00"). Pickups below land at
-- 07:30 and 09:15 NPT — inside the 06:00→06:00 window for their calendar day,
-- so they fall in the day a reader expects and not on a boundary.
-- Nepal is UTC+05:45 and has not changed offset since 1986, so the fixed
-- offset written here is exact.
--
-- ## Gates
--
-- `validate_booking_gates` (trg_booking_gate_check) only guards the
-- transitions INTO 'On Rent' and 'Closed', which require a settled deposit and
-- no outstanding invoice. **'Booked' and 'Packed' are ungated**, so these rows
-- insert without needing `security_deposits` or `invoices` rows. Verified
-- against the live function definition, 31 Aug 2026.
--
-- Law 3 note: `trg_bookings_reject_delete` blocks DELETE on `bookings`. These
-- rows CANNOT be removed once applied — only cancelled (`cancelled_at`), which
-- is what the last section of this file offers as the retreat.
--
-- ## Verification performed before this file was committed
--
-- The whole body was executed against the live database inside
-- `begin; … rollback;` on 31 Aug 2026. It ran clean through every trigger and
-- CHECK constraint, and `todaysOutgoing`'s exact predicate then returned the
-- expected rows. Nothing was persisted. See PROGRESS.md, 31 Aug.
-- =============================================================================

-- ── Bookings ────────────────────────────────────────────────────────────────
--
-- Written as inline CTEs rather than temp tables ON PURPOSE. A `create temporary
-- table … on commit drop` only survives if the whole file runs inside ONE
-- transaction, and a migration runner is free to commit per statement — in which
-- case the temp table vanishes before the INSERT that reads it and the migration
-- fails halfway, having already written some rows. CTEs carry no such assumption,
-- so this file behaves identically under `psql -1`, the Supabase CLI, and a
-- per-statement runner.
--
-- ── Reference anchors ──
-- Resolved by natural key, never by literal UUID, matching 0047's convention.
--
-- ── The plan ──
-- Mirrors src/lib/seed.ts's STAGE_PLAN windows for these two stages, but
-- relative to the apply date instead of a frozen anchor.
--
--   Packed  — pickup 0..2 days out. This is what fills Today ▸ Going out.
--   Booked  — pickup 1..24 days out. Fills Tomorrow / This Week / Next 7 Days.
--
-- Deliberately weighted so TODAY is not empty: 6 of the 16 Packed rows sit on
-- day 0. An empty Today screen is the exact failure this migration exists to
-- end, and "0 rows because the window is right but the dice were unkind" is
-- indistinguishable from "0 rows because the query is broken".

with ctx as (
  select
    (select id from branches order by created_at limit 1)                   as branch_id,
    (select id from users where primary_role = 'Owner' order by id limit 1) as actor_id,
    -- Continue the ruled B-<n> sequence (migration 0055) from the current high-water mark.
    (select coalesce(max((regexp_replace(booking_no, '\D', '', 'g'))::int), 0)
       from bookings where booking_no ~ '^B-[0-9]+$')                       as max_no
),
plan(stage, n, day_offset) as (
  values
    ('Packed'::booking_stage,  6, 0),
    ('Packed'::booking_stage,  5, 1),
    ('Packed'::booking_stage,  5, 2),
    ('Booked'::booking_stage,  4, 1),
    ('Booked'::booking_stage,  6, 3),
    ('Booked'::booking_stage,  6, 7),
    ('Booked'::booking_stage,  7, 12),
    ('Booked'::booking_stage,  7, 24)
),
numbered as (
  select
    p.stage,
    p.day_offset,
    row_number() over (order by p.day_offset, p.stage, g.i) as seq,
    g.i
  from plan p
  cross join lateral generate_series(1, p.n) as g(i)
),
picked as (
  -- Spread across distinct clients deterministically rather than at random:
  -- a repeated client on every row makes the Dashboard look broken in a
  -- different way. Ordered by id so the choice is stable for a given corpus.
  select n.*,
         c.id  as client_id,
         ctx.branch_id,
         ctx.actor_id,
         'B-' || (ctx.max_no + n.seq)::text as booking_no
  from numbered n
  cross join ctx
  join lateral (
    select id from clients order by id offset ((n.seq * 7) % 366) limit 1
  ) c on true
)
insert into bookings (
  client_uuid, booking_no, branch_id, client_id,
  project, pickup_at, return_at, delivery_type,
  pickup_location, deposit_required, stage,
  created_by, updated_by
)
select
  gen_random_uuid(),
  p.booking_no,
  p.branch_id,
  p.client_id,
  'Seed corpus — operational stages (0076)',
  -- 07:30 NPT on day 0/1/2…, then 09:15 for the alternate rows so the panel
  -- shows a realistic morning spread rather than one repeated time.
  ((current_date + p.day_offset)::text || ' ' ||
     case when p.i % 2 = 0 then '09:15' else '07:30' end || ':00+05:45')::timestamptz,
  -- Runs of 2–6 days, deterministic, so Coming back has rows on later days too.
  ((current_date + p.day_offset + 2 + (p.i % 5))::text || ' 06:00:00+05:45')::timestamptz,
  'Customer Pickup'::delivery_type,
  'Kathmandu Main HQ',
  0,
  p.stage,
  p.actor_id,
  p.actor_id
from picked p;

-- ── Lines ───────────────────────────────────────────────────────────────────
-- Without these every seeded row reads "0 items", which is its own kind of
-- broken-looking. One or two Equipment lines each, priced from the product's
-- own daily_rate so no figure here is hand-typed (PLAN.md Phase 1).

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id,
  description, qty, days, rate, sort_order, created_by
)
select
  gen_random_uuid(),
  b.id,
  'Equipment'::booking_line_type,
  pr.id,
  pr.name,
  1 + (l.k % 2),
  greatest(1, (b.return_at::date - b.pickup_at::date)),
  pr.daily_rate,
  l.k,
  b.created_by
from bookings b
cross join lateral generate_series(0, 1) as l(k)
join lateral (
  select id, name, daily_rate
  from products
  where daily_rate is not null
  order by id
  offset ((abs(hashtext(b.booking_no)) + l.k) % 204) limit 1
) pr on true
where b.project = 'Seed corpus — operational stages (0076)';

-- No explicit BEGIN/COMMIT: the runner owns the transaction. See the note above
-- the first CTE for why this file makes no assumption about it.

-- =============================================================================
-- Retreat, if this corpus is ever unwanted.
--
-- Law 3: bookings CANNOT be deleted — `trg_bookings_reject_delete` rejects it.
-- The named terminal action is cancellation, which also removes the rows from
-- every Dashboard panel, since all of them carry `presence.cancelled_at=false`:
--
--   update bookings
--      set cancelled_at        = now(),
--          cancelled_by        = (select id from users where primary_role='Owner' order by id limit 1),
--          cancellation_reason = 'Seed corpus withdrawn'
--    where project = 'Seed corpus — operational stages (0076)';
--
-- The `project` value is the handle for that — it is why every row carries it.
-- =============================================================================
