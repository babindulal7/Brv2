-- =============================================================================
-- Migration 0115: Stage Gates in apply_booking_stage_transition (S1-1)
--
-- Law 1: The database is the single source of truth for all stage transitions.
-- Gates are moved out of application logic and into apply_booking_stage_transition.
--
-- Enforcement order per to_stage:
--   Quote -> Booked:
--     - Client not blocked: gate.booking.client_blocked
--     - At least 1 line: gate.booking.no_lines
--   Booked -> Packed:
--     - Packing session exists: gate.pack.session_missing
--     - Serialised units assigned: gate.pack.units_unassigned
--     - Units packed with movement: gate.pack.units_unpacked
--   Packed -> On Rent:
--     - Handover session exists: gate.handover.session_missing
--     - Handover lines exist: gate.handover.units_unhanded
--     - Agreement signed: gate.handover.agreement_unsigned
--     - Payment outstanding: R-06 WARN only
--   On Rent -> Returned:
--     - Return session exists: gate.return.session_missing
--     - Return lines exist: gate.return.units_unaccounted
--   Closed -> Returned (Reopen):
--     - Caller role >= Manager: gate.reopen.role
--     - Reason >= 10 chars: gate.reopen.reason_missing
--   Cancel:
--     - Stage >= Packed requires Manager+: gate.cancel.stage_too_late
--     - Reason >= 10 chars: gate.cancel.reason_missing
--
-- N-5: Written, numbered, tested locally under PGlite.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Helper functions: auth_is_manager_or_above and auth_is_owner
-- -----------------------------------------------------------------------------

create or replace function auth_is_manager_or_above()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager');
$$;

comment on function auth_is_manager_or_above is
  'Stage 1 (0115): True for Owner, Admin, Manager. Used for stage reopen, cancellation guards, and staff directory.';

create or replace function auth_is_owner()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth_user_role() = 'Owner';
$$;

comment on function auth_is_owner is
  'Stage 1 (0115): True only for Owner role.';

-- -----------------------------------------------------------------------------
-- 2 · Cancellation guard on bookings (updating 0094's reject_direct_booking_stage_write)
-- -----------------------------------------------------------------------------

create or replace function reject_direct_booking_stage_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.stage is distinct from 'Quote'::booking_stage then
      raise exception
        'A booking is created at Quote and moves by recorded transitions. Refused an INSERT '
        'straight at %, which would leave a booking with no stage history that no gate ever '
        'checked.', NEW.stage;
    end if;

    if NEW.closed_at is not null then
      raise exception
        'A booking is created open. Refused an INSERT carrying closed_at — a booking born closed '
        'can never be moved by any transition and can never be deleted, so it would be stuck '
        'forever. Closing is a transition to Closed, which sets this column itself.';
    end if;
    if NEW.cancelled_at is not null then
      raise exception
        'A booking is created live. Refused an INSERT carrying cancelled_at — cancellation is the '
        'sixth state (0015) and a booking cannot be born in it.';
    end if;
    return NEW;
  end if;

  if NEW.stage is distinct from OLD.stage or NEW.closed_at is distinct from OLD.closed_at then
    raise exception
      'bookings.stage and bookings.closed_at are written only by booking_stage_transitions '
      '(0021). Refused a direct write moving % from % to %. Insert a transition row instead — '
      'that is what validates the stage order, records who did it, and runs the gates.',
      NEW.booking_no, OLD.stage, NEW.stage;
  end if;

  -- Cancellation discipline (0115 S1-1):
  if NEW.cancelled_at is distinct from OLD.cancelled_at
     or NEW.cancelled_by is distinct from OLD.cancelled_by
     or NEW.cancellation_reason is distinct from OLD.cancellation_reason then

    if OLD.cancelled_at is not null and NEW.cancelled_at is null then
      raise exception 'A cancelled booking cannot be uncancelled.' using errcode = 'P0001';
    end if;

    if OLD.cancelled_at is null and NEW.cancelled_at is not null then
      if OLD.stage in ('Packed', 'On Rent', 'Returned', 'Closed') then
        if not (auth_is_manager_or_above() or coalesce(current_setting('app.override_role', true), '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.cancel.stage_too_late|Cannot cancel a booking at or past Packed without Manager approval.' using errcode = 'P0001';
        end if;
      end if;

      if NEW.cancellation_reason is null or length(btrim(NEW.cancellation_reason)) < 10 then
        raise exception 'GATE:gate.cancel.reason_missing|Cancellation requires a reason of at least 10 characters.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

comment on function reject_direct_booking_stage_write() is
  'Stage 1 (0115): Restricts stage/closed_at to booking_stage_transitions; enforces cancellation discipline (Manager+ past Packed, >=10 chars reason).';

-- -----------------------------------------------------------------------------
-- 3 · Central stage gate validation in apply_booking_stage_transition()
-- -----------------------------------------------------------------------------

create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_stage       booking_stage;
  v_closed_at           timestamptz;
  v_prev_occurred_at    timestamptz;
  v_deposit_pending     numeric(14,2) := 0;
  v_rental_outstanding  numeric(14,2) := 0;
  v_reason              text;
  v_pack_session_id     uuid;
  v_handover_session_id uuid;
  v_return_session_id   uuid;
begin
  select stage, closed_at into v_current_stage, v_closed_at
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  -- ── Genesis ──
  if NEW.from_stage is null then
    if v_current_stage <> 'Quote' then
      raise exception 'Genesis transition rejected: booking % is not at Quote (currently %).', NEW.booking_id, v_current_stage;
    end if;
    if NEW.to_stage <> 'Quote' then
      raise exception 'Genesis transition must target Quote, got %.', NEW.to_stage;
    end if;
  else
    if NEW.from_stage <> v_current_stage then
      raise exception 'Stage transition rejected: from_stage (%) does not match booking %''s actual current stage (%). Stale read or concurrent write.',
        NEW.from_stage, NEW.booking_id, v_current_stage;
    end if;

    -- ── Closed reopen or immutability ──
    if v_current_stage = 'Closed' then
      if NEW.to_stage = 'Returned' then
        -- R-05 Reopen gate
        if not (auth_is_manager_or_above() or coalesce(NEW.actor_role, '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.reopen.role|Only Manager or above can reopen a closed booking.' using errcode = 'P0001';
        end if;
        if NEW.reason is null or length(btrim(NEW.reason)) < 10 then
          raise exception 'GATE:gate.reopen.reason_missing|Reopening a closed booking requires a reason of at least 10 characters.' using errcode = 'P0001';
        end if;
      else
        raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
      end if;
    elsif v_closed_at is not null then
      raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
    else
      -- ── Normal forward or reversal transition ──
      if NEW.is_reversal then
        if NEW.to_stage >= NEW.from_stage then
          raise exception 'Reversal rejected: to_stage (%) does not precede from_stage (%).', NEW.to_stage, NEW.from_stage;
        end if;
      else
        if NEW.to_stage <> next_booking_stage(NEW.from_stage) then
          raise exception 'Stage transition rejected: % does not immediately follow % -- skipping a stage is only legal as an approved reversal.',
            NEW.to_stage, NEW.from_stage;
        end if;
      end if;
    end if;
  end if;

  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  -- ── STAGE GATES ENFORCEMENT ──

  -- 1. Quote -> Booked
  if NEW.to_stage = 'Booked' and (NEW.from_stage is null or NEW.from_stage = 'Quote') then
    if exists (
      select 1 from bookings b
      join client_flags cf on cf.client_id = b.client_id
      where b.id = NEW.booking_id
        and cf.flag_type = 'Blocked'
        and cf.removed_at is null
    ) then
      raise exception 'GATE:gate.booking.client_blocked|Client is blocked from making bookings.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from booking_lines
      where booking_id = NEW.booking_id
        and voided_at is null
    ) then
      raise exception 'GATE:gate.booking.no_lines|Booking must have at least one line.' using errcode = 'P0001';
    end if;
  end if;

  -- 2. Booked -> Packed
  if NEW.to_stage = 'Packed' and NEW.from_stage = 'Booked' then
    select id into v_pack_session_id
    from operation_sessions
    where booking_id = NEW.booking_id
      and operation = 'Packing'
      and state in ('In Progress', 'Completed')
    order by created_at desc
    limit 1;

    if v_pack_session_id is null then
      raise exception 'GATE:gate.pack.session_missing|Booking requires an active or completed packing session.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from booking_lines bl
      join products p on p.id = bl.product_id
      where bl.booking_id = NEW.booking_id
        and bl.voided_at is null
        and p.tracking_mode = 'Serialised'
        and (
          select count(*)
          from booking_line_units blu
          where blu.booking_line_id = bl.id
            and blu.asset_id is not null
        ) <> bl.qty
    ) then
      raise exception 'GATE:gate.pack.units_unassigned|Every serialised line must have all units assigned.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from booking_lines bl
      join booking_line_units blu on blu.booking_line_id = bl.id
      where bl.booking_id = NEW.booking_id
        and bl.voided_at is null
        and blu.asset_id is not null
        and not exists (
          select 1
          from session_line_movements slm
          where slm.session_id = v_pack_session_id
            and slm.unit_id = blu.asset_id
        )
    ) then
      raise exception 'GATE:gate.pack.units_unpacked|Every unit must have a movement in the packing session.' using errcode = 'P0001';
    end if;
  end if;

  -- 3. Packed -> On Rent
  if NEW.to_stage = 'On Rent' and NEW.from_stage = 'Packed' then
    select id into v_handover_session_id
    from operation_sessions
    where booking_id = NEW.booking_id
      and operation = 'Handover'
      and state in ('In Progress', 'Completed')
    order by created_at desc
    limit 1;

    if v_handover_session_id is null then
      raise exception 'GATE:gate.handover.session_missing|Booking requires an active or completed handover session.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from booking_lines bl
      where bl.booking_id = NEW.booking_id
        and bl.voided_at is null
        and not exists (
          select 1
          from handover_lines hl
          where hl.booking_line_id = bl.id
        )
    ) then
      raise exception 'GATE:gate.handover.units_unhanded|Every booking line must have a handover line recorded.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from signatures s
      where s.session_id = v_handover_session_id
    ) then
      raise exception 'GATE:gate.handover.agreement_unsigned|Rental agreement must be signed before handover.' using errcode = 'P0001';
    end if;

    -- R-06 WARN on money
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.booking_id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.booking_id and status not in ('Void');

    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(NEW.reason, current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           NEW.from_stage,
          'to_stage',             NEW.to_stage
        )
      );
    end if;
  end if;

  -- 4. On Rent -> Returned
  if NEW.to_stage = 'Returned' and NEW.from_stage = 'On Rent' then
    select id into v_return_session_id
    from operation_sessions
    where booking_id = NEW.booking_id
      and operation = 'Return'
      and state in ('In Progress', 'Completed')
    order by created_at desc
    limit 1;

    if v_return_session_id is null then
      raise exception 'GATE:gate.return.session_missing|Booking requires an active or completed return session.' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from booking_lines bl
      where bl.booking_id = NEW.booking_id
        and bl.voided_at is null
        and not exists (
          select 1
          from return_lines rl
          where rl.booking_line_id = bl.id
        )
    ) then
      raise exception 'GATE:gate.return.units_unaccounted|Every booking line must have a return line recorded.' using errcode = 'P0001';
    end if;
  end if;

  -- Publish GUCs for downstream triggers if needed
  perform set_config('app.stage_override_reason', coalesce(NEW.reason, ''), true);
  perform set_config('app.stage_actor_id',        coalesce(NEW.actor_id::text, ''), true);
  perform set_config('app.stage_branch_id',       coalesce(NEW.branch_id::text, ''), true);

  -- Perform the booking stage update
  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case
                     when NEW.to_stage = 'Closed' then NEW.occurred_at
                     when NEW.from_stage = 'Closed' and NEW.to_stage = 'Returned' then null
                     else closed_at
                   end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;

  return NEW;
end;
$$;

comment on function apply_booking_stage_transition is
  'Stage 1 (0115): Evaluates stage gates, enforces money/custody invariants, updates bookings.stage and closed_at.';

-- -----------------------------------------------------------------------------
-- 4 · validate_booking_gates() — delegate operational gates to apply_booking_stage_transition
-- -----------------------------------------------------------------------------

create or replace function validate_booking_gates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit_pending    numeric(14,2) := 0;
  v_deposit_held       numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
begin
  -- Packed and Handover gates are now evaluated in apply_booking_stage_transition().
  -- Close gate remains here until migration 0116 unifies it with the new GATE syntax.
  if NEW.stage = 'Closed' and (OLD.stage is null or OLD.stage < 'Closed') then
    if not exists (
      select 1 from invoices
      where booking_id = NEW.id and status not in ('Void')
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach Closed without an invoice.', NEW.id;
    end if;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled invoices.';
    end if;

    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_pending := coalesce(v_deposit_pending, 0);

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled security deposit.';
    end if;

    select coalesce(sum(received_amount - refunded_amount - applied_amount), 0) into v_deposit_held
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_held := coalesce(v_deposit_held, 0);

    if v_deposit_held > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with held security deposit of Rs. %.', v_deposit_held;
    end if;

    if exists (
      select 1 from cases
      where linked_booking_id = NEW.id
        and status in ('Open', 'Under Review', 'Awaiting Decision', 'In Progress')
    ) then
      raise exception 'Gate Check Failure: Cannot Close booking with open cases.';
    end if;
  end if;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5 · write_reservations_on_stage_transition() — withhold release for unreturned units
-- -----------------------------------------------------------------------------

create or replace function write_reservations_on_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pickup     timestamptz;
  v_return     timestamptz;
  v_period     tstzrange;
  v_booking_no text;
begin
  -- ── Release paths ─────────────────────────────────────────────────────────
  if NEW.to_stage in ('Returned', 'Closed', 'Quote') then
    update inventory_reservations r
       set released_at     = NEW.occurred_at,
           released_reason = case NEW.to_stage
             when 'Returned' then 'Released on Return: the booking reached Returned.'
             when 'Closed'   then 'Released on Close: the booking reached Closed.'
             else 'Released by a reversal back to Quote: a Quote holds nothing.'
           end
     where booking_id = NEW.booking_id
       and released_at is null
       and (
         NEW.to_stage <> 'Returned'
         or r.asset_id is null
         or not exists (
           select 1 from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
           where bl.booking_id = NEW.booking_id
             and blu.asset_id = r.asset_id
             and (blu.unit_state = 'Missing' or blu.returned_at is null)
         )
       );
    return NEW;
  end if;

  if NEW.to_stage <> 'Booked' then
    return NEW;
  end if;

  -- ── Booked: place the holds ───────────────────────────────────────────────
  select pickup_at, return_at, booking_no
    into v_pickup, v_return, v_booking_no
    from bookings
   where id = NEW.booking_id;

  if v_pickup is null then
    raise exception 'Reservation rejected: booking % has no pickup_at / return_at window.', NEW.booking_id;
  end if;

  v_period := tstzrange(v_pickup, v_return, '[)');

  -- Holds for serialised units
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, period, created_by)
  select
    gen_random_uuid(),
    NEW.booking_id,
    blu.booking_line_id,
    blu.asset_id,
    v_period,
    NEW.actor_id
  from booking_line_units blu
  join booking_lines bl on bl.id = blu.booking_line_id
  join products p on p.id = bl.product_id
  where bl.booking_id = NEW.booking_id
    and bl.voided_at is null
    and blu.asset_id is not null
    and p.tracking_mode = 'Serialised';

  -- Holds for non-serialised quantity lines
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
  select
    gen_random_uuid(),
    NEW.booking_id,
    bl.id,
    bl.product_id,
    bl.qty,
    v_period,
    NEW.actor_id
  from booking_lines bl
  join products p on p.id = bl.product_id
  where bl.booking_id = NEW.booking_id
    and bl.voided_at is null
    and p.tracking_mode <> 'Serialised';

  return NEW;
end;
$$;

commit;
