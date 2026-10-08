-- =============================================================================
-- Migration 0114: Database owns unit status — recompute_unit_status(asset_id)
--
-- Audit §6.4: units in live product_units drift because runFloorVerb updated
-- client-side, crashed, or bypassed. The database engine must own unit status.
--
-- 10-state precedence:
--   1. Retired      (retired_at is not null)
--   2. Missing      (open Missing case links to this unit)
--   3. Maintenance  (unfinished maintenance row: completed_at is null)
--   4. On Rent      (unit on a booking currently in 'On Rent' stage)
--   5. Returning    (unfinished Return session accepted the unit)
--   6. Inspection   (on a Returned booking with no completed inspection)
--   7. Cleaning     (in cleaning queue and completed_at is null)
--   8. Packed       (packed on a booking currently in 'Packed' stage)
--   9. Reserved     (live inventory_reservations covering now())
--  10. In Stock     (default)
--
-- Direct writes to product_units.status are refused by trigger:
--   GATE:gate.unit_status.direct_write
-- =============================================================================

begin;

-- 1. Function recompute_unit_status(p_asset_id uuid)
create or replace function recompute_unit_status(p_asset_id uuid)
returns inventory_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status inventory_state;
  v_old_status inventory_state;
  v_retired_at timestamptz;
begin
  select status, retired_at into v_old_status, v_retired_at
  from product_units
  where id = p_asset_id;

  if not found then
    return null;
  end if;

  -- 1. Retired if product_units.retired_at is not null
  if v_retired_at is not null then
    v_new_status := 'Retired';

  -- 2. Missing if an open case (type = 'Missing', status not in ('Resolved', 'Closed', 'Cancelled')) links to this unit
  elsif exists (
    select 1 from cases c
    where c.type = 'Missing'
      and c.status not in ('Resolved', 'Closed', 'Cancelled')
      and (
        exists (select 1 from damage_findings df where df.case_id = c.id and df.unit_id = p_asset_id and df.voided_at is null)
        or
        (c.linked_booking_id is not null and exists (
          select 1 from booking_line_units blu
          join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = c.linked_booking_id
            and blu.asset_id = p_asset_id
            and blu.unit_state = 'Missing'
        ))
      )
  ) then
    v_new_status := 'Missing';

  -- 3. Maintenance if an unfinished maintenance row (completed_at is null) exists
  elsif exists (
    select 1 from maintenance_records mr
    where mr.product_unit_id = p_asset_id
      and mr.completed_at is null
  ) then
    v_new_status := 'Maintenance';

  -- 4. On Rent if the unit is on a booking currently in On Rent stage
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'On Rent'
      and b.cancelled_at is null
  ) then
    v_new_status := 'On Rent';

  -- 5. Returning if an unfinished Return session has accepted the unit but not completed
  elsif exists (
    select 1 from operation_sessions os
    where os.operation = 'Return'
      and os.state != 'Completed'
      and (
        exists (select 1 from session_line_movements slm where slm.session_id = os.id and slm.unit_id = p_asset_id)
        or exists (select 1 from booking_line_units blu where blu.return_session_id = os.id and blu.asset_id = p_asset_id)
      )
  ) then
    v_new_status := 'Returning';

  -- 6. Inspection if on a Returned booking with no completed inspection
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Returned'
      and b.cancelled_at is null
      and (
        blu.condition is null
        or exists (
          select 1 from return_lines rl
          where rl.booking_line_id = bl.id
            and (rl.inspection_state != 'Inspected' or rl.inspected_at is null)
        )
      )
  ) then
    v_new_status := 'Inspection';

  -- 7. Cleaning if in the cleaning queue and unfinished (cleaning_queue_entries.completed_at is null)
  elsif exists (
    select 1 from cleaning_queue_entries cqe
    where cqe.unit_id = p_asset_id
      and cqe.completed_at is null
  ) then
    v_new_status := 'Cleaning';

  -- 8. Packed if packed on a booking currently in Packed stage
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Packed'
      and b.cancelled_at is null
      and blu.packed = true
  ) then
    v_new_status := 'Packed';

  -- 9. Reserved if a live inventory_reservations row covers now() (period @> now() and released_at is null)
  elsif exists (
    select 1 from inventory_reservations ir
    where ir.asset_id = p_asset_id
      and ir.released_at is null
      and ir.period @> now()
  ) then
    v_new_status := 'Reserved';

  -- 10. Default: In Stock
  else
    v_new_status := 'In Stock';
  end if;

  -- Writes the result into product_units.status using transaction-scoped GUC
  if v_old_status is distinct from v_new_status then
    perform set_config('app.unit_status_recompute', 'on', true);
    update product_units
    set status = v_new_status,
        updated_at = now()
    where id = p_asset_id;
    perform set_config('app.unit_status_recompute', 'off', true);
  end if;

  return v_new_status;
end;
$$;

-- 2. Direct write guard trigger on product_units.status
create or replace function trg_product_units_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if nullif(current_setting('app.unit_status_recompute', true), '') is distinct from 'on' then
      raise exception 'GATE:gate.unit_status.direct_write|Unit status is owned by the database engine. Direct writes are refused.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists product_units_status_guard on product_units;
create trigger product_units_status_guard
  before update of status on product_units
  for each row
  execute function trg_product_units_status_guard();

-- 3. Trigger on booking_stage_transitions
create or replace function trg_recompute_unit_status_on_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_b_id uuid;
begin
  v_b_id := coalesce(new.booking_id, old.booking_id);
  for r in (
    select distinct blu.asset_id
    from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    where bl.booking_id = v_b_id
      and blu.asset_id is not null
  ) loop
    perform recompute_unit_status(r.asset_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_booking_stage_transitions_unit_status on booking_stage_transitions;
create trigger trg_booking_stage_transitions_unit_status
  after insert on booking_stage_transitions
  for each row
  execute function trg_recompute_unit_status_on_stage_transition();

-- 4. Trigger on bookings stage / cancelled_at
create or replace function trg_recompute_unit_status_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if (new.stage is distinct from old.stage or new.cancelled_at is distinct from old.cancelled_at) then
    for r in (
      select distinct blu.asset_id
      from booking_line_units blu
      join booking_lines bl on bl.id = blu.booking_line_id
      where bl.booking_id = new.id
        and blu.asset_id is not null
    ) loop
      perform recompute_unit_status(r.asset_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_unit_status on bookings;
create trigger trg_bookings_unit_status
  after update of stage, cancelled_at on bookings
  for each row
  execute function trg_recompute_unit_status_on_booking();

-- 5. Trigger on booking_line_units
create or replace function trg_recompute_unit_status_on_booking_line_unit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.asset_id is not null then
    perform recompute_unit_status(new.asset_id);
  end if;
  if old.asset_id is not null and old.asset_id is distinct from new.asset_id then
    perform recompute_unit_status(old.asset_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_booking_line_units_unit_status on booking_line_units;
create trigger trg_booking_line_units_unit_status
  after insert or update of asset_id, packed, returned_at, unit_state, condition or delete on booking_line_units
  for each row
  execute function trg_recompute_unit_status_on_booking_line_unit();

-- 6. Trigger on session_line_movements
create or replace function trg_recompute_unit_status_on_session_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_id is not null then
    perform recompute_unit_status(new.unit_id);
  end if;
  if old.unit_id is not null and old.unit_id is distinct from new.unit_id then
    perform recompute_unit_status(old.unit_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_session_line_movements_unit_status on session_line_movements;
create trigger trg_session_line_movements_unit_status
  after insert or update of unit_id, resulting_item_state or delete on session_line_movements
  for each row
  execute function trg_recompute_unit_status_on_session_movement();

-- 7. Trigger on cleaning_queue_entries
create or replace function trg_recompute_unit_status_on_cleaning_queue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_id is not null then
    perform recompute_unit_status(new.unit_id);
  end if;
  if old.unit_id is not null and old.unit_id is distinct from new.unit_id then
    perform recompute_unit_status(old.unit_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cleaning_queue_entries_unit_status on cleaning_queue_entries;
create trigger trg_cleaning_queue_entries_unit_status
  after insert or update of unit_id, completed_at or delete on cleaning_queue_entries
  for each row
  execute function trg_recompute_unit_status_on_cleaning_queue();

-- 8. Trigger on maintenance_records
create or replace function trg_recompute_unit_status_on_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_unit_id is not null then
    perform recompute_unit_status(new.product_unit_id);
  end if;
  if old.product_unit_id is not null and old.product_unit_id is distinct from new.product_unit_id then
    perform recompute_unit_status(old.product_unit_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_maintenance_records_unit_status on maintenance_records;
create trigger trg_maintenance_records_unit_status
  after insert or update of product_unit_id, completed_at or delete on maintenance_records
  for each row
  execute function trg_recompute_unit_status_on_maintenance();

-- 9. Trigger on cases
create or replace function trg_recompute_unit_status_on_case()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_booking_id uuid;
  v_case_id uuid;
begin
  v_case_id := coalesce(new.id, old.id);
  v_booking_id := coalesce(new.linked_booking_id, old.linked_booking_id);

  for r in (
    select distinct df.unit_id as asset_id
    from damage_findings df
    where df.case_id = v_case_id
      and df.unit_id is not null
  ) loop
    perform recompute_unit_status(r.asset_id);
  end loop;

  if v_booking_id is not null then
    for r in (
      select distinct blu.asset_id
      from booking_line_units blu
      join booking_lines bl on bl.id = blu.booking_line_id
      where bl.booking_id = v_booking_id
        and blu.asset_id is not null
    ) loop
      perform recompute_unit_status(r.asset_id);
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cases_unit_status on cases;
create trigger trg_cases_unit_status
  after insert or update of type, status, linked_booking_id or delete on cases
  for each row
  execute function trg_recompute_unit_status_on_case();

-- 10. Trigger on inventory_reservations
create or replace function trg_recompute_unit_status_on_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.asset_id is not null then
    perform recompute_unit_status(new.asset_id);
  end if;
  if old.asset_id is not null and old.asset_id is distinct from new.asset_id then
    perform recompute_unit_status(old.asset_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_inventory_reservations_unit_status on inventory_reservations;
create trigger trg_inventory_reservations_unit_status
  after insert or update of asset_id, period, released_at or delete on inventory_reservations
  for each row
  execute function trg_recompute_unit_status_on_reservation();

-- 11. Trigger on product_units (retire)
create or replace function trg_recompute_unit_status_on_retire()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.retired_at is distinct from old.retired_at) then
    perform recompute_unit_status(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_units_retire_status on product_units;
create trigger trg_product_units_retire_status
  after update of retired_at on product_units
  for each row
  execute function trg_recompute_unit_status_on_retire();

-- 12. Trigger on operation_sessions
create or replace function trg_recompute_unit_status_on_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_session_id uuid;
begin
  v_session_id := coalesce(new.id, old.id);
  for r in (
    select distinct unit_id as asset_id
    from session_line_movements
    where session_id = v_session_id
      and unit_id is not null
    union
    select distinct asset_id
    from booking_line_units
    where (packing_session_id = v_session_id or handover_session_id = v_session_id or return_session_id = v_session_id)
      and asset_id is not null
  ) loop
    perform recompute_unit_status(r.asset_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_operation_sessions_unit_status on operation_sessions;
create trigger trg_operation_sessions_unit_status
  after update of state on operation_sessions
  for each row
  execute function trg_recompute_unit_status_on_session();

-- 13. Trigger on return_lines (inspection completion)
create or replace function trg_recompute_unit_status_on_return_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_bline_id uuid;
begin
  v_bline_id := coalesce(new.booking_line_id, old.booking_line_id);
  for r in (
    select distinct blu.asset_id
    from booking_line_units blu
    where blu.booking_line_id = v_bline_id
      and blu.asset_id is not null
  ) loop
    perform recompute_unit_status(r.asset_id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_return_lines_unit_status on return_lines;
create trigger trg_return_lines_unit_status
  after update of inspection_state, inspected_at on return_lines
  for each row
  execute function trg_recompute_unit_status_on_return_line();

-- 14. One-shot backfill at the end of migration
do $$
declare
  r record;
  v_count integer := 0;
  v_stat record;
begin
  for r in select id from product_units loop
    perform recompute_unit_status(r.id);
    v_count := v_count + 1;
  end loop;

  raise notice 'recompute_unit_status backfilled % product_units', v_count;
  for v_stat in select status, count(*) as cnt from product_units group by status loop
    raise notice 'product_units status %: %', v_stat.status, v_stat.cnt;
  end loop;
end;
$$;

commit;
