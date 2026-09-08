-- =============================================================================
-- 0100 — RULING 2026-09-08 (R-26): the DATABASE writes reservations, not the app.
--
-- ## What was wrong
--
-- `inventory_reservations` carries the only structural defence against a double
-- booking in this schema:
--
--     constraint inventory_reservations_no_double_booking
--       exclude using gist (asset_id with =, period with &&)
--       where (released_at is null and asset_id is not null)     -- 0003:1470
--
-- and, for the quantity-tracked half that the exclusion's WHERE clause skips,
-- `enforce_inventory_reservation_capacity()` (0045). Both are real. Both guard a
-- table that, until this file, **only the browser ever filled** — one call site,
-- `confirmRental.ts -> reserveAssignedUnits` (`src/lib/queries/availability.ts`).
--
-- A defence nothing is obliged to arm is not a defence. Reproduced in PGlite
-- over the full chain, 8 Sep 2026:
--
--     #900  unit X, 10-12 Sep  -> Booked       inventory_reservations: 0 rows
--     #901  unit X, 11-13 Sep  -> Booked       inventory_reservations: 0 rows
--
-- Two bookings, one camera, overlapping dates, both accepted, and the GiST
-- constraint never consulted because no row was ever offered to it. Any of the
-- five roles admitted by `booking_stage_transitions_insert` — Owner, Admin,
-- Manager, Coordinator, Warehouse — reaches that with one PostgREST call and no
-- browser at all. P0.
--
-- 0003 asked for this in 2026 and said so in the file, four times over:
--
--     -- TRIGGER REQUIRED: no row may exist for a booking at stage Quote or Draft.
--     -- TRIGGER REQUIRED: cancelling a booking sets released_at and released_reason
--     --   on every live hold in the same transaction.
--     -- TRIGGER REQUIRED: insert and release happen only through the Confirm and
--     --   Cancel transactions, never by direct write.
--
-- 0045's own header recorded the same boundary from the other side: "until that
-- engine exists this ceiling — like the EXCLUDE beside it — guards a table
-- nothing is yet obliged to populate." This file is that engine.
--
-- ## The rule, verbatim from R-26
--
-- A booking holds inventory from the moment it becomes **Booked**, and Postgres
-- writes that hold. Quotes hold nothing — a Quote may overlap another Quote.
--
-- ## Where the hold is written from
--
-- `after insert on booking_stage_transitions`, not from an UPDATE on `bookings`.
-- That table is already the sole writer of `bookings.stage` (0021, made real by
-- 0094), it is append-only, and it carries the actor. Hanging the reservation
-- off it means the hold and the stage move are the same transaction by
-- construction: if the reservation is refused, the exception propagates out of
-- this trigger, the transition INSERT rolls back, `apply_booking_stage_transition`'s
-- UPDATE rolls back with it, and **the booking is still a Quote**. There is no
-- order of writes to get wrong and no compensation to half-run, which is what
-- `confirmRental.ts` had to do because PostgREST cannot give a browser a
-- transaction.
--
-- Trigger name: `trg_reservations_follow_stage_transition`. Same event as
-- `trg_apply_booking_stage_transition`, and Postgres fires same-event triggers in
-- **name order**, so `trg_a…` runs first and the stage is already applied when
-- this one runs. The name is load-bearing; renaming it to something sorting
-- before `trg_apply_…` would silently reverse the two.
--
-- ## SECURITY INVOKER, and why that is safe here rather than merely required
--
-- R-26 says invoker, and the policies agree exactly:
--
--     booking_stage_transitions_insert  WITH CHECK auth_user_role() = ANY
--         (Owner, Admin, Manager, Coordinator, Warehouse)
--     inventory_reservations_all        USING/CHECK auth_user_role() = ANY
--         (Owner, Admin, Manager, Coordinator, Warehouse)
--
-- The same five, read off `pg_policy` on 8 Sep 2026. So everyone who can make a
-- booking Booked can write its holds, and nobody else gains a write path they
-- did not have. A SECURITY DEFINER trigger here would have handed the other four
-- roles an indirect INSERT into a table their policy refuses them — a widening
-- nobody asked for. `search_path` is pinned per 0050.
--
-- The invoker choice has one cost, and it is guarded rather than assumed: the
-- SELECTs below also run under the caller's RLS, so a caller who could see the
-- booking but not all of its lines would hold less than the booking commits.
-- The coverage assertion at the end of the function is what turns that from a
-- silent under-reservation into a refusal.
--
-- ## Which rows are written
--
-- Per non-voided `booking_lines` row of the booking:
--
--   * one SERIALISED hold (`asset_id`, `qty = 1`) per live `booking_line_units`
--     row — the serials assigned at creation (D5 / 0071), minus any released
--     since (`booking_line_units.released_at`, 0076);
--   * one QUANTITY hold (`product_id`, `qty = line.qty - live units on the line`)
--     when that remainder is positive.
--
-- R-26 words the second case as "for every serialised line with no units"; this
-- is that case and its two neighbours, because the remainder covers all three
-- with one rule and no gaps:
--
--     units = 0, quantity-tracked product   -> one hold for the whole qty
--                                              (exactly what `reserveAssignedUnits`
--                                              wrote; 204 of 204 live products
--                                              are Quantity, so this is the live
--                                              path)
--     units = 0, serialised product         -> one hold for the whole qty
--     0 < units < qty                       -> serial holds + a hold for the rest
--     units = qty                           -> serial holds only, no remainder
--
-- 0045 counts both shapes against one ceiling ("a model-level hold of 3 plus a
-- serial hold on a fourth unit is 4 units claimed"), so the partly-assigned line
-- is charged correctly rather than twice or not at all.
--
-- Lines naming no product — Bundle, Service, Sub-rental, Manual item — hold
-- nothing. They commit no stock, so there is nothing to hold and nothing to
-- release.
--
-- ## Release
--
-- Law 3: released, never deleted. `released_at` + `released_reason` (the table's
-- own CHECK requires the reason with the timestamp), on:
--
--   * `to_stage in ('Returned','Closed')` — R-26;
--   * `bookings.cancelled_at` becoming non-null — R-26;
--   * `to_stage = 'Quote'` — **not in R-26's list, and added here deliberately.**
--     R-26's first sentence is "a booking holds inventory from the moment it
--     becomes Booked", and its second is "Quotes hold nothing". A reversal from
--     Booked back to Quote (0021 allows it, with an approver and a reason) must
--     therefore give the stock back; leaving the holds live would both contradict
--     that sentence and **deadlock the booking**, because re-confirming it would
--     collide with its own reservation on the GiST constraint and could never
--     succeed again. Symmetry, not new policy — but it is an addition to the
--     ruling's text and is flagged as one rather than folded in silently.
--
-- ## The backfill
--
-- 76 bookings sit at Booked · Packed · On Rent in the reference corpus holding
-- nothing. Every one of them is a commitment the database cannot see, so the
-- constraint would start defending only future bookings and would happily let a
-- new booking take a camera that is already out on rent.
--
-- Retro-fitting a constraint onto history that predates it can fail, and a
-- backfill that aborts the migration on the first overlap would make the fix
-- unappliable. So each booking is backfilled inside its own subtransaction: an
-- overlap or a capacity breach skips **that booking** and is counted and named,
-- and the migration still lands. A `raise notice` prints written / skipped and
-- the skipped booking numbers, so an existing overbooking becomes a work item
-- rather than a silent hole. Re-running writes nothing new — coverage is tested
-- per line before anything is inserted.
--
-- Measured on this repo's own corpus, 8 Sep 2026: **208 holds written across 57
-- bookings, and 19 bookings skipped** — every one of them refused by 0045 with a
-- sentence of the form
--
--     Reservation rejected: product … would have 6 units held at once between
--     2026-08-02 and 2026-08-06, but stock on hand is 4.
--
-- Those 19 are not a defect in this file. They are 19 double bookings sitting in
-- the reference corpus, invisible until something finally asked the question,
-- and they are the clearest evidence available that the constraint has been
-- guarding an empty table. The skip is also order-dependent — one of the 19
-- succeeds on a second pass, once the bookings ahead of it have been skipped —
-- so the notice is a starting list for a human, not a ranked verdict on which
-- booking is at fault.
--
-- One asymmetry to know before reading a green run as more than it is: the 0047
-- corpus is 56 products and **all of them Serialised**, while production is 204
-- products and **all of them Quantity with zero `product_units`**. A scratch
-- build here therefore exercises the GiST exclusion and never the capacity
-- ceiling, and production is the exact opposite. Post-condition 7a covers the
-- first; 7b — which skips here and runs on live — covers the second; and
-- `check:lifecycle` L5 seeds its own Quantity product so the ceiling is proved
-- in CI rather than only in production.
--
-- ## What this file does NOT do
--
--   * It does not disable, defer or weaken `inventory_reservations_no_double_booking`.
--     It is `condeferrable = false` today and stays that way; the override path
--     (`rental.override_overbooking`, M+) RELEASES the losing reservation and
--     re-runs the transition, which is a recorded act with a reason. Nothing
--     turns the constraint off.
--   * It does not implement 0003's remaining `TRIGGER REQUIRED` line — "no row
--     may exist for a booking at stage Quote or Draft". After this file the app
--     no longer writes holds early, so the window that line was about is gone,
--     but a direct PostgREST INSERT could still place one. That is a separate
--     guard and a separate migration.
--   * It does not touch `create_booking`. Creating a Quote reserves nothing
--     (R-26, unchanged) — 0099's comment on that function is restated at the
--     bottom of this file only because its last sentence about Confirm was
--     written when the app held the pen.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Live stands at 0001-0078 plus 0089 (ledger
-- re-read 8 Sep 2026), so it has neither this trigger nor 0099. Per CLAUDE.md no
-- migration reaches live without explicit approval; and this one carries a
-- backfill that writes rows to a production table, so it wants the Step-0 dump
-- first, not merely a yes.
-- =============================================================================
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ The writer.
-- ---------------------------------------------------------------------------
create or replace function reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup    timestamptz;
  v_return    timestamptz;
  v_period    tstzrange;
  v_booking_no text;
  v_uncovered text;
begin
  -- ── Release paths ───────────────────────────────────────────────────────
  -- Returned and Closed end the commitment; Quote un-makes it (see the header).
  -- Filtered on `released_at is null` so Returned -> Closed is a no-op rather
  -- than a second release that would overwrite the first reason.
  if NEW.to_stage in ('Returned', 'Closed', 'Quote') then
    update inventory_reservations
       set released_at     = NEW.occurred_at,
           released_reason = case NEW.to_stage
             when 'Returned' then 'Released on Return: the booking reached Returned.'
             when 'Closed'   then 'Released on Close: the booking reached Closed.'
             else 'Released by a reversal back to Quote: a Quote holds nothing.'
           end
     where booking_id = NEW.booking_id
       and released_at is null;
    return NEW;
  end if;

  if NEW.to_stage <> 'Booked' then
    return NEW;
  end if;

  -- ── Booked: place the holds ─────────────────────────────────────────────
  select pickup_at, return_at, booking_no
    into v_pickup, v_return, v_booking_no
    from bookings
   where id = NEW.booking_id;

  if v_pickup is null then
    -- Unreachable through `apply_booking_stage_transition`, which raises on a
    -- missing booking before this trigger runs. Stated rather than assumed: if
    -- RLS ever hides the row from the caller, this must refuse, not reserve a
    -- null window.
    raise exception
      'Reservation rejected: booking % could not be read, so its rental window is unknown.',
      NEW.booking_id;
  end if;

  -- Half-open, matching `RENTAL_WINDOW_BOUNDS = 'half-open'` in
  -- `src/lib/availability.ts` (ruled PLAN.md §4.30(b)). A 12 Sep return and a
  -- 12 Sep pickup on the same unit do not collide. **Never change one of these
  -- two without the other** — the app would then check a different question
  -- from the one the constraint answers.
  v_period := tstzrange(v_pickup, v_return, '[)');

  -- Serialised: one row per live assigned unit.
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1, v_period, NEW.actor_id
    from booking_lines bl
    join booking_line_units blu on blu.booking_line_id = bl.id
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and blu.released_at is null;

  -- Quantity: the remainder of each line that its units do not cover.
  -- `client_uuid` is minted PER ROW — it is UNIQUE on this table, so one key
  -- across several rows collides on the second.
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id, bl.qty - coalesce(u.n, 0),
         v_period, NEW.actor_id
    from booking_lines bl
    left join lateral (
      select count(*) as n
        from booking_line_units blu
       where blu.booking_line_id = bl.id
         and blu.released_at is null
    ) u on true
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and bl.qty - coalesce(u.n, 0) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  -- Every live line that names stock now holds something. This is the check
  -- that turns a SECURITY INVOKER read the caller could not fully see into a
  -- refusal instead of a booking that commits gear it never reserved.
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_line_id = bl.id
          and r.released_at is null
     );

  if v_uncovered is not null then
    raise exception
      'Reservation rejected: booking % reached Booked with no hold behind %. Nothing was booked.',
      coalesce(v_booking_no, NEW.booking_id::text), v_uncovered;
  end if;

  return NEW;
end;
$$;

comment on function reservations_follow_stage_transition() is
  'R-26 (8 Sep 2026): inventory_reservations is written by the database, from the '
  'Booked transition, and released on Returned/Closed and on a reversal to Quote. '
  'SECURITY INVOKER — the five roles that may insert a transition are exactly the '
  'five inventory_reservations_all admits, so this widens nothing. A refused hold '
  'raises inside the transition INSERT, so the confirm is refused whole and the '
  'booking stays a Quote.';

-- Fires AFTER `trg_apply_booking_stage_transition` — same event, and Postgres
-- orders same-event triggers by NAME. See the header; the name is load-bearing.
drop trigger if exists trg_reservations_follow_stage_transition on booking_stage_transitions;
create trigger trg_reservations_follow_stage_transition
  after insert on booking_stage_transitions
  for each row execute function reservations_follow_stage_transition();


-- ---------------------------------------------------------------------------
-- 2 ▸ Cancellation releases the holds, in the same transaction.
--
-- 0003:1495-1496 asked for exactly this. Cancelled is the sixth state and lives
-- on `bookings.cancelled_at` (0015), not in `stage`, so it never passes through
-- `booking_stage_transitions` and the trigger above cannot see it.
--
-- Today only `postgres` and `service_role` can write that column at all (0094
-- refuses a direct PATCH, and `cancelRental.ts` is `implemented: false`), so this
-- is armed ahead of the writer rather than behind it — which is the right order:
-- whoever builds `rental.cancel` inherits a release they cannot forget.
-- ---------------------------------------------------------------------------
create or replace function release_reservations_on_cancellation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update inventory_reservations
     set released_at     = NEW.cancelled_at,
         released_reason = 'Released on cancellation of booking ' || NEW.booking_no || ': '
                           || coalesce(nullif(btrim(NEW.cancellation_reason), ''), 'no reason recorded')
   where booking_id = NEW.id
     and released_at is null;
  return NEW;
end;
$$;

comment on function release_reservations_on_cancellation() is
  'R-26 (8 Sep 2026): cancelling a booking releases every live hold it carries, in '
  'the same transaction. Law 3 — released, never deleted. Implements 0003:1495-1496.';

drop trigger if exists trg_reservations_released_on_cancellation on bookings;
create trigger trg_reservations_released_on_cancellation
  after update of cancelled_at on bookings
  for each row
  when (OLD.cancelled_at is null and NEW.cancelled_at is not null)
  execute function release_reservations_on_cancellation();


-- ---------------------------------------------------------------------------
-- 3 ▸ Backfill — every booking already past Quote.
--
-- Per booking, in its own subtransaction, so one historical overlap skips that
-- booking instead of aborting the migration. Idempotent: a line that already
-- holds something is not given a second hold, so a re-run writes nothing.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  v_booking  record;
  v_period   tstzrange;
  v_written  integer := 0;
  v_bookings integer := 0;
  v_skipped  text[]  := '{}';
  v_rows     integer;
begin
  for v_booking in
    select id, booking_no, pickup_at, return_at, stage, created_by
      from bookings
     where stage in ('Booked', 'Packed', 'On Rent')
       and cancelled_at is null
     order by booking_no
  loop
    v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');

    begin
      insert into inventory_reservations
        (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by)
      select gen_random_uuid(), v_booking.id, bl.id, blu.asset_id, 1, v_period, v_booking.created_by
        from booking_lines bl
        join booking_line_units blu on blu.booking_line_id = bl.id
       where bl.booking_id = v_booking.id
         and bl.voided_at is null
         and blu.released_at is null
         and not exists (
           select 1 from inventory_reservations r
            where r.booking_line_id = bl.id
              and r.asset_id = blu.asset_id
              and r.released_at is null
         )
      on conflict do nothing;   -- the GiST constraint, per R-26
      get diagnostics v_rows = row_count;
      v_written := v_written + v_rows;

      insert into inventory_reservations
        (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
      select gen_random_uuid(), v_booking.id, bl.id, bl.product_id,
             bl.qty - coalesce(u.n, 0), v_period, v_booking.created_by
        from booking_lines bl
        left join lateral (
          select count(*) as n
            from booking_line_units blu
           where blu.booking_line_id = bl.id
             and blu.released_at is null
        ) u on true
       where bl.booking_id = v_booking.id
         and bl.voided_at is null
         and bl.product_id is not null
         and bl.qty - coalesce(u.n, 0) > 0
         and not exists (
           select 1 from inventory_reservations r
            where r.booking_line_id = bl.id
              and r.product_id is not null
              and r.released_at is null
         )
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_written := v_written + v_rows;

      v_bookings := v_bookings + 1;
    exception when others then
      -- An overlap or a capacity breach that predates the constraint being
      -- armed. Named, not swallowed: it is a real double booking sitting in the
      -- data and somebody has to unpick it.
      v_skipped := v_skipped || (v_booking.booking_no || ' (' || sqlerrm || ')');
    end;
  end loop;

  raise notice
    '0100 backfill: % hold(s) written across % booking(s) at Booked/Packed/On Rent.',
    v_written, v_bookings;

  if array_length(v_skipped, 1) is not null then
    raise notice
      '0100 backfill: % booking(s) could NOT be backfilled — they overlap something already held, which means the data contains a double booking that predates this constraint: %',
      array_length(v_skipped, 1), array_to_string(v_skipped, ' | ');
  end if;
end;
$backfill$;


-- ---------------------------------------------------------------------------
-- 4 ▸ Post-conditions.
--
-- Structural first, then one behavioural proof that undoes itself. The
-- behavioural half runs inside a plpgsql BEGIN/EXCEPTION block, which is an
-- implicit subtransaction: raising at the end of it rolls back everything it
-- wrote, so the migration proves the trigger works without leaving a test
-- booking in the corpus. The full lifecycle lives in `npm run check:lifecycle`
-- (R-27) — this is the part that must be true the instant the file lands.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_def       text;
  v_booking   uuid;
  v_line      uuid;
  v_asset     uuid;
  v_actor     uuid;
  v_branch    uuid;
  v_client    uuid;
  v_product   uuid;
  v_holds     integer;
  v_refused   boolean := false;
  v_released  integer;
  v_capacity  integer;
  v_message   text;
  -- Which behavioural probes actually ran. plpgsql variables live in memory, so
  -- an assignment made inside the subtransaction below SURVIVES its rollback --
  -- which is the only way to tell "the probe passed" from "the probe was
  -- skipped because this database had nothing to probe with".
  v_ran       text[] := '{}';
begin
  -- (1) The trigger exists, on the right table and event.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'booking_stage_transitions'::regclass
       and tgname  = 'trg_reservations_follow_stage_transition'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 1 FAILED: trg_reservations_follow_stage_transition is not on booking_stage_transitions.';
  end if;

  -- (2) It sorts AFTER the stage applier, or the stage would not yet be applied.
  if 'trg_reservations_follow_stage_transition' <= 'trg_apply_booking_stage_transition' then
    raise exception 'POST-CONDITION 2 FAILED: the reservation trigger no longer sorts after trg_apply_booking_stage_transition, so it would run first.';
  end if;

  -- (3) SECURITY INVOKER with a pinned search_path (R-26; 0050).
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reservations_follow_stage_transition';
  if v_def is null then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() does not exist.';
  end if;
  if position('SECURITY DEFINER' in v_def) > 0 then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() is SECURITY DEFINER. R-26 says invoker — definer would hand four roles an INSERT their own policy refuses.';
  end if;
  if position('search_path' in v_def) = 0 then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() has no pinned search_path (0050).';
  end if;

  -- (4) The cancellation release is armed.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'bookings'::regclass
       and tgname  = 'trg_reservations_released_on_cancellation'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 4 FAILED: cancellation does not release reservations.';
  end if;

  -- (5) The constraint is untouched: still there, still NOT deferrable.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'inventory_reservations'::regclass
       and conname  = 'inventory_reservations_no_double_booking'
       and contype  = 'x'
       and not condeferrable
  ) then
    raise exception 'POST-CONDITION 5 FAILED: inventory_reservations_no_double_booking is missing, or has become deferrable. R-26: the constraint is never disabled and never deferrable.';
  end if;

  -- (6) The backfill left no Booked/Packed/On Rent line naming stock unheld.
  if exists (
    select 1
      from bookings b
      join booking_lines bl on bl.booking_id = b.id
     where b.stage in ('Booked', 'Packed', 'On Rent')
       and b.cancelled_at is null
       and bl.voided_at is null
       and bl.product_id is not null
       and not exists (
         select 1 from inventory_reservations r
          where r.booking_line_id = bl.id and r.released_at is null
       )
       -- Bookings the backfill reported as skipped are excluded: they are a
       -- pre-existing double booking, named in the notice above, and this
       -- check must not turn a data problem into an unappliable migration.
       and exists (
         select 1 from inventory_reservations r2 where r2.booking_id = b.id
       )
  ) then
    raise exception 'POST-CONDITION 6 FAILED: a backfilled booking still has a stock-bearing line with no live hold.';
  end if;

  -- (7) Behavioural: a Booked transition writes holds, and a second booking on
  --     the same unit over an overlapping window is REFUSED. Rolled back below.
  begin
    select id into v_actor   from users where primary_role = 'Owner' limit 1;
    select id into v_branch  from branches limit 1;
    select id into v_client  from clients limit 1;
    select pu.id, pu.product_id into v_asset, v_product
      from product_units pu
      join products p on p.id = pu.product_id
     where p.tracking_mode = 'Serialised'
       and not exists (
         select 1 from inventory_reservations r
          where r.asset_id = pu.id and r.released_at is null
       )
     limit 1;

    if v_actor is null or v_branch is null or v_client is null then
      raise exception 'POST-CONDITION 7 FAILED: no Owner, no branch or no client — this database cannot be probed at all, so nothing below was proved.';
    end if;

    -- -- 7a . Serialised: the GiST exclusion --------------------------------
    -- Skipped where there are no serial units to probe with. That is not a
    -- hypothetical: the live project has 204 Quantity products and ZERO
    -- product_units, so on production 7b is the only one of these two that runs
    -- — which is why 7b exists.
    if v_asset is null then
      raise notice '0100: no free serialised unit here; probe 7a (the GiST exclusion) was skipped.';
    else
      insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                            pickup_at, return_at, created_by, updated_by)
      values (gen_random_uuid(), '999999901', v_branch, v_client, 'Customer Pickup',
              '2099-01-10T04:00:00Z', '2099-01-12T04:00:00Z', v_actor, v_actor)
      returning id into v_booking;

      insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
      values (gen_random_uuid(), v_booking, 'Equipment', v_product, '0100 post-condition line', 1, 2, 0, v_actor)
      returning id into v_line;

      insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
      values (gen_random_uuid(), v_line, v_asset, 1, v_actor);

      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());

      select count(*) into v_holds
        from inventory_reservations
       where booking_id = v_booking and released_at is null and asset_id = v_asset;
      if v_holds <> 1 then
        raise exception 'POST-CONDITION 7 FAILED: Booked wrote % serialised hold(s), expected 1.', v_holds;
      end if;

      -- The same unit, an overlapping window, a second booking: refused.
      declare
        v_booking2 uuid;
        v_line2    uuid;
      begin
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999902', v_branch, v_client, 'Customer Pickup',
                '2099-01-11T04:00:00Z', '2099-01-13T04:00:00Z', v_actor, v_actor)
        returning id into v_booking2;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking2, 'Equipment', v_product, '0100 post-condition line 2', 1, 2, 0, v_actor)
        returning id into v_line2;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (gen_random_uuid(), v_line2, v_asset, 1, v_actor);

        begin
          insert into booking_stage_transitions
            (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
          values (gen_random_uuid(), v_booking2, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());
        exception when exclusion_violation then
          v_refused := true;
        end;

        if not v_refused then
          raise exception 'POST-CONDITION 7 FAILED: a second booking took the same unit over an overlapping window and was ACCEPTED. The constraint is not being consulted.';
        end if;

        if (select stage from bookings where id = v_booking2) <> 'Quote' then
          raise exception 'POST-CONDITION 7 FAILED: the refused booking did not stay at Quote.';
        end if;
      end;

      -- Returned releases.
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Booked', 'Packed', v_actor, 'Owner', now());
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Packed', 'On Rent', v_actor, 'Owner', now());
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'On Rent', 'Returned', v_actor, 'Owner', now());

      select count(*) into v_released
        from inventory_reservations
       where booking_id = v_booking and released_at is not null and released_reason is not null;
      if v_released < 1 then
        raise exception 'POST-CONDITION 7 FAILED: Returned did not release the booking''s holds.';
      end if;

      v_ran := v_ran || '7a serialised: Booked holds, an overlapping second booking is refused and stays at Quote, Returned releases'::text;
    end if;

    -- -- 7b . Quantity: the 0045 capacity ceiling ---------------------------
    -- The shape that matters on production, where every product is Quantity and
    -- no exclusion constraint applies (its WHERE clause is `asset_id is not
    -- null`). Books a product's ENTIRE stock in an empty far-future window, then
    -- asks for one more unit of it over the same window.
    select p.id, p.total_quantity into v_product, v_capacity
      from products p
     where p.tracking_mode = 'Quantity'
       and p.total_quantity between 1 and 50
     limit 1;

    if v_product is null then
      raise notice '0100: no Quantity product with a small stock here; probe 7b (the capacity ceiling) was skipped. Expected in a scratch build from this repo — the 0047 reference corpus is 56 products and ALL of them Serialised, the exact inverse of production (204 Quantity, 0 product_units). 7b runs on live; the quantity ceiling is proved here by check:lifecycle L5, which seeds its own Quantity product.';
    else
      declare
        v_booking3 uuid;
        v_booking4 uuid;
      begin
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999903', v_branch, v_client, 'Customer Pickup',
                '2099-06-01T04:00:00Z', '2099-06-03T04:00:00Z', v_actor, v_actor)
        returning id into v_booking3;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking3, 'Equipment', v_product, '0100 capacity probe - the whole shelf', v_capacity, 2, 0, v_actor);

        insert into booking_stage_transitions
          (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking3, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());

        select count(*), coalesce(sum(qty), 0) into v_holds, v_released
          from inventory_reservations
         where booking_id = v_booking3 and released_at is null and product_id = v_product;
        if v_holds <> 1 or v_released <> v_capacity then
          raise exception
            'POST-CONDITION 7b FAILED: booking the whole shelf wrote % quantity hold(s) totalling %, expected 1 hold of %.',
            v_holds, v_released, v_capacity;
        end if;

        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999904', v_branch, v_client, 'Customer Pickup',
                '2099-06-01T04:00:00Z', '2099-06-03T04:00:00Z', v_actor, v_actor)
        returning id into v_booking4;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking4, 'Equipment', v_product, '0100 capacity probe - one more than exists', 1, 2, 0, v_actor);

        v_refused := false;
        begin
          insert into booking_stage_transitions
            (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
          values (gen_random_uuid(), v_booking4, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());
        exception when others then
          v_refused := true;
          v_message := sqlerrm;
        end;

        if not v_refused then
          raise exception
            'POST-CONDITION 7b FAILED: a booking took one more than the whole stock of a Quantity product and was ACCEPTED. enforce_inventory_reservation_capacity() is not being reached.';
        end if;
        if position('Reservation rejected' in coalesce(v_message, '')) = 0 then
          raise exception
            'POST-CONDITION 7b FAILED: the over-capacity booking was refused, but by something other than the capacity ceiling: %', v_message;
        end if;
        if (select stage from bookings where id = v_booking4) <> 'Quote' then
          raise exception 'POST-CONDITION 7b FAILED: the refused booking did not stay at Quote.';
        end if;

        v_ran := v_ran || '7b quantity: the whole shelf holds as one row, one more than exists is refused by the capacity ceiling and stays at Quote'::text;
      end;
    end if;

    -- Undo everything this block wrote. `bookings`, `booking_stage_transitions`
    -- and `booking_line_units` all refuse DELETE (Law 3), so the only way back
    -- is to abort the subtransaction — which is what this raise does.
    raise exception using errcode = 'P0001', message = '__0100_rollback_probe__';
  exception when others then
    if sqlerrm <> '__0100_rollback_probe__' then
      raise;
    end if;
  end;

  if array_length(v_ran, 1) is null then
    raise exception
      'POST-CONDITION 7 FAILED: neither behavioural probe could run — this database has no serialised unit AND no small Quantity product, so nothing about the trigger''s behaviour was proved and the structural checks above are the only evidence.';
  end if;

  raise notice
    '0100 post-conditions passed. Structural: the trigger is on booking_stage_transitions, sorts after the stage applier, is SECURITY INVOKER with a pinned search_path, cancellation releases, and inventory_reservations_no_double_booking is still enabled and NOT deferrable. Behavioural (rolled back): %',
    array_to_string(v_ran, ' | ');
end;
$chk$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + '
  'discounts) in a single transaction. SECURITY INVOKER — every insert faces '
  'its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid). Per D5 '
  '(ruled 30 Aug 2026) a line may carry units[] — serials assigned at '
  'creation, one booking_line_units row each; absent means unit-less, and '
  'Pack confirms or fills. Reserves nothing: a Quote holds no stock, and since '
  'R-26 (0100) the holds are written by the Booked transition, not by any '
  'application code. Prices nothing — src/lib/money.ts owns pricing (Law 1). '
  '0099: the discount audit row is class ''discount''; it was ''data change'', '
  'which is not a member of audit_event_class, so every discounted booking was '
  'refused outright.';

commit;
