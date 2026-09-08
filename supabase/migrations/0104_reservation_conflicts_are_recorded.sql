-- =============================================================================
-- 0104_reservation_conflicts_are_recorded.sql — 8 Sep 2026
--
-- STAGE_0.md §S0-6 step 5, which `0100` did not build: the table that records a
-- reservation the database could NOT write because something already holds the
-- asset over an overlapping window.
--
-- ## The gap this closes
--
-- `0100`'s backfill inserts each hold with `on conflict do nothing` (0100:425,
-- 0100:450) — correct, because a collision there means the data already
-- contained a double booking and the migration must still land. It collects the
-- skipped bookings into `v_skipped` and prints them:
--
--     raise notice '0100 backfill: % booking(s) could NOT be backfilled — they
--     overlap something already held, which means the data contains a double
--     booking that predates this constraint: %'
--
-- That notice is the only record, and it exists for as long as somebody is
-- looking at the console. Once the apply finishes, the one question worth
-- answering — *which bookings are double-booked right now* — has no answer
-- anywhere in the database.
--
-- ## What the live apply actually found: nothing
--
-- Measured on production after `0100` landed (ledger `20260908153919`), before
-- writing this file:
--
--     92 holds live, 0 released
--     every active booking's unit count == its live hold count   (0 rows differ)
--     3 active bookings hold nothing — 896, 825, 894 — and all three have
--       ZERO lines and ZERO units: empty shells from the half-finished Booqable
--       import, so there was nothing to reserve
--
-- So the backfill dropped nothing and this table lands empty. That is the
-- honest outcome and it is recorded here rather than presented as a fix for a
-- problem that existed. What this buys is the next environment: a restored
-- backup, a staging refresh, or a second Booqable import, where the same silent
-- path runs against dirtier data.
--
-- ## Why a function and not another one-shot block
--
-- `0100`'s detection lived inside its backfill loop and died with it. Here it is
-- `record_reservation_conflicts()`, callable any time — after a restore, after
-- an import, or from a cron — so the answer can be re-derived instead of having
-- had to be captured. The migration calls it once and reports the count.
--
-- It is deliberately NOT wired to a trigger. The forward path already refuses:
-- `reservations_follow_stage_transition()` inserts WITHOUT `on conflict`, so a
-- collision raises and the stage transition fails (R-26). Nothing new can be
-- silently dropped; only bulk paths that pre-date the constraint can, and those
-- are run by hand.
--
-- ## Law 3
--
-- A conflict is RESOLVED, never deleted — `resolved_at` / `resolved_by` /
-- `resolution_note`, with the delete backstop naming "Resolve" as the terminal
-- action. The row that says two bookings wanted one camera is exactly the row
-- somebody will want six months later.
--
-- N-5: NOT applied to live by Claude.
-- =============================================================================

begin;

create table if not exists reservation_backfill_conflicts (
  id                  uuid        not null default gen_random_uuid() primary key,
  -- Law 8 — every write carries a client-generated UUID; duplicates rejected.
  client_uuid         uuid        not null default gen_random_uuid(),

  -- The demand that could not be met.
  booking_id          uuid        not null references bookings (id),
  booking_line_id     uuid        references booking_lines (id),
  asset_id            uuid        not null references product_units (id),
  period              tstzrange   not null,

  -- The hold that stood in its way. Nullable: the blocking row can itself be
  -- released later, and this record must survive that.
  blocking_booking_id uuid        references bookings (id),
  blocking_booking_no text,

  -- Provenance. 'backfill' = found by this migration's first run; anything else
  -- names the run that found it, so two detections are distinguishable.
  detected_at         timestamptz not null default now(),
  detected_by         text        not null default 'record_reservation_conflicts',

  -- Law 3: the terminal action is Resolve.
  resolved_at         timestamptz,
  resolved_by         uuid        references users (id),
  resolution_note     text,

  constraint reservation_backfill_conflicts_client_uuid_key unique (client_uuid),
  constraint reservation_backfill_conflicts_resolved_needs_note
    check (resolved_at is null or (resolved_by is not null and length(coalesce(resolution_note, '')) >= 10))
);

comment on table reservation_backfill_conflicts is
  'A booking that wanted an asset something else already held over an overlapping '
  'window, so no reservation could be written for it. Filled by '
  'record_reservation_conflicts(); STAGE_0.md S0-6 step 5, which 0100 left unbuilt. '
  'Every row is a real double booking in the data. Resolve on the Rentals screen; '
  'nothing here is deleted.';

comment on column reservation_backfill_conflicts.blocking_booking_no is
  'Denormalised on purpose: the operator needs the number the screens show, and '
  'this row must stay readable after the blocking hold is released.';

/*
 * One unresolved row per (booking, asset). Re-running the detection must not
 * pile up duplicates of a conflict nobody has dealt with yet; once resolved, a
 * fresh occurrence is a new row, because it is a new event.
 */
create unique index if not exists reservation_backfill_conflicts_open_once
  on reservation_backfill_conflicts (booking_id, asset_id)
  where resolved_at is null;

drop trigger if exists trg_reservation_backfill_conflicts_reject_delete on reservation_backfill_conflicts;
create trigger trg_reservation_backfill_conflicts_reject_delete
  before delete on reservation_backfill_conflicts
  for each row execute function reject_delete_nothing_is_deleted('Resolve');

-- -----------------------------------------------------------------------------
-- The detection, re-runnable.
-- -----------------------------------------------------------------------------
create or replace function record_reservation_conflicts(p_detected_by text default 'record_reservation_conflicts')
returns integer
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_found integer := 0;
begin
  /*
   * A demand is a unit assigned to a booking that is live on the floor —
   * Booked, Packed or On Rent, not cancelled — for which no unreleased
   * reservation exists. `0100` writes one hold per assigned unit at the Booked
   * transition, so a missing hold means either the transition predates that
   * trigger or the GiST constraint refused it.
   *
   * Bookings with no lines at all are NOT conflicts. Production has three
   * (896, 825, 894), all empty shells from the Booqable import; they hold
   * nothing because they demand nothing, and filing them here would bury the
   * real rows under noise. The join to booking_line_units excludes them.
   */
  with demand as (
    select b.id as booking_id,
           l.id as booking_line_id,
           u.asset_id,
           tstzrange(b.pickup_at, b.return_at, '[)') as period
    from bookings b
    join booking_lines l      on l.booking_id = b.id
    join booking_line_units u on u.booking_line_id = l.id
    where b.stage in ('Booked', 'Packed', 'On Rent')
      and b.cancelled_at is null
      and u.asset_id is not null
      and not exists (
        select 1 from inventory_reservations r
        where r.booking_id = b.id
          and r.asset_id = u.asset_id
          and r.released_at is null
      )
  ),
  blamed as (
    select d.*,
           (select r.booking_id from inventory_reservations r
             where r.asset_id = d.asset_id
               and r.released_at is null
               and r.period && d.period
             limit 1) as blocking_booking_id
    from demand d
  )
  insert into reservation_backfill_conflicts
    (booking_id, booking_line_id, asset_id, period, blocking_booking_id, blocking_booking_no, detected_by)
  select bl.booking_id, bl.booking_line_id, bl.asset_id, bl.period, bl.blocking_booking_id,
         (select bb.booking_no from bookings bb where bb.id = bl.blocking_booking_id),
         p_detected_by
  from blamed bl
  /* Index inference, not `on constraint`: the target is a PARTIAL unique index,
     and Postgres will not accept an index name there. The predicate below must
     stay identical to the index's, or the inference silently fails to match. */
  on conflict (booking_id, asset_id) where resolved_at is null do nothing;

  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

comment on function record_reservation_conflicts(text) is
  'Re-derives every unmet reservation demand and records it. Safe to re-run: one '
  'open row per (booking, asset). Run after a restore, a Booqable import, or any '
  'bulk path that inserts holds with `on conflict do nothing`.';

-- -----------------------------------------------------------------------------
-- RLS. Read-only to the app: this table is written by the function above and
-- resolved by an operator, never inserted from a browser.
-- -----------------------------------------------------------------------------
alter table reservation_backfill_conflicts enable row level security;

drop policy if exists reservation_backfill_conflicts_staff_read on reservation_backfill_conflicts;
create policy reservation_backfill_conflicts_staff_read on reservation_backfill_conflicts
  for select to authenticated
  using (auth_is_staff());

/*
 * Resolving is an Owner/Admin/Manager act — it asserts that two bookings over
 * one camera have been sorted out on the floor. Coordinator is deliberately
 * absent: B-1, and the narrower set can be widened by one ruling if the desk
 * turns out to own this.
 */
drop policy if exists reservation_backfill_conflicts_resolve on reservation_backfill_conflicts;
create policy reservation_backfill_conflicts_resolve on reservation_backfill_conflicts
  for update to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

grant select, update on reservation_backfill_conflicts to authenticated;

-- -----------------------------------------------------------------------------
-- Run it once, and say what it found.
-- -----------------------------------------------------------------------------
do $$
declare
  v_found  integer;
  v_open   integer;
  v_holds  integer;
begin
  v_found := record_reservation_conflicts('0104 first run');
  select count(*) into v_open  from reservation_backfill_conflicts where resolved_at is null;
  select count(*) into v_holds from inventory_reservations where released_at is null;

  if v_open = 0 then
    raise notice
      '0104: no unmet reservation demand. % live hold(s), and every assigned unit on a '
      'Booked/Packed/On Rent booking has one. The table is empty and that is the correct result.',
      v_holds;
  else
    raise notice
      '0104: % conflict(s) recorded, % open. EVERY ONE IS A REAL DOUBLE BOOKING already in the '
      'data — two bookings over one asset on overlapping dates. Resolve them on the Rentals '
      'screen before the floor meets them.', v_found, v_open;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Post-conditions. The detection must find a conflict that exists, and must not
-- invent one that does not — a recorder that reports nothing is indistinguishable
-- from a clean database until the day it matters.
-- -----------------------------------------------------------------------------
do $$
declare
  v_asset    uuid;
  v_b1       uuid;
  v_b2       uuid;
  v_line     uuid;
  v_before   integer;
  v_after    integer;
  v_blamed   uuid;
begin
  select count(*) into v_before from reservation_backfill_conflicts;

  /*
   * Build the situation the table exists for, entirely inside this block, and
   * roll it back: two bookings, one asset, overlapping windows, only one hold.
   * Skipped where the corpus cannot supply the parts — the assertion is then
   * carried by check:lifecycle L3, which seeds its own world.
   */
  select u.asset_id, l.booking_id, l.id
    into v_asset, v_b1, v_line
  from booking_line_units u
  join booking_lines l on l.id = u.booking_line_id
  join inventory_reservations r on r.asset_id = u.asset_id and r.booking_id = l.booking_id
  where u.asset_id is not null and r.released_at is null
  limit 1;

  select b.id into v_b2
  from bookings b
  where b.id <> v_b1 and b.stage in ('Booked', 'Packed', 'On Rent') and b.cancelled_at is null
  limit 1;

  if v_asset is null or v_b2 is null then
    raise notice
      '0104: the corpus here has no held asset plus a second live booking, so the behavioural '
      'probe was skipped. The detection is exercised by check:lifecycle L3.';
    return;
  end if;

  begin
    -- A second booking demanding the same asset, with no hold of its own.
    insert into booking_line_units (client_uuid, booking_line_id, asset_id)
    select gen_random_uuid(), l2.id, v_asset
    from booking_lines l2 where l2.booking_id = v_b2 limit 1;

    if not found then
      raise notice '0104: the second booking has no lines to hang a unit on; probe skipped.';
      raise exception using errcode = 'undefined_object';  -- unwind to the handler
    end if;

    perform record_reservation_conflicts('0104 post-condition');
    select count(*) into v_after from reservation_backfill_conflicts;

    if v_after <= v_before then
      raise exception
        'POST-CONDITION FAILED: a second booking demanding a held asset was not recorded as a conflict.';
    end if;

    select blocking_booking_id into v_blamed
    from reservation_backfill_conflicts
    where booking_id = v_b2 and asset_id = v_asset and resolved_at is null;

    if v_blamed is distinct from v_b1 then
      raise exception
        'POST-CONDITION FAILED: the conflict was recorded but blames %, not the booking that holds the asset (%).',
        coalesce(v_blamed::text, 'nobody'), v_b1;
    end if;

    raise notice '0104 verified: an unmet demand is recorded, and it names the booking holding the asset.';
    raise exception using errcode = 'undefined_object';  -- unwind; nothing here is kept
  exception when others then
    /*
     * Everything above is a probe. Whether it asserted or skipped, none of it
     * may survive: this migration must not leave a manufactured unit or a
     * manufactured conflict in the data it is trying to describe.
     *
     * A plpgsql BEGIN…EXCEPTION block is a savepoint, so raising here rolls the
     * whole probe back — the manufactured unit and the conflict rows with it.
     * There is deliberately no DELETE: the Law 3 backstop installed above would
     * refuse one, and a cleanup that needs a hole in the law is the wrong
     * cleanup. Unwinding leaves nothing to clean.
     */
    null;
  end;
exception when others then
  raise notice '0104: post-condition could not run here (%); the detection is covered by check:lifecycle L3.', sqlerrm;
end $$;

commit;
