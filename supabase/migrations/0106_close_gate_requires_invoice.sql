-- =============================================================================
-- Migration 0106: Close gate requires invoice and settlement (L11, Stage 1)
--
-- Postgres enforces that a booking cannot reach 'Closed' without an invoice,
-- and that all invoices must be settled (outstanding_amount = 0).
-- Also enforces that security deposits are resolved (none pending collection
-- and none held without refund/application), and no open cases remain.
--
-- R-07: Close gate remains a hard block with no override.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function validate_booking_gates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit_pending    numeric(14,2) := 0;
  v_deposit_held       numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
  v_reason             text;
  v_actor              uuid;
  v_branch             uuid;
begin
  -- 1. Packed gate (transition to 'Packed')
  if NEW.stage = 'Packed' and (OLD.stage is null or OLD.stage < 'Packed') then
    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Packing'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach Packed without a Packing session.', NEW.id;
    end if;
  end if;

  -- 2. Handover gate (transition to 'On Rent')
  if NEW.stage = 'On Rent' and (OLD.stage is null or OLD.stage < 'On Rent') then
    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Packing'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach On Rent without a Packing session.', NEW.id;
    end if;

    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Handover'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach On Rent without a Handover session.', NEW.id;
    end if;

    -- R-06: WARN, do not block on money if override reason is provided.
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a '
          'pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded '
          'against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      v_actor  := nullif(btrim(coalesce(current_setting('app.stage_actor_id',  true), '')), '')::uuid;
      v_branch := nullif(btrim(coalesce(current_setting('app.stage_branch_id', true), '')), '')::uuid;

      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.id, 'Approve', v_actor, v_branch, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           OLD.stage,
          'to_stage',             NEW.stage
        )
      );
    end if;
  end if;

  -- 3. Close gate (transition to 'Closed') — R-07: STAYS A HARD BLOCK.
  if NEW.stage = 'Closed' and (OLD.stage is null or OLD.stage < 'Closed') then
    -- (a) Must have at least one non-void invoice
    if not exists (
      select 1 from invoices
      where booking_id = NEW.id and status not in ('Void')
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach Closed without an invoice.', NEW.id;
    end if;

    -- (b) All non-void invoices must be settled
    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled invoices.';
    end if;

    -- (c) Security deposit must not be pending collection
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_pending := coalesce(v_deposit_pending, 0);

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled security deposit.';
    end if;

    -- (d) Security deposit must not be held (collected but not refunded or applied)
    select coalesce(sum(received_amount - refunded_amount - applied_amount), 0) into v_deposit_held
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_held := coalesce(v_deposit_held, 0);

    if v_deposit_held > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with held security deposit of Rs. %.', v_deposit_held;
    end if;

    -- (e) No open cases
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

commit;
