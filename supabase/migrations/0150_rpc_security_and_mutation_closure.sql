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
