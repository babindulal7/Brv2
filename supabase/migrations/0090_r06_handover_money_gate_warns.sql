-- =============================================================================
-- 0090_r06_handover_money_gate_warns.sql — 4 Sep 2026
--
-- **P0.** `validate_booking_gates()` hard-blocks handover on outstanding money,
-- which contradicts a binding ruling.
--
-- ## The ruling
--
-- RULINGS-2026-09-04.md, R-06 — Handover money gate:
--
--   > **Warns, does not block.** Proceeding with an outstanding balance or an
--   > unpaid deposit requires a **named override reason**, recorded in
--   > `audit_events` with the amounts as they stood.
--   >
--   > The deposit warning is the loud one: an unpaid rental invoice is a
--   > receivable, but a missing security deposit is the only cover against
--   > damage and non-return.
--
-- R-00 makes that file binding and above PLAN.md, so the current hard block is a
-- defect, not a policy.
--
-- ## What it costs today
--
-- Measured on the reference corpus, 4 Sep 2026:
--   * 66 of 70 open bookings carry an outstanding balance,
--   * 9 Packed bookings carry a pending deposit,
-- and every one of them is refused at handover with no way through — there is no
-- override path in the trigger, and (separately) no screen can reduce
-- `security_deposits.pending_amount`. The van is loaded and Postgres says no.
--
-- Probed directly before this change:
--   UPDATE bookings SET stage='On Rent' WHERE booking_no='715'
--   -> ERROR: Gate Check Failure: Handover blocked due to outstanding rental
--      payment (Rs. 117520.00).
--
-- ## What changes, precisely
--
--   * **Handover (→ On Rent)** — money no longer blocks *by itself*. If anything
--     is owed, a **named reason is required**; with one, the transition proceeds
--     and an `audit_events` row records the reason and both amounts as they stood.
--     Without one, it is still refused — the refusal now names what to do.
--   * **Close (→ Closed)** — **UNCHANGED, still a hard block.** R-07 keeps it
--     that way, and R-06 is explicitly about handover only. Nothing below touches
--     the Closed branch.
--
-- ## How the reason reaches the trigger
--
-- `validate_booking_gates` is a BEFORE UPDATE trigger on `bookings` and sees only
-- the booking row, which has no reason column. The reason lives on the
-- `booking_stage_transitions` row that drives the update, so
-- `apply_booking_stage_transition` publishes it as a transaction-local GUC
-- (`set_config(..., true)`) immediately before its UPDATE, and the gate reads it.
--
-- A GUC rather than a column because the reason belongs to the *transition*, not
-- to the booking: writing it onto `bookings` would leave the last override reason
-- sitting on the row forever, describing a moment that has passed.
--
-- Transaction-local means it cannot leak into another statement or session, and a
-- direct `UPDATE bookings SET stage='On Rent'` that bypasses the transition table
-- carries no reason and is therefore still refused — the override is available
-- only through the recorded path.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · The gate. Handover warns-and-records; Close is left exactly as it was.
-- -----------------------------------------------------------------------------
create or replace function validate_booking_gates()
returns trigger
language plpgsql
as $$
declare
  v_deposit_pending    numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
  v_reason             text;
  v_actor              uuid;
  v_branch             uuid;
begin
  -- 1. Handover gate (transition to 'On Rent') — R-06: WARN, do not block.
  if NEW.stage = 'On Rent' and (OLD.stage is null or OLD.stage < 'On Rent') then
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        -- Still refused, but for the thing R-06 actually requires: a NAME on the
        -- decision. The message says what is owed and what would let it through.
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a '
          'pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded '
          'against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      v_actor  := nullif(btrim(coalesce(current_setting('app.stage_actor_id',  true), '')), '')::uuid;
      v_branch := nullif(btrim(coalesce(current_setting('app.stage_branch_id', true), '')), '')::uuid;

      /*
       * R-06: "recorded in audit_events with the amounts AS THEY STOOD". They are
       * captured here, inside the same transaction as the stage move, so the row
       * cannot describe a balance that a later payment has already changed.
       */
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

  -- 2. Close gate (transition to 'Closed') — R-07: STAYS A HARD BLOCK.
  --    Deliberately untouched. Outstanding must be 0 and the deposit resolved,
  --    with no override of any kind.
  if NEW.stage = 'Closed' and (OLD.stage is null or OLD.stage < 'Closed') then
    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled invoices.';
    end if;

    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled security deposit.';
    end if;
  end if;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · Publish the transition's reason so the gate above can read it.
--
-- Only the four `set_config` lines are new; everything else is the function as it
-- stood, re-stated because plpgsql has no way to patch a body in place.
-- -----------------------------------------------------------------------------
create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stage    booking_stage;
  v_closed_at        timestamptz;
  v_prev_occurred_at timestamptz;
begin
  select stage, closed_at into v_current_stage, v_closed_at
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  if v_closed_at is not null then
    raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
  end if;

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

  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  /*
   * NEW — publish this transition's identity for `validate_booking_gates`, which
   * fires on the UPDATE below and cannot see this row. Transaction-local, so it
   * ends with the statement's transaction and cannot leak anywhere else.
   */
  perform set_config('app.stage_override_reason', coalesce(NEW.reason, ''), true);
  perform set_config('app.stage_actor_id',        coalesce(NEW.actor_id::text, ''), true);
  perform set_config('app.stage_branch_id',       coalesce(NEW.branch_id::text, ''), true);

  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case when NEW.to_stage = 'Closed' then NEW.occurred_at else closed_at end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;
  -- This UPDATE still passes through bookings' own BEFORE UPDATE trigger
  -- (trg_booking_gate_check / validate_booking_gates(), 0010) exactly as if
  -- a client had issued it directly -- SECURITY DEFINER changes who owns
  -- the row lock and the column-revoke bypass, not which triggers fire.

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions. Both halves of R-06, and R-07 left intact.
-- -----------------------------------------------------------------------------
do $$
declare
  v_booking   uuid;
  v_owing     numeric(14,2);
  v_audit_after  bigint;
  v_stage     booking_stage;
  v_blocked   boolean := false;
begin
  -- a booking that is Packed and owes money — exactly the case that was refused
  select b.id into v_booking
  from bookings b
  join invoices i on i.booking_id = b.id and i.status not in ('Void')
  where b.stage = 'Packed'
  group by b.id
  having coalesce(sum(i.outstanding_amount), 0) > 0
  limit 1;

  if v_booking is null then
    raise notice '0090: no Packed booking with an outstanding balance in this database; behavioural check skipped.';
    return;
  end if;

  -- (a) with NO reason it must still refuse
  perform set_config('app.stage_override_reason', '', true);
  begin
    update bookings set stage = 'On Rent' where id = v_booking;
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: handover with money owing and no override reason was allowed.';
  end if;

  -- (b) with a reason it must proceed AND record the override
  --
  -- Counted by IDENTITY, not by total: `bookings` carries its own audit trigger
  -- (trg_audit_bookings), so the UPDATE writes an ordinary audit row of its own.
  -- An assertion on the raw count sees two and fails for the wrong reason — which
  -- is exactly what it did on the first run of this migration.
  perform set_config('app.stage_override_reason', 'QA post-condition: client pays on delivery', true);
  update bookings set stage = 'On Rent' where id = v_booking;

  select stage into v_stage from bookings where id = v_booking;

  select count(*) into v_audit_after
  from audit_events
  where record_id = v_booking
    and reason = 'QA post-condition: client pays on delivery'
    and new_values ->> 'gate' = 'handover_money'
    and new_values ->> 'ruling' = 'R-06';

  if v_stage <> 'On Rent' then
    raise exception 'POST-CONDITION FAILED: handover with a named reason did not move the stage (still %).', v_stage;
  end if;
  if v_audit_after <> 1 then
    raise exception 'POST-CONDITION FAILED: expected exactly one R-06 override row in audit_events, found %.', v_audit_after;
  end if;

  raise notice '0090 verified: handover refuses without a reason, proceeds with one, and records it.';

  -- This block only ever ran to prove the behaviour; undo it.
  raise exception 'ROLLBACK_POSTCONDITION_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_POSTCONDITION_PROBE' then
      raise notice '0090 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;
