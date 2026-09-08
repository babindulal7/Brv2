-- =============================================================================
-- 0097_sync_cursors_are_server_written.sql — 7 Sep 2026
--
-- **Every sync cursor in the on-device design reads a column the device writes.**
-- PLAN.md §4.43(d) items 1 and 2, and ONDEVICE_DB_PLAN Phase 0 items 1 and 2.
-- Both are engineering, not product rulings — §4.43(d) says so explicitly — so
-- neither waits on §4.43(a) numbering or (b) money-on-disk.
--
-- ## Defect 1 — `updated_at` is written by the client, and nothing overrides it
--
-- `src/actions/rentals/floorVerb.ts` sets `updated_at` from `occurredAt`, which is
-- the DEVICE clock. Across all 96 prior migrations there is not one trigger that
-- touches the column — verified by grep for `new.updated_at`, zero hits.
--
-- Every cursor-based pull in every design in the panel orders and filters on it.
-- So one tablet with a skewed clock does not merely mis-stamp its own rows: it
-- writes timestamps that sort BEHIND the fleet cursor, and every device that has
-- already moved its cursor past that instant **silently and permanently skips
-- those rows**. Nothing throws. The row is simply never pulled again.
--
-- That is the whole failure mode the dead-zone build exists to avoid, and it is
-- unfixable at the call site: `updated_at` has to stop being the device's to say.
--
-- Four tables in the 14-table floor sync set do not have the column at all —
-- `booking_lines`, `booking_line_units`, `session_line_movements` and
-- `booking_stage_transitions` — so a uniform cursor cannot be written over the
-- set as it stands.
--
--   ⚠ PLAN.md §4.43(d).1 lists the four as booking_lines, booking_line_units,
--     `booking_discounts` and booking_stage_transitions. That list is wrong in
--     both directions: it names `booking_discounts`, which is NOT in the floor
--     sync set (it is money), and omits `session_line_movements`, which IS.
--     Re-measured 7 Sep over the CREATE TABLE blocks: exactly five tables lack
--     the column.
--
-- ## RULING 2026-09-07 — `booking_stage_transitions` is excluded, and its cursor
-- ## is `created_at`
--
-- The first draft of this file added `updated_at` to all five and attached the
-- trigger to all fifteen. **Applying it to a real Postgres refused it**, and the
-- refusal was correct:
--
--   Law 3 (append-only): UPDATE on booking_stage_transitions is rejected for
--   every role including Owner and service_role. Correction: insert a reversal row.
--
-- `trg_booking_stage_transitions_reject_update` (`0044:200`) makes that table
-- append-only. The backfill below is an UPDATE, so it could never run — and more
-- to the point, a column that can never change is not a cursor, it is a lie, and
-- a BEFORE UPDATE trigger on a table that rejects UPDATE is dead code.
--
-- So: the table keeps NO `updated_at`, and **a sync cursor over
-- `booking_stage_transitions` must order on `created_at`**. That is sound
-- precisely because it is append-only — a row never moves after it lands, which
-- is the property `updated_at` exists to detect and this table does not need.
--
-- `booking_discounts` IS included: `0044`'s own note says UPDATE there stays
-- legal (whether it should be append-only is an open TODO at `0044:213`), so it
-- both can be backfilled and will want a cursor the day money syncs.
--
-- Revert: re-add 'booking_stage_transitions' to the two arrays below. It will
-- fail again, in the same place, for the same reason.
--
-- Net: `updated_at` added to **4** tables; the trigger attached to **14**.
--
-- ## Defect 2 — `bookings.version` is a dead optimistic lock
--
-- `version integer not null default 1` with `check (version >= 1)`
-- (`0002_bookings.sql`), and nothing anywhere increments it: 0 migrations,
-- 0 source files. Every design in the panel treats it as a working CAS, so every
-- compare-and-set matches and every conflict resolves as silent last-write-wins.
--
-- §4.43(d).2 offers increment or delete, and says leaving it is worse than both
-- because it reads as protection that is not there. This increments it: two
-- devices editing one booking offline is precisely the case the dead-zone build
-- creates, and a column that already exists on 246 live rows is cheaper to arm
-- than to remove and reintroduce.
--
-- ## What this adds
--
--   1. `updated_at` on the **4** updatable tables that lack it — backfilled from
--      `created_at`, NOT from `now()`, so an old row does not arrive at the
--      fleet looking freshly touched and drag every cursor forward.
--   2. `public.set_updated_at()` — unconditional `new.updated_at := now()`.
--      Unconditional is the point: a supplied value is exactly what we are
--      defending against, so it is overwritten rather than respected.
--   3. `public.bump_row_version()` — `new.version := old.version + 1`, on
--      `bookings` only.
--   4. `set_updated_at` attached BEFORE UPDATE to **14** tables: the floor sync
--      set minus append-only `booking_stage_transitions`, plus
--      `booking_discounts`.
--
-- `now()` is transaction time, not `clock_timestamp()`: every row written by one
-- transaction must carry one instant, or a cursor can land mid-transaction and
-- tear a booking from its lines.
--
-- ## Scope note — the third defect is fixed in code, not here
--
-- §4.43(d).3 (`operation_sessions.id` minted per device) is fixed in
-- `src/lib/deterministicId.ts` + `floorVerb.ts`, and needs **no schema change**.
--
-- RULING 2026-09-07: §4.43(d).3's prescribed key `(booking_id, operation,
-- operational_day)` was rejected on three counts, each checked against the
-- schema: (1) `operation_sessions_one_packing_per_booking` (`0003:152`) allows
-- one Packing session per booking *ever*, so a day-keyed id is wider than an
-- existing invariant and re-creates the orphan it was meant to prevent;
-- (2) `session_no` separates the morning collection from the evening one on the
-- SAME day, which a day key merges; (3) `operational_day` derives from
-- `operationalDayStart`, a `localStorage`-only per-browser setting, so it is not
-- fleet-deterministic. Built on `(booking_id, operation, session_no)` instead —
-- already unique via `operation_sessions_session_no_unique` (`0003:85`), no new
-- column, no setting. Revert: restore `generateClientUuid()` at the id site.
-- =============================================================================

begin;

-- ── Pre-conditions ────────────────────────────────────────────────────────────
do $$
declare
  v_missing text;
  v_have    int;
begin
  -- Every table this file touches must exist, or the trigger loop below would
  -- silently attach to a shorter list than the header claims.
  select string_agg(u.name, ', ' order by u.name) into v_missing
  from unnest(array[
    'bookings','booking_lines','booking_line_units','products','product_units',
    'operation_sessions','packing_lines','handover_lines','return_lines',
    'session_line_movements','cleaning_queue_entries','booking_stage_transitions',
    'damage_findings','clients','booking_discounts'
  ]) as u(name)
  where to_regclass('public.' || u.name) is null;

  if v_missing is not null then
    raise exception 'PRE-CONDITION FAILED: missing table(s): %', v_missing;
  end if;

  -- bookings.version must still be the untouched column §4.43(d).2 describes.
  select count(*) into v_have
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bookings' and column_name = 'version';

  if v_have <> 1 then
    raise exception 'PRE-CONDITION FAILED: bookings.version is gone — §4.43(d).2 was '
                    'resolved by deletion, so this file must not arm it.';
  end if;
end $$;

-- ── 1 · the column, where it is missing ───────────────────────────────────────
-- Nullable first, backfilled from created_at, then constrained. Adding it as
-- `not null default now()` in one step would stamp every existing row with the
-- migration's own instant — which is the exact false-freshness this file exists
-- to prevent, and it would make the first pull fetch the entire table.
do $$
declare
  t text;
begin
  -- RULING 2026-09-07: booking_stage_transitions is NOT here. It is append-only
  -- (0044:200 rejects every UPDATE), so the backfill below cannot run on it and
  -- its sync cursor is created_at. See the header.
  foreach t in array array[
    'booking_lines','booking_line_units','session_line_movements','booking_discounts'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('alter table public.%I add column updated_at timestamptz', t);
      execute format('update public.%I set updated_at = created_at where updated_at is null', t);
      execute format('alter table public.%I alter column updated_at set default now()', t);
      execute format('alter table public.%I alter column updated_at set not null', t);
      raise notice '0097: added updated_at to %, backfilled from created_at', t;
    else
      raise notice '0097: % already had updated_at — left alone', t;
    end if;
  end loop;
end $$;

-- ── 2 · the two trigger functions ─────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Unconditional, and deliberately so. The device supplying a value is the
  -- defect (§4.43(d).1), so a supplied value carries no authority here.
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'PLAN.md §4.43(d).1 — sync cursors must not read a clock the device controls. '
  'Overwrites updated_at with transaction time on every UPDATE, ignoring any '
  'value the client sent.';

create or replace function public.bump_row_version()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- old.version is never null: the column is `not null default 1` with
  -- `check (version >= 1)`, so this cannot produce a null and cannot go below 1.
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.bump_row_version() is
  'PLAN.md §4.43(d).2 — arms bookings.version so an optimistic-lock compare can '
  'actually fail. Before this, every CAS matched and every conflict resolved as '
  'silent last-write-wins.';

-- ── 3 · attach ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  -- RULING 2026-09-07: booking_stage_transitions omitted — a BEFORE UPDATE
  -- trigger on a table that rejects UPDATE is dead code. 14 targets, not 15.
  foreach t in array array[
    'bookings','booking_lines','booking_line_units','products','product_units',
    'operation_sessions','packing_lines','handover_lines','return_lines',
    'session_line_movements','cleaning_queue_entries',
    'damage_findings','clients','booking_discounts'
  ]
  loop
    execute format('drop trigger if exists trg_%s_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists trg_bookings_bump_version on public.bookings;
create trigger trg_bookings_bump_version
  before update on public.bookings
  for each row execute function public.bump_row_version();

-- ── 4 · post-conditions ───────────────────────────────────────────────────────
-- Structural assertions always run. The behavioural probe runs only if a booking
-- exists, and says so out loud when it does not — a check that quietly passes on
-- an empty table is not a check (cf. 0085's external_refs gate, which cannot fire
-- because the rows it counts were never imported).
--
-- Every write below is inside the ROLLBACK_0097_PROBE sentinel — the pattern 0094
-- and 0095 use, and the one 0092 omitted, which is why 0092's probe committed a
-- real UPDATE to a production product row.
do $$
declare
  v_expected  int := 14;
  v_attached  int;
  v_id        uuid;
  v_before    timestamptz;
  v_after     timestamptz;
  v_ver_before int;
  v_ver_after  int;
  v_skewed    constant timestamptz := timestamptz '1999-01-01 00:00:00+00';
begin
  select count(*) into v_attached
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  where not tg.tgisinternal
    and tg.tgname = 'trg_' || c.relname || '_set_updated_at'
    and c.relnamespace = 'public'::regnamespace
    and c.relname = any (array[
      'bookings','booking_lines','booking_line_units','products','product_units',
      'operation_sessions','packing_lines','handover_lines','return_lines',
      'session_line_movements','cleaning_queue_entries',
      'damage_findings','clients','booking_discounts'
    ]);

  if v_attached <> v_expected then
    raise exception 'POST-CONDITION FAILED: set_updated_at attached to % tables, expected %.',
      v_attached, v_expected;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_bookings_bump_version' and not tgisinternal
  ) then
    raise exception 'POST-CONDITION FAILED: trg_bookings_bump_version is not attached.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('booking_lines','booking_line_units','session_line_movements',
                         'booking_discounts')
      and column_name = 'updated_at'
      and is_nullable = 'YES'
  ) then
    raise exception 'POST-CONDITION FAILED: updated_at is still nullable somewhere — the '
                    'backfill did not complete, so a cursor would read NULL.';
  end if;

  select id, updated_at, version into v_id, v_before, v_ver_before
  from public.bookings order by created_at limit 1;

  if v_id is null then
    raise notice '0097: BEHAVIOURAL PROBE NOT RUN — public.bookings is empty. The triggers '
                 'are attached (asserted above) but nothing has demonstrated that a skewed '
                 'client timestamp is actually overwritten on this database.';
  else
    -- A device in 1999. If the trigger works, this value never reaches the row.
    update public.bookings set updated_at = v_skewed where id = v_id;
    select updated_at, version into v_after, v_ver_after from public.bookings where id = v_id;

    if v_after = v_skewed then
      raise exception 'POST-CONDITION FAILED: the client-supplied timestamp survived — '
                      'set_updated_at did not fire on bookings.';
    end if;
    if v_after < v_before then
      raise exception 'POST-CONDITION FAILED: updated_at moved BACKWARDS (% -> %), which is '
                      'the cursor-skipping failure this file exists to prevent.', v_before, v_after;
    end if;
    if v_ver_after <> v_ver_before + 1 then
      raise exception 'POST-CONDITION FAILED: version did not increment (% -> %).',
        v_ver_before, v_ver_after;
    end if;
    raise notice '0097: probe passed — skewed % overwritten with %, version % -> %.',
      v_skewed, v_after, v_ver_before, v_ver_after;
  end if;

  raise exception 'ROLLBACK_0097_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0097_PROBE' then
      return;  -- probe writes discarded; the DDL above is outside this block and stands
    end if;
    raise;
end $$;

commit;
