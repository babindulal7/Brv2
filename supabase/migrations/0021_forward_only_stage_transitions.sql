-- ============================================================================
-- 0021_forward_only_stage_transitions.sql
--
-- Implements the "forward-only stages" trigger PLAN.md's Phase 1 checklist
-- has asked for since it was written, and makes `bookings.stage`'s own
-- column comment ("Written ONLY by that table's trigger; a direct UPDATE is
-- rejected" -- 0002_bookings.sql:80-81, restated verbatim by 0015) true
-- instead of aspirational. Found false, with three lines of evidence
-- (no such trigger anywhere; `bookings_update`'s RLS allows a direct client
-- UPDATE with no WITH CHECK; `booking_stage_transitions` has zero triggers
-- despite six `-- TRIGGER REQUIRED` comments naming exactly this), during
-- this session's Phase 1 audit -- see PLAN.md §6.7/§6.8 for the full trail.
--
-- SCOPE, READ THIS BEFORE ASSUMING MORE WAS BUILT THAN WAS
-- ------------------------------------------------------------------------
-- `0002_bookings.sql:483-502` lists SIX `-- TRIGGER REQUIRED` items on
-- `booking_stage_transitions`. This migration implements exactly the ones
-- PLAN.md's Phase 1 checklist actually names -- "forward-only stages" and
-- "causal order":
--   1. Unless is_reversal, to_stage must be the immediately next value in
--      booking_stage order -- skipping is rejected.
--   2. occurred_at must be >= the booking's previous transition's occurred_at.
--   3. No transition may be inserted for a booking whose closed_at is set.
--   4. This table's trigger is the only writer of bookings.stage.
-- It deliberately does NOT implement the other two, which are full Phase 3
-- ("the engines") responsibilities, not schema-layer plumbing, and would
-- require inventing unspecified business logic to attempt here:
--   - "to_stage = 'Cancelled' releases inventory reservations" -- moot as
--     literally stated (0015 removed 'Cancelled' from the enum entirely;
--     cancellation is `bookings.cancelled_at`, orthogonal to this table
--     since 0015 -- see that migration's header) but the real underlying
--     need (something must release reservations when a booking is
--     cancelled) is real and unbuilt. Not attempted here.
--   - "advancing to 'Confirmed' reserves inventory / updates calendar /
--     recalculates payment status / generates the Rental Agreement /
--     enables Packing" and "advance past 'Confirmed' is rejected while any
--     Critical condition holds" -- this is the Status/Validation engines'
--     job (PLAN.md Phase 3), not a row-level CHECK. Attempting a partial
--     version here would mean guessing at "Critical condition"'s exact
--     definition, which is not this migration's call to make.
-- Also out of scope: `bookings.booking_no` immutability and the
-- Cancel-blocked-while-any-unit-Picked-Up trigger -- both real, both listed
-- in 0002's OTHER "TRIGGER REQUIRED" block (lines 103-108), neither part of
-- "forward-only stages."
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · The canonical successor function
--
-- Postgres enum comparison (<, >) already follows declaration order (0015's
-- own convention), which is enough for reversals ("to_stage precedes
-- from_stage" -- comment on booking_stage_transitions.is_reversal). Forward
-- moves need more than "later" -- they need "immediately next, no
-- skipping" -- hence this explicit map rather than an ordinal arithmetic
-- trick.
-- ---------------------------------------------------------------------------

create or replace function next_booking_stage(s booking_stage)
returns booking_stage
language sql
immutable
as $$
  select case s
    when 'Quote'    then 'Booked'::booking_stage
    when 'Booked'   then 'Packed'::booking_stage
    when 'Packed'   then 'On Rent'::booking_stage
    when 'On Rent'  then 'Returned'::booking_stage
    when 'Returned' then 'Closed'::booking_stage
    when 'Closed'   then null
  end;
$$;

comment on function next_booking_stage is
  'The canonical six-stage successor map (0015). Null for Closed -- nothing follows it.';

-- ---------------------------------------------------------------------------
-- 2 · The trigger: booking_stage_transitions is the sole writer of
--     bookings.stage / bookings.closed_at
--
-- SECURITY DEFINER (same established pattern as log_audit_event(), 0010) so
-- it can still write bookings.stage/closed_at after section 3 below revokes
-- direct UPDATE on those two columns from `authenticated`. Runs AFTER
-- INSERT so the row's own CHECK constraints (reversal-needs-approval,
-- no-self-transition -- both already enforced by Postgres before this
-- trigger ever fires) are guaranteed satisfied by the time this validates
-- the stage-order and causal-order rules those CHECKs don't cover.
--
-- Locks the booking row (`for update`) before reading its current stage, so
-- two concurrent transition inserts for the same booking cannot both read
-- the same "current" stage and both believe they are the legal next step.
-- ---------------------------------------------------------------------------

create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
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
    -- The genesis row -- 'Null only on the row that creates the booking, at
    -- Quote' (column comment). bookings.stage already defaults to 'Quote'
    -- on INSERT, so this branch is a consistency check, not the thing that
    -- actually sets Quote.
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

  -- Causal order: this transition cannot be recorded before the booking's
  -- most recently recorded one.
  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case when NEW.to_stage = 'Closed' then NEW.occurred_at else closed_at end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;
  -- This UPDATE still passes through bookings' own BEFORE UPDATE trigger
  -- (trg_booking_gate_check / validate_booking_gates(), 0010) exactly as if
  -- a client had issued it directly -- SECURITY DEFINER changes who owns
  -- the row lock and the column-revoke bypass, not which triggers fire. A
  -- gate failure (pending deposit, outstanding invoice) raises from inside
  -- that trigger, which rolls back this whole transaction -- the
  -- booking_stage_transitions row that triggered it included.

  return NEW;
end;
$$;

comment on function apply_booking_stage_transition is
  'The only path that may change bookings.stage/closed_at (enforced by the '
  'column REVOKE below). Validates forward-only/no-skip, reversal direction, '
  'causal order, and the Closed-is-final rule, then applies the transition.';

create trigger trg_apply_booking_stage_transition
  after insert on booking_stage_transitions
  for each row execute function apply_booking_stage_transition();

-- ---------------------------------------------------------------------------
-- 3 · Make the trigger the ONLY path -- revoke direct column access
--
-- `bookings_update` (0011, restated 0018) stays exactly as broad as it is
-- for every other column on `bookings` -- this does not narrow who can
-- update a booking's project/pickup_at/delivery_type/etc. It narrows what a
-- direct UPDATE can touch: `stage` (the thing this whole migration is
-- about) and `closed_at` (without this, a direct UPDATE could set closed_at
-- to NULL and silently "reopen" a Closed booking, defeating "Closed is
-- final" -- 0002_bookings.sql:96-97 -- without ever going through a
-- transition row at all).
-- ---------------------------------------------------------------------------

revoke update (stage, closed_at) on bookings from authenticated;

-- ---------------------------------------------------------------------------
-- 4 · booking_stage_transitions itself has RLS enabled and, verified by
--     grep, has never had a single policy -- fail-closed. Left as-is, this
--     migration would make things WORSE, not better: section 3 just revoked
--     the only other path to change bookings.stage, and with zero INSERT
--     policy here, nobody could ever take THIS path either -- every
--     booking's stage would freeze at 'Quote' forever. This is not adjacent
--     scope creep; without it, section 2/3 actively regresses the app.
--
-- INSERT: the same role set `bookings_update` (0011, restated 0018)
-- currently allows to change a booking directly -- moving a booking's stage
-- is a subset of "update this booking," so the set that could always do the
-- broader thing keeps the ability, via the narrower path. `with check`
-- additionally pins `actor_id` to the session's own identity (the same
-- `app.current_user_id` pattern `log_audit_event()` already uses) so a
-- transition can't be inserted claiming a different actor performed it.
--
-- SELECT: broadened to `auth_is_staff()` rather than the same five-role
-- list -- this table carries no money columns, and an audit trail nobody
-- can read is close to pointless. Writing it stays narrow; reading it does
-- not need to.
-- ---------------------------------------------------------------------------

create policy booking_stage_transitions_select on booking_stage_transitions
  for select
  using (auth_is_staff());

create policy booking_stage_transitions_insert on booking_stage_transitions
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
    and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

commit;
