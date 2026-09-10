-- =============================================================================
-- Migration 0116: Close Gate in apply_booking_stage_transition (S1-2)
--
-- Law 1: The database is the law. Close gate requires a settled booking.
-- Order of evaluation for Returned -> Closed:
--   1. At least one non-void invoice: gate.close.no_invoice
--   2. All non-void invoices settled: gate.close.invoice_unsettled
--   3. Security deposits resolved: gate.close.deposit_unresolved
--   4. No open cases: gate.close.open_case
--   5. No live inventory reservations: gate.close.reservation_live
--
-- N-5: Written, numbered, tested locally under PGlite.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Notice on already-Closed bookings without invoices (Law 3: historical rows preserved)
-- -----------------------------------------------------------------------------

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from bookings b
  where b.stage = 'Closed'
    and not exists (
      select 1 from invoices i where i.booking_id = b.id and i.status <> 'Void'
    );
  raise notice 'Closed bookings without invoice audit count: %', v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · apply_booking_stage_transition() extended with Close gates
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
  v_deposit_required    numeric(14,2) := 0;
  v_deposit_pending     numeric(14,2) := 0;
  v_rental_outstanding  numeric(14,2) := 0;
  v_reason              text;
  v_pack_session_id     uuid;
  v_handover_session_id uuid;
  v_return_session_id   uuid;
begin
  select stage, closed_at, coalesce(deposit_required, 0)
    into v_current_stage, v_closed_at, v_deposit_required
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

  -- 5. Returned -> Closed (S1-2 Close Gate)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
    end if;

    -- (b) All non-void invoices settled
    if exists (
      select 1 from invoices
      where booking_id = NEW.booking_id
        and status not in ('Void')
        and outstanding_amount > 0
    ) then
      raise exception 'GATE:gate.close.invoice_unsettled|Cannot close booking with unsettled invoices.' using errcode = 'P0001';
    end if;

    -- (c) Deposit resolved
    if (v_deposit_required > 0 and not exists (select 1 from security_deposits where booking_id = NEW.booking_id))
       or exists (
         select 1 from security_deposits
         where booking_id = NEW.booking_id
           and (pending_amount > 0 or (received_amount - refunded_amount - applied_amount) > 0)
       ) then
      raise exception 'GATE:gate.close.deposit_unresolved|Cannot close booking with unresolved security deposit.' using errcode = 'P0001';
    end if;

    -- (d) No open cases
    if exists (
      select 1 from cases
      where linked_booking_id = NEW.booking_id
        and status not in ('Resolved', 'Closed', 'Cancelled')
    ) then
      raise exception 'GATE:gate.close.open_case|Cannot close booking with open cases.' using errcode = 'P0001';
    end if;

    -- (e) No live reservations
    if exists (
      select 1 from inventory_reservations
      where booking_id = NEW.booking_id
        and released_at is null
    ) then
      raise exception 'GATE:gate.close.reservation_live|Cannot close booking with live reservations.' using errcode = 'P0001';
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
  'Stage 1 (0116): Evaluates stage gates including close gate, enforces money/custody invariants, updates bookings.stage and closed_at.';

-- -----------------------------------------------------------------------------
-- 3 · validate_booking_gates() — retired as all gates live in apply_booking_stage_transition
-- -----------------------------------------------------------------------------

create or replace function validate_booking_gates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- All gates (Pack, Handover, Return, Close) now centrally evaluated in apply_booking_stage_transition().
  return NEW;
end;
$$;

commit;
