-- =============================================================================
-- Migration 0112: Open Missing Case on Partial Return (Stage 1, L7)
--
-- Operations rule:
-- When a booking transitions to 'Returned' (in booking_stage_transitions),
-- if any serialized unit on the booking has not been marked returned
-- (booking_line_units.returned_at IS NULL), the database automatically
-- opens a cases row of type 'Missing' parented on the booking.
--
-- This guarantees:
-- 1. No unreturned equipment is silently forgotten when a rental returns.
-- 2. Gate 3(e) (validate_booking_gates) ensures the booking cannot reach
--    'Closed' until the missing item case is settled/resolved by a Manager.
-- 3. Case numbers conform to the ^CASE-[0-9]{4}-[0-9]{4}$ format rule.
--
-- N-5: Tested locally against PGlite. Babin applies to production after backup.
-- =============================================================================

begin;

create or replace function public.open_missing_case_on_return()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_missing_count integer;
  v_client_id     uuid;
  v_client_name   text;
  v_booking_no    text;
  v_case_no       text;
  v_year          integer := extract(year from current_date);
  v_next_val      bigint;
begin
  -- Only trigger on transition to 'Returned'
  if NEW.to_stage <> 'Returned' then
    return NEW;
  end if;

  -- Count unreturned units for this booking
  select count(*) into v_missing_count
    from booking_lines bl
    join booking_line_units blu on blu.booking_line_id = bl.id
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and blu.returned_at is null;

  if v_missing_count > 0 then
    -- Do not open duplicate Missing cases for the same booking
    if not exists (
      select 1 from cases
       where linked_booking_id = NEW.booking_id
         and type = 'Missing'
    ) then
      select b.client_id, coalesce(c.name, 'Client'), b.booking_no
        into v_client_id, v_client_name, v_booking_no
        from bookings b
        left join clients c on c.id = b.client_id
       where b.id = NEW.booking_id;

      -- Generate next sequential CASE-YYYY-NNNN number
      select coalesce(max(substring(case_no from 11)::bigint), 0) + 1
        into v_next_val
        from cases
       where case_no ~ ('^CASE-' || v_year::text || '-[0-9]+$');

      v_case_no := 'CASE-' || v_year::text || '-' || lpad(v_next_val::text, 4, '0');

      insert into cases (
        client_uuid,
        case_no,
        type,
        title,
        counterparty_kind,
        counterparty_name,
        priority,
        status,
        linked_booking_id,
        owner_id,
        created_by
      ) values (
        gen_random_uuid(),
        v_case_no,
        'Missing',
        'Missing gear from booking ' || coalesce(v_booking_no, NEW.booking_id::text) || ' (' || v_missing_count::text || ' unreturned item' || case when v_missing_count = 1 then '' else 's' end || ')',
        'Client',
        v_client_name,
        'High',
        'Open',
        NEW.booking_id,
        NEW.actor_id,
        NEW.actor_id
      );
    end if;
  end if;

  return NEW;
end;
$$;

comment on function public.open_missing_case_on_return() is
  'Automatically creates a cases row of type Missing when a booking transitions to Returned with unreturned units.';

-- Fires after the transition is applied and reservations are released
drop trigger if exists trg_return_missing_case on public.booking_stage_transitions;
create trigger trg_return_missing_case
  after insert on public.booking_stage_transitions
  for each row execute function public.open_missing_case_on_return();

-- -----------------------------------------------------------------------------
-- Post-conditions verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_return_missing_case'
       and tgrelid = 'public.booking_stage_transitions'::regclass
  ) then
    raise exception 'POST-CONDITION FAILED: trg_return_missing_case trigger missing on booking_stage_transitions.';
  end if;
end;
$$;

commit;
