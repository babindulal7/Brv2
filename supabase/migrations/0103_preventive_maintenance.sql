-- =============================================================================
-- 0103 — RULING 2026-09-08 (R-28): preventive maintenance is DUE BY TIME OR
--        USAGE, WARNS ONLY, and its intervals live on the product MODEL.
--
-- Babin ruled three things on 8 Sep, and each one is a decision this file
-- implements rather than a default it takes:
--
--   1. A unit is **due for service** when EITHER its elapsed-time interval OR
--      its usage interval since the last completed preventive job is reached —
--      whichever comes first.
--   2. Being due **warns only**. A `Service due` badge; the unit stays bookable.
--      Nothing moves it to Maintenance, nothing creates a work order.
--   3. The interval lives on the **product model**, not the category and not
--      the unit.
--
-- ## Derived, never stored
--
-- Due-ness is computed at read time from three facts — the model's interval,
-- the unit's last completed preventive job, the unit's usage since then. There
-- is **no `is_due` column** anywhere (Bundles v1.1 §1). A stored flag would be
-- wrong the moment the clock moved, and a nightly job to keep it true is a
-- second source for a fact the tables already carry.
--
-- ## Three deviations from R-28's schema table, each stated rather than folded in
--
-- **(a) The meter already exists.** R-28 adds `product_units.meter_hours
-- numeric(10,1)`. `product_units.running_hours numeric(10,2) NOT NULL` has been
-- on that table since 0004 and is the same fact. Adding a second hours column
-- would give one unit two meters that could disagree, which is the defect this
-- repo keeps finding (`vat-rate-has-three-sources`). So `running_hours` IS the
-- meter, and only what it lacks is added: when the reading was taken, and what
-- it read at the last service.
--
-- **(b) A delta needs a baseline.** `meter_hours_since_service` cannot be
-- computed from a running total alone, and R-28 names no place to keep the
-- reading at service time. `product_units.service_meter_baseline` is that place:
-- set to the unit's current reading at intake (backfilled below, so no existing
-- unit is instantly overdue), and re-set by the trigger when a `Preventive
-- Service` job completes. That trigger IS the reset R-28 describes — "a
-- completed Preventive row is the reset; nothing else resets the clock" — made
-- executable.
--
-- **(c) `Preventive` is spelled `Preventive Service`.** R-28 says
-- `maintenance_type` must carry `Preventive`, "one of the eight locked types".
-- The eight locked types are Repair · Inspection · Calibration · Firmware Update
-- · Sensor Cleaning · Internal Cleaning · Fungus Removal · **Preventive
-- Service** (0001). The member exists; nothing is added to the enum, and the
-- shorthand in the ruling is read as naming it.
--
-- ## `due_at` is the TIME due date, and only that
--
-- R-28 defines `due_at` as "the earlier of `last_service_at + interval_days` and
-- the date usage crossed its threshold". The first is arithmetic. The second is
-- not available: crossing a rental-day threshold happens somewhere inside a
-- booking history, and recovering the instant would mean replaying every
-- booking's transitions per unit on every read of an inventory list.
--
-- So `due_at` carries the TIME due date (null when the model sets no day
-- interval), and the usage case is served by the counters instead — which is
-- exactly what R-28's own tooltip shows: `— usage (42 of 40 rental days)` names
-- no date. `overdue_days` follows the same rule and is null for a usage-only
-- reason, because "overdue by N days" has no meaning when the threshold is
-- rental days rather than a calendar.
--
-- When BOTH thresholds are crossed, `due_reason` reports `'time'`. It is the one
-- that carries a date the operator can act on, and R-28's "whichever comes
-- first" cannot be evaluated without the crossing instant the paragraph above
-- says is unavailable. Stated here so a later reader does not take it for a bug.
--
-- ## Money-free by construction
--
-- `product_units_service_v` names no money column, so every staff role may read
-- it and no Law 6 mask is needed. `maintenance_records.cost` is deliberately
-- NOT joined in — the view answers "is this due", not "what did it cost".
--
-- ## Read-only, like every other view here
--
-- 0095's rule, verbatim: "any migration that creates a view must revoke its DML
-- in the same file". A Postgres view over one table is auto-updatable, and the
-- platform's default ACL grants `authenticated` INSERT/UPDATE/DELETE on new
-- objects — which is how 23 `_v` views became a writable bypass around RLS. The
-- revoke is at the bottom of this file.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Additive — six columns, one view, one
-- trigger, one backfill of an existing column's baseline — and still subject to
-- CLAUDE.md N-5.
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
-- 1 ▸ The plan, on the MODEL.
--
-- All three intervals nullable, and **null means that trigger is off**. A model
-- with all three null has no preventive plan and never badges — which is every
-- model in the catalogue the moment this lands, so nothing starts shouting on
-- day one. `service_grace_days` is NOT NULL with the ⭐ default of 7 (R-28).
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists service_interval_days         integer,
  add column if not exists service_interval_rental_days  integer,
  add column if not exists service_interval_meter_hours  numeric(10,1),
  add column if not exists service_grace_days            integer not null default 7;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_service_intervals_positive') then
    alter table products add constraint products_service_intervals_positive check (
      (service_interval_days        is null or service_interval_days        > 0) and
      (service_interval_rental_days is null or service_interval_rental_days > 0) and
      (service_interval_meter_hours is null or service_interval_meter_hours > 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_service_grace_non_negative') then
    -- Zero is a real answer: "due is overdue, no grace at all". Negative is not.
    alter table products add constraint products_service_grace_non_negative
      check (service_grace_days >= 0);
  end if;
end;
$$;

comment on column products.service_interval_days is
  'R-28: calendar days between preventive services for this MODEL. Null = the time trigger is off.';
comment on column products.service_interval_rental_days is
  'R-28: rental days (sum of booking_lines.days on bookings that reached On Rent) between preventive services. Null = off.';
comment on column products.service_interval_meter_hours is
  'R-28: meter hours between preventive services, read against product_units.running_hours. Null = off.';
comment on column products.service_grace_days is
  'R-28 ⭐ (default 7): days after due before a unit reads Overdue rather than Due. Zero means no grace.';


-- ---------------------------------------------------------------------------
-- 2 ▸ The unit's meter — what `running_hours` was missing.
--
-- `meter_hours_recorded_at` is WHEN the reading was taken, which is what makes a
-- stale meter visible instead of silently under-counting.
-- `service_meter_baseline` is what the meter read at the last service, and it is
-- the only reason a delta is computable at all (deviation (b) in the header).
-- ---------------------------------------------------------------------------
alter table product_units
  add column if not exists meter_hours_recorded_at timestamptz,
  add column if not exists service_meter_baseline  numeric(10,2) not null default 0;

-- Backfill: an existing unit's meter starts counting from where it is NOW, not
-- from zero. Without this, a camera with 900 recorded hours would read as 900
-- hours overdue the instant a model gained a meter interval — a fleet-wide false
-- alarm on day one, which is exactly the way a warning stops being read.
update product_units set service_meter_baseline = running_hours
 where service_meter_baseline = 0 and running_hours > 0;

comment on column product_units.meter_hours_recorded_at is
  'R-28: when running_hours was last written. Written at intake (Add Equipment v3.0) and at Return; no other writer.';
comment on column product_units.service_meter_baseline is
  'R-28: what running_hours read at the last completed Preventive Service. The subtrahend in meter_hours_since_service; re-set by trg_preventive_service_resets_the_meter.';


-- ---------------------------------------------------------------------------
-- 3 ▸ The reset.
--
-- "A completed Preventive Service row IS the reset; nothing else resets the
-- clock" (R-28). A Corrective job — Repair, and the six others — does NOT reset
-- it: fixing a fault is not a service, and letting it count would let a unit
-- that broke twice go three years without being serviced.
--
-- The time and rental-day counters need no trigger; they read `completed_at` off
-- `maintenance_records` directly. Only the meter does, because only the meter
-- carries a baseline.
-- ---------------------------------------------------------------------------
create or replace function preventive_service_resets_the_meter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- SECURITY DEFINER, for the same reason 0045's ceiling is: a Technician
  -- completing a job must be able to move the baseline on the unit even where
  -- `product_units_update` does not admit them, and the value written is read
  -- from the unit itself rather than supplied by the caller — so definer rights
  -- grant no ability to state a number.
  update product_units pu
     set service_meter_baseline = pu.running_hours
   where pu.id = NEW.product_unit_id;
  return NEW;
end;
$$;

comment on function preventive_service_resets_the_meter() is
  'R-28: completing a Preventive Service job re-bases the unit''s meter. Nothing else does — a Corrective job is not a service.';

drop trigger if exists trg_preventive_service_resets_the_meter on maintenance_records;
create trigger trg_preventive_service_resets_the_meter
  after insert or update of completed_at on maintenance_records
  for each row
  when (NEW.completed_at is not null and NEW.maintenance_type = 'Preventive Service')
  execute function preventive_service_resets_the_meter();


-- ---------------------------------------------------------------------------
-- 4 ▸ The view. One row per unit that can be due.
--
-- Retired and Missing units never badge (R-28), so they are not in the view at
-- all rather than in it with a null reason — a caller that forgot to filter
-- cannot then badge a camera that was written off in 2024.
-- ---------------------------------------------------------------------------
create or replace view product_units_service_v as
with last_service as (
  select mr.product_unit_id, max(mr.completed_at) as completed_at
    from maintenance_records mr
   where mr.maintenance_type = 'Preventive Service'
     and mr.completed_at is not null
   group by mr.product_unit_id
),
base as (
  select
    pu.id           as unit_id,
    pu.product_id,
    pu.running_hours,
    pu.service_meter_baseline,
    p.service_interval_days,
    p.service_interval_rental_days,
    p.service_interval_meter_hours,
    p.service_grace_days,
    -- "A unit with no completed preventive job counts from product_units.created_at
    -- (intake)" — R-28, verbatim.
    coalesce(ls.completed_at, pu.created_at) as last_service_at
  from product_units pu
  join products p on p.id = pu.product_id
  left join last_service ls on ls.product_unit_id = pu.id
  where pu.retired_at is null
    and pu.status not in ('Retired', 'Missing')
),
usage as (
  select
    b.unit_id,
    coalesce(sum(bl.days), 0) as rental_days
  from base b
  join booking_line_units blu on blu.asset_id = b.unit_id
  join booking_lines bl       on bl.id = blu.booking_line_id
  where bl.voided_at is null
    and exists (
      -- "bookings that reached On Rent after last_service_at" — the transition
      -- row is the evidence, not `bookings.stage`, because a booking that has
      -- since Returned is still a booking the unit went out on.
      select 1 from booking_stage_transitions t
       where t.booking_id = bl.booking_id
         and t.to_stage = 'On Rent'
         and t.occurred_at > b.last_service_at
    )
  group by b.unit_id
),
computed as (
  select
    b.unit_id,
    b.product_id,
    b.last_service_at,
    floor(extract(epoch from (now() - b.last_service_at)) / 86400)::integer as days_since_service,
    coalesce(u.rental_days, 0)::integer                                     as rental_days_since_service,
    greatest(b.running_hours - b.service_meter_baseline, 0)                 as meter_hours_since_service,
    b.service_interval_days,
    b.service_interval_rental_days,
    b.service_interval_meter_hours,
    b.service_grace_days,
    case when b.service_interval_days is null then null
         else (b.last_service_at + make_interval(days => b.service_interval_days))
    end as due_at
  from base b
  left join usage u on u.unit_id = b.unit_id
)
select
  c.unit_id,
  c.product_id,
  c.last_service_at,
  c.days_since_service,
  c.rental_days_since_service,
  c.meter_hours_since_service,
  c.due_at,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days then 'time'
    when (c.service_interval_rental_days is not null
          and c.rental_days_since_service >= c.service_interval_rental_days)
      or (c.service_interval_meter_hours is not null
          and c.meter_hours_since_service >= c.service_interval_meter_hours) then 'usage'
    else null
  end as due_reason,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days
    then greatest(c.days_since_service - c.service_interval_days - c.service_grace_days, 0)
    else null
  end as overdue_days,
  -- Carried so a screen can render R-28's tooltip — `usage (42 of 40 rental
  -- days)` — without a second query per row for the model's plan.
  c.service_interval_days,
  c.service_interval_rental_days,
  c.service_interval_meter_hours,
  c.service_grace_days
from computed c;

comment on view product_units_service_v is
  'R-28 (8 Sep 2026): whether a unit is due for preventive service, derived at read time from the MODEL''s intervals, the unit''s last completed Preventive Service job and its usage since. No is_due column exists anywhere. due_reason is null for a model with no plan. Money-free by construction, so every staff role may read it. Retired and Missing units are not in it.';

-- 0095's rule: a view ships with its revoke, in the same file. A view over one
-- table is auto-updatable and the platform's default ACL would otherwise hand
-- `authenticated` a write path straight past product_units' RLS.
revoke insert, update, delete, truncate on product_units_service_v from anon, authenticated, public;
grant select on product_units_service_v to authenticated, anon;


-- ---------------------------------------------------------------------------
-- 5 ▸ Post-conditions.
--
-- Structural, then R-28's own scenario executed and rolled back: a model on
-- 90 days / 40 rental days, a unit serviced today, five bookings of ten rental
-- days each — `due_reason` must read `'usage'` although the calendar says the
-- unit has 90 days to run. Then a completed Preventive job resets it, and a
-- completed Corrective job does not.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_product   uuid;
  v_unit      uuid;
  v_client    uuid;
  v_branch    uuid;
  v_actor     uuid;
  v_reason    text;
  v_rental    integer;
  v_booking   uuid;
  v_line      uuid;
  v_n         integer;
  v_ran       boolean := false;
begin
  -- (1) The view exists and answers null for a model with no plan.
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'product_units_service_v') then
    raise exception 'POST-CONDITION 1 FAILED: product_units_service_v does not exist.';
  end if;

  select count(*) into v_n
    from product_units_service_v s
    join products p on p.id = s.product_id
   where p.service_interval_days is null
     and p.service_interval_rental_days is null
     and p.service_interval_meter_hours is null
     and s.due_reason is not null;
  if v_n > 0 then
    raise exception 'POST-CONDITION 1 FAILED: % unit(s) of a model with NO preventive plan report a due_reason. Null means the trigger is off.', v_n;
  end if;

  -- (2) The view carries no money column. Law 6 is a masking problem only when
  --     there is something to mask; this proves there is not.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'product_units_service_v'
       and (column_name ~* 'amount|price|rate|cost|total|paid|deposit|vat|discount')
       -- `service_interval_*` are counts, not currency; named out explicitly so
       -- the pattern above can stay broad.
       and column_name not like 'service_interval%'
  ) then
    raise exception 'POST-CONDITION 2 FAILED: product_units_service_v grew a money-shaped column. It is readable by every staff role precisely because it has none.';
  end if;

  -- (3) It is not writable.
  if has_table_privilege('authenticated', 'product_units_service_v', 'INSERT')
     or has_table_privilege('authenticated', 'product_units_service_v', 'UPDATE')
     or has_table_privilege('authenticated', 'product_units_service_v', 'DELETE') then
    raise exception 'POST-CONDITION 3 FAILED: authenticated can WRITE product_units_service_v. An auto-updatable view is a bypass around product_units'' RLS (0095).';
  end if;

  -- (4) The reset trigger is armed, and only for Preventive Service.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'maintenance_records'::regclass
       and tgname = 'trg_preventive_service_resets_the_meter'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 4 FAILED: the meter reset trigger is not on maintenance_records.';
  end if;

  -- (5) R-28's scenario, executed and undone.
  begin
    select id into v_actor  from users where primary_role = 'Owner' limit 1;
    select id into v_branch from branches limit 1;
    select id into v_client from clients limit 1;
    select pu.id, pu.product_id into v_unit, v_product
      from product_units pu where pu.retired_at is null limit 1;

    if v_actor is null or v_branch is null or v_client is null or v_unit is null then
      raise notice '0103: no Owner / branch / client / unit here; the behavioural check was skipped.';
    else
      -- The plan: 90 calendar days OR 40 rental days.
      update products
         set service_interval_days = 90, service_interval_rental_days = 40, service_grace_days = 7
       where id = v_product;

      -- Serviced today, so the calendar cannot be the reason.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-A', v_unit, 'Preventive Service', '0103 probe: baseline service', 'Completed', current_date, now() - interval '60 days', v_actor);

      select due_reason into v_reason from product_units_service_v where unit_id = v_unit;
      if v_reason is not null then
        raise exception 'POST-CONDITION 5 FAILED: a unit serviced today reads due (%). Nothing should be due.', v_reason;
      end if;

      -- Five bookings of ten rental days each, every one of them reaching On Rent.
      for v_n in 1..5 loop
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '99990103' || v_n::text, v_branch, v_client, 'Babin Delivery',
                now() - make_interval(days => 20 - v_n), now() - make_interval(days => 10 - v_n), v_actor, v_actor)
        returning id into v_booking;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking, 'Equipment', v_product, '0103 probe line', 1, 10, 0, v_actor)
        returning id into v_line;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (gen_random_uuid(), v_line, v_unit, 1, v_actor);

        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Booked', 'Packed', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Packed', 'On Rent', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'On Rent', 'Returned', v_actor, 'Owner', now() - interval '30 days');
      end loop;

      select due_reason, rental_days_since_service into v_reason, v_rental
        from product_units_service_v where unit_id = v_unit;

      if v_rental <> 50 then
        raise exception 'POST-CONDITION 5 FAILED: five bookings of ten rental days each counted as % rental days, not 50.', v_rental;
      end if;
      if v_reason is distinct from 'usage' then
        raise exception 'POST-CONDITION 5 FAILED: 50 rental days against a 40-day usage interval reads %, not ''usage''. Whichever comes first (R-28).', coalesce(v_reason, 'not due');
      end if;

      -- A CORRECTIVE job does not reset the clock. Fixing a fault is not a service.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-B', v_unit, 'Repair', '0103 probe: a repair, not a service', 'Completed', current_date, now(), v_actor);

      select due_reason into v_reason from product_units_service_v where unit_id = v_unit;
      if v_reason is distinct from 'usage' then
        raise exception 'POST-CONDITION 5 FAILED: a completed Repair reset the service clock. Only a Preventive Service does.';
      end if;

      -- A completed PREVENTIVE job does.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-C', v_unit, 'Preventive Service', '0103 probe: the service', 'Completed', current_date, now(), v_actor);

      select due_reason, rental_days_since_service into v_reason, v_rental
        from product_units_service_v where unit_id = v_unit;
      if v_rental <> 0 then
        raise exception 'POST-CONDITION 5 FAILED: a completed Preventive Service left % rental days on the counter, not 0.', v_rental;
      end if;
      if v_reason is not null then
        raise exception 'POST-CONDITION 5 FAILED: a serviced unit still reads due (%).', v_reason;
      end if;

      v_ran := true;
      raise exception using errcode = 'P0001', message = '__0103_rollback_probe__';
    end if;
  exception when others then
    if sqlerrm <> '__0103_rollback_probe__' then
      raise;
    end if;
  end;

  if v_ran then
    raise notice '0103 post-conditions passed, behavioural half included: a model with no plan never badges, 50 rental days against a 40-day interval reads ''usage'' although the calendar has 40 days to run, a Repair does not reset the clock and a Preventive Service does. The view is money-free and not writable.';
  else
    raise notice '0103 post-conditions passed (structural only — this database had no unit to probe with).';
  end if;
end;
$chk$;

commit;
