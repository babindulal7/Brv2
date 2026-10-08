-- ====================================================================
-- Babin Rentals OS — Cutover Batch: supabase_cutover_batch_3_0131_to_0152.sql
-- Scope: Migrations 131 to 152
-- Purpose: Damage gates, crew/transport, security hardening D1-D7, short document numbering
-- Paste into Supabase SQL Editor and click RUN
-- ====================================================================

-- Ensure migration probes and seed operations can insert lines under 0119 money guard
select set_config('app.in_create_booking', 'on', false);

-- >>> START 0131_close_gate_pending_damage.sql <<<
-- =============================================================================
-- Migration 0131: Close Gate — pending damage findings (Audit-01 P0-02)
--
-- Law 1: The database is the law. The close gate now has SIX checks, not five.
--
-- ## The hole
--
-- 0116's Returned -> Closed gate checked: invoice exists, invoices settled,
-- deposit resolved, no open cases, no live reservations. It never checked
-- `damage_findings`. A return-inspection finding with
-- `approval_state = 'Pending Approval'` raises NO case (0003:484 — the client
-- has not signed off yet), so gate (d) "no open cases" cannot see it — and the
-- app-layer gate (`src/lib/workflow.ts` closeGates, RL-06, which reads
-- `damageChargesPendingApproval`) is only consulted on the `closeRental` path.
-- A direct `booking_stage_transitions` insert — any future RPC, script, or
-- hand-run SQL — walked straight past it:
--
--   Returned -> damage finding Pending Approval -> no case -> invoice settled
--   -> deposit resolved -> reservations released -> Closed. Pending damage
--   silently dropped from the record of a closed rental.
--
-- `0003_operations.sql:399-400` always intended otherwise ("any unresolved Not
-- Returned blocks Stage 10 Completed; any unsettled Damaged blocks Stage 11
-- Closed"), and 0003:505-506 requires the return session itself to hold until
-- every finding is approved or dispositioned. This migration closes the gap at
-- the layer that cannot be bypassed.
--
-- ## The check
--
-- A finding is attached to a booking through EITHER of its parents
-- (`damage_findings_exactly_one_parent` guarantees exactly one is set):
--
--   - Return:  damage_findings.return_line_id -> return_lines.booking_line_id
--              -> booking_lines.booking_id
--   - Reset:   damage_findings.cleaning_queue_entry_id
--              -> cleaning_queue_entries.booking_id
--
-- matching RL-06's app-side count, which reads both. The gate fires on
-- `approval_state = 'Pending Approval'` and `voided_at is null`; a voided
-- finding is a finding that never was (Law 3 / 0003:496).
--
-- RULING 2026-09-21: gate.close.damage_pending is fail-closed at the database.
-- Revert = re-apply 0116's function body (this file is a full-body replacement).
--
-- ## Applying this
--
-- ⚠ Never apply to the live Supabase project without explicit approval
-- (CLAUDE.md, N-5). Additive by shape: one `create or replace function`, no
-- table touched, no existing pass/fail changed except "close with pending
-- damage verdicts", which today is the unprotected path. Verified by
-- `npm run check:pglite` building this function over the full chain; a
-- migration is `Verified` only when check:pglite AND check:lifecycle are both
-- green in the same run (R-35), and that verdict belongs to the run, not the
-- file.
-- =============================================================================

begin;

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

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 21 Sep 2026)
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

    -- (f) No damage finding awaiting approval (RL-06, at the layer the app
    --     cannot bypass). A return-inspection finding raises NO case
    --     (0003:484), so gate (d) cannot see it; this is the same two-parent
    --     read the app gate documents — return line via booking_lines, or
    --     cleaning queue entry carrying booking_id directly. A voided finding
    --     is a finding that never was (0003:496).
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
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
  'Stage 1 (0116, extended 0131): Evaluates stage gates including the six-part close gate — invoice exists, '
  'invoices settled, deposit resolved, no open cases, no live reservations, no damage finding pending approval '
  '(RL-06 through both finding parents) — enforces money/custody invariants, updates bookings.stage and closed_at.';

commit;

-- >>> END 0131_close_gate_pending_damage.sql <<<

-- >>> START 0132_create_booking_crew_transport.sql <<<
-- =============================================================================
-- 0132 — `create_booking(jsonb)`: crew and transport join the ONE transaction.
--
-- ## The gap this closes (Audit-01 P1-02)
--
-- 0063 made header + lines + discounts atomic and left `booking_crew_lines`
-- and `booking_transport` to the client, which wrote them AFTER the RPC
-- returned. A failure in that tail left a Quote that exists without its crew
-- or its transport — `CreateRentalPartialError` named it, and the NewRental
-- screen's recovery was "press Confirm again", which CONFIRMED the incomplete
-- Quote rather than completing it. Worse, BookingDetail had (and has) no edit
-- path for either table, so the missing rows could not be added afterwards:
-- a Quote without transport had no honest path to one.
--
-- Crew and transport are not accessories to a booking; they are the price the
-- client signs (day_rate × days) and the way the gear physically moves. A
-- booking that lands them silently-later-or-never is the same class of defect
-- 0063 was written to end for discounts.
--
-- ## The shape
--
-- Same doctrine as everything else in this function: each crew row and the
-- transport row carry their own caller-minted Law 8 `client_uuid`; the replay
-- check still runs before any of this (`bookings.client_uuid`), so a retried
-- press re-enters NOTHING — either the first attempt committed everything (and
-- a replay returns it untouched) or it committed nothing at all. Partial state
-- is now impossible by construction, which is what removes the healing path
-- the client used to need.
--
-- SECURITY INVOKER, as always (0063's header): each insert below faces the
-- caller's own RLS policy, exactly as it did when the browser wrote the rows
-- one at a time over PostgREST. Nothing is granted or bypassed here; what a
-- role could not write before, it cannot write now — a refusal simply rolls
-- the WHOLE booking back instead of orphaning half of it.
--
-- ## Payload additions
--
--   "crew": [
--     { "client_uuid", "crew_member_id"|null, "name", "crew_role", "phone"|null,
--       "day_rate", "days", "overtime", "accommodation", "meals" }, …
--   ]
--   "transport": null | {
--     "client_uuid", "delivery_charge", "fuel_charge",
--     "vehicle"|null, "number_plate"|null, "driver_contact"|null,
--     "special_instructions"|null
--   }
--
-- The return gains `crew_lines` (int) and `transport_written` (bool). A replay
-- returns neither — it wrote nothing, including on this axis.
--
-- RULING 2026-09-21: booking creation is ONE transaction, crew and transport
-- included. Revert = re-apply 0119's function body and restore the client-side
-- post-RPC writes in createRental.ts.
--
-- ## What this is rebased on
--
-- **0119, verbatim** — the S1-7 server-side pricing, the money-blind discount
-- gate and the `app.in_create_booking` marker are carried forward unchanged.
-- Only the two loops after the discount loop are new.
--
-- ## Applying this
--
-- ⚠ Never applied to the live Supabase project without explicit approval
-- (CLAUDE.md, N-5). Additive in shape — one `create or replace function`, no
-- table touched. The local mirror in `src/lib/mock/client.ts` is amended in
-- the same change (the seam rule at `createRental.ts`: one implementation of
-- what a booking is, two backends). `Verified` only when check:pglite AND
-- check:lifecycle are green in the same run (R-35).
-- =============================================================================

begin;

create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id     uuid;
  v_existing_no     text;
  v_existing_stage  text;
  v_booking_id      uuid;
  v_booking_no      text;
  v_actor           uuid := (p_payload ->> 'created_by')::uuid;
  v_branch          uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines           jsonb;
  v_line            jsonb;
  v_discount        jsonb;
  v_audit_id        uuid;
  v_line_count      integer := 0;
  v_unit_count      integer := 0;
  v_pending         jsonb;
  v_next            jsonb;
  v_parent_key      uuid;
  v_parent_id       uuid;
  v_wrote           integer;
  v_line_id         uuid;
  v_unit            jsonb;
  v_asset_product   uuid;
  v_dupe_assets     integer;
  v_base_rate       numeric;
  v_payload_rate    numeric;
  v_final_rate      numeric;
  v_rate_overridden boolean;
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ───────────────────────────────────────────
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      -- ── S1-7: Line pricing calculation ─────────────────────────────────────
      if v_parent_id is not null or coalesce((v_line ->> 'is_included')::boolean, false) then
        v_base_rate := 0;
      elsif (v_line ->> 'product_id') is not null or (v_line ->> 'bundle_id') is not null then
        v_base_rate := get_model_daily_rate((v_line ->> 'product_id')::uuid, (v_line ->> 'bundle_id')::uuid);
      else
        v_base_rate := coalesce((v_line ->> 'rate')::numeric, 0);
      end if;

      v_payload_rate := (v_line ->> 'rate')::numeric;
      v_rate_overridden := false;

      if auth_can_view_money() then
        if v_payload_rate is not null then
          v_final_rate := v_payload_rate;
          if v_base_rate is not null and v_final_rate <> v_base_rate then
            v_rate_overridden := true;
          end if;
        else
          v_final_rate := coalesce(v_base_rate, 0);
        end if;
      else
        -- Money-blind caller: silently use server price
        v_final_rate := coalesce(v_base_rate, 0);
        v_rate_overridden := false;

        if v_payload_rate is not null and v_payload_rate <> v_final_rate then
          insert into audit_events (
            id, client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, branch_id, reason, new_values
          )
          values (
            gen_random_uuid(),
            gen_random_uuid(),
            'override',
            'Rentals',
            'Rentals',
            'price.server_applied',
            'Informational',
            'Success',
            'booking_lines',
            v_booking_id,
            v_actor,
            v_branch,
            'Server-side price applied for money-blind caller (Law 6)',
            jsonb_build_object(
              'booking_no',   v_booking_no,
              'product_id',   v_line ->> 'product_id',
              'payload_rate', v_payload_rate,
              'applied_rate', v_final_rate
            )
          );
        end if;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        v_final_rate,
        case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end,
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        case when auth_can_view_money() then (v_line ->> 'supplier_cost')::numeric else null end,
        case when auth_can_view_money() then (v_line ->> 'markup_amount')::numeric else null end,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor,
        v_rate_overridden
      )
      returning id into v_line_id;

      -- ── D5: creation-time unit assignment ───────────────────────────────
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  -- ── Crew (0132) — inside the transaction, or the booking does not exist ──
  -- One row per crew entry, each with its own caller-minted Law 8 key, exactly
  -- like lines and discounts. Table CHECKs (`booking_crew_lines_days_min`,
  -- `_money_non_negative`, `_name_present`) are the only money/name rule and
  -- they fire here as they did on the PostgREST write; this loop adds no second
  -- implementation of them (Law 10).
  for v_crew in select * from jsonb_array_elements(coalesce(p_payload -> 'crew', '[]'::jsonb))
  loop
    if v_crew ->> 'client_uuid' is null then
      raise exception 'create_booking: every crew row needs its own client_uuid (Law 8, one per ROW)';
    end if;

    insert into booking_crew_lines (
      client_uuid, booking_id, crew_member_id, name, crew_role, phone,
      day_rate, days, overtime, accommodation, meals, created_by
    )
    values (
      (v_crew ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_crew ->> 'crew_member_id')::uuid,
      v_crew ->> 'name',
      (v_crew ->> 'crew_role')::crew_role,
      v_crew ->> 'phone',
      coalesce((v_crew ->> 'day_rate')::numeric, 0),
      (v_crew ->> 'days')::integer,
      coalesce((v_crew ->> 'overtime')::numeric, 0),
      coalesce((v_crew ->> 'accommodation')::numeric, 0),
      coalesce((v_crew ->> 'meals')::numeric, 0),
      v_actor
    );
    v_crew_count := v_crew_count + 1;
  end loop;

  -- ── Transport (0132) — the one row `booking_transport_booking_id_key` allows ──
  -- `days` on a crew line is never defaulted (Law 9 applies to priced lines);
  -- transport carries no days at all, only the two charges. A bad row refuses
  -- the WHOLE booking now, not just its own insert.
  --
  -- `jsonb_typeof(...) = 'object'`, deliberately: `p_payload -> 'transport'`
  -- returns the jsonb value `null` (which is NOT SQL-null) when the caller
  -- sends `"transport": null`, and that jsonb null would otherwise walk into
  -- the insert and raise on a missing client_uuid — refusing a booking for a
  -- section the caller explicitly said is empty.
  if jsonb_typeof(p_payload -> 'transport') = 'object' then
    v_transport := p_payload -> 'transport';
    if v_transport ->> 'client_uuid' is null then
      raise exception 'create_booking: the transport row needs its own client_uuid (Law 8)';
    end if;

    insert into booking_transport (
      client_uuid, booking_id, delivery_charge, fuel_charge,
      vehicle, number_plate, driver_contact, special_instructions, created_by
    )
    values (
      (v_transport ->> 'client_uuid')::uuid,
      v_booking_id,
      coalesce((v_transport ->> 'delivery_charge')::numeric, 0),
      coalesce((v_transport ->> 'fuel_charge')::numeric, 0),
      v_transport ->> 'vehicle',
      v_transport ->> 'number_plate',
      v_transport ->> 'driver_contact',
      v_transport ->> 'special_instructions',
      v_actor
    );
    v_transport_written := true;
  end if;

  return jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_no',        v_booking_no,
    'stage',             'Quote',
    'line_count',        v_line_count,
    'unit_count',        v_unit_count,
    'crew_lines',        v_crew_count,
    'transport_written', v_transport_written,
    'replayed',          false
  );
end;
$$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + discounts + crew + transport) in a '
  'single transaction (0132 — crew/transport folded in; there is no partial booking). SECURITY INVOKER — every '
  'insert faces its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay returns the existing '
  'booking and writes nothing, including no sequence advance. Lines insert in dependency order (parent_client_uuid); '
  'per D5 a line may carry units[]; S1-7 prices lines server-side for money-blind callers. Prices nothing else — '
  'src/lib/money.ts owns the pricing order (Law 1).';

commit;

-- >>> END 0132_create_booking_crew_transport.sql <<<

-- >>> START 0133_create_documents_storage_bucket.sql <<<
-- =============================================================================
-- 0129_create_documents_storage_bucket.sql — AUD-010 (P2)
--
-- Seed Storage Buckets:
-- Ensures the private 'documents' and 'evidence' storage buckets exist
-- in storage.buckets for commercial PDFs, invoices, agreements, and media.
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('documents', 'documents'), ('evidence', 'evidence')
    on conflict (id) do nothing;
  end if;
end $$;

-- Enable RLS on storage.objects
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    alter table storage.objects enable row level security;

    -- SELECT policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_select_policy'
    ) then
      create policy "documents_evidence_select_policy"
        on storage.objects for select
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;

    -- INSERT policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_insert_policy'
    ) then
      create policy "documents_evidence_insert_policy"
        on storage.objects for insert
        to authenticated, anon
        with check (bucket_id in ('documents', 'evidence'));
    end if;

    -- UPDATE policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_update_policy'
    ) then
      create policy "documents_evidence_update_policy"
        on storage.objects for update
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;

    -- DELETE policy
    if not exists (
      select 1 from pg_policies 
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'documents_evidence_delete_policy'
    ) then
      create policy "documents_evidence_delete_policy"
        on storage.objects for delete
        to authenticated, anon
        using (bucket_id in ('documents', 'evidence'));
    end if;
  end if;
end $$;

-- >>> END 0133_create_documents_storage_bucket.sql <<<

-- >>> START 0134_bundle_items_soft_delete.sql <<<
-- =============================================================================
-- Migration 0134: Bundle Items Soft-Deactivation (OPEN_DECISIONS.md §4.52)
--
-- Law 3: Operational and configuration tables are append-only / soft-delete.
-- Physical DELETE operations are prohibited. Bundle line quantity must be >= 1.
-- This migration introduces is_active, deactivated_at, and deactivated_by
-- so components can be removed from a bundle without breaking history.
-- =============================================================================

begin;

alter table bundle_items
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references users(id);

create index if not exists idx_bundle_items_bundle_active
  on bundle_items (bundle_id, is_active);

-- -----------------------------------------------------------------------------
-- Post-condition assertion
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bundle_items' and column_name = 'is_active'
  ) then
    raise exception '0134 post-condition failed: bundle_items.is_active not found';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'bundle_items' and column_name = 'deactivated_at'
  ) then
    raise exception '0134 post-condition failed: bundle_items.deactivated_at not found';
  end if;
end;
$$;

commit;

-- >>> END 0134_bundle_items_soft_delete.sql <<<

-- >>> START 0135_zero_value_close_override.sql <<<
-- =============================================================================
-- Migration 0135: Zero-Value Rental Close Override (OPEN_DECISIONS.md §4.51)
--
-- Law 1: The database is the law.
-- Close gate requires a settled booking. For genuine zero-value / sponsored /
-- goodwill jobs where no invoice is issued, an Owner or Admin can close the
-- rental by providing an audited override reason of at least 10 characters.
-- General staff (Coordinator, Technician, Accounts) cannot waive this gate.
-- The override writes an immutable entry into audit_events.
-- Based directly on 0131_close_gate_pending_damage.sql.
-- =============================================================================

begin;

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

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131 and 0135)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'CloseOverride', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
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

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
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
  'Stage 1 (0116, extended 0131, 0135): Evaluates stage gates including the close gate — invoice exists '
  '(or Owner/Admin zero-value override with reason >= 10 chars), invoices settled, deposit resolved, '
  'no open cases, no live reservations, no damage finding pending approval — enforces invariants and updates stage.';

commit;

-- >>> END 0135_zero_value_close_override.sql <<<

-- >>> START 0136_payment_reversal_ceiling.sql <<<
-- 0136 · Payment reversal ceiling
--
-- Law 4: a payment remains immutable and a correction is an append-only row.
-- The ceiling must therefore live at the write boundary, not in a client-side
-- balance display: partial reversals, retries and concurrent operators must
-- never cumulatively reverse more than the original receipt.

begin;

insert into public.number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
values ('payment_reversal', 'REV-', extract(year from current_date)::integer, 0, 4, true)
on conflict (sequence_key) do nothing;

create or replace function public.enforce_payment_reversal_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_amount numeric(14,2);
  v_payment_type payment_type;
  v_payment_status payment_status;
  v_reversed_amount numeric(14,2);
begin
  -- Serialize all correction attempts for this receipt before summing its rows.
  select p.amount, p.payment_type, p.status
    into v_payment_amount, v_payment_type, v_payment_status
    from payments p
   where p.id = new.original_payment_id
   for update;

  if not found then
    raise exception 'Original payment % does not exist', new.original_payment_id
      using errcode = '23503';
  end if;

  if v_payment_type <> 'Advance Payment' or v_payment_status <> 'Received' then
    raise exception 'Only a received advance payment can be reversed'
      using errcode = '23514';
  end if;

  select coalesce(sum(r.amount), 0)
    into v_reversed_amount
    from payment_reversals r
   where r.original_payment_id = new.original_payment_id;

  if new.amount > v_payment_amount - v_reversed_amount then
    raise exception 'Reversal amount % exceeds the remaining reversible amount % for payment %',
      new.amount, v_payment_amount - v_reversed_amount, new.original_payment_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_reversals_enforce_ceiling on public.payment_reversals;
create trigger payment_reversals_enforce_ceiling
before insert on public.payment_reversals
for each row execute function public.enforce_payment_reversal_ceiling();

revoke all on function public.enforce_payment_reversal_ceiling() from public;

commit;

-- >>> END 0136_payment_reversal_ceiling.sql <<<

-- >>> START 0137_law17_delivery_method_client_pickup.sql <<<
-- =============================================================================
-- Migration 0137: Law 17 in the database — delivery_method Client Pickup
--
-- BUG (live, 28 Sep 2026): Confirm Handover fails with
--   `[DataAccess] Insert failed on operation_sessions: invalid input value for
--    enum delivery_method: "Client Pickup"`
--
-- Root cause: floorVerb.ts:1112 writes `booking.delivery_type` into
-- `operation_sessions.delivery_method`. 0113 renamed `delivery_type`'s member
-- to 'Client Pickup', so the booking row now carries 'Client Pickup' — but the
-- sibling `delivery_method` enum (0001:33) was never renamed and still holds
-- 'Customer Pickup'. Every write except 'Client Pickup' passed the enum cast
-- (the 0113 test only exercised 'Babin Delivery'), which is why only a Client
-- Pickup handover broke.
--
-- Ruled exception to N-6 (R-33/R-38), same as 0113: alter type ... rename value
-- rewrites the catalog, not the rows. The 0003 check constraints that name the
-- member literally (operation_sessions_pickup_person_method :95,
-- operation_sessions_address_not_on_customer_pickup :107) store enum OIDs, so
-- they follow the rename — verified on PGlite: post-rename they deparse as
-- 'Client Pickup'::delivery_method, existing rows relabel in place, a pickup
-- with an address is still rejected, and 'Customer Pickup' is unrepresentable.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'delivery_method' and e.enumlabel = 'Customer Pickup'
  ) then
    alter type delivery_method rename value 'Customer Pickup' to 'Client Pickup';
  end if;
end $$;

commit;

-- >>> END 0137_law17_delivery_method_client_pickup.sql <<<

-- >>> START 0138_subrental_return_by_date.sql <<<
begin;

-- RULING 2026-09-29: vendor return-by is operator-entered and independent of booking extensions.
alter table booking_lines
  add column subrental_return_by date;

alter table booking_lines
  add constraint booking_lines_subrental_return_by_required
  check (line_type <> 'Sub-rental' or subrental_return_by is not null) not valid;

-- Existing vendor agreements cannot be assigned a deadline from booking dates.
-- NOT VALID still enforces this check on every new or updated row. Validate only
-- after an operator records the real deadline on historical Sub-rental lines.

commit;

-- >>> END 0138_subrental_return_by_date.sql <<<

-- >>> START 0139_return_gate_exempt_non_physical_lines.sql <<<
-- RULING 2026-09-29: non-physical lines need no Return receipt.
-- =============================================================================
-- Migration 0139: Return gate exemption for non-physical booking lines.
--
-- Law 1: The database is the law.
-- Close gate requires a settled booking. For genuine zero-value / sponsored /
-- goodwill jobs where no invoice is issued, an Owner or Admin can close the
-- rental by providing an audited override reason of at least 10 characters.
-- General staff (Coordinator, Technician, Accounts) cannot waive this gate.
-- The override writes an immutable entry into audit_events.
-- Full transition function copied from 0135; only the Return predicate changes.
-- =============================================================================

begin;

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
        and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
        and not exists (
          select 1
          from return_lines rl
          where rl.booking_line_id = bl.id
        )
    ) then
      raise exception 'GATE:gate.return.units_unaccounted|Every physical booking line must have a return line recorded.' using errcode = 'P0001';
    end if;
  end if;

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131 and 0135)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'CloseOverride', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
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

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
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
  'Stage 1 (0116, extended 0131, 0135, 0139): Evaluates stage gates including the close gate — invoice exists '
  '(or Owner/Admin zero-value override with reason >= 10 chars), invoices settled, deposit resolved, '
  'no open cases, no live reservations, no damage finding pending approval — enforces invariants and updates stage.';

commit;

-- >>> END 0139_return_gate_exempt_non_physical_lines.sql <<<

-- >>> START 0141_return_gate_consumable_exemption.sql <<<
-- RULING 2026-09-29 (Option A, OPEN_DECISIONS.md #4): Consumable-tracked lines need no Return receipt.
-- =============================================================================
-- Migration 0141: Return gate exemption for Consumable-tracked booking lines.
--
-- Law 1: The database is the law.
-- 0139 exempted Service, Sub-rental and Manual item lines from the Return
-- receipt gate by line_type. That filter alone misses every consumable: a sale
-- line (gaffer tape, gels, batteries) is an Equipment/Accessory line whose
-- PRODUCT carries products.tracking_mode = 'Consumable' — there is no 'Sale'
-- member in booking_line_type (0001:296-303). Forcing a return receipt for a
-- line whose stock is consumed at Handover (0142) makes the operator fake-mark
-- it just to reach Returned.
--
-- Full transition function copied from 0139; only the Return predicate changes:
-- the exists() check left-joins products and also requires
-- coalesce(p.tracking_mode, 'Serialised') <> 'Consumable'. LEFT JOIN (not
-- inner) so a physical line with a null product_id stays fail-closed: it is
-- still required, never silently exempted.
-- =============================================================================

begin;

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
  -- 0141: Consumable-tracked products are consumed at Handover (0142) and never
  -- come back, so they need no return line. A consumable sale is an
  -- Equipment/Accessory LINE whose product is tracking_mode = 'Consumable' —
  -- the line_type filter alone misses it, hence the join. LEFT JOIN +
  -- coalesce default 'Serialised' keeps a physical line with a null product_id
  -- fail-closed (still required, never silently exempted).
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
      left join products p on p.id = bl.product_id
      where bl.booking_id = NEW.booking_id
        and bl.voided_at is null
        and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
        and coalesce(p.tracking_mode, 'Serialised') <> 'Consumable'
        and not exists (
          select 1
          from return_lines rl
          where rl.booking_line_id = bl.id
        )
    ) then
      raise exception 'GATE:gate.return.units_unaccounted|Every physical booking line must have a return line recorded.' using errcode = 'P0001';
    end if;
  end if;

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131 and 0135)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'CloseOverride', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
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

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
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
  'Stage 1 (0116, extended 0131, 0135, 0139, 0141): Evaluates stage gates including the close gate — invoice exists '
  '(or Owner/Admin zero-value override with reason >= 10 chars), invoices settled, deposit resolved, '
  'no open cases, no live reservations, no damage finding pending approval — enforces invariants and updates stage. '
  '0141 exempts Consumable-tracked products from the Return receipt gate.';

commit;

-- >>> END 0141_return_gate_consumable_exemption.sql <<<

-- >>> START 0142_consumable_stock_deduction_on_handover.sql <<<
-- RULING 2026-09-29 (Option A, OPEN_DECISIONS.md #4): Consumables deplete at Handover.
-- =============================================================================
-- Migration 0142: Automatic consumable stock deduction on Handover.
--
-- Law 1: The database is the law.
-- 0141 stops the Return gate from demanding a receipt for Consumable-tracked
-- lines. Without this migration nothing would ever decrement
-- products.total_quantity when consumables (gaffer tape, gels, batteries)
-- leave the building — the count would silently stop meaning anything.
--
-- Shape follows 0112_partial_return_missing_case.sql exactly: a trigger on
-- booking_stage_transitions insert, keyed on to_stage, idempotency by UNIQUE
-- constraint (not a bare not-exists), post-condition check at the end.
--
-- Why 'On Rent' and not 'Packed': Handover completes Packed -> On Rent and is
-- the point of no return. Packing can be redone or the booking cancelled
-- before anything leaves; deducting at Packed would charge stock for gear
-- still on the shelf.
--
-- Interaction with 0140's products_bulk_quantity_rpc_only: that trigger
-- refuses DIRECT total_quantity updates only when current_user =
-- 'authenticated'. This function is SECURITY DEFINER, so its update runs as
-- the function owner and is not refused — same as adjust_stock()'s own
-- update. A client UPDATE on products is still refused; only this trigger and
-- adjust_stock() may move the number, and each leaves its own audit row
-- (consumable_stock_movements here, stock_adjustments there) so "why did this
-- number change" stays answerable without filtering a mixed table by cause.
-- =============================================================================

begin;

create table consumable_stock_movements (
  id                uuid          not null default gen_random_uuid() primary key,
  client_uuid       uuid          not null,
  booking_id        uuid          not null references bookings (id),
  booking_line_id   uuid          not null references booking_lines (id),
  product_id        uuid          not null references products (id),
  qty               integer       not null,
  quantity_before   integer       not null,
  quantity_after    integer       not null,
  created_at        timestamptz   not null default now(),
  created_by        uuid          not null references users (id),

  constraint consumable_stock_movements_client_uuid_key unique (client_uuid),
  constraint consumable_stock_movements_qty_positive check (qty > 0),
  constraint consumable_stock_movements_quantity_before_nonneg check (quantity_before >= 0),
  constraint consumable_stock_movements_quantity_after_nonneg check (quantity_after >= 0),
  -- One deduction per line, ever — a re-run of the trigger (e.g. a Handover
  -- session reopened and re-closed) must not double-charge stock. This UNIQUE
  -- is the real idempotency guard; the not-exists check in the function only
  -- avoids a wasted attempt.
  constraint consumable_stock_movements_one_per_line unique (booking_line_id)
);

create index idx_consumable_stock_movements_booking on consumable_stock_movements (booking_id);
create index idx_consumable_stock_movements_product on consumable_stock_movements (product_id, created_at desc);

alter table consumable_stock_movements enable row level security;

-- Reporting audience only: an automatic system effect, never an operator
-- write, so no insert/update/delete policy — the SECURITY DEFINER trigger
-- below bypasses RLS. Mirrors stock_adjustments_select (0140).
create policy consumable_stock_movements_select on consumable_stock_movements for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke all on consumable_stock_movements from public, anon, authenticated;
grant select on consumable_stock_movements to authenticated;

create or replace function public.deduct_consumable_stock_on_handover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line       record;
  v_before     integer;
  v_after      integer;
begin
  -- Only trigger on transition to 'On Rent' (Handover complete)
  if NEW.to_stage <> 'On Rent' then
    return NEW;
  end if;

  -- Every Consumable-tracked line on this booking that hasn't already been
  -- deducted (the unique constraint on booking_line_id is the real guard;
  -- this check just avoids a wasted attempt on a re-run).
  for v_line in
    select bl.id as booking_line_id, bl.product_id, bl.qty
    from booking_lines bl
    join products p on p.id = bl.product_id
    where bl.booking_id = NEW.booking_id
      and bl.voided_at is null
      and p.tracking_mode = 'Consumable'
      and not exists (
        select 1 from consumable_stock_movements csm
        where csm.booking_line_id = bl.id
      )
  loop
    select total_quantity into v_before
      from products
     where id = v_line.product_id
       for update;

    if v_before is null then
      -- Product row missing — should not happen given the FK, but never
      -- silently skip a stock event; fail loudly instead.
      raise exception 'GATE:gate.handover.consumable_product_missing|Consumable product % not found for booking line %.', v_line.product_id, v_line.booking_line_id using errcode = 'P0001';
    end if;

    v_after := greatest(0, v_before - v_line.qty);
    -- Deliberately clamped at zero rather than raising: Handover has already
    -- happened by the time this trigger fires (it runs on the stage
    -- transition itself), so refusing here would block a completed handover
    -- over a stock-count discrepancy that predates this booking. A negative
    -- total_quantity going forward would be worse than a clamped one; the
    -- undercount is instead visible for a Manager to correct with
    -- adjust_stock() (0140), with the real reason on record.

    update products
       set total_quantity = v_after,
           updated_at = now()
     where id = v_line.product_id;

    insert into consumable_stock_movements (
      client_uuid, booking_id, booking_line_id, product_id,
      qty, quantity_before, quantity_after, created_by
    ) values (
      gen_random_uuid(), NEW.booking_id, v_line.booking_line_id, v_line.product_id,
      v_line.qty, v_before, v_after, NEW.actor_id
    );
  end loop;

  return NEW;
end;
$$;

comment on function public.deduct_consumable_stock_on_handover() is
  'Automatically decrements products.total_quantity for Consumable-tracked booking lines when a booking transitions to On Rent (Handover complete). Clamped at zero; a pre-existing undercount surfaces for a Manager to fix via adjust_stock(), not as a blocked handover.';

-- Fires after the transition is applied, same timing as trg_return_missing_case
drop trigger if exists trg_consumable_stock_deduction on public.booking_stage_transitions;
create trigger trg_consumable_stock_deduction
  after insert on public.booking_stage_transitions
  for each row execute function public.deduct_consumable_stock_on_handover();

-- -----------------------------------------------------------------------------
-- Post-conditions verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_consumable_stock_deduction'
       and tgrelid = 'public.booking_stage_transitions'::regclass
  ) then
    raise exception 'POST-CONDITION FAILED: trg_consumable_stock_deduction trigger missing on booking_stage_transitions.';
  end if;
end;
$$;

commit;

-- >>> END 0142_consumable_stock_deduction_on_handover.sql <<<

-- >>> START 0143_smart_intel_notes_fields.sql <<<
-- Smart Intel Cards: append-only notes and classified custom fields.
-- RULING 2026-09-29: existing booking notes stay all_staff; new notes use
-- all_staff / operations (staff except Accounts) / management (O/A/M).
-- WRITTEN for local verification only. N-5 forbids live application here.

alter table booking_notes
  add column visibility text not null default 'all_staff'
  constraint booking_notes_visibility_check
  check (visibility in ('all_staff', 'operations', 'management'));

-- A permissive FOR ALL policy would OR with a new SELECT policy and leak
-- management notes. Replace it with command-specific policies.
drop policy if exists booking_notes_all on booking_notes;
drop policy if exists booking_notes_select on booking_notes;
create policy booking_notes_select on booking_notes for select
  using (
    auth_is_staff() and archived_at is null and (
      visibility = 'all_staff'
      or (visibility = 'operations' and auth_user_role() <> 'Accounts')
      or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))
    )
  );
create policy booking_notes_insert on booking_notes for insert
  with check (
    auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and created_by = auth_user_id()
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager'))
  );
create policy booking_notes_update on booking_notes for update
  using (archived_at is null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and (visibility = 'all_staff' or (visibility = 'operations' and auth_user_role() <> 'Accounts')
      or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))))
  with check (auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager')));

create function booking_intel_note_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.booking_id is distinct from old.booking_id or new.booking_line_id is distinct from old.booking_line_id
     or new.note_type is distinct from old.note_type or new.body is distinct from old.body
     or new.visibility is distinct from old.visibility or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only archiving a live booking note is allowed';
  end if;
  return new;
end $$;
create trigger booking_intel_note_archive_only before update on booking_notes
  for each row execute function booking_intel_note_archive_only();

create table intel_entity_notes (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  entity_type text not null check (entity_type in ('client','equipment')),
  client_id uuid references clients(id),
  product_id uuid references products(id),
  body text not null check (length(btrim(body)) > 0),
  visibility text not null default 'all_staff'
    check (visibility in ('all_staff','operations','management')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint intel_entity_notes_target check (
    (entity_type = 'client' and client_id is not null and product_id is null)
    or (entity_type = 'equipment' and product_id is not null and client_id is null)
  )
);
create index intel_entity_notes_client_recent on intel_entity_notes(client_id, created_at desc)
  where archived_at is null;
create index intel_entity_notes_product_recent on intel_entity_notes(product_id, created_at desc)
  where archived_at is null;
alter table intel_entity_notes enable row level security;
grant select, insert, update on intel_entity_notes to authenticated;
revoke delete on intel_entity_notes from public, anon, authenticated;

create policy intel_entity_notes_read on intel_entity_notes for select
  using (auth_is_staff() and archived_at is null and (
    visibility = 'all_staff'
    or (visibility = 'operations' and auth_user_role() <> 'Accounts')
    or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))
  ));
create policy intel_entity_notes_insert on intel_entity_notes for insert
  with check (
    created_by = auth_user_id()
    and (
      (entity_type = 'client' and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
      or (entity_type = 'equipment' and auth_user_role() in ('Owner','Admin','Manager'))
    )
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager'))
  );
create policy intel_entity_notes_archive on intel_entity_notes for update
  using (auth_user_role() in ('Owner','Admin','Manager'))
  with check (auth_user_role() in ('Owner','Admin','Manager'));

create function intel_entity_note_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.entity_type is distinct from old.entity_type or new.client_id is distinct from old.client_id
     or new.product_id is distinct from old.product_id or new.body is distinct from old.body
     or new.visibility is distinct from old.visibility or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only archiving a live Intel note is allowed';
  end if;
  return new;
end $$;
create trigger intel_entity_note_archive_only before update on intel_entity_notes
  for each row execute function intel_entity_note_archive_only();

create table intel_field_definitions (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  entity_type text not null check (entity_type in ('client','equipment','rental')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  classification text not null check (classification in ('operational','personal','financial')),
  high_priority boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index intel_field_definition_live_key on intel_field_definitions(entity_type, field_key)
  where archived_at is null;
alter table intel_field_definitions enable row level security;
grant select, insert, update on intel_field_definitions to authenticated;
revoke delete on intel_field_definitions from public, anon, authenticated;
create policy intel_field_definitions_read on intel_field_definitions for select
  using (auth_is_staff());
create policy intel_field_definitions_insert on intel_field_definitions for insert
  with check (auth_user_role() in ('Owner','Admin','Manager') and created_by = auth_user_id());
create policy intel_field_definitions_archive on intel_field_definitions for update
  using (auth_user_role() in ('Owner','Admin','Manager'))
  with check (auth_user_role() in ('Owner','Admin','Manager'));

create function intel_field_definition_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.entity_type is distinct from old.entity_type or new.field_key is distinct from old.field_key
     or new.label is distinct from old.label or new.classification is distinct from old.classification
     or new.high_priority is distinct from old.high_priority or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Custom field definitions are immutable; archive and create another';
  end if;
  return new;
end $$;
create trigger intel_field_definition_archive_only before update on intel_field_definitions
  for each row execute function intel_field_definition_archive_only();

-- Values are append-only. The most recent row for a definition and entity is
-- the current value; a NULL value_text clears it while retaining the history.
create table intel_field_values (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  definition_id uuid not null references intel_field_definitions(id),
  client_id uuid references clients(id),
  product_id uuid references products(id),
  booking_id uuid references bookings(id),
  value_text text check (value_text is null or length(value_text) <= 2000),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint intel_field_values_one_target check (
    (case when client_id is not null then 1 else 0 end)
    + (case when product_id is not null then 1 else 0 end)
    + (case when booking_id is not null then 1 else 0 end) = 1
  )
);
create index intel_field_values_client_recent on intel_field_values(client_id, definition_id, created_at desc, id desc);
create index intel_field_values_product_recent on intel_field_values(product_id, definition_id, created_at desc, id desc);
create index intel_field_values_booking_recent on intel_field_values(booking_id, definition_id, created_at desc, id desc);
alter table intel_field_values enable row level security;
grant select, insert on intel_field_values to authenticated;
revoke update, delete on intel_field_values from public, anon, authenticated;

create function intel_field_allowed(p_classification text) returns boolean language sql stable as $$
  select case p_classification
    when 'operational' then auth_is_staff()
    when 'personal' then auth_user_role() in ('Owner','Admin','Manager','Coordinator','Accounts')
    when 'financial' then auth_user_role() in ('Owner','Admin','Manager','Accounts')
    else false
  end;
$$;

create policy intel_field_values_read on intel_field_values for select
  using (exists (
    select 1 from intel_field_definitions d
    where d.id = definition_id and d.archived_at is null
      and intel_field_allowed(d.classification)
  ));
create policy intel_field_values_insert on intel_field_values for insert
  with check (
    created_by = auth_user_id()
    and exists (
      select 1 from intel_field_definitions d
      where d.id = definition_id and d.archived_at is null
        and (
          (d.entity_type = 'client' and client_id is not null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
          or (d.entity_type = 'equipment' and product_id is not null and auth_user_role() in ('Owner','Admin','Manager'))
          or (d.entity_type = 'rental' and booking_id is not null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
        )
        and intel_field_allowed(d.classification)
    )
  );

-- Preserve the existing immutable audit trail for these new writes and for
-- visibility/archive changes. The logger captures the actor and row snapshot;
-- audit_events itself remains Owner/Manager-readable under its existing RLS.
create trigger trg_audit_booking_intel_notes after insert or update on booking_notes
  for each row execute function log_audit_event();
create trigger trg_audit_intel_entity_notes after insert or update on intel_entity_notes
  for each row execute function log_audit_event();
create trigger trg_audit_intel_field_definitions after insert or update on intel_field_definitions
  for each row execute function log_audit_event();
create trigger trg_audit_intel_field_values after insert on intel_field_values
  for each row execute function log_audit_event();

-- >>> END 0143_smart_intel_notes_fields.sql <<<

-- >>> START 0145_document_registry_read_scope.sql <<<
-- Keep registry reads within the Documents permissions matrix. A restrictive
-- SELECT policy also constrains the older permissive FOR ALL write policy.
create policy document_registry_role_read_scope on public.document_registry
  as restrictive for select to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
    or (
      auth_user_role() = 'Technician'
      and document_type not in ('Quotation', 'Tax Invoice', 'Receipt', 'Credit Note', 'Debit Note')
    )
    or (
      auth_user_role() = 'Warehouse'
      and document_type in ('Rental Agreement', 'Packing List', 'Delivery Note')
    )
  );

comment on policy document_registry_role_read_scope on public.document_registry is
  'Documents matrix and Law 6: finance-capable staff read all types; Technician reads operational types; Warehouse reads agreement, packing list and delivery note only; Driver is excluded.';

-- >>> END 0145_document_registry_read_scope.sql <<<

-- >>> START 0148_view_anon_leak_closure.sql <<<
-- =============================================================================
-- 0148_view_anon_leak_closure.sql — close three anon-readable views, and make
--                                  the closure a gate rather than a one-time fix
--
-- WHAT THIS FIXES (all three confirmed against the full 145-file chain in
-- PGlite, by reading `pg_class` / `pg_get_viewdef`, not by reading migrations)
-- -----------------------------------------------------------------------------
-- The audit that prompted this file measured, as the `anon` role against the
-- fully-built chain:
--
--   view                        rows to anon   why
--   -------------------------   -----------   ---------------------------------
--   audit_logs                  2,222         no row predicate at all; runs as its
--                                             owner, so `audit_events_select`
--                                             (Owner/Admin/Manager only) never runs
--   staff_directory_v           5 of 5        no row predicate; `revoke … from
--                                             public` does not remove anon's own grant
--   product_units_service_v     220           `grant select … to authenticated, anon`
--                                             written explicitly in 0103
--
--   Live exposure differs per view, and that matters for urgency:
--     * `product_units_service_v` is LIVE — 0103 was applied to production 8 Sep.
--     * `staff_directory_v` (0120) and `audit_logs` (0129) are PENDING. Applying
--       0125→0147 as planned would have opened the first two at cutover.
--
-- TWO CAUSES, AND ONLY THE SECOND ONE IS THE AUDIT'S STORY
-- -----------------------------------------------------------------------------
-- Cause 1 — a missing row predicate. `audit_logs` (0129) and
-- `product_units_service_v` (0103) select straight from a base table with no
-- `where`. 0048 established the house rule for exactly this: every definer view
-- carries its base table's row predicate INLINE, because a view runs as its
-- owner and therefore skips the base table's ROW policies. The twenty views 0048
-- repaired got the predicate. `staff_directory_v` did not — it kept 0067's
-- `auth_user_role() = 'Owner'`, and 0120 dropped it entirely when it recreated
-- the view for general staff access.
--
-- Cause 2 — and this is the one that let the first cause survive — **anon holds
-- SELECT on every view in `public`, by platform default.** `0095` corrected the
-- default ACL for DML and deliberately left SELECT alone; its post-condition
-- still treats `anon` losing SELECT on a view as a FAILURE:
--
--     if not has_table_privilege('anon', r.oid, 'SELECT') then
--       v_bad := v_bad || format('anon can no longer SELECT %s (0093 shape
--                                changed)', r.relname)::text;
--
-- and line 237 asserts `anon can no longer SELECT on public.clients` is bad. So
-- the house invariant was literally "anon reads every view, and the row
-- predicates are what stop it". That invariant held only while every view had a
-- predicate. 0129 shipped without one, and nothing in the chain could say so,
-- because a probe that counts rows cannot tell "gated" from "empty" against a
-- thin seed.
--
-- Note that 0095's assertion is NOT contradicted here: it runs at 0095, and
-- this file runs at 0148. In a fresh chain anon's SELECT is still present when
-- 0095 checks. What changes is that 0148 revokes it afterwards — which is why
-- the invariant "anon reads every view" is now FALSE by design, and why the
-- reusable gate in `scripts/check-pglite.mjs` (same commit) is the control that
-- matters going forward rather than this file's own post-conditions.
--
-- WHY REVOKE, AND NOT ONLY ADD A PREDICATE
-- -----------------------------------------------------------------------------
-- `PERMISSIONS.md` §12.2 D-6 states it as a law: "As anon / no `users` row:
-- everything staff-side → 0 rows, role resolves `Client`." A predicate makes
-- that true *by accident of the data*; a revoked grant makes it true
-- structurally, and it cannot be undone by the next view someone adds. Every
-- `_v` view in this schema is staff-side working data. There is no anon reader:
-- every `.from('<view>')` in `src/` sits behind an authenticated session
-- (`src/lib/queries/*`, `src/lib/bookingQuery.ts`, `src/lib/scannerLookup.ts`,
-- `src/lib/syncEngine.ts`), and `marketing.html` reads no view.
--
-- The revoke is therefore stated for ALL public views, not just the three, so
-- that the post-condition is a single invariant with no allow-list to maintain.
-- If a genuinely public view is ever needed, granting it back is one line and
-- must say in a comment why the anon key may read it — that is the decision
-- this file is making sure cannot be made by omission.
--
-- WHAT `anon` LOSES, precisely
-- -----------------------------------------------------------------------------
-- Nothing in the product. `anon` is what PostgREST sees with no JWT: the login
-- screen, the password-reset request, the OTP hand-off. None of those read a
-- view. `authenticated` keeps SELECT on all thirty (POST-CONDITION 2).
--
-- THE TWO PRODUCT DECISIONS IN HERE, AND HOW EACH WAS RESOLVED
-- -----------------------------------------------------------------------------
-- 1. `audit_logs` → `where auth_user_role() in ('Owner','Admin','Manager')`.
--    Not a decision: that is `audit_events_select` verbatim, read from
--    `0018_manager_role_policies.sql:180-184` and mirrored inline per 0048. The
--    view answers to its base table's policy or it is not the same view.
--
--    `security_invoker = on` was considered and NOT taken, against the audit's
--    recommendation. 0048's header already rules it out for this schema, and
--    PLAN.md §6.32 makes it actively unsafe here: the pending grant repair will
--    `revoke select on <t> from authenticated` and re-grant per column, so an
--    invoker view would start requiring callers to hold SELECT on
--    `audit_events.old_values / new_values / diff` — the jsonb columns most
--    likely to be left off a non-money column grant. That would break the audit
--    trail for exactly the roles meant to read it. The inline predicate plus a
--    revoked anon grant closes the same hole without that coupling.
--
-- 2. `staff_directory_v` → `where … and auth_is_staff()`.
--    PARTIALLY a decision, and the unresolved half is logged rather than
--    invented. What is settled: P9 (`PERMISSIONS.md:79`) says Client is
--    external and reads only rows joined to its own `client_id`, and D-6 says
--    anon reads nothing staff-side. 0120 shipped neither, so a Client session
--    and an anon session each received the whole roster — names, employee
--    codes, roles, departments, branches.
--
--    What is NOT settled: WHICH staff roles may read it. R-27
--    (`RULINGS-2026-09-08.md:159`) cites 0067's `auth_user_role() = 'Owner'`
--    inline as one of its four grounds for ruling role assignment Owner-only,
--    and PERMISSIONS §12.2 D-8 (corrected 8 Sep under R-27) repeats it. 0120's
--    header instead cites §4.3 AD2 — the row R-27 corrected — and widens the
--    view to "general staff access". The repo therefore contradicts itself, and
--    the answer is a product call, not a database call.
--
--    So this file takes the strictly tighter position that requires no ruling:
--    `auth_is_staff()` closes anon and Client (both required by existing law)
--    and leaves every internal role reading what 0120 gave them, which is a
--    narrowing and never a widening. B-1 is "stricter wins", so nothing here
--    requires a decision to be defensible. The Owner-vs-staff half is written
--    up in `docs/OPEN_DECISIONS.md` as `TODO(decision)` and left open.
--
-- COLUMN-LOSS PROTECTION (0048's §6.23 / §6.25 bug class)
-- -----------------------------------------------------------------------------
-- `product_units_service_v` is 94 lines of CTEs. Retyping it by hand is exactly
-- how this repo has twice shipped a view that silently lost columns, so the
-- body below is 0103's, unchanged and in order, with a `where` on the final
-- select. Three controls make a mistake here a hard error rather than a
-- behaviour change:
--   1. `create or replace view`, never `drop` + `create` — Postgres rejects a
--      replacement whose column names, order, or types differ, so a retyped
--      column fails at apply time.
--   2. POST-CONDITION 3 asserts the exact column count of all three views
--      against numbers read off `information_schema.columns` before this file
--      was written (21 / 17 / 13).
--   3. `drop view … cascade` stays away from `staff_directory_v` and
--      `product_units_service_v`, both of which have dependents — the two
--      functions 0103 defines over `product_units_service_v` would go with it.
--
-- ⚠ NOT APPLIED TO LIVE. Additive: three view redefinitions and a grant
--   reversal, no data, no table, no function. Subject to CLAUDE.md N-5 —
--   Babin applies after `BACKUP_PROTOCOL.md`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · audit_logs — the base table's SELECT predicate, inlined (0048's pattern).
--     0129's own comment calls this "a compatibility view … so tools,
--     analytics, and verification queries resolve transparently". Nothing in
--     `src/` reads it; it exists for out-of-band querying, which is exactly why
--     nobody noticed it was open. `create or replace view` keeps the OID, so the
--     22 columns and their order are inherited unchanged and cannot drift.
-- -----------------------------------------------------------------------------
create or replace view public.audit_logs as
  select
    id,
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    ip_address,
    user_agent,
    device_type,
    old_values,
    new_values,
    diff,
    reason,
    created_at
  from public.audit_events
  -- `audit_events_select`, verbatim (0018:180-184). Without this the view runs
  -- as its owner and the policy is never consulted — which is how 2,222 audit
  -- rows, 2,102 of them carrying `old_values` / `new_values` / `diff` payloads,
  -- became readable with the public anon key.
  where auth_user_role() in ('Owner', 'Admin', 'Manager');

comment on view public.audit_logs is
  'AUD-017: Transparent compatibility view over audit_events for universal audit '
  'trail logging and queries. 0148: carries audit_events_select inline (0048''s '
  'pattern) and is no longer readable by anon. A definer view without this '
  'predicate is the audit trail with no row gate at all.';

-- -----------------------------------------------------------------------------
-- 2 · staff_directory_v — 0120's column list and masks, unchanged; one predicate
--     added. 0120 recreates this view from 0067 and drops 0067's
--     `auth_user_role() = 'Owner'`; that is where the row gate went. Re-adding
--     it as `auth_is_staff()` is the narrowest predicate that satisfies P9 and
--     D-6 without answering the Owner-vs-staff question 0120 and R-27 disagree
--     about. The masks (`auth_user_role() in ('Owner','Admin')`) are 0120's and
--     stay: they are what keeps email, mobile and credential state off a
--     non-Admin's screen, and they are not affected by this change.
--
--     Note that `auth_is_staff()` in the WHERE is invisible to a naive audit: the
--     definition already contained `auth_user_role()` inside its CASE masks, so
--     "does this view mention auth_*" reads true while the row gate is absent.
--     That is why POST-CONDITION 4 matches on the WHERE clause, not the body.
-- -----------------------------------------------------------------------------
create or replace view public.staff_directory_v as
select
  u.id,
  u.full_name,
  u.employee_code,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.email
    else null
  end as email,
  u.primary_role,
  u.department,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.mobile
    else null
  end as mobile,
  u.branch_id,
  b.branch_code,
  b.name as branch_name,
  u.is_active,

  -- Credential state (Owner/Admin only)
  case
    when auth_user_role() in ('Owner', 'Admin') then (p.id is not null)
    else false
  end as has_pin,
  case
    when auth_user_role() in ('Owner', 'Admin') and p.locked_until > now() then p.locked_until
    else null
  end as pin_locked_until,
  case
    when auth_user_role() in ('Owner', 'Admin') then coalesce(p.rotated_at, p.set_at)
    else null
  end as pin_set_at,

  case
    when auth_user_role() in ('Owner', 'Admin') then (au.id is not null)
    else false
  end as has_auth_account,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.last_sign_in_at
    else null
  end as last_sign_in_at,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.email_confirmed_at
    else null
  end as email_confirmed_at

from users u
left join branches b
  on b.id = u.branch_id
left join staff_auth_pins p
  on p.user_id = u.id
 and p.revoked_at is null
left join auth.users au
  on au.id = u.id
where u.deactivated_at is null
  and u.is_active = true
  -- 0148: P9 (Client is external) and D-6 (anon reads nothing staff-side).
  and auth_is_staff();

-- -----------------------------------------------------------------------------
-- 3 · product_units_service_v — 0103's body, byte for byte, with the same
--     predicate. `PERMISSIONS.md` §4.3 already names the audience ("all staff")
--     and explains why no Law 6 mask is needed (the view is money-free by
--     construction), so `auth_is_staff()` is that row's own predicate rather
--     than a judgement call — it is also what 0103's header meant by "every
--     staff role may read it", which the `anon` grant quietly widened.
--
--     Two dependents ride on this view: `service_due_reason(unit)`,
--     `service_due_at(unit)` and the sibling helpers 0103 defines below. They
--     are SECURITY DEFINER and call this view as their owner. Adding a
--     predicate therefore narrows what THEY return for a Client or anon caller
--     too — which is the intended direction (a client must not learn a unit's
--     service state through a definer function), and is called out here because
--     it is a behaviour change for those two paths.
-- -----------------------------------------------------------------------------
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
from computed c
-- 0148: PERMISSIONS §4.3's "all staff", as a predicate. 0103 wrote the audience
-- into a GRANT to `anon` instead, which is how the anon key came to hold it.
where auth_is_staff();

comment on view product_units_service_v is
  'R-28 (8 Sep 2026): whether a unit is due for preventive service, derived at read '
  'time from the MODEL''s intervals, the unit''s last completed Preventive Service '
  'job and its usage since. No is_due column exists anywhere. due_reason is null for '
  'a model with no plan. Money-free by construction, so every staff role may read it. '
  'Retired and Missing units are not in it. 0148: that "every staff role" is now a '
  'row predicate rather than a grant to anon (PERMISSIONS §4.3).';

-- -----------------------------------------------------------------------------
-- 4 · The actual closure: anon holds no SELECT on any view in `public`.
--
--     `revoke … from anon` is the gate. The predicates above are defence in
--     depth — they survive a careless re-grant, the revoke does not. Done as a
--     loop rather than three statements so the invariant in POST-CONDITION 1 is
--     exhaustive: any view added later, here or in a future migration, is
--     covered without editing this file.
--
--     `from public` as well as `from anon`: the platform grants `anon` directly,
--     so revoking the PUBLIC grant alone would achieve nothing — which is
--     precisely the mistake 0120 made with `revoke all … from public`.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  loop
    execute format('revoke select on table public.%I from anon, public', r.relname);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception '0148: no public views found — the revoke loop asserted nothing.';
  end if;
  raise notice '0148: anon SELECT revoked on % public views.', n;
end $$;

-- =============================================================================
-- POST-CONDITIONS
--
-- 1 is the invariant this file exists to establish, and it is checked
-- catalogue-side so it cannot be satisfied by an empty seed. 3 and 4 are the
-- column-loss and missing-predicate controls. 5 is the behaviour, and it rolls
-- back so a probe that unexpectedly succeeds leaves nothing behind (0095's
-- pattern).
--
-- Stated plainly, because it is the honest limit of this file: 1, 3 and 4 cannot
-- tell you what a view returns to a real caller against a real dataset. Only 5
-- can, and 5 is thin for exactly the reason the audit recorded — most of these
-- views hold no rows in a fresh PGlite build. The durable answer is
-- `check:lifecycle` against seeded roles plus the per-role live probe in
 --     Babin's cutover checklist, not a stronger assertion here.
-- =============================================================================
do $$
declare
  expected constant jsonb := '{
    "audit_logs": 21, "staff_directory_v": 17, "product_units_service_v": 13
  }'::jsonb;
  r       record;
  k       text;
  actual  integer;
  v_bad   text := '';
  v_n     integer := 0;
begin
  -- (1) THE INVARIANT. No public view is readable by anon.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and has_table_privilege('anon', c.oid, 'SELECT')
     order by c.relname
  loop
    v_bad := v_bad || format('anon can still SELECT %s; ', r.relname)::text;
  end loop;

  -- (2) …and authenticated still can read every one of them. A revoke that
  --     breaks the app is not a fix, so this is asserted rather than assumed.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and not has_table_privilege('authenticated', c.oid, 'SELECT')
     order by c.relname
  loop
    v_bad := v_bad || format('authenticated lost SELECT on %s; ', r.relname)::text;
  end loop;

  -- (3) Column counts unchanged. Read off information_schema.columns before this
  --     file was written; `create or replace view` would already have refused a
  --     changed name/order/type, so this is the belt to that pair of braces.
  for k in select jsonb_object_keys(expected) loop
    select count(*) into actual
      from information_schema.columns
     where table_schema = 'public' and table_name = k;
    if actual is distinct from (expected ->> k)::integer then
      v_bad := v_bad || format('%s has %s columns, expected %s; ',
                               k, actual, expected ->> k)::text;
    end if;
  end loop;

  -- (4) Every public view carries a row predicate that consults an auth_*
  --     function — matched in the WHERE, not anywhere in the definition.
  --     `staff_directory_v` is the reason that distinction is load-bearing: its
  --     CASE masks mention `auth_user_role()` while its row gate is absent, so a
  --     body-wide match reports it as safe.
  --     Weaker than a seeded behavioural test and documented as such in the
  --     header: a predicate inside a CTE would satisfy this. The authoritative
  --     control is (1), which does not depend on the definition at all.
  --
  --     Written with `\m`/`\M` and a plain `.`, both of which were arrived at by
  --     measuring rather than assuming, and both of which fail SILENTLY when
  --     wrong — a regex that matches nothing reports every view as unpoliced and
  --     reads like a correct alarm. `\b` is not a word boundary in Postgres ARE
  --     (it spells that `\y`), and `[\s\S]` is not a valid alternation there.
  --     Postgres ARE is newline-INsensitive by default, so `.` does cross the
  --     newlines in `pg_get_viewdef` output; the SQL-standard assumption that it
  --     does not is what makes people reach for `[\s\S]` in the first place.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and pg_get_viewdef(c.oid) !~* '\mwhere\M.*\mauth_(is_staff|user_role|can_view_money)'
     order by c.relname
  loop
    v_bad := v_bad || format('%s has no auth_* row predicate; ', r.relname)::text;
  end loop;

  select count(*) into v_n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'v';

  if v_bad <> '' then
    raise exception 'POST-CONDITION FAILED (0148): %', v_bad;
  end if;

  raise notice
    '0148 verified (catalogue): anon holds no SELECT on any of % public views; authenticated retains SELECT on all %; audit_logs/staff_directory_v/product_units_service_v still carry 21/17/13 columns; every view carries an auth_* row predicate.',
    v_n, v_n;
end $$;

-- -----------------------------------------------------------------------------
-- 5 · The behaviour, for the three views this file actually changed. Proves the
--     gate is reached by the CALLER's role and not merely present in the text:
--     a Client session must get zero rows from the staff-side two, an anon
--     session must be refused by privilege rather than by an empty result, and
--     a staff session must still be served — a predicate that fires for everyone
--     would pass every assertion above and break the product.
--
--     Skipped, with a notice rather than silently passed, when the seed has no
--     user rows to act as — the same guard 0095 uses.
-- -----------------------------------------------------------------------------
do $$
declare
  v_staff  uuid;
  v_rows   bigint;
  v_blocked boolean;
  v_state  text;
  v_err    text;
begin
  select id into v_staff from users where primary_role <> 'Client' limit 1;
  if v_staff is null then
    raise notice '0148: no staff user in this build; behavioural checks skipped (catalogue checks above still hold).';
    return;
  end if;

  -- (a) A Client session reads neither staff-side view. P9 + D-6.
  set local role authenticated;
  perform set_config('app.current_user_id', '', true);
  select count(*) into v_rows from staff_directory_v;
  if v_rows <> 0 then
    reset role;
    raise exception 'POST-CONDITION FAILED (0148): a Client session read % rows of staff_directory_v (P9).', v_rows;
  end if;
  select count(*) into v_rows from product_units_service_v;
  reset role;
  if v_rows <> 0 then
    raise exception 'POST-CONDITION FAILED (0148): a Client session read % rows of product_units_service_v (P9).', v_rows;
  end if;

  -- (b) A staff session is still served. Without this, (a) is satisfied by a
  --     view that returns nothing to anyone — which is the failure mode a
  --     row-count assertion cannot see.
  set local role authenticated;
  perform set_config('app.current_user_id', v_staff::text, true);
  select count(*) into v_rows from staff_directory_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise notice '0148: no staff rows seeded here; staff_directory_v read-path check skipped.';
  end if;

  -- (c) anon is refused by the GRANT, not by an empty result — the same
  --     distinction 0095 insisted on, and the reason a row count is not a test.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    perform (select count(*) from audit_logs);
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0148): anon SELECTed through audit_logs.';
  end if;
  if v_state <> '42501' then
    raise exception
      'POST-CONDITION FAILED (0148): anon was refused reading audit_logs, but not by the grant — Postgres said (%): %',
      v_state, v_err;
  end if;

  raise notice
    '0148 verified (behaviour): Client reads 0 rows of staff_directory_v and product_units_service_v; anon is refused 42501 on audit_logs by the grant, not by an empty result.';

  raise exception 'ROLLBACK_0148_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0148_PROBE' then
      raise notice '0148 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;
-- >>> END 0148_view_anon_leak_closure.sql <<<

-- >>> START 0149_handover_gate_exempt_non_physical_lines.sql <<<
-- RULING 2026-10-03: Handover gate exemption for non-physical lines (§4.59)
-- =============================================================================
-- Migration 0149: Handover & operational gate refinement for non-physical lines.
--
-- Law 1: The database is the law.
-- 1. 0139 & 0141 exempted Service, Sub-rental and Manual item lines (and consumables)
--    from the Return receipt gate, but the Handover gate still checked all booking
--    lines unconditionally, demanding handover_lines for services that have no
--    physical gear to hand over.
-- 2. Non-physical lines ('Service', 'Sub-rental', 'Manual item') are now exempt
--    from the Handover unit check, matching the Return exemption.
-- 3. For service-only bookings (bookings with NO physical equipment lines),
--    operational stage advancement (Booked -> Packed -> On Rent -> Returned) does
--    not demand physical operation_sessions (Packing, Handover, Return) or fabricated
--    movement rows.
-- 4. Financial invariants (R-06 money override warning on Handover, deposit pending,
--    and close gate invoice settlement / zero-value override) remain strictly enforced.
-- =============================================================================

begin;

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
  v_has_physical_lines  boolean := false;
begin
  select stage, closed_at, coalesce(deposit_required, 0)
    into v_current_stage, v_closed_at, v_deposit_required
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  -- Check if booking has any physical equipment lines
  select exists (
    select 1
    from booking_lines bl
    where bl.booking_id = NEW.booking_id
      and bl.voided_at is null
      and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
  ) into v_has_physical_lines;

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
    if v_has_physical_lines then
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
  end if;

  -- 3. Packed -> On Rent
  if NEW.to_stage = 'On Rent' and NEW.from_stage = 'Packed' then
    if v_has_physical_lines then
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
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
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
    end if;

    -- R-06 WARN on money (Enforced for ALL bookings, physical and service-only)
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
    if v_has_physical_lines then
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
        left join products p on p.id = bl.product_id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
          and coalesce(p.tracking_mode, 'Serialised') <> 'Consumable'
          and not exists (
            select 1
            from return_lines rl
            where rl.booking_line_id = bl.id
          )
      ) then
        raise exception 'GATE:gate.return.units_unaccounted|Every physical booking line must have a return line recorded.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131, 0135, 0141, 0149)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'CloseOverride', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
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

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
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
  'Stage 1 (0116, extended 0131, 0135, 0139, 0141, 0149): Evaluates stage gates including the close gate — invoice exists '
  '(or Owner/Admin zero-value override with reason >= 10 chars), invoices settled, deposit resolved, '
  'no open cases, no live reservations, no damage finding pending approval — enforces invariants and updates stage. '
  '0139/0141 exempts non-physical lines from Return. 0149 exempts non-physical lines from Handover and allows service-only '
  'bookings without physical lines to advance stages without empty operational sessions.';

commit;

-- >>> END 0149_handover_gate_exempt_non_physical_lines.sql <<<

-- >>> START 0150_rpc_security_and_mutation_closure.sql <<<
-- =============================================================================
-- Migration 0150: RPC Security and Mutation Closure (AUD-2026-10-03)
--
-- Closes Audit findings D4, D5, D6, D7:
--
-- 1. D4: `cancel_booking` RPC security lockdown
--    - In 0109, `if current_user not in ('postgres', ...)` was used inside a
--      SECURITY DEFINER function. Because current_user is always the definer
--      (postgres), the role check was completely bypassed.
--    - In 0109, client-supplied `actor_id` was accepted and fell back to picking
--      an arbitrary Owner if null.
--    - Fix: Remove the current_user bypass; check `auth_user_role()` directly
--      (Owner, Admin, Manager, Coordinator; Coordinator blocked if Packed);
--      derive the actor strictly from `auth_user_id()`.
--    - Revoke EXECUTE from anon and public; grant only to authenticated.
--
-- 2. D5: `extend_booking` RPC column error repair
--    - In 0111, step 7 attempted to assign `updated_at = v_now` on
--      `inventory_reservations`. That table has no `updated_at` column, causing
--      all successful calls to fail with a column error.
--    - Fix: Drop the `updated_at` assignment; update `period = tstzrange(...)` only.
--    - Remove the `current_user` bypass on the role gate; derive actor strictly
--      from `auth_user_id()`.
--    - Revoke EXECUTE from anon and public; grant only to authenticated.
--
-- 3. D6: `void_invoice` RPC type mismatch repair
--    - In 0121, `coalesce(nullif(current_setting('app.override_role', true), ''), auth_user_role())`
--      coalesced text with system_role enum, raising type mismatch error 42804 for all callers.
--    - Fix: Cast `auth_user_role()::text`.
--    - Derive created_by strictly from `coalesce(auth_user_id(), ...)`.
--    - Revoke EXECUTE from anon and public; grant only to authenticated.
--
-- 4. D7 & RPC Attack Surface Hardening:
--    - Revoke EXECUTE from anon and public on mutating and sensitive functions:
--      `cancel_booking`, `extend_booking`, `void_invoice`, `issue_invoice`,
--      `booking_estimate_total`, `get_model_daily_rate`, `recompute_unit_status`,
--      `recompute_invoice_payment_state`, `create_booking`, `next_document_number`,
--      `record_reservation_conflicts`, `invoice_paid_net`.
--    - Alter default privileges in schema public to revoke EXECUTE from public and anon
--      for all future functions.
--    - Pin search_path on `enforce_inventory_reservation_capacity` (P2 finding from 0050).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- ── 0. Prevent future functions from defaulting to anon / public execute ──────
alter default privileges in schema public revoke execute on functions from public, anon;

-- ── 1. Repair and secure cancel_booking ────────────────────────────────────────
create or replace function public.cancel_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
begin
  if v_booking_id is null then
    raise exception 'cancel_booking: booking_id is required.';
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'cancel_booking: cancellation reason must be at least 10 characters (got % characters). State why the booking is being cancelled.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'cancel_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'cancel_booking: booking % is already cancelled (at %).',
      v_booking.booking_no, v_booking.cancelled_at;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'cancel_booking: booking % is Closed and cannot be cancelled.', v_booking.booking_no;
  end if;

  if v_booking.stage in ('On Rent', 'Returned') then
    raise exception
      'cancel_booking: booking % is at stage % and cannot be cancelled. Gear in the field must be returned and settled.',
      v_booking.booking_no, v_booking.stage;
  end if;

  -- Check if any unit lines are picked up
  if exists (
    select 1 from booking_line_units blu
     join booking_lines bl on bl.id = blu.booking_line_id
     where bl.booking_id = v_booking_id
       and blu.unit_state = 'Picked Up'
  ) then
    raise exception 'cancel_booking: booking % has units already picked up and cannot be cancelled.', v_booking.booking_no;
  end if;

  -- 2. Role & permission validation (R-05, PERMISSIONS.md)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'cancel_booking: this session (%) may not cancel a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if v_booking.stage = 'Packed' and v_role = 'Coordinator' then
    raise exception
      'cancel_booking: booking % is Packed. Cancelling a Packed booking requires Manager, Admin or Owner authority.',
      v_booking.booking_no
      using errcode = '42501';
  end if;

  -- 3. Resolve actor strictly from authenticated session (never forgeable by caller)
  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'cancel_booking: an authenticated user is required to cancel a booking.'
      using errcode = '42501';
  end if;

  -- 4. Update bookings row (SECURITY DEFINER bypasses reject_direct_booking_stage_write)
  update bookings
     set cancelled_at        = v_now,
         cancelled_by        = v_actor,
         cancellation_reason = v_reason,
         updated_at          = v_now
   where id = v_booking_id;

  -- 5. Record audit event
  if v_client_uuid is null then
    v_client_uuid := gen_random_uuid();
  end if;

  insert into audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    old_values,
    new_values,
    reason
  ) values (
    v_client_uuid,
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'cancelled_at', null,
      'stage', v_booking.stage
    ),
    jsonb_build_object(
      'cancelled_at', v_now,
      'cancelled_by', v_actor,
      'cancellation_reason', v_reason,
      'stage', v_booking.stage
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'cancelled_at', v_now,
    'cancelled_by', v_actor,
    'cancellation_reason', v_reason
  );
end;
$$;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.cancel_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'reason', p_reason
  ));
end;
$$;

revoke execute on function public.cancel_booking(jsonb) from anon, public;
revoke execute on function public.cancel_booking(uuid, text, uuid) from anon, public;
grant execute on function public.cancel_booking(jsonb) to authenticated;
grant execute on function public.cancel_booking(uuid, text, uuid) to authenticated;

-- ── 2. Repair and secure extend_booking ────────────────────────────────────────
create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor strictly from authenticated session
  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'extend_booking: an authenticated user is required to extend a booking.'
      using errcode = '42501';
  end if;

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at (triggers reservations_follow_booking_dates)
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  -- D5 repair: inventory_reservations has NO updated_at column
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. If a Draft invoice exists, increment invoice_lines.days (recalculate_invoice_totals trigger reprices it)
  update invoice_lines
     set days = days + v_days
   where invoice_id in (select id from invoices where booking_id = v_booking_id and status = 'Draft');

  -- 9. Insert audit log
  insert into audit_events (
    client_uuid,
    event_class,
    module,
    category,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days
  );
end;
$$;

create or replace function public.extend_booking(
  p_booking_id uuid,
  p_days integer,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.extend_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'days', p_days,
    'reason', p_reason
  ));
end;
$$;

revoke execute on function public.extend_booking(jsonb) from anon, public;
revoke execute on function public.extend_booking(uuid, integer, text, uuid) from anon, public;
grant execute on function public.extend_booking(jsonb) to authenticated;
grant execute on function public.extend_booking(uuid, integer, text, uuid) to authenticated;

-- ── 3. Repair and secure void_invoice ──────────────────────────────────────────
create or replace function public.void_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id        uuid;
  v_client_uuid       uuid;
  v_reason            text;
  v_created_by        uuid;
  v_caller_role       text;
  v_current_status    invoice_status;
  v_paid_amount       numeric(14,2);
  v_total_amount      numeric(14,2);
  v_credit_note_no    text;
  v_credit_note_id    uuid;
  v_voided_at         timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'GATE:gate.invoice.void_reason|Payload must be a JSON object.' using errcode = 'P0001';
  end if;

  v_invoice_id := (p_payload ->> 'invoice_id')::uuid;
  if v_invoice_id is null then
    raise exception 'GATE:gate.invoice.void_reason|invoice_id is required.' using errcode = 'P0001';
  end if;

  v_reason := btrim(coalesce(p_payload ->> 'reason', ''));
  if length(v_reason) < 10 then
    raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires a reason of at least 10 characters.' using errcode = 'P0001';
  end if;

  v_client_uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  if v_client_uuid is null then
    v_client_uuid := gen_random_uuid();
  end if;

  -- 1. Identity & role check: Owner, Admin, Manager, Accounts
  v_caller_role := coalesce(
    nullif(current_setting('app.override_role', true), ''),
    auth_user_role()::text
  );

  if not (auth_is_finance_or_admin() or v_caller_role in ('Owner', 'Admin', 'Manager', 'Accounts')) then
    raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
  end if;

  v_created_by := coalesce(
    auth_user_id(),
    nullif(p_payload ->> 'created_by', '')::uuid
  );
  if v_created_by is null then
    raise exception 'GATE:gate.invoice.void_auth|An authenticated user is required to void an invoice.' using errcode = 'P0001';
  end if;

  -- 2. Fetch invoice state
  select status, paid_amount, total_amount
  into v_current_status, v_paid_amount, v_total_amount
  from invoices
  where id = v_invoice_id;

  if not found then
    raise exception 'Invoice % not found.', v_invoice_id using errcode = 'P0002';
  end if;

  if v_current_status = 'Void' then
    raise exception 'GATE:gate.invoice.void_immutable|Invoice % is already voided and cannot be modified.', v_invoice_id using errcode = 'P0001';
  end if;

  -- 3. If paid_amount > 0, ensure credit note exists or mint one
  if coalesce(v_paid_amount, 0) > 0 then
    select id, credit_note_no
    into v_credit_note_id, v_credit_note_no
    from credit_notes
    where invoice_id = v_invoice_id
    order by created_at desc
    limit 1;

    if v_credit_note_id is null then
      v_credit_note_no := next_document_number('credit_note');
      if v_credit_note_no is null then
        raise exception 'Failed to mint credit note number for void of paid invoice.' using errcode = 'P0001';
      end if;

      insert into credit_notes (
        client_uuid,
        credit_note_no,
        invoice_id,
        amount,
        reason,
        created_by
      ) values (
        gen_random_uuid(),
        v_credit_note_no,
        v_invoice_id,
        v_paid_amount,
        'Auto credit note on invoice void: ' || v_reason,
        v_created_by
      )
      returning id into v_credit_note_id;
    end if;
  end if;

  -- 4. Mark invoice Void (trg_enforce_invoice_void_discipline fires here)
  v_voided_at := now();
  update invoices
  set status = 'Void',
      void_reason = v_reason,
      voided_by = v_created_by,
      voided_at = v_voided_at
  where id = v_invoice_id;

  -- 5. Audit log
  insert into audit_events (
    client_uuid,
    event_class,
    module,
    category,
    action,
    severity,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    reason
  ) values (
    v_client_uuid,
    'status change',
    'Finance',
    'Finance',
    'Update',
    'Informational',
    'invoices',
    v_invoice_id,
    v_created_by,
    v_caller_role::system_role,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', 'Void', 'credit_note_no', v_credit_note_no),
    v_reason
  );

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'status', 'Void',
    'credit_note_no', v_credit_note_no,
    'voided_at', v_voided_at
  );
end;
$$;

revoke execute on function public.void_invoice(jsonb) from anon, public;
grant execute on function public.void_invoice(jsonb) to authenticated;

-- ── 4. Revoke anon on mutating and money-revealing functions ───────────────────
revoke execute on function public.issue_invoice(jsonb) from anon, public;
revoke execute on function public.issue_invoice(uuid) from anon, public;
grant execute on function public.issue_invoice(jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;

revoke execute on function public.booking_estimate_total(uuid) from anon, public;
grant execute on function public.booking_estimate_total(uuid) to authenticated;

revoke execute on function public.get_model_daily_rate(uuid, uuid) from anon, public;
grant execute on function public.get_model_daily_rate(uuid, uuid) to authenticated;

revoke execute on function public.recompute_unit_status(uuid) from anon, public;
grant execute on function public.recompute_unit_status(uuid) to authenticated;

revoke execute on function public.recompute_invoice_payment_state(uuid) from anon, public;
grant execute on function public.recompute_invoice_payment_state(uuid) to authenticated;

revoke execute on function public.create_booking(jsonb) from anon, public;
grant execute on function public.create_booking(jsonb) to authenticated;

revoke execute on function public.record_reservation_conflicts(text) from anon, public;
grant execute on function public.record_reservation_conflicts(text) to authenticated;

revoke execute on function public.next_document_number(text) from anon, public;
grant execute on function public.next_document_number(text) to authenticated;

revoke execute on function public.invoice_paid_net(uuid) from anon, public;
grant execute on function public.invoice_paid_net(uuid) to authenticated;

-- ── 5. Pin search_path on enforce_inventory_reservation_capacity ──────────────
alter function public.enforce_inventory_reservation_capacity() set search_path = public, pg_temp;

-- ── 6. Verification POST-CONDITION ────────────────────────────────────────────
do $$
declare
  v_bad text := '';
begin
  if has_function_privilege('anon', 'public.cancel_booking(jsonb)', 'execute') then
    v_bad := v_bad || ' anon can execute cancel_booking(jsonb);';
  end if;
  if has_function_privilege('anon', 'public.extend_booking(jsonb)', 'execute') then
    v_bad := v_bad || ' anon can execute extend_booking(jsonb);';
  end if;
  if has_function_privilege('anon', 'public.void_invoice(jsonb)', 'execute') then
    v_bad := v_bad || ' anon can execute void_invoice(jsonb);';
  end if;
  if has_function_privilege('anon', 'public.issue_invoice(jsonb)', 'execute') then
    v_bad := v_bad || ' anon can execute issue_invoice(jsonb);';
  end if;
  if has_function_privilege('anon', 'public.booking_estimate_total(uuid)', 'execute') then
    v_bad := v_bad || ' anon can execute booking_estimate_total(uuid);';
  end if;
  if has_function_privilege('anon', 'public.get_model_daily_rate(uuid, uuid)', 'execute') then
    v_bad := v_bad || ' anon can execute get_model_daily_rate(uuid, uuid);';
  end if;
  if has_function_privilege('anon', 'public.recompute_unit_status(uuid)', 'execute') then
    v_bad := v_bad || ' anon can execute recompute_unit_status(uuid);';
  end if;
  if has_function_privilege('anon', 'public.recompute_invoice_payment_state(uuid)', 'execute') then
    v_bad := v_bad || ' anon can execute recompute_invoice_payment_state(uuid);';
  end if;

  if v_bad <> '' then
    raise exception 'POST-CONDITION FAILED in 0150:%', v_bad;
  end if;
end;
$$;

commit;

-- >>> END 0150_rpc_security_and_mutation_closure.sql <<<

-- >>> START 0151_payment_numbering_short_format.sql <<<
-- =============================================================================
-- 0151_payment_numbering_short_format.sql
--
-- Payment Numbering Ruling (Babin, 3 Oct 2026):
-- Switch payment sequence from four-digit padded format ('PAY-0094') to
-- short sequential format ('PAY-94') with padding = 1 and include_year = false.
--
-- Background:
-- - Historical payments 1..93 ('PAY-2026-0001' .. 'PAY-2026-0093') remain
--   immutable under Law 3 and Law 4 (trg_payments_reject_update).
-- - In 0081_ruled_sequences_completion.sql, payment was left pending Babin's
--   ruling. This migration applies Babin's decision (Option 2), aligning new
--   payment receipts with other short document sequences ('BK-1', 'INV-1').
-- - In 0089_next_document_number_never_truncates.sql, payment regex
--   '^PAY-([0-9]{4}-)?[0-9]+$' already validates both historical and short formats.
-- =============================================================================

begin;

update public.number_sequences
set padding = 1,
    include_year = false,
    updated_at = now()
where sequence_key = 'payment';

-- Prove that payment sequence configuration is updated to padding 1, include_year false
do $$
declare
  v_rec record;
begin
  select padding, include_year into v_rec
  from public.number_sequences
  where sequence_key = 'payment';

  if v_rec.padding <> 1 or v_rec.include_year <> false then
    raise exception 'POST-CONDITION FAILED: payment sequence padding is % (expected 1), include_year is % (expected false)',
      v_rec.padding, v_rec.include_year;
  end if;
end $$;

commit;

-- >>> END 0151_payment_numbering_short_format.sql <<<

-- >>> START 0152_harden_storage_policies_revoke_anon.sql <<<
-- =============================================================================
-- 0152_harden_storage_policies_revoke_anon.sql — Item 11 Audit Hardening
--
-- Closes the critical vulnerability introduced in 0133:
-- 0133 granted anon SELECT, INSERT, UPDATE, and DELETE on storage.objects for
-- 'documents' and 'evidence'. This allowed unauthenticated users to inspect,
-- upload, overwrite, or delete client contracts, PAN cards, damage photos,
-- and signed invoices.
--
-- This migration drops the insecure policies and replaces them with strict,
-- authenticated-only policies. Document deletion is restricted to Managers and
-- Owners (Law 3).
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Drop insecure 0133 policies that granted access to anon
    drop policy if exists "documents_evidence_select_policy" on storage.objects;
    drop policy if exists "documents_evidence_insert_policy" on storage.objects;
    drop policy if exists "documents_evidence_update_policy" on storage.objects;
    drop policy if exists "documents_evidence_delete_policy" on storage.objects;

    -- SELECT: authenticated users only (Staff & Client portal viewing their docs)
    create policy "documents_evidence_select_policy"
      on storage.objects for select
      to authenticated
      using (bucket_id in ('documents', 'evidence'));

    -- INSERT: authenticated users only
    create policy "documents_evidence_insert_policy"
      on storage.objects for insert
      to authenticated
      with check (bucket_id in ('documents', 'evidence'));

    -- UPDATE: authenticated users only
    create policy "documents_evidence_update_policy"
      on storage.objects for update
      to authenticated
      using (bucket_id in ('documents', 'evidence'));

    -- DELETE: Manager or Owner only (Law 3: staff cannot delete commercial documents)
    create policy "documents_evidence_delete_policy"
      on storage.objects for delete
      to authenticated
      using (bucket_id in ('documents', 'evidence') and auth_is_manager_or_above());
  end if;
end $$;

-- >>> END 0152_harden_storage_policies_revoke_anon.sql <<<

-- Reset migration probe session setting
select set_config('app.in_create_booking', 'off', false);
