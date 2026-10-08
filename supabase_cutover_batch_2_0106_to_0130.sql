-- ====================================================================
-- Babin Rentals OS — Cutover Batch: supabase_cutover_batch_2_0106_to_0130.sql
-- Scope: Migrations 106 to 130
-- Purpose: Closure gates, payment ceilings, server-side pricing, inspections, performance indexes
-- Paste into Supabase SQL Editor and click RUN
-- ====================================================================

-- Ensure migration probes and seed operations can insert lines under 0119 money guard
select set_config('app.in_create_booking', 'on', false);

-- >>> START 0106_close_gate_requires_invoice.sql <<<
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

-- >>> END 0106_close_gate_requires_invoice.sql <<<

-- >>> START 0107_payments_validation_guards.sql <<<
-- =============================================================================
-- Migration 0107: Payment validation guards (L9, Stage 1)
--
-- Postgres enforces that:
-- 1. Payments cannot overpay an invoice (amount cannot exceed invoice's
--    outstanding_amount for Advance Payments).
-- 2. Payments cannot be posted against another client's booking or invoice
--    (payments.client_id must match bookings.client_id and invoices.client_id).
-- 3. If invoice_id is present, it must belong to the booking named.
-- 4. Payments cannot be posted to a Void invoice.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function validate_payment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_booking_client_id  uuid;
  v_invoice_client_id  uuid;
  v_invoice_booking_id uuid;
  v_invoice_status     invoice_status;
  v_outstanding        numeric(14,2);
begin
  -- 1. Validate booking exists and client_id matches booking.client_id
  select client_id into v_booking_client_id
  from bookings
  where id = NEW.booking_id;

  if v_booking_client_id is null then
    raise exception 'Payment rejected: booking % does not exist.', NEW.booking_id;
  end if;

  if NEW.client_id <> v_booking_client_id then
    raise exception 'Payment rejected: client % does not match booking client %.', NEW.client_id, v_booking_client_id;
  end if;

  -- 2. If invoice_id is provided, validate invoice consistency and outstanding amount
  if NEW.invoice_id is not null then
    select client_id, booking_id, status, outstanding_amount
      into v_invoice_client_id, v_invoice_booking_id, v_invoice_status, v_outstanding
    from invoices
    where id = NEW.invoice_id;

    if v_invoice_client_id is null then
      raise exception 'Payment rejected: invoice % does not exist.', NEW.invoice_id;
    end if;

    if v_invoice_booking_id <> NEW.booking_id then
      raise exception 'Payment rejected: invoice % belongs to booking %, not %.',
        NEW.invoice_id, v_invoice_booking_id, NEW.booking_id;
    end if;

    if v_invoice_client_id <> NEW.client_id then
      raise exception 'Payment rejected: invoice % belongs to client %, not %.',
        NEW.invoice_id, v_invoice_client_id, NEW.client_id;
    end if;

    if v_invoice_status = 'Void' then
      raise exception 'Payment rejected: invoice % is void.', NEW.invoice_id;
    end if;

    if NEW.payment_type = 'Advance Payment' and NEW.amount > v_outstanding then
      raise exception 'Payment rejected: payment amount % exceeds invoice outstanding amount %.',
        NEW.amount, v_outstanding;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validate_payment on payments;
create trigger trg_validate_payment
  before insert on payments
  for each row
  execute function validate_payment();

commit;

-- >>> END 0107_payments_validation_guards.sql <<<

-- >>> START 0108_issue_invoice_rpc.sql <<<
-- =============================================================================
-- Migration 0108: `issue_invoice(jsonb)` and `issue_invoice(uuid)` RPC (Stage 1)
--
-- Closes MONEY-06:
-- - Issues an invoice in Draft status with at least one line.
-- - Checks permissions: Owner, Admin, Manager, Accounts (R-05), and auth_can_view_money().
-- - Mints unique invoice_no using next_document_number('invoice') (R-15).
-- - Sets issue_date (defaults to current_date) and calculates due_date based on
--   client payment terms.
-- - Sets status: 'Paid' if outstanding is 0 and total > 0, 'Partially Paid' if paid > 0,
--   or 'Sent'.
-- - Once issued, figures become immutable under reject_invoice_edit_after_issue().
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function public.issue_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id   uuid    := (p_payload ->> 'invoice_id')::uuid;
  v_actor        uuid    := nullif(coalesce(p_payload ->> 'issued_by', p_payload ->> 'actor_id', ''), '')::uuid;
  v_issue_date   date    := nullif(coalesce(p_payload ->> 'issue_date', ''), '')::date;
  v_role         system_role;
  v_invoice      invoices%rowtype;
  v_line_count   integer := 0;
  v_invoice_no   text;
  v_terms        text;
  v_term_days    integer := 0;
  v_due_date     date;
  v_new_status   invoice_status;
begin
  -- 1. Role & authorization checks (R-05)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'issue_invoice: this session (%) may not issue an invoice. R-05 gives that to Owner, Admin, Manager and Accounts.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'issue_invoice: this session cannot read money (Law 6), so it cannot issue an invoice.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'issue_invoice: invoice_id is required.';
  end if;

  -- 2. Verify invoice existence and eligibility
  select * into v_invoice from invoices where id = v_invoice_id;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception
      'issue_invoice: invoice % is already issued (status %, invoice_no %). Only a Draft can be issued.',
      v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
  if v_line_count = 0 then
    raise exception 'issue_invoice: invoice % has no lines. An empty invoice cannot be issued.', v_invoice_id;
  end if;

  -- 3. Mint invoice number (R-15)
  v_invoice_no := next_document_number('invoice');
  if v_invoice_no is null then
    raise exception 'issue_invoice: next_document_number failed to mint an invoice number.';
  end if;

  -- 4. Date calculation
  v_issue_date := coalesce(v_issue_date, current_date);

  select payment_terms::text into v_terms from clients where id = v_invoice.client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := v_issue_date + v_term_days;

  -- 5. Determine status
  if v_invoice.outstanding_amount = 0 and v_invoice.total_amount > 0 then
    v_new_status := 'Paid'::invoice_status;
  elsif v_invoice.paid_amount > 0 then
    v_new_status := 'Partially Paid'::invoice_status;
  else
    v_new_status := 'Sent'::invoice_status;
  end if;

  -- 6. Update the invoice row
  update invoices
     set invoice_no = v_invoice_no,
         issue_date = v_issue_date,
         due_date   = coalesce(v_due_date, due_date),
         status     = v_new_status,
         updated_at = now(),
         updated_by = coalesce(v_actor, v_invoice.updated_by)
   where id = v_invoice_id;

  -- 7. Read back updated invoice
  select * into v_invoice from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',         v_invoice.id,
    'invoice_no',         v_invoice.invoice_no,
    'status',             v_invoice.status,
    'issue_date',         v_invoice.issue_date,
    'due_date',           v_invoice.due_date,
    'booking_id',         v_invoice.booking_id,
    'client_id',          v_invoice.client_id,
    'line_count',         v_line_count,
    'subtotal',           v_invoice.subtotal,
    'discount_amount',    v_invoice.discount_amount,
    'taxable_amount',     v_invoice.taxable_amount,
    'vat_amount',         v_invoice.vat_amount,
    'total_amount',       v_invoice.total_amount,
    'paid_amount',        v_invoice.paid_amount,
    'outstanding_amount', v_invoice.outstanding_amount
  );
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return issue_invoice(jsonb_build_object('invoice_id', p_invoice_id));
end;
$$;

comment on function public.issue_invoice(jsonb) is
  'Issues a Draft invoice: mints invoice_no via next_document_number(''invoice'') (R-15), '
  'sets issue_date, derives due_date from client terms, sets status (Sent/Paid), and locks figures '
  'under reject_invoice_edit_after_issue(). R-05 role check enforced.';

comment on function public.issue_invoice(uuid) is
  'Convenience overload of issue_invoice(jsonb).';

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

commit;

-- >>> END 0108_issue_invoice_rpc.sql <<<

-- >>> START 0109_cancel_booking_rpc.sql <<<
-- =============================================================================
-- Migration 0109: `cancel_booking` RPC (Stage 1)
--
-- Closes the cancellation write seam:
-- - In 0094:159-171, cancelled_at / cancelled_by / cancellation_reason were
--   locked down against direct table UPDATE by authenticated users, requiring a
--   SECURITY DEFINER writer.
-- - In 0100:344-380, trg_reservations_released_on_cancellation was armed to
--   automatically release all active holds when bookings.cancelled_at is set.
-- - PERMISSIONS.md:
--   - Before Packed (Quote, Reserved): Coordinator, Manager, Admin, Owner (C+).
--   - Packed: Manager, Admin, Owner (M+).
--   - On Rent, Returned, Closed: Cannot be cancelled (gear is in field or settled).
-- - Reason must be >= 10 non-whitespace characters.
-- - Inserts immutable audit_events record.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function public.cancel_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'cancelled_by', ''), '')::uuid;
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

  -- 2. Role & permission validation
  v_role := auth_user_role();
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
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
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager')
     order by created_at
     limit 1;
  end if;
  if v_actor is null then
    raise exception 'cancel_booking: an actor ID is required to cancel a booking.';
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
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.cancel_booking(jsonb) to authenticated;
grant execute on function public.cancel_booking(uuid, text, uuid) to authenticated;

comment on function public.cancel_booking(jsonb) is
  'Cancels a booking (Quote, Reserved, Packed). Checks role permissions (C+ before Packed, M+ for Packed), '
  'refuses if On Rent/Returned/Closed or units picked up, requires reason >= 10 chars, updates bookings, '
  'triggers inventory_reservations release via trg_reservations_released_on_cancellation, and logs audit_events.';

commit;

-- >>> END 0109_cancel_booking_rpc.sql <<<

-- >>> START 0110_client_own_rows_rls.sql <<<
-- =============================================================================
-- Migration 0110: `client own rows` RLS policies (Stage 1 - 9th DB Gate)
--
-- Closes the 9th DB Enforcement gate:
-- - In 0020, clients_select, bookings_select and booking_lines_select were restricted
--   to auth_is_staff(), completely locking out non-staff / Client roles from seeing
--   even their own records.
-- - This migration defines auth_client_id() to resolve the acting user's client binding
--   (from portal_users or linked client account).
-- - Scopes SELECT policies on clients, bookings, and booking_lines: staff continue
--   to see all operational rows, while a Client role sees ONLY their own rows and is
--   denied access to other clients' rows.
-- - Money tables (invoices, payments, security_deposits) remain masked from money-blind
--   roles (Warehouse, Technician, Driver, Client) under Law 6 (0011/0014/0038/0062).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- 1. Helper function to resolve the acting client's ID
create or replace function public.auth_client_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.client_id
    from portal_users p
   where (p.auth_user_id = auth_user_id() or p.id = auth_user_id())
     and p.status = 'Active'
     and p.deactivated_at is null
  union all
  select p.client_id
    from portal_users p
    join users u on u.id = auth_user_id() and lower(btrim(u.email)) = lower(btrim(p.email))
   where p.status = 'Active'
     and p.deactivated_at is null
  union all
  select c.id
    from clients c
    join users u on u.id = auth_user_id() and lower(btrim(u.email)) = lower(btrim(c.email))
   where c.deactivated_at is null
  limit 1;
$$;

comment on function public.auth_client_id() is
  'Resolves the clients.id uuid bound to the current auth identity (via portal_users or linked email). '
  'Returns null for unauthenticated users, unbound users, or internal staff without an attached client.';

grant execute on function public.auth_client_id() to authenticated;

-- 2. clients_select: staff read all; clients read own row only
drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select
  using (
    auth_is_staff()
    or id = auth_client_id()
  );

-- 3. bookings_select: staff read all; clients read own bookings only
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select
  using (
    auth_is_staff()
    or client_id = auth_client_id()
  );

-- 4. booking_lines_select: staff read all; clients read lines for own bookings only
drop policy if exists booking_lines_select on booking_lines;
create policy booking_lines_select on booking_lines
  for select
  using (
    auth_is_staff()
    or exists (
      select 1 from bookings b
       where b.id = booking_lines.booking_id
         and b.client_id = auth_client_id()
    )
  );

commit;

-- >>> END 0110_client_own_rows_rls.sql <<<

-- >>> START 0111_extend_booking_rpc.sql <<<
-- =============================================================================
-- Migration 0111: `extend_booking` RPC (Stage 1)
--
-- Implements rental extension in Postgres:
-- - Extends bookings.return_at by N days.
-- - Increments days on active booking_lines by N days.
-- - Expands period on all active inventory_reservations to the new return date,
--   re-evaluating GiST exclusion (no double-booking) and capacity ceiling.
-- - If a Draft invoice exists, updates invoice_lines.days to trigger reprice.
-- - Permissions: Coordinator, Manager, Admin, Owner (C+) per PERMISSIONS.md:204.
-- - Refuses extension if booking is Cancelled, Returned, or Closed.
-- - Requires reason >= 10 non-whitespace characters.
-- - Records an immutable audit event in audit_events.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

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
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
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
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
      raise exception
        'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
        coalesce(v_role::text, 'unidentified')
        using errcode = '42501';
    end if;
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
       and is_active
     order by created_at
     limit 1;
  end if;

  if v_role is null and v_actor is not null then
    select primary_role into v_role from users where id = v_actor;
  end if;
  v_role := coalesce(v_role, 'Coordinator');

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
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
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)'),
         updated_at = v_now
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
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.extend_booking(jsonb) to authenticated;
grant execute on function public.extend_booking(uuid, integer, text, uuid) to authenticated;

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events.';

commit;

-- >>> END 0111_extend_booking_rpc.sql <<<

-- >>> START 0112_partial_return_missing_case.sql <<<
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

-- >>> END 0112_partial_return_missing_case.sql <<<

-- >>> START 0113_law17_delivery_type_client_pickup.sql <<<
-- =============================================================================
-- Migration 0113: Law 17 in the database — delivery_type Client Pickup
--
-- Audit §8: the enum still carries 'Customer Pickup'; the app's CLIENT_PICKUP
-- constant in createRental.ts was the only place the boundary was written down.
-- Law 17: the word appears nowhere.
--
-- Ruled exception to N-6 (R-33/R-38): alter type ... rename value rewrites the
-- catalog, not the rows.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'delivery_type' and e.enumlabel = 'Customer Pickup'
  ) then
    alter type delivery_type rename value 'Customer Pickup' to 'Client Pickup';
  end if;
end $$;

commit;

-- >>> END 0113_law17_delivery_type_client_pickup.sql <<<

-- >>> START 0114_unit_status_engine.sql <<<
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

-- >>> END 0114_unit_status_engine.sql <<<

-- >>> START 0115_stage_gates.sql <<<
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

-- >>> END 0115_stage_gates.sql <<<

-- >>> START 0116_close_gate.sql <<<
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

-- >>> END 0116_close_gate.sql <<<

-- >>> START 0117_invoice_void_discipline.sql <<<
-- =============================================================================
-- Migration 0117: Invoice Void Discipline & Credit Notes (S1-3)
--
-- Law 3: Financial records are immutable. Voiding an invoice is a documented act.
--
-- 1. Helper function auth_is_finance_or_admin() updated to R-05 / S1-a default:
--    Owner, Admin, Manager, Accounts (Coordinator excluded).
-- 2. Table credit_notes created with document numbering sequence 'credit_note'.
-- 3. Invoices void trigger enforces:
--    - Role check: gate.invoice.void_role
--    - Reason check (>=10 chars) & auto-stamps voided_by/voided_at: gate.invoice.void_reason
--    - Paid invoice requires existing credit note: gate.invoice.void_paid
-- 4. Invoices once Void are completely immutable: gate.invoice.void_immutable
--
-- N-5: Written, numbered, tested locally under PGlite.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Update auth_is_finance_or_admin() to Owner, Admin, Manager, Accounts (R-05)
-- -----------------------------------------------------------------------------

create or replace function auth_is_finance_or_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts');
$$;

comment on function auth_is_finance_or_admin is
  'Stage 1 (0117): Owner, Admin, Manager, Accounts per R-05 / S1-a. Coordinator excluded.';

-- -----------------------------------------------------------------------------
-- 2 · Number sequence for credit notes
-- -----------------------------------------------------------------------------

insert into number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
values ('credit_note', 'CN-', extract(year from current_date)::int, 0, 1, false)
on conflict (sequence_key) do nothing;

-- -----------------------------------------------------------------------------
-- 3 · Table credit_notes
-- -----------------------------------------------------------------------------

create table if not exists credit_notes (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null unique default gen_random_uuid(),
  credit_note_no  text          not null unique,
  invoice_id      uuid          not null references invoices (id),
  amount          numeric(14,2) not null,
  reason          text          not null,
  created_at      timestamptz   not null default now(),
  created_by      uuid          not null references users (id),

  constraint credit_notes_amount_positive check (amount > 0),
  constraint credit_notes_reason_length check (char_length(btrim(reason)) >= 10)
);

comment on table credit_notes is
  'Stage 1 (0117): Formal credit notes issued against invoices. Required before voiding a paid invoice.';

alter table credit_notes enable row level security;

-- Policies for credit_notes
drop policy if exists credit_notes_select on credit_notes;
create policy credit_notes_select on credit_notes
  for select
  using (
    auth_is_finance_or_admin()
  );

drop policy if exists credit_notes_insert on credit_notes;
create policy credit_notes_insert on credit_notes
  for insert
  with check (
    auth_is_finance_or_admin()
  );

-- No DELETE policy: Law 3.

-- -----------------------------------------------------------------------------
-- 4 · Replace old CHECK constraint on invoices
-- -----------------------------------------------------------------------------

alter table invoices drop constraint if exists invoices_void_requires_reason;

-- -----------------------------------------------------------------------------
-- 5 · Trigger for invoice void discipline & immutability
-- -----------------------------------------------------------------------------

create or replace function reject_invoice_edit_after_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 1. Voided invoices are completely immutable
  if OLD.status = 'Void' then
    raise exception 'GATE:gate.invoice.void_immutable|A voided invoice is immutable and cannot be modified.' using errcode = 'P0001';
  end if;

  -- 2. Draft invoices can be edited freely (except cannot transition directly to Void without discipline)
  if OLD.status = 'Draft' and NEW.status <> 'Void' then
    return NEW;
  end if;

  -- 3. Voiding transition: status becomes 'Void'
  if NEW.status = 'Void' and OLD.status <> 'Void' then
    -- (a) Role check: Owner, Admin, Manager, Accounts
    if not (auth_is_finance_or_admin() or coalesce(current_setting('app.override_role', true), '') in ('Owner', 'Admin', 'Manager', 'Accounts')) then
      raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
    end if;

    -- (b) Reason check (>= 10 chars)
    if length(coalesce(btrim(NEW.void_reason), '')) < 10 then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires a reason of at least 10 characters.' using errcode = 'P0001';
    end if;

    -- Auto-stamp voided_by and voided_at if not set
    if NEW.voided_by is null then
      NEW.voided_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
      if NEW.voided_by is null then
        begin
          NEW.voided_by := auth.uid();
        exception when others then
          null;
        end;
      end if;
    end if;
    if NEW.voided_at is null then
      NEW.voided_at := now();
    end if;

    if NEW.voided_by is null or NEW.voided_at is null then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires voided_by and voided_at.' using errcode = 'P0001';
    end if;

    -- (c) If paid_amount > 0, credit note must exist
    if OLD.paid_amount > 0 then
      if not exists (
        select 1 from credit_notes
        where invoice_id = NEW.id
      ) then
        raise exception 'GATE:gate.invoice.void_paid|Cannot void an invoice with payments unless a credit note has been issued.' using errcode = 'P0001';
      end if;

      if NEW.credit_note_no is null then
        select credit_note_no into NEW.credit_note_no
        from credit_notes
        where invoice_id = NEW.id
        order by created_at desc
        limit 1;
      end if;
    end if;

    -- Figures must remain unchanged while voiding
    if NEW.subtotal is distinct from OLD.subtotal
      or NEW.discount_amount is distinct from OLD.discount_amount
      or NEW.discount_percent is distinct from OLD.discount_percent
      or NEW.taxable_amount is distinct from OLD.taxable_amount
      or NEW.vat_amount is distinct from OLD.vat_amount
      or NEW.total_amount is distinct from OLD.total_amount
      or NEW.due_date is distinct from OLD.due_date
    then
      raise exception 'Law 4/finance: invoice % cannot change its own figures while being voided.', OLD.invoice_no;
    end if;

    return NEW;
  end if;

  -- 4. An issued invoice cannot revert to Draft
  if NEW.status = 'Draft' and OLD.status <> 'Draft' then
    raise exception 'Law 4/finance: an issued invoice (%) cannot revert to Draft.', OLD.invoice_no;
  end if;

  -- 5. Figures are immutable on issued invoices
  if NEW.subtotal is distinct from OLD.subtotal
    or NEW.discount_amount is distinct from OLD.discount_amount
    or NEW.discount_percent is distinct from OLD.discount_percent
    or NEW.taxable_amount is distinct from OLD.taxable_amount
    or NEW.vat_amount is distinct from OLD.vat_amount
    or NEW.total_amount is distinct from OLD.total_amount
    or NEW.due_date is distinct from OLD.due_date
  then
    raise exception 'Law 4/finance: invoice % is issued (status %) — its figures are immutable. Corrections take Void + Credit Note, never a direct edit.', OLD.invoice_no, OLD.status;
  end if;

  return NEW;
end;
$$;

commit;

-- >>> END 0117_invoice_void_discipline.sql <<<

-- >>> START 0118_payment_ceiling.sql <<<
-- Migration 0118_payment_ceiling.sql
-- S1-4 · A payment cannot exceed what is owed (R-27, R-29, Law 4, Law 6)
--
-- 1. booking_estimate_total(booking_id) calculates current booking estimate:
--    subtotal (booking_lines + crew + transport) - discount (booking_discounts) + VAT 13%
-- 2. enforce_payment_ceiling() trigger before insert on payments:
--    - Checks client_id match with booking and invoice (gate.payment.client_mismatch)
--    - If invoice_id is not null: new.amount <= invoice.outstanding_amount + 0.01 (gate.payment.over_invoice)
--    - If invoice_id is null: prior_payments + new.amount <= booking_estimate_total + 0.01 (gate.payment.over_booking)

create or replace function booking_estimate_total(p_booking_id uuid)
returns numeric(14,2)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lines_subtotal numeric(14,2) := 0;
  v_crew_subtotal numeric(14,2) := 0;
  v_transport_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_percent numeric(5,2) := 0;
  v_discount numeric(14,2) := 0;
  v_taxable numeric(14,2) := 0;
  v_vat numeric(14,2) := 0;
begin
  if p_booking_id is null then
    return 0;
  end if;

  -- 1. booking_lines
  select coalesce(sum(greatest(0, greatest(1, qty) * greatest(1, days) * rate - coalesce(discount_amount, 0))), 0)
    into v_lines_subtotal
    from booking_lines
   where booking_id = p_booking_id
     and voided_at is null;

  -- 2. booking_crew_lines
  select coalesce(sum(day_rate * greatest(1, days) + coalesce(overtime, 0) + coalesce(accommodation, 0) + coalesce(meals, 0)), 0)
    into v_crew_subtotal
    from booking_crew_lines
   where booking_id = p_booking_id
     and voided_at is null;

  -- 3. booking_transport
  select coalesce(sum(coalesce(delivery_charge, 0) + coalesce(fuel_charge, 0)), 0)
    into v_transport_subtotal
    from booking_transport
   where booking_id = p_booking_id
     and (coalesce(delivery_charge, 0) + coalesce(fuel_charge, 0)) > 0;

  v_subtotal := v_lines_subtotal + v_crew_subtotal + v_transport_subtotal;

  -- 4. booking_discounts
  select coalesce(max(percent), 0)
    into v_percent
    from booking_discounts
   where booking_id = p_booking_id;

  v_discount := round(v_subtotal * (v_percent / 100.0), 2);
  v_taxable := v_subtotal - v_discount;
  v_vat := round(v_taxable * 0.13, 2);

  return v_taxable + v_vat;
end;
$$;

create or replace function enforce_payment_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_client_id uuid;
  v_inv_client_id uuid;
  v_inv_booking_id uuid;
  v_inv_outstanding numeric(14,2);
  v_inv_status invoice_status;
  v_prior_payments numeric(14,2) := 0;
  v_booking_estimate numeric(14,2) := 0;
begin
  -- Client mismatch check on booking
  select client_id into v_booking_client_id
    from bookings
   where id = NEW.booking_id;

  if v_booking_client_id is null or NEW.client_id <> v_booking_client_id then
    raise exception 'GATE:gate.payment.client_mismatch|Payment client % does not match booking client %',
      NEW.client_id, v_booking_client_id
      using errcode = 'P0001';
  end if;

  if NEW.invoice_id is not null then
    select client_id, booking_id, outstanding_amount, status
      into v_inv_client_id, v_inv_booking_id, v_inv_outstanding, v_inv_status
      from invoices
     where id = NEW.invoice_id;

    if v_inv_client_id is not null and NEW.client_id <> v_inv_client_id then
      raise exception 'GATE:gate.payment.client_mismatch|Payment client % does not match invoice client %',
        NEW.client_id, v_inv_client_id
        using errcode = 'P0001';
    end if;

    if v_inv_booking_id is not null and NEW.booking_id <> v_inv_booking_id then
      raise exception 'GATE:gate.payment.client_mismatch|Payment booking % does not match invoice booking %',
        NEW.booking_id, v_inv_booking_id
        using errcode = 'P0001';
    end if;

    if v_inv_status = 'Void' then
      raise exception 'GATE:gate.payment.over_invoice|Cannot make payment against voided invoice %',
        NEW.invoice_id
        using errcode = 'P0001';
    end if;

    -- Ceiling check against invoice outstanding amount (with 1 paisa tolerance)
    if NEW.amount > (coalesce(v_inv_outstanding, 0) + 0.01) then
      raise exception 'GATE:gate.payment.over_invoice|Payment amount % exceeds invoice outstanding amount % (plus 0.01 tolerance)',
        NEW.amount, coalesce(v_inv_outstanding, 0)
        using errcode = 'P0001';
    end if;
  else
    -- advance / deposit-type payments without invoice
    select coalesce(sum(amount), 0)
      into v_prior_payments
      from payments
     where booking_id = NEW.booking_id
       and payment_type <> 'Security Deposit';

    v_booking_estimate := booking_estimate_total(NEW.booking_id);

    if (v_prior_payments + NEW.amount) > (v_booking_estimate + 0.01) then
      raise exception 'GATE:gate.payment.over_booking|Total payments % (including % this payment) exceeds booking estimate % (plus 0.01 tolerance)',
        (v_prior_payments + NEW.amount), NEW.amount, v_booking_estimate
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_payment_ceiling on payments;
create trigger trg_enforce_payment_ceiling
  before insert on payments
  for each row execute function enforce_payment_ceiling();

revoke all on function booking_estimate_total(uuid) from public;
grant execute on function booking_estimate_total(uuid) to authenticated, service_role;
-- >>> END 0118_payment_ceiling.sql <<<

-- >>> START 0119_server_side_prices.sql <<<
-- Migration 0119_server_side_prices.sql
-- S1-7 · Prices come from the database when the caller cannot see them (Law 1, Law 6, S0-5)
--
-- 1. booking_lines gains `rate_overridden boolean not null default false`
-- 2. get_model_daily_rate(product_id, bundle_id) helper (security definer) to read daily_rate
-- 3. create_booking(jsonb) updated:
--    - Sets app.in_create_booking = 'on' for the transaction
--    - Gate gate.discount.money_blind for money-blind callers attempting discounts
--    - Line pricing: model rate unless auth_can_view_money() and explicit rate provided
--    - If money-blind caller supplies rate differing from model rate, log audit row price.server_applied
-- 4. guard_booking_lines_money_blind() trigger before insert on booking_lines:
--    - Refuses direct money figure insertion by money-blind callers outside create_booking

alter type audit_action add value if not exists 'price.server_applied';

alter table booking_lines add column if not exists rate_overridden boolean not null default false;
grant select (rate_overridden) on booking_lines to authenticated;

create or replace function get_model_daily_rate(p_product_id uuid, p_bundle_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate numeric;
begin
  if p_product_id is not null then
    select daily_rate into v_rate from products where id = p_product_id;
    return coalesce(v_rate, 0);
  elsif p_bundle_id is not null then
    select daily_rate into v_rate from bundles where id = p_bundle_id;
    return coalesce(v_rate, 0);
  end if;
  return null;
end;
$$;

revoke all on function get_model_daily_rate(uuid, uuid) from public;
grant execute on function get_model_daily_rate(uuid, uuid) to authenticated, service_role;

create or replace function guard_booking_lines_money_blind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.in_create_booking', true) = 'on' then
    return NEW;
  end if;

  if not auth_can_view_money() then
    if (NEW.rate is not null and NEW.rate <> 0)
       or (NEW.discount_amount is not null and NEW.discount_amount <> 0)
       or NEW.supplier_cost is not null
       or NEW.markup_amount is not null then
      raise exception 'GATE:gate.booking_lines.money_blind_insert|Money-blind callers cannot insert money figures into booking_lines outside create_booking'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_booking_lines_money_insert on booking_lines;
create trigger trg_guard_booking_lines_money_insert
  before insert on booking_lines
  for each row execute function guard_booking_lines_money_blind();

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

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_no', v_booking_no,
    'stage',      'Quote',
    'line_count', v_line_count,
    'unit_count', v_unit_count,
    'replayed',   false
  );
end;
$$;
-- >>> END 0119_server_side_prices.sql <<<

-- >>> START 0120_users_visibility_and_role_ceiling.sql <<<
-- Migration 0120_users_visibility_and_role_ceiling.sql
-- S1-6 · Staff can be seen, and roles have a ceiling (PERMISSIONS.md §3.1 AD2, §10, Law 3)
--
-- 1. users gains deactivated_at timestamptz
-- 2. auth_user_branch_id() helper
-- 3. auth_user_role() updated to resolve deactivated users to 'Client'
-- 4. staff_directory_v view: dropped and recreated with masking and general staff access
-- 5. users RLS policies (self_read, read_staff_directory, update_admin, insert_admin)
-- 6. enforce_users_role_ceiling() trigger before insert or update on users
-- 7. reject_users_delete() trigger before delete on users (Law 3)

alter table users add column if not exists deactivated_at timestamptz;

create or replace function auth_user_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch_id from users
   where id = coalesce(
     nullif(current_setting('app.current_user_id', true), '')::uuid,
     auth.uid()
   );
$$;

revoke all on function auth_user_branch_id() from public;
grant execute on function auth_user_branch_id() to authenticated, service_role;

-- Deactivation resolves to Client immediately
create or replace function public.auth_user_role()
returns system_role
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select primary_role from users
      where id = coalesce(
        nullif(current_setting('app.current_user_id', true), '')::uuid,
        auth.uid()
      )
      and deactivated_at is null
      and is_active = true),
    'Client'::system_role
  );
$$;

revoke execute on function public.auth_user_role() from public;
grant execute on function public.auth_user_role() to authenticator, anon, authenticated, service_role;

-- 4 · staff_directory_v: names for assignment dropdowns (email/mobile masked for non-Owner/Admin)
drop view if exists staff_directory_v cascade;

create view staff_directory_v as
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
  and u.is_active = true;

revoke all on staff_directory_v from public;
grant select on staff_directory_v to authenticated, service_role;

-- 5 · RLS policies on users
drop policy if exists users_select_own on users;
drop policy if exists users_self_read on users;
create policy users_self_read on users
  for select
  using (
    id = coalesce(
      nullif(current_setting('app.current_user_id', true), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists users_read_staff_directory on users;
create policy users_read_staff_directory on users
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
    or (
      auth_user_role() = 'Manager'
      and branch_id = auth_user_branch_id()
    )
  );

drop policy if exists users_update_admin on users;
create policy users_update_admin on users
  for update
  using (auth_user_role() in ('Owner', 'Admin'))
  with check (auth_user_role() in ('Owner', 'Admin'));

drop policy if exists users_insert_admin on users;
create policy users_insert_admin on users
  for insert
  with check (auth_user_role() in ('Owner', 'Admin'));

grant select, insert, update on users to authenticated, service_role;
revoke delete on users from public, authenticated, anon;

-- 6 · Role ceiling & invariant trigger
create or replace function enforce_users_role_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role system_role;
  v_caller_id uuid;
  v_owner_count integer;
begin
  v_caller_role := auth_user_role();
  v_caller_id := coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  );

  if TG_OP = 'INSERT' then
    if v_caller_role = 'Admin' and NEW.primary_role in ('Owner', 'Admin') then
      raise exception 'GATE:gate.users.role_ceiling|Admin cannot create user with role % (role ceiling AD2)',
        NEW.primary_role
        using errcode = 'P0001';
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    -- Role ceiling check
    if v_caller_role = 'Admin' and NEW.primary_role in ('Owner', 'Admin') and (OLD.primary_role is distinct from NEW.primary_role) then
      raise exception 'GATE:gate.users.role_ceiling|Admin cannot assign role % (role ceiling AD2)',
        NEW.primary_role
        using errcode = 'P0001';
    end if;

    if v_caller_role = 'Manager' and NEW.primary_role is distinct from OLD.primary_role then
      raise exception 'GATE:gate.users.role_ceiling|Manager cannot change user roles'
        using errcode = 'P0001';
    end if;

    -- Self-deactivation prohibited
    if NEW.id = v_caller_id and (
      (NEW.deactivated_at is not null and OLD.deactivated_at is null)
      or (NEW.is_active = false and OLD.is_active = true)
    ) then
      raise exception 'GATE:gate.users.self_deactivation|Users cannot deactivate their own account'
        using errcode = 'P0001';
    end if;

    -- Sync is_active and deactivated_at
    if NEW.deactivated_at is not null and OLD.deactivated_at is null then
      NEW.is_active := false;
    elsif NEW.is_active = false and OLD.is_active = true and NEW.deactivated_at is null then
      NEW.deactivated_at := now();
    elsif NEW.deactivated_at is null and OLD.deactivated_at is not null then
      NEW.is_active := true;
    end if;

    -- Last Owner protection
    if OLD.primary_role = 'Owner' and (
      NEW.primary_role <> 'Owner'
      or NEW.deactivated_at is not null
      or NEW.is_active = false
    ) then
      select count(*) into v_owner_count
        from users
       where primary_role = 'Owner'
         and deactivated_at is null
         and is_active = true
         and id <> OLD.id;

      if v_owner_count = 0 then
        raise exception 'GATE:gate.users.last_owner|Cannot demote or deactivate the last remaining active Owner'
          using errcode = 'P0001';
      end if;
    end if;

    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_users_role_ceiling on users;
create trigger trg_enforce_users_role_ceiling
  before insert or update on users
  for each row execute function enforce_users_role_ceiling();

-- 7 · Immutable users (Law 3 - no delete)
create or replace function reject_users_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'GATE:gate.users.immutable|Users cannot be deleted (Law 3). Deactivate instead.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_reject_users_delete on users;
create trigger trg_reject_users_delete
  before delete on users
  for each row execute function reject_users_delete();
-- >>> END 0120_users_visibility_and_role_ceiling.sql <<<

-- >>> START 0121_void_invoice_rpc.sql <<<
-- =============================================================================
-- Migration 0121: void_invoice(p_payload jsonb) RPC (Stage 2)
--
-- Law 3: Financial records are immutable. Voiding an invoice is a documented act.
-- Law 4: Payments immutable.
--
-- Single-transaction RPC to void an invoice:
-- - Validates caller role (auth_is_finance_or_admin() or app.override_role)
-- - Validates void_reason >= 10 chars
-- - If invoice is paid (paid_amount > 0), checks or auto-issues a credit_notes row
--   using next_document_number('credit_note')
-- - Updates invoices status = 'Void', void_reason, voided_by, voided_at
-- - Emits audit event
-- - Returns jsonb: { invoice_id, status: 'Void', credit_note_no, voided_at }
-- =============================================================================

begin;

create or replace function void_invoice(p_payload jsonb)
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

  v_created_by := nullif(p_payload ->> 'created_by', '')::uuid;
  if v_created_by is null then
    v_created_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    if v_created_by is null then
      begin
        v_created_by := auth.uid();
      exception when others then
        null;
      end;
    end if;
  end if;

  -- 1. Role check: Owner, Admin, Manager, Accounts
  v_caller_role := coalesce(
    nullif(current_setting('app.override_role', true), ''),
    auth_user_role()
  );

  if not (auth_is_finance_or_admin() or v_caller_role in ('Owner', 'Admin', 'Manager', 'Accounts')) then
    raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
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
      insert into credit_notes (
        client_uuid,
        credit_note_no,
        invoice_id,
        amount,
        reason,
        created_by
      ) values (
        v_client_uuid,
        v_credit_note_no,
        v_invoice_id,
        v_paid_amount,
        v_reason,
        coalesce(v_created_by, (select id from users order by created_at limit 1))
      )
      returning id into v_credit_note_id;
    end if;
  end if;

  -- 4. Update the invoice to Void
  v_voided_at := now();

  update invoices
  set status = 'Void',
      void_reason = v_reason,
      voided_by = v_created_by,
      voided_at = v_voided_at,
      credit_note_no = coalesce(v_credit_note_no, credit_note_no)
  where id = v_invoice_id;

  -- 5. Audit event
  insert into audit_events (
    event_class,
    category,
    module,
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
    'status change',
    'Finance',
    'Finance',
    'Update',
    'Informational',
    'invoices',
    v_invoice_id,
    v_created_by,
    v_caller_role,
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

grant execute on function void_invoice(jsonb) to authenticated;

comment on function void_invoice(jsonb) is
  'Stage 2 (0121): Atomically issues credit note if invoice was paid, and voids invoice.';

commit;

-- >>> END 0121_void_invoice_rpc.sql <<<

-- >>> START 0122_inspection_operation_session.sql <<<
-- Migration 0122_inspection_operation_session.sql
-- Resolution of PLAN.md §4.29(a):
-- Adds 'Inspection' to operation_kind enum and updates operation_sessions check constraint.
-- Operation sessions RLS policies (operation_sessions_all) already admit ('Owner', 'Admin', 'Manager', 'Warehouse').
-- This maps inspection.create, inspection.pass, inspection.fail to canWriteFloor.

alter type operation_kind add value if not exists 'Inspection';

begin;

alter table operation_sessions drop constraint if exists operation_sessions_operation_is_a_session;
alter table operation_sessions add constraint operation_sessions_operation_is_a_session
  check (operation::text in ('Packing', 'Handover', 'Return', 'Inspection'));

commit;
-- >>> END 0122_inspection_operation_session.sql <<<

-- >>> START 0123_categorize_equipment_inventory.sql <<<
-- =============================================================================
-- 0123_categorize_equipment_inventory.sql
-- Populate missing inventory_categories and re-categorize the 204 products
-- from the monolithic 'Camera' assignment into proper industry categories.
-- =============================================================================

-- 1. Insert missing 11 product categories into inventory_categories
insert into inventory_categories (id, client_uuid, code, name, description, sort_order, is_active)
values
  ('00000000-0000-0000-0000-000000000507'::uuid, '20000000-0000-0000-0000-000000000507'::uuid, 'drone', 'Drone'::product_category, 'Drones & Aerial Systems', 7, true),
  ('00000000-0000-0000-0000-000000000508'::uuid, '20000000-0000-0000-0000-000000000508'::uuid, 'monitor', 'Monitor'::product_category, 'Production, Director & On-Camera Monitors', 8, true),
  ('00000000-0000-0000-0000-000000000509'::uuid, '20000000-0000-0000-0000-000000000509'::uuid, 'power', 'Power'::product_category, 'V-Mount Batteries, Chargers & Power Stations', 9, true),
  ('00000000-0000-0000-0000-000000000510'::uuid, '20000000-0000-0000-0000-000000000510'::uuid, 'media', 'Media'::product_category, 'Memory Cards, SSDs & Card Readers', 10, true),
  ('00000000-0000-0000-0000-000000000511'::uuid, '20000000-0000-0000-0000-000000000511'::uuid, 'computing', 'Computing'::product_category, 'DIT Stations, Laptops & Video Switchers', 11, true),
  ('00000000-0000-0000-0000-000000000512'::uuid, '20000000-0000-0000-0000-000000000512'::uuid, 'case', 'Case'::product_category, 'Hard Cases & Flight Cases', 12, true),
  ('00000000-0000-0000-0000-000000000513'::uuid, '20000000-0000-0000-0000-000000000513'::uuid, 'bag', 'Bag'::product_category, 'Soft Bags, Backpacks & Pouches', 13, true),
  ('00000000-0000-0000-0000-000000000514'::uuid, '20000000-0000-0000-0000-000000000514'::uuid, 'accessory', 'Accessory'::product_category, 'Cables, Adapters, Matte Boxes, Follow Focus & Rigging', 14, true),
  ('00000000-0000-0000-0000-000000000515'::uuid, '20000000-0000-0000-0000-000000000515'::uuid, 'consumable', 'Consumable'::product_category, 'Gaffer Tape, Gels & Expendables', 15, true),
  ('00000000-0000-0000-0000-000000000516'::uuid, '20000000-0000-0000-0000-000000000516'::uuid, 'vehicle', 'Vehicle'::product_category, 'Production Vans, Trucks & Vehicles', 16, true),
  ('00000000-0000-0000-0000-000000000517'::uuid, '20000000-0000-0000-0000-000000000517'::uuid, 'other', 'Other'::product_category, 'Crew Services & Miscellaneous Equipment', 17, true)
on conflict (code) do nothing;

-- 2. Update products category_id to point to the correct category
-- CAMERA (12 products)
update products
set category_id = (select id from inventory_categories where code = 'camera')
where asset_code in (
  'EQ000065' -- DJI Osmo Pocket 3 ,
  'EQ000066' -- DJI Ronin 4D 6K 4-Axis Cinema Camera System (Body Only),
  'EQ000097' -- Insta360 X5 8K 360° Action Camera,
  'EQ000128' -- RED KOMODO 6K Cinema Camera (Body Only),
  'EQ000129' -- RED Komodo X 6k Cinema Camera (Body Only),
  'EQ000130' -- RED V-Raptor 8K VV Cinema Camera (Body Only),
  'EQ000185' -- Sony A7 IV Mirrorless Camera (Body Only),
  'EQ000186' -- Sony A7S III Mirrorless Camera (Body Only),
  'EQ000189' -- Sony BURANO 8K Digital Cinema Camera (Body Only),
  'EQ000191' -- Sony FX3 Cinema Line Camera (Body Only),
  'EQ000192' -- Sony FX30 Cinema Line Camera (Body Only),
  'EQ000193' -- Sony FX6 Cinema Camera (Body Only)
);

-- LENS (30 products)
update products
set category_id = (select id from inventory_categories where code = 'lens')
where asset_code in (
  'EQ000008' -- 7Artisans 37mm Lens,
  'EQ000009' -- 7Artisans 57mm Lens,
  'EQ000035' -- Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL) ,
  'EQ000036' -- BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL),
  'EQ000049' -- CHIOPT XTREME Zoom Lens 28–85mm T3.2,
  'EQ000050' -- CHIOPT XTREME Zoom Lens 75–250mm T3.2,
  'EQ000088' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 35mm,
  'EQ000089' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 50mm,
  'EQ000090' -- Great Joy 1.8x Anamorphic Lens |T2.9| PL Mount - 85mm,
  'EQ000112' -- Meike Full Frame lens set (PL Mount),
  'EQ000113' -- NiSi ATHENA PRIME Cinema Lens Series,
  'EQ000157' -- Sigma 14-24mm f/2.8 DG DN Art Lens (E mount),
  'EQ000158' -- Sigma 24-70mm f/2.8 DG DN II Art Lens for Sony E,
  'EQ000159' -- Sigma 28-45mm F1.8 DG DN Art Lens for Sony E,
  'EQ000160' -- Sigma 28-70mm f/2.8 DG DN Contemporary Lens (E mount),
  'EQ000163' -- Sirui 24mm f/2.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000164' -- Sirui 35mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000165' -- Sirui 50mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000166' -- Sirui 75mm f/1.8 Anamorphic 1.33x Lens (E Mount),
  'EQ000167' -- Sirui Anamorphic Lens Set (24/35/50/75mm) E-Mount,
  'EQ000175' -- Sony 16-35mm f/2.8 GM Lens,
  'EQ000176' -- Sony 200-600mm f/5.6-6.3 G OSS Lens,
  'EQ000177' -- Sony 24-70mm f/2.8 GM II Lens,
  'EQ000178' -- Sony 24-70mm f/2.8 GM Lens,
  'EQ000179' -- Sony 24-105mm f/4 G OSS Lens,
  'EQ000180' -- Sony 35mm f/1.4 GM Lens,
  'EQ000181' -- Sony 50mm f/1.2 GM Lens,
  'EQ000182' -- Sony 70-200mm f/2.8 GM OSS II Lens,
  'EQ000183' -- Sony 85mm f/1.4 GM Lens,
  'EQ000184' -- Sony 90mm f/2.8 Macro G OSS Lens
);

-- LIGHTING (16 products)
update products
set category_id = (select id from inventory_categories where code = 'lighting')
where asset_code in (
  'EQ000005' -- 5 in 1 Folded Reflector,
  'EQ000019' -- Amaran 200d S LED Video Light,
  'EQ000020' -- Amaran 300c ,
  'EQ000021' -- Amaran 60d S,
  'EQ000022' -- Amaran F22c Light,
  'EQ000023' -- Amaran PT2c RGBWW LED Pixel Tube Light,
  'EQ000024' -- Amaran PT4c RGBWW LED Pixel Tube Light,
  'EQ000025' -- Amaran T2C RGBWW LED Tube Light 25W (2ft),
  'EQ000026' -- Amaran T4C RGBWW LED Tube Light,
  'EQ000028' -- Aperture LS 1200x light,
  'EQ000029' -- Aperture LS 600x light,
  'EQ000030' -- Aputure 400x,
  'EQ000031' -- Aputure MC Pro RGB LED Light Panel (Production 8-Light Kit),
  'EQ000083' -- Godox RS60R Kit 2 RGB LED Video Light (2-Light Kit),
  'EQ000087' -- Godox V860III Flash for Sony,
  'EQ000111' -- Mc pro light
);

-- AUDIO (18 products)
update products
set category_id = (select id from inventory_categories where code = 'audio')
where asset_code in (
  'EQ000017' -- Accsoon CoMo 7/9-Set Headset Intercom - 9,
  'EQ000018' -- Accsoon CoMo SE 5-Person Intercom System (Grade B),
  'EQ000064' -- Dji Mic Mini,
  'EQ000084' -- Godox SkyTalk Air intercom system - 3 set,
  'EQ000085' -- Godox SkyTalk Air intercom system - 4 set,
  'EQ000086' -- Godox SkyTalk Air intercom system - 5 set,
  'EQ000094' -- Hollyland 8 person comset,
  'EQ000132' -- Rode Lavalier Go Microphone,
  'EQ000133' -- Rode Mic pro plus,
  'EQ000134' -- Rode NTG4+ Shotgun Microphone,
  'EQ000135' -- Rode Wireless go 2 (single),
  'EQ000136' -- Rode Wireless GO II Dual Kit,
  'EQ000137' -- Rode wireless pro,
  'EQ000142' -- Samson dynamic mic Q2U,
  'EQ000154' -- Sennheiser EW 100 G4 Wireless Microphone System,
  'EQ000155' -- Sennheiser MKE 600 Shotgun Microphone,
  'EQ000190' -- Sony ECM-VG1 Shotgun Microphone,
  'EQ000196' -- Sony UWP-D21 Wireless Lavalier Microphone System
);

-- GRIP (21 products)
update products
set category_id = (select id from inventory_categories where code = 'grip')
where asset_code in (
  'EQ000001' -- 10x10 Skimmer Frame and Cloth ,
  'EQ000002' -- 12x12 Skimmer and Cloth,
  'EQ000003' -- 20x20 skimmer cloth (BLACK),
  'EQ000006' -- 6x6 Skimmer Frame and cloth,
  'EQ000010' -- 8x8 Skimmer Frame and Cloth,
  'EQ000034' -- Baby boom stand,
  'EQ000042' -- Came TV Hydraulic Suspension Car Rig,
  'EQ000052' -- C stand  - Cstand Flag set,
  'EQ000053' -- C stand  - Double height ,
  'EQ000054' -- C stand  - Triple height ,
  'EQ000091' -- Grip Head,
  'EQ000098' -- JF DigitalFoto IRON-C100S + IRON-C100G Magic Arm & Super Clamp Combo Kit,
  'EQ000100' -- Jumbo Stand  - Double Height ,
  'EQ000101' -- Jumbo Stand  - Triple Height ,
  'EQ000117' -- NSH CX-10 Electric Suction Cup Shooting System Car Photography Suction Cup Car Shooting,
  'EQ000118' -- Openmoon Saddle Bag,
  'EQ000139' -- Roller Stand  - Double Height ,
  'EQ000140' -- Roller Stand  - Triple Height ,
  'EQ000141' -- Safety Pin,
  'EQ000143' -- Sand Bag,
  'EQ000173' -- SmallRig Super Clamp
);

-- SUPPORT (14 products)
update products
set category_id = (select id from inventory_categories where code = 'support')
where asset_code in (
  'EQ000055' -- Dana Dolly NS-50 Slider System,
  'EQ000068' -- DJI RS 3 Gimbal,
  'EQ000069' -- DJI RS 4 Pro,
  'EQ000070' -- DJI RS 5 / RS 5 Combo - DJI RS 5,
  'EQ000071' -- DJI RS 5 / RS 5 Combo - DJI RS 5 Combo,
  'EQ000075' -- Easy rig,
  'EQ000076' -- Easyrig minimax,
  'EQ000077' -- E image 3 gear tripod,
  'EQ000104' -- K&F Concept VA3 Heavy-Duty Aluminum Tripod with BV20 Fluid Head,
  'EQ000109' -- Libec Tripod,
  'EQ000168' -- Sirui SVT75 Pro Carbon Fiber Tripod with SVH15 Fluid Head,
  'EQ000169' -- Slider 3ft Proaim,
  'EQ000201' -- X jib (scissor jib),
  'EQ000202' -- Yunteng Tripod Small
);

-- MONITOR (15 products)
update products
set category_id = (select id from inventory_categories where code = 'monitor')
where asset_code in (
  'EQ000013' -- Accsoon CineView M7 Pro 7" monitor (built in wireless),
  'EQ000033' -- Atomos Ninja V+ Kit,
  'EQ000056' -- Desview Blade 5 Pro,
  'EQ000057' -- Desview OLED Director Monitor  - 14 Inch,
  'EQ000058' -- Desview OLED Director Monitor  - 16 Inch,
  'EQ000059' -- Desview S14-HDR 14″ Director Monitor Kit (Wireless Video + V-Mount Battery),
  'EQ000060' -- Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") - Desview S14-HDR 14″,
  'EQ000061' -- Director Monitor (PortKeys 8″  or  Desview S14-HDR 14″") -  PortKeys 8″ Monitor,
  'EQ000063' -- Dji High Bright Monitor,
  'EQ000079' -- Feelworld 5.5-inch Monitor,
  'EQ000121' -- Portkeys BM5 III WR 5.5" Touchscreen Monitor,
  'EQ000122' -- Portkeys HS8 8-inch Monitor,
  'EQ000123' -- Portkeys LEYE SDI Electronic View Finder,
  'EQ000156' -- Shimbol Memory I Pro 5.5-inch Monitor,
  'EQ000203' -- Zacuto Kameleon EVF - View Finder
);

-- POWER (18 products)
update products
set category_id = (select id from inventory_categories where code = 'power')
where asset_code in (
  'EQ000012' -- 99Whr Vmount battery,
  'EQ000073' -- D-tap Charger,
  'EQ000074' -- D tap to 12v DC cable,
  'EQ000078' -- FB 310Whr Vmount battery,
  'EQ000096' -- Honda EU22i Inverter Generator (2200VA),
  'EQ000105' -- K&F NP-F550 Battery,
  'EQ000116' -- NP-F 3-Way Battery Adapter,
  'EQ000119' -- PECRON F3000LFP Portable Power Station 3600W 3072Wh,
  'EQ000120' -- PECRON PV200 Portable Solar Panel (200W) x2,
  'EQ000124' -- Power Bank 65W 30000 mAh Baseus,
  'EQ000125' -- Power Strip (Socket),
  'EQ000170' -- Smallrig mini v-mount battery 50Wh,
  'EQ000171' -- Smallrig mini v-mount battery 99Wh,
  'EQ000174' -- SmallRig V-Mount Battery Adapter Plate,
  'EQ000187' -- Sony BP-U35 Battery,
  'EQ000188' -- Sony BP-U70 Battery,
  'EQ000194' -- Sony NP-FZ100 Battery,
  'EQ000204' -- ZGCINE NP-FZ100 Battery Box
);

-- MEDIA (17 products)
update products
set category_id = (select id from inventory_categories where code = 'media')
where asset_code in (
  'EQ000027' -- Angelbird 1TB AV PRO SE CFexpress v4 Type B Memory Card,
  'EQ000044' -- CFast 512GB Memory Card (RED),
  'EQ000045' -- CFast Card Reader,
  'EQ000046' -- CFexpress Type B 1TB card (RED),
  'EQ000047' -- CF express Type B Card Reader ,
  'EQ000048' -- CFexpress Type B Card Reader,
  'EQ000106' -- Lexar CFexpress Type A Professional Memory Card - 160GB,
  'EQ000107' -- Lexar CFexpress Type A Professional Memory Card - 320GB,
  'EQ000108' -- Lexar CFexpress Type A Professional Memory Card - 512 GB,
  'EQ000144' -- SanDisk 128GB Extreme PRO UHS-II SDXC Memory Card,
  'EQ000145' -- SanDisk 128GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000146' -- SanDisk 256GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000147' -- SanDisk 64GB Extreme PRO UHS-I SDXC Memory Card,
  'EQ000148' -- SanDisk Professional PRO-BLADE STATION 4-Bay NVMe Enclosure,
  'EQ000149' -- SanDisk PRO-BLADE TRANSPORT 1TB Portable NVMe SSD,
  'EQ000150' -- SD Card Reader,
  'EQ000195' -- Sony TOUGH 160GB CFexpress Type A Memory Card
);

-- COMPUTING (1 products)
update products
set category_id = (select id from inventory_categories where code = 'computing')
where asset_code in (
  'EQ000138' -- Roland V-1HD 4x HDMI input Video Switcher
);

-- ACCESSORY (32 products)
update products
set category_id = (select id from inventory_categories where code = 'accessory')
where asset_code in (
  'EQ000004' -- 58mm Nd,
  'EQ000007' -- 77mm Close-Up Filter,
  'EQ000011' -- 95mm Polarizer Filter for Tilta Mirage,
  'EQ000014' -- Accsoon Cineview Nano,
  'EQ000015' -- Accsoon cineview Sdi 2,
  'EQ000016' -- Accsoon Cineviw SDI 2 Transmitter(TX),
  'EQ000032' -- Arm Rod,
  'EQ000043' -- Canon Mount Adapter EF-EOS R,
  'EQ000051' -- Clap Board,
  'EQ000062' -- Dji Focus pro with Lidar,
  'EQ000067' -- DJI Ronin 4D Flex Cable ,
  'EQ000072' -- DJI SDR TRANSMISSION COMBO,
  'EQ000092' -- HDMI to HDMI Cable (SmallRig) - 35cm,
  'EQ000093' -- HDMI to HDMI Cable (SmallRig) - 55cm,
  'EQ000095' -- Hollyland cosmo C1 wireless video transmitter,
  'EQ000102' -- K&F CONCEPT NANO-X Series Filter VARIABLE ND4-32  - 67mm,
  'EQ000103' -- K&F CONCEPT NANO-X Series Filter VARIABLE ND4-32  - 72mm,
  'EQ000114' -- NiSi Cinema 4×5.65″ True Color Polariser Filter,
  'EQ000115' -- NiSi PL to E-Mount Adapter,
  'EQ000126' -- Proaim 7" Monitor Cage with Sunhood,
  'EQ000127' -- Proaim 9" Director Monitor Cage with Sunhood,
  'EQ000131' -- RF to PL Adapter,
  'EQ000151' -- SDI Cable - 15m,
  'EQ000152' -- SDI Cable - 20m,
  'EQ000153' -- SDI Cable - 55cm,
  'EQ000161' -- Sigma MC-11 EF to E-Mount Adapter,
  'EQ000162' -- Simmod EF to L Mount Adapter,
  'EQ000172' -- Smallrig Quick Release Plate for Manfrotto,
  'EQ000197' -- Tilta Mirage Matte Box,
  'EQ000198' -- Tilta Mirage VND Motorized Kit,
  'EQ000199' -- Tilta Nucleus-M Wireless Follow Focus Kit,
  'EQ000200' -- Tilta Nucleus-Nano II Wireless Lens Control System
);

-- OTHER (10 products)
update products
set category_id = (select id from inventory_categories where code = 'other')
where asset_code in (
  'EQ000037' -- Camera Caretaker ,
  'EQ000038' -- Camera Caretaker - Contact no. 9712052572 (Sunil Lama),
  'EQ000039' -- Camera Caretaker - Contact no. 9712052574 (Aryan Chaudhary),
  'EQ000040' -- Camera Caretaker - Contact no. 9748249945 (Shisir Parkhi),
  'EQ000041' -- Camera Caretaker - Contact no. 9820418147 (Pratik Puri),
  'EQ000080' -- Fog Machine  - 1300 Watt,
  'EQ000081' -- Fog Machine  - 1500 Watt,
  'EQ000082' -- Fog Machine  - 1800 Watt,
  'EQ000099' -- Jib Operator ,
  'EQ000110' -- Light Man 
);


-- >>> END 0123_categorize_equipment_inventory.sql <<<

-- >>> START 0124_reservations_follow_booking_dates.sql <<<
-- =============================================================================
-- Migration 0124: Synchronize Inventory Reservations on Booking Rescheduling (AUD-001)
--
-- ## Context & Problem
--
-- Migration 0100 (R-26) correctly automated inventory reservations when a booking
-- moves to `Booked`. However, `trg_reservations_follow_stage_transition` only
-- fires `AFTER INSERT ON booking_stage_transitions`.
--
-- If an operator or API client later rescheduled a confirmed booking by updating
-- `bookings.pickup_at` or `bookings.return_at`, no trigger existed to update the
-- reservation period. The reservation remained locked to the old rental dates,
-- while the new shoot dates had zero reservation coverage. This permitted
-- overlapping double bookings on the rescheduled dates (AUD-001).
--
-- ## The Invariant
--
-- Whenever `bookings.pickup_at` or `bookings.return_at` changes:
-- 1. `pickup_at` must remain strictly before `return_at`.
-- 2. All active (`released_at IS NULL`) reservations for that booking must have
--    their `period` updated to `tstzrange(NEW.pickup_at, NEW.return_at, '[)')`
--    within the exact same transaction.
-- 3. Updating the reservation periods automatically exercises:
--    - The GiST exclusion constraint (`inventory_reservations_no_double_booking`)
--      for serialized units (0003).
--    - The capacity ceiling trigger (`trg_enforce_inventory_reservation_capacity`)
--      with its `FOR UPDATE` row lock on `products` for quantity-tracked items (0045).
-- 4. If the new period conflicts with an existing booking or exceeds stock on hand,
--    the exclusion constraint or capacity trigger raises an exception, aborting
--    the transaction and preserving the original dates.
--
-- SECURITY DEFINER with search_path = public, pg_temp so the update has authority
-- to maintain reservation integrity.
-- =============================================================================

begin;

create or replace function public.reservations_follow_booking_dates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_period tstzrange;
begin
  -- Only act when rental boundaries actually change
  if (OLD.pickup_at is distinct from NEW.pickup_at) or (OLD.return_at is distinct from NEW.return_at) then
    if NEW.pickup_at is null or NEW.return_at is null then
      raise exception
        'Booking %: pickup_at and return_at cannot be null for an active rental.',
        NEW.booking_no;
    end if;

    if NEW.pickup_at >= NEW.return_at then
      raise exception
        'Booking %: pickup_at (%) must be strictly before return_at (%).',
        NEW.booking_no, NEW.pickup_at, NEW.return_at;
    end if;

    -- Half-open bounds '[)', strictly matching RENTAL_WINDOW_BOUNDS in src/lib/availability.ts
    v_new_period := tstzrange(NEW.pickup_at, NEW.return_at, '[)');

    -- Atomically update all unreleased holds for this booking.
    -- If the new period conflicts, GiST exclusion (0003) or capacity ceiling (0045)
    -- will raise an exception and roll back this entire UPDATE transaction.
    update public.inventory_reservations
       set period = v_new_period
     where booking_id = NEW.id
       and released_at is null
       and period is distinct from v_new_period;
  end if;

  return NEW;
end;
$$;

comment on function public.reservations_follow_booking_dates() is
  'AUD-001: Synchronizes inventory_reservations.period when booking dates change, '
  're-evaluating GiST asset exclusion and quantity capacity locks to prevent double booking.';

drop trigger if exists trg_reservations_follow_booking_dates on public.bookings;
create trigger trg_reservations_follow_booking_dates
  after update of pickup_at, return_at on public.bookings
  for each row
  execute function public.reservations_follow_booking_dates();

commit;

-- >>> END 0124_reservations_follow_booking_dates.sql <<<

-- >>> START 0125_rental_drafts.sql <<<
-- 0125 — durable New Rental drafts
--
-- A draft is not yet a booking: it has no booking number, does not enter the
-- booking stage machine, and must not reserve inventory.  The complete,
-- versioned New Rental form is stored as JSON so reopening the draft restores
-- fields that do not yet have a home on `bookings` (for example the VAT toggle
-- and the entered advance).  Conversion retains the snapshot and links it to
-- the one booking produced from it.

begin;

create table rental_drafts (
  id                    uuid        primary key default gen_random_uuid(),
  client_uuid           uuid        not null unique,
  booking_client_uuid   uuid        not null unique,
  branch_id             uuid        not null references branches(id),
  data                  jsonb       not null,
  status                text        not null default 'Active',
  converted_booking_id  uuid        references bookings(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid        references users(id),
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  created_by            uuid        not null references users(id),
  updated_at            timestamptz not null default now(),
  updated_by            uuid        not null references users(id),

  constraint rental_drafts_status_check
    check (status in ('Active', 'Converted', 'Cancelled')),
  constraint rental_drafts_data_version_check
    check ((data ->> 'version')::integer = 1),
  constraint rental_drafts_conversion_check
    check ((status = 'Converted') = (converted_booking_id is not null)),
  constraint rental_drafts_cancellation_check
    check (
      (status = 'Cancelled') =
      (cancelled_at is not null and cancelled_by is not null and nullif(btrim(cancellation_reason), '') is not null)
    )
);

create index rental_drafts_branch_status_updated_idx
  on rental_drafts (branch_id, status, updated_at desc);

create function enforce_rental_draft_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking bookings%rowtype;
begin
  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.booking_client_uuid <> OLD.booking_client_uuid
     or NEW.branch_id <> OLD.branch_id
     or NEW.created_at <> OLD.created_at
     or NEW.created_by <> OLD.created_by then
    raise exception 'A rental draft identity and ownership are immutable.' using errcode = 'P0001';
  end if;

  if OLD.status <> 'Active' and NEW is distinct from OLD then
    raise exception 'A converted or cancelled rental draft is immutable.' using errcode = 'P0001';
  end if;

  if NEW.status = 'Converted' then
    select * into v_booking from bookings where id = NEW.converted_booking_id;
    if not found or v_booking.stage <> 'Booked' then
      raise exception 'A rental draft can only convert to a Booked booking.' using errcode = 'P0001';
    end if;
    if v_booking.client_uuid <> NEW.booking_client_uuid then
      raise exception 'The booking was not created from this rental draft.' using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_enforce_rental_draft_update
  before update on rental_drafts
  for each row execute function enforce_rental_draft_update();

alter table rental_drafts enable row level security;

create policy rental_drafts_select on rental_drafts
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

create policy rental_drafts_insert on rental_drafts
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
    and branch_id = auth_user_branch_id()
    and created_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
    and updated_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
  );

create policy rental_drafts_update on rental_drafts
  for update
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
    and updated_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
  );

grant select, insert, update on rental_drafts to authenticated, service_role;
revoke delete on rental_drafts from public, anon, authenticated;

comment on table rental_drafts is
  'Durable, versioned New Rental snapshots. Drafts do not reserve equipment; conversion links the retained snapshot to its confirmed booking.';
comment on column rental_drafts.client_uuid is
  'Idempotency key for creation/retry of this draft.';
comment on column rental_drafts.booking_client_uuid is
  'Stable create_booking idempotency key used when this exact draft is converted.';

commit;

-- >>> END 0125_rental_drafts.sql <<<

-- >>> START 0126_performance_indexes.sql <<<
-- =============================================================================
-- 0126_performance_indexes.sql — Database Indexing Optimization
--
-- Adds targeted B-tree indexes for foreign keys, join relationships, and hot
-- query paths identified in the system-wide performance audit.
--
-- Laws preserved:
--   - All operations are strictly additive (CREATE INDEX IF NOT EXISTS).
--   - No constraints, tables, views, or triggers are altered.
--   - Full idempotency guaranteed.
-- =============================================================================

begin;

-- 1. Unit Status Engine & Availability Checks
-- Accelerates trigger lookups in 0114_unit_status_engine (blu.asset_id = p_asset_id)
create index if not exists idx_booking_line_units_asset
  on public.booking_line_units (asset_id)
  where asset_id is not null;

-- 2. Inventory Reservations
-- Accelerates reservation lookups and releases by booking
create index if not exists idx_inventory_reservations_booking
  on public.inventory_reservations (booking_id);

create index if not exists idx_inventory_reservations_booking_line
  on public.inventory_reservations (booking_line_id);

-- 3. Operations Workspaces & Movement Ledger
-- Eliminates sequential table scans when loading warehouse session workspaces
create index if not exists idx_session_line_movements_session
  on public.session_line_movements (session_id);

create index if not exists idx_session_line_movements_booking_line
  on public.session_line_movements (booking_line_id);

create index if not exists idx_session_line_movements_unit
  on public.session_line_movements (unit_id)
  where unit_id is not null;

create index if not exists idx_packing_lines_session
  on public.packing_lines (session_id);

create index if not exists idx_return_lines_session
  on public.return_lines (session_id)
  where session_id is not null;

create index if not exists idx_handover_lines_completed_session
  on public.handover_lines (completed_session_id)
  where completed_session_id is not null;

create index if not exists idx_handover_lines_first_session
  on public.handover_lines (first_session_id)
  where first_session_id is not null;

-- 4. Client Directory & Contacts
-- Standard btree index on client_contacts for parent lookups
create index if not exists idx_client_contacts_client
  on public.client_contacts (client_id);

-- Speeds up alphabetical sorting and directory searching
create index if not exists idx_clients_name
  on public.clients (name);

-- Speeds up filtering by client status (Active vs Deactivated)
create index if not exists idx_clients_status
  on public.clients (status);

-- 5. Booking Line Hierarchy
-- Accelerates bundle child line resolution
create index if not exists idx_booking_lines_parent
  on public.booking_lines (parent_line_id)
  where parent_line_id is not null;

-- 6. Operations & Today Active Booking Paths
-- Partial composite indexes for operational date & stage queries
create index if not exists idx_bookings_active_pickup
  on public.bookings (stage, pickup_at)
  where cancelled_at is null;

create index if not exists idx_bookings_active_return
  on public.bookings (stage, return_at)
  where cancelled_at is null;

commit;

-- >>> END 0126_performance_indexes.sql <<<

-- >>> START 0127_query_optimization_indexes.sql <<<
-- =============================================================================
-- 0127_query_optimization_indexes.sql — Database Query Optimization Indexes
--
-- Performance Optimization Pass:
-- Adds essential B-tree indexes for foreign keys, sort orders, and lookup
-- queries identified across Rentals, Clients, Operations, and Finance modules.
--
-- Laws preserved:
--   - Strictly additive (CREATE INDEX IF NOT EXISTS).
--   - No constraints, tables, views, or triggers are altered.
--   - Full idempotency guaranteed.
-- =============================================================================

begin;

-- 1. Bookings lookups & default sorting
-- Accelerates client detail lookups: listBookings({ chips: { client_id } })
create index if not exists idx_bookings_client_id
  on public.bookings (client_id);

-- Accelerates default reverse-chronological sorting in RentalsList
create index if not exists idx_bookings_created_at_desc
  on public.bookings (created_at desc);

-- 2. Booking lines joins & sub-rental badge lookups
-- Foreign key index for lines belonging to a booking
create index if not exists idx_booking_lines_booking_id
  on public.booking_lines (booking_id);

-- Foreign key index for product lines
create index if not exists idx_booking_lines_product_id
  on public.booking_lines (product_id);

-- Partial composite index for fast sub-rental detection without sequential table scan
create index if not exists idx_booking_lines_subrental_lookup
  on public.booking_lines (booking_id, line_type)
  where voided_at is null;

-- 3. Product units scanner & barcode lookups
-- High-frequency barcode scanning in floor workspaces & modal
create index if not exists idx_product_units_barcode
  on public.product_units (barcode)
  where barcode is not null;

-- Serial number lookups in scanner & stock check
create index if not exists idx_product_units_serial_no
  on public.product_units (serial_no)
  where serial_no is not null;

-- Asset tag index for unit identification
create index if not exists idx_product_units_asset_tag
  on public.product_units (asset_tag);

-- 4. Clients fast directory search
-- Phone search in client combobox and directory
create index if not exists idx_clients_phone
  on public.clients (phone);

-- Email search in client combobox
create index if not exists idx_clients_email
  on public.clients (email)
  where email is not null;

-- 5. Invoices & Payments joins
-- Invoice lookup by booking in BookingDetail
create index if not exists idx_invoices_booking_id
  on public.invoices (booking_id);

-- Payment lookup by booking in BookingDetail
create index if not exists idx_payments_booking_id
  on public.payments (booking_id);

-- Sorted payment ledger
create index if not exists idx_payments_created_at_desc
  on public.payments (created_at desc);

-- 6. Operations & Reset queue
-- Booking lookup in reset queue (completeResetQueue)
create index if not exists idx_cleaning_queue_entries_booking_id
  on public.cleaning_queue_entries (booking_id);

-- Unit queue status in readOpenCleaning
create index if not exists idx_cleaning_queue_entries_unit_id
  on public.cleaning_queue_entries (unit_id);

commit;

-- >>> END 0127_query_optimization_indexes.sql <<<

-- >>> START 0128_transition_cinema_assets_to_serialized.sql <<<
-- =============================================================================
-- 0128_transition_cinema_assets_to_serialized.sql — AUD-020 (P2)
--
-- Transition Key Cinema Assets to Serialized Mode:
-- 1. Inserts/updates top-tier cinema cameras and cinema lenses with
--    tracking_mode = 'Serialised'.
-- 2. Seeds physical product_units for each cinema asset with unique asset tags,
--    serials, barcodes, and warehouse locations.
-- 3. Synchronizes products.total_quantity to match active unit counts.
-- =============================================================================

do $$
declare
  v_branch_id uuid;
  v_warehouse_id uuid;
  v_zone_cam_id uuid;
  v_zone_lens_id uuid;
  v_cat_cam_id uuid;
  v_cat_lens_id uuid;
  v_creator_id uuid;
  r record;
  v_unit_idx integer;
  v_tag text;
  v_sn text;
  v_zone_id uuid;
begin
  -- Resolve primary branch and warehouse
  select id into v_branch_id from branches where branch_code = 'BR-KTM-01' limit 1;
  if v_branch_id is null then
    select id into v_branch_id from branches order by created_at limit 1;
  end if;

  select id into v_warehouse_id from warehouses where warehouse_code = 'WH-KTM-MAIN' limit 1;
  if v_warehouse_id is null then
    select id into v_warehouse_id from warehouses order by created_at limit 1;
  end if;

  select id into v_zone_cam_id from storage_zones where code = 'ZONE-CAM-A' limit 1;
  select id into v_zone_lens_id from storage_zones where code = 'ZONE-LENS-B' limit 1;

  select id into v_cat_cam_id from inventory_categories where code = 'camera' limit 1;
  select id into v_cat_lens_id from inventory_categories where code = 'lens' limit 1;

  select id into v_creator_id from users where email = 'warehouse@babinrentals.com' limit 1;
  if v_creator_id is null then
    select id into v_creator_id from users order by created_at limit 1;
  end if;

  -- 1. Ensure the 14 cinema products exist in products with tracking_mode = 'Serialised'
  insert into products (
    client_uuid, asset_code, name, category_id, brand, model,
    tracking_mode, status, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
  ) values
    (gen_random_uuid(), 'EQ000066', 'DJI Ronin 4D 6K 4-Axis Cinema Camera System', v_cat_cam_id, 'DJI', 'Ronin 4D 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 12000.00, 1100000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000128', 'RED KOMODO 6K Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'KOMODO 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 15000.00, 1200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000129', 'RED Komodo X 6k Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'Komodo X 6K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 18000.00, 1500000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000130', 'RED V-Raptor 8K VV Cinema Camera (Body Only)', v_cat_cam_id, 'RED', 'V-Raptor 8K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 25000.00, 2400000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000189', 'Sony BURANO 8K Digital Cinema Camera (Body Only)', v_cat_cam_id, 'Sony', 'BURANO 8K', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 30000.00, 3200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000191', 'Sony FX3 Cinema Line Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX3', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 4500.00, 550000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000192', 'Sony FX30 Cinema Line Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX30', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 3000.00, 320000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000193', 'Sony FX6 Cinema Camera (Body Only)', v_cat_cam_id, 'Sony', 'ILME-FX6', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 8000.00, 950000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000035', 'Blazar Great Joy 1.8x T2.9 Anamorphic lens set (PL)', v_cat_lens_id, 'Blazar', 'Great Joy 1.8x Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 10000.00, 1200000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000036', 'BLAZAR LENS MANTIS 1.33x Anamorphic 5-Lens Set (ARRI PL)', v_cat_lens_id, 'Blazar', 'MANTIS 1.33x Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 14000.00, 1800000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000049', 'CHIOPT XTREME Zoom Lens 28–85mm T3.2', v_cat_lens_id, 'CHIOPT', 'XTREME 28-85mm T3.2', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 6000.00, 650000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000050', 'CHIOPT XTREME Zoom Lens 75–250mm T3.2', v_cat_lens_id, 'CHIOPT', 'XTREME 75-250mm T3.2', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 6000.00, 650000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000112', 'Meike Full Frame lens set (PL Mount)', v_cat_lens_id, 'Meike', 'FF Cine Set PL', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 7500.00, 800000.00, 1, true, true, v_creator_id),
    (gen_random_uuid(), 'EQ000113', 'NiSi ATHENA PRIME Cinema Lens Series', v_cat_lens_id, 'NiSi', 'ATHENA PRIME 5-Lens Set', 'Serialised'::product_tracking_mode, 'Active'::product_record_state, 9000.00, 1100000.00, 1, true, true, v_creator_id)
  on conflict (asset_code) do update
  set tracking_mode = 'Serialised'::product_tracking_mode,
      category_id = excluded.category_id;

  -- 2. Seed 2 physical units for each cinema asset if not already present
  for r in
    select p.id, p.asset_code, p.name, p.replacement_value, c.code as cat_code
    from products p
    left join inventory_categories c on c.id = p.category_id
    where p.asset_code in (
      'EQ000066', 'EQ000128', 'EQ000129', 'EQ000130', 'EQ000189', 'EQ000191', 'EQ000192', 'EQ000193',
      'EQ000035', 'EQ000036', 'EQ000049', 'EQ000050', 'EQ000112', 'EQ000113'
    )
  loop
    v_zone_id := case when r.cat_code = 'lens' then coalesce(v_zone_lens_id, v_zone_cam_id) else coalesce(v_zone_cam_id, v_zone_lens_id) end;

    for v_unit_idx in 1..2 loop
      v_tag := r.asset_code || '-U0' || v_unit_idx;
      v_sn  := 'SN-' || r.asset_code || '-0' || v_unit_idx;

      insert into product_units (
        client_uuid,
        product_id,
        serial_no,
        asset_tag,
        barcode,
        qr_code,
        status,
        condition,
        branch_id,
        warehouse_id,
        storage_zone_id,
        replacement_value,
        created_by
      ) values (
        gen_random_uuid(),
        r.id,
        v_sn,
        v_tag,
        v_tag,
        'https://babinrentals.com/qr/' || v_tag,
        'In Stock'::inventory_state,
        'Good'::unit_condition,
        v_branch_id,
        v_warehouse_id,
        v_zone_id,
        coalesce(r.replacement_value, 1500000.00),
        v_creator_id
      )
      on conflict (asset_tag) do nothing;
    end loop;

    -- 3. Synchronize total_quantity to count of non-retired units
    update products
    set total_quantity = (
      select count(*)
      from product_units
      where product_id = r.id and status <> 'Retired'
    )
    where id = r.id;
  end loop;
end;
$$;

-- >>> END 0128_transition_cinema_assets_to_serialized.sql <<<

-- >>> START 0129_audit_logs_view.sql <<<
-- =============================================================================
-- 0129_audit_logs_view.sql — AUD-017 (P2)
--
-- Provide audit_logs compatibility view over audit_events so tools, analytics,
-- and verification queries referencing audit_logs resolve transparently.
-- =============================================================================

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
  from public.audit_events;

comment on view public.audit_logs is
  'AUD-017: Transparent compatibility view over audit_events for universal audit trail logging and queries.';


-- >>> END 0129_audit_logs_view.sql <<<

-- >>> START 0130_law6_arm_money_grants_remaining_tables.sql <<<
-- =============================================================================
-- 0130 — Law 6: arm the money column grants on the remaining staff-visible
--        tables. NOT APPLIED to live (N-5) — this file is written and verified
--        locally; Babin applies it after the backup step.
--
-- ## What this closes
--
-- 0062 armed `bookings`, `products`, `product_units`, `booking_lines`; 0077
-- armed `accessories`/`booking_transport`/`maintenance_records`/`vehicle_fuel_
-- logs`. PLAN.md Phase 1 kept the item at [~] on the strength of one sentence:
-- "The remaining ~30 money base tables still carry the blanket grant, so their
-- `_v` mask stays bypassable." This file is that remainder, scoped.
--
-- The mechanical note from 0062/0077 still governs: Supabase's default
-- privileges give `authenticated` TABLE-level SELECT on every public table, and
-- `revoke select (col)` cannot subtract from a table grant (PostgreSQL records
-- nothing; pg_attribute.attacl stays null). The working sequence is the
-- reverse — drop the table grant, hand back the named non-money columns:
--
--     revoke select on <table> from authenticated;
--     grant  select (<every non-money column>) to authenticated;
--
-- After this, the money columns are reachable only through the `_v` views,
-- which re-apply `auth_can_view_money()` per role.
--
-- ## How the target list was measured, not inferred
--
-- scripts/check-law6-exposure.mjs builds the full chain in PGlite, seeds the
-- nine lifecycle users, and probes every money-pattern column as Warehouse /
-- Technician / Driver with `set local role authenticated` +
-- `app.current_user_id`. Its read on the pre-0130 schema:
--
--   · PROVEN TODAY: `booking_crew_lines` — Warehouse/Technician/Driver read all
--     120 rows WITH `day_rate` = 8000.00. Crew payout rates were live-readable
--     by money-blind roles. A real Law 6 breach.
--   · `clients.pan_vat` (40 rows) and `number_sequences.current_value` (12 rows)
--     are also readable: they are handled under "Deliberately not in this file"
--     below — neither is a money figure.
--   · Everything else: money columns readable, zero rows admitted today
--     (latent; activates with the first admitted row — 0077's prelude).
--
-- ## The money set per table comes from the project's own mask, not this file
--
-- 0048/0035–0039 already wrote masking views for 14 of the 16 tables; their
-- `case when auth_can_view_money() then <col>` arms ARE the declared money set.
-- This migration revokes exactly those columns at the base — no more, no less.
-- The two tables with no view get one here, same convention, and the columns
-- chosen there are stated in their section below.
--
--   Table                    | Masked at the base after this file
--   -------------------------+----------------------------------------------------
--   booking_crew_lines       | day_rate, overtime, accommodation, meals
--   bundles                  | daily_rate, weekly_rate
--   cases                    | assessed_amount, deposit_held_amount,
--                            |   charged_to_client_amount, deposit_applied_amount,
--                            |   insurance_claimed_amount, warranty_covered_amount,
--                            |   recovered_from_partner_amount, absorbed_amount
--   client_memberships       | fee_paid
--   clients                  | approved_credit_limit, payment_terms
--   crew_assignments         | daily_rate, line_total
--   crew_bookings            | day_rate
--   crew_members             | withholding_rate, day_rate, internal_note
--   crew_profiles_v2         | daily_rate, hourly_rate
--   damage_findings          | estimated_cost
--   fulfillment_outcomes     | estimated_revenue_lost
--   late_fee_findings        | day_rate_amount, fee_amount
--   membership_limit_breaches| limit_value, actual_value
--   membership_plans         | annual_fee, individual_discount_pct,
--                            |   bundle_discount_pct, default_credit_limit
--   purchase_requests        | estimated_unit_cost, total_estimated_cost
--   return_accessory_checks  | replacement_cost
--
-- Three of those sets carry their own note:
--
--   · crew_members.internal_note is not money — the existing view hides it,
--     so the base grant does too. A grant list that hands back what the view
--     was written to hide is a leak with extra steps. (B-1: stricter wins.)
--   · membership_limit_breaches.limit_value / actual_value are breach sizes —
--     counts in kind, money when the limit is a credit line. Not in §5's table
--     by name; masked because the cheaper reading is the wrong one to leak.
--   · clients.payment_terms is an enum, not a figure — but 0019's own masking
--     taxonomy treats it as commercial terms (it is masked in clients_v), and
--     §5's "credit limit, pay-later" row is this column's family.
--
-- `pan_vat` on clients/branches/suppliers stays granted: a registration number
-- is business identity, not a money figure, and 0048's clients_v leaves it
-- unmasked — same visibility today, plus a note for the PII pass (§10), which
-- is where identity narrowing belongs. Not silently dropped; consciously out
-- of scope for Law 6.
--
-- ## What this file deliberately does NOT arm
--
-- Row-gated money tables stay row-gated: `payments`, `invoices`,
-- `invoice_lines`, `security_deposits`, `deposit_movements`, `charges`,
-- `credit_notes`, `payment_reversals`, `expenses`, `expense_reversals`,
-- `depreciation_logs`, `tax_ledgers`, `coupons`, `coupon_redemptions`,
-- `external_invoices`. Their SELECT policies already refuse every money-blind
-- role (`auth_can_view_money()` / `auth_is_finance_or_admin()`), so a Warehouse
-- session gets zero rows today. Column grants would be the second layer; this
-- file is the layer that was MISSING (staff-visible tables), not a restack of
-- the one that holds. If one of those policies is ever loosened, that change
-- must add the column grants in the same diff.
--
-- Also skipped: `number_sequences.current_value` (a counter — order volume is
-- not a price), `stock_audits` totals / `broadcast_batches.total_recipients` /
-- `timesheets.total_hours` (counts and hours), `system_settings` (role-gated),
-- `sync_conflicts` (Owner/Admin), `user_approval_authorities` (Owner/Admin/
-- Manager).
--
-- ## The app was moved first — every money read already sits on a view
--
-- Call-site audit (2026-09-19, both quote styles, whole of src/): the tables
-- were either read only through their `_v` view, or moved to it in the same
-- change as this file —
--
--   · queries/bundles.ts, queries/addBundle.ts            → bundles_v
--   · queries/cases.ts, queries/damage.ts                 → cases_v
--   · queries/invoicePreview.ts (payment_terms)           → clients_v
--   · queries/purchaseRequests.ts                         → purchase_requests_v
--
-- Three write paths issued a bare `RETURNING *` on tables armed here and would
-- have thrown 42501 AFTER commit (the AUDIT_0062 phantom-write class). Fixed in
-- the same change by naming an echo or dropping it:
--
--   · actions/clients/createClient.ts          → returningColumns id, client_code
--   · actions/rentals/floorVerb.ts × 2         → returnRow: false (finding rows
--                                                were never read back)
--   · actions/inventory/approvePurchaseRequest → returningColumns id, pr_no, status
--
-- `actions/clients/mergeClients.ts` repoints by bare UPDATE (no RETURNING, so
-- the grants do not touch it) and now checks every repoint's error: the case
-- branch previously queried `cases.client_id`, a column that has never existed,
-- so it error'd silently on every merge — it is gone, and case attachment
-- follows the booking.
--
-- ⚠ FORWARD OBLIGATION (0065's, restated): PostgREST issues RETURNING * on a
-- bare insert/update; on these 16 tables that names an ungranted column and
-- fails after the commit. Any future writer passes `returnRow: false` or names
-- granted columns. `dataAccess`'s option docs carry the same warning text.
--
-- ⚠ MAINTENANCE OBLIGATION: a column ADDED to any of these 16 tables is
-- unreadable by `authenticated` until it is added to the grant list below. The
-- post-conditions count-check against information_schema, so an added column
-- fails the apply loudly rather than reading back nothing forever.
-- =============================================================================

begin;

-- 1 · booking_crew_lines — 15 columns, 11 granted
revoke select on booking_crew_lines from authenticated;
grant select (
  id, client_uuid, booking_id, crew_member_id, name, crew_role, phone,
  days, voided_at, created_at, created_by
) on booking_crew_lines to authenticated;

-- 2 · bundles — 13 columns, 11 granted
revoke select on bundles from authenticated;
grant select (
  id, client_uuid, bundle_code, name, description, category_id, is_active,
  created_at, created_by, updated_at, updated_by
) on bundles to authenticated;

-- 3 · cases — 26 columns, 18 granted
revoke select on cases from authenticated;
grant select (
  id, client_uuid, case_no, type, title, counterparty_kind, counterparty_name,
  priority, status, disposition, linked_booking_id, owner_id, flags,
  opened_at, settled_at, created_at, created_by, updated_at
) on cases to authenticated;

-- 4 · client_memberships — 10 columns, 9 granted
revoke select on client_memberships from authenticated;
grant select (
  id, client_uuid, client_id, plan_id, join_date,
  superseded_by_id, superseded_at, created_at, created_by
) on client_memberships to authenticated;

-- 5 · clients — 40 columns, 38 granted
revoke select on clients from authenticated;
grant select (
  id, client_uuid, client_code, type_parent, org_subtype, name, phone, email,
  pan_vat, business_registration, website, government_id_kind,
  government_id_number, address_line, city, district, postal_code, country,
  billing_address, client_since, professions, segments, source,
  referred_by_client_id, tags, preferred_contact_channels,
  marketing_photo_consent, notes, assigned_staff_id, status, deactivated_at,
  deactivated_by, deactivation_reason, merged_into_client_id,
  portal_default_language, created_at, created_by, updated_at
) on clients to authenticated;

-- 6 · crew_assignments — 15 columns, 13 granted
revoke select on crew_assignments from authenticated;
grant select (
  id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time,
  days, notes, created_at, created_by, updated_at, updated_by
) on crew_assignments to authenticated;

-- 7 · crew_bookings — 24 columns, 23 granted
revoke select on crew_bookings from authenticated;
grant select (
  id, client_uuid, crew_booking_no, production_id, booking_id, crew_member_id,
  position, days, start_date, end_date, location, state, payout_state,
  conflict_override_by, conflict_override_reason, conflict_override_at,
  travel_warning_acknowledged_by, travel_warning_acknowledged_at, cancelled_at,
  cancel_reason, created_by, created_at, updated_at
) on crew_bookings to authenticated;

-- 8 · crew_members — 14 columns, 11 granted
revoke select on crew_members from authenticated;
grant select (
  id, client_uuid, full_name, position, phone, engagement_type, pan_status,
  deactivated_at, created_by, created_at, updated_at
) on crew_members to authenticated;

-- 9 · crew_profiles_v2 — 15 columns, 13 granted
revoke select on crew_profiles_v2 from authenticated;
grant select (
  id, client_uuid, crew_code, full_name, mobile, email, primary_role,
  is_internal_staff, is_active, created_at, created_by, updated_at, updated_by
) on crew_profiles_v2 to authenticated;

-- 10 · damage_findings — 20 columns, 19 granted
revoke select on damage_findings from authenticated;
grant select (
  id, client_uuid, source, return_line_id, cleaning_queue_entry_id, unit_id,
  damage_type, description, severity, approval_state, approved_by,
  approved_at, disposition, case_id, charge_id, voided_at, created_at,
  created_by, updated_at
) on damage_findings to authenticated;

-- 11 · fulfillment_outcomes — 21 columns, 20 granted
revoke select on fulfillment_outcomes from authenticated;
grant select (
  id, client_uuid, booking_id, booking_line_id, requested_model_id,
  requested_qty, delivered_qty, fulfillment_status, substituted_model_id,
  swap_type, sub_rental_id, waiting_since, resolved_at, delivery_method,
  assigned_staff_id, due_date_ad, branch_id, warehouse_id, created_at,
  created_by
) on fulfillment_outcomes to authenticated;

-- 12 · late_fee_findings — 18 columns, 16 granted
revoke select on late_fee_findings from authenticated;
grant select (
  id, client_uuid, booking_id, return_session_id, scheduled_return_at,
  actual_return_at, overage_minutes, band, full_days_charged, approval_state,
  approved_by, approved_at, voided_at, voided_reason, created_at, created_by
) on late_fee_findings to authenticated;

-- 13 · membership_limit_breaches — 10 columns, 8 granted
revoke select on membership_limit_breaches from authenticated;
grant select (
  id, client_uuid, client_id, membership_id, breach_kind, booking_id,
  created_at, approved_by
) on membership_limit_breaches to authenticated;

-- 14 · membership_plans — 19 columns, 15 granted
revoke select on membership_plans from authenticated;
grant select (
  id, client_uuid, level, label, monthly_booking_limit,
  simultaneous_rental_limit, authorized_users, term_months, perks,
  display_order, status, retired_at, created_at, created_by, updated_at
) on membership_plans to authenticated;

-- 15 · purchase_requests — 18 columns, 16 granted
revoke select on purchase_requests from authenticated;
grant select (
  id, client_uuid, pr_no, product_id, supplier_id, quantity, reason_type,
  urgency, status, requested_by, approved_by, rejection_reason, created_at,
  created_by, updated_at, updated_by
) on purchase_requests to authenticated;

-- 16 · return_accessory_checks — 9 columns, 8 granted
revoke select on return_accessory_checks from authenticated;
grant select (
  id, client_uuid, return_line_id, accessory_id, accessory_name, present,
  created_at, created_by
) on return_accessory_checks to authenticated;

-- ---------------------------------------------------------------------------
-- The two masking views that were never written — created here, never apart
-- from the revoke (0019/0035/0036/0077 convention). Definer rights, explicit
-- row predicate copied from the effective read policy, money through
-- auth_can_view_money(). Do NOT set security_invoker on either view: under
-- this migration that re-applies the caller's revoked grants and kills the
-- read for every role (0061's bug, 0065's repair).
-- ---------------------------------------------------------------------------

create or replace view public.fulfillment_outcomes_v as
select
  id,
  client_uuid,
  booking_id,
  booking_line_id,
  requested_model_id,
  requested_qty,
  delivered_qty,
  fulfillment_status,
  substituted_model_id,
  swap_type,
  sub_rental_id,
  waiting_since,
  resolved_at,
  delivery_method,
  assigned_staff_id,
  due_date_ad,
  branch_id,
  warehouse_id,
  case when auth_can_view_money() then estimated_revenue_lost else null::numeric end as estimated_revenue_lost,
  created_at,
  created_by
from fulfillment_outcomes
where auth_is_staff();

grant select on public.fulfillment_outcomes_v to authenticated;

comment on view public.fulfillment_outcomes_v is
  'Law 6. The only path to fulfillment_outcomes.estimated_revenue_lost once 0130 '
  'arms the mask. Definer rights + explicit row predicate (0048): the effective '
  'read gate is auth_is_staff() — fulfillment_outcomes_select plus the role-listed '
  'fulfillment_outcomes_all are PERMISSIVE and OR together. Do NOT set '
  'security_invoker on this view.';

create or replace view public.membership_limit_breaches_v as
select
  id,
  client_uuid,
  client_id,
  membership_id,
  breach_kind,
  booking_id,
  case when auth_can_view_money() then limit_value else null::integer end as limit_value,
  case when auth_can_view_money() then actual_value else null::integer end as actual_value,
  created_at,
  approved_by
from membership_limit_breaches
where auth_is_staff();

grant select on public.membership_limit_breaches_v to authenticated;

comment on view public.membership_limit_breaches_v is
  'Law 6. The only path to membership_limit_breaches.limit_value / actual_value '
  'once 0130 arms the mask. Definer rights + auth_is_staff() row gate (effective '
  'gate of the two PERMISSIVE policies). Do NOT set security_invoker.';

-- ---------------------------------------------------------------------------
-- Post-conditions — the checks 0019/0035/0036 never had. Refuse to leave this
-- half-landed: blanket grant gone per table, every masked column refused, a
-- neighbouring operational column still readable, base-table column counts
-- still match this file's written lists, and every masking view present,
-- row-gated and definer-rights.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tables constant text[] := array[
    'booking_crew_lines', 'bundles', 'cases', 'client_memberships', 'clients',
    'crew_assignments', 'crew_bookings', 'crew_members', 'crew_profiles_v2',
    'damage_findings', 'fulfillment_outcomes', 'late_fee_findings',
    'membership_limit_breaches', 'membership_plans', 'purchase_requests',
    'return_accessory_checks'
  ];
  v_money constant jsonb := '{
    "booking_crew_lines":       ["day_rate", "overtime", "accommodation", "meals"],
    "bundles":                  ["daily_rate", "weekly_rate"],
    "cases":                    ["assessed_amount", "deposit_held_amount", "charged_to_client_amount", "deposit_applied_amount", "insurance_claimed_amount", "warranty_covered_amount", "recovered_from_partner_amount", "absorbed_amount"],
    "client_memberships":       ["fee_paid"],
    "clients":                  ["approved_credit_limit", "payment_terms"],
    "crew_assignments":         ["daily_rate", "line_total"],
    "crew_bookings":            ["day_rate"],
    "crew_members":             ["withholding_rate", "day_rate", "internal_note"],
    "crew_profiles_v2":         ["daily_rate", "hourly_rate"],
    "damage_findings":          ["estimated_cost"],
    "fulfillment_outcomes":     ["estimated_revenue_lost"],
    "late_fee_findings":        ["day_rate_amount", "fee_amount"],
    "membership_limit_breaches":["limit_value", "actual_value"],
    "membership_plans":         ["annual_fee", "individual_discount_pct", "bundle_discount_pct", "default_credit_limit"],
    "purchase_requests":        ["estimated_unit_cost", "total_estimated_cost"],
    "return_accessory_checks":  ["replacement_cost"]
  }'::jsonb;
  v_keep constant jsonb := '{
    "booking_crew_lines": "name",             "bundles": "bundle_code",
    "cases": "case_no",                        "client_memberships": "plan_id",
    "clients": "name",                         "crew_assignments": "crew_id",
    "crew_bookings": "crew_booking_no",        "crew_members": "full_name",
    "crew_profiles_v2": "crew_code",           "damage_findings": "unit_id",
    "fulfillment_outcomes": "booking_id",      "late_fee_findings": "booking_id",
    "membership_limit_breaches": "client_id",  "membership_plans": "level",
    "purchase_requests": "pr_no",              "return_accessory_checks": "accessory_name"
  }'::jsonb;
  v_counts constant jsonb := '{
    "booking_crew_lines": 15, "bundles": 13, "cases": 26, "client_memberships": 10,
    "clients": 40, "crew_assignments": 15, "crew_bookings": 24, "crew_members": 14,
    "crew_profiles_v2": 15, "damage_findings": 20, "fulfillment_outcomes": 21,
    "late_fee_findings": 18, "membership_limit_breaches": 10, "membership_plans": 19,
    "purchase_requests": 18, "return_accessory_checks": 9
  }'::jsonb;
  v_views constant text[] := array[
    'booking_crew_lines_v', 'bundles_v', 'cases_v', 'client_memberships_v',
    'clients_v', 'crew_assignments_v', 'crew_bookings_v', 'crew_members_v',
    'crew_profiles_v2_v', 'damage_findings_v', 'fulfillment_outcomes_v',
    'late_fee_findings_v', 'membership_limit_breaches_v', 'membership_plans_v',
    'purchase_requests_v', 'return_accessory_checks_v'
  ];
  t text;
  c text;
  v_actual int;
begin
  foreach t in array v_tables loop
    -- 1 · the blanket is gone
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      raise exception
        '0130 post-condition failed: authenticated still holds TABLE-level SELECT on public.% -- the mask is inert, exactly as in 0019/0035/0036.', t;
    end if;

    -- 2a · every masked column is refused
    for c in select jsonb_array_elements_text(v_money -> t) loop
      if has_column_privilege('authenticated', format('public.%I', t), c, 'SELECT') then
        raise exception
          '0130 post-condition failed: authenticated can still read %.% -- Law 6 is not armed on this column.', t, c;
      end if;
    end loop;

    -- 2b · the operational half survived
    if not has_column_privilege('authenticated', format('public.%I', t), v_keep ->> t, 'SELECT') then
      raise exception
        '0130 post-condition failed: %.% is no longer readable -- the revoke was over-broad and took an operational column with it.', t, v_keep ->> t;
    end if;

    -- 3 · the column list this file was written against still holds
    select count(*) into v_actual
      from information_schema.columns
     where table_schema = 'public' and table_name = t;
    if v_actual is distinct from (v_counts ->> t)::int then
      raise exception
        '0130 post-condition failed: public.% has % columns, expected % -- a column was added or dropped since this file was drafted and is now ungranted (fail-closed). Update the grant list above.', t, v_actual, (v_counts ->> t)::int;
    end if;
  end loop;

  -- 4 · every masking view is present, row-gated, and definer-rights
  foreach t in array v_views loop
    if not exists (
      select 1 from pg_views where schemaname = 'public' and viewname = t
    ) then
      raise exception '0130 post-condition failed: view public.% does not exist -- the money columns have no sanctioned read path at all.', t;
    end if;

    if not exists (
      select 1 from pg_views
       where schemaname = 'public' and viewname = t and definition ilike '%where%'
    ) then
      raise exception '0130 post-condition failed: view public.% has no WHERE clause (0048''s stated failure mode).', t;
    end if;

    if exists (
      select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
       where n.nspname = 'public' and k.relname = t
         and coalesce(k.reloptions, '{}') && array['security_invoker=on', 'security_invoker=true']
    ) then
      raise exception '0130 post-condition failed: view public.% is security_invoker -- under this migration the caller''s revoked grants apply and the read dies for every role (0061''s bug, 0065''s repair).', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The check that proves it, by hand. Run AFTER applying, inside a transaction
-- that rolls back — the MCP/service connection bypasses RLS and proves nothing
-- on its own (0077's §7 ritual):
--
--     begin;
--     set local role authenticated;
--     select set_config('app.current_user_id', '<a Warehouse user uuid>', true);
--
--     select day_rate from booking_crew_lines limit 1;   -- expect 42501
--     select estimated_cost from damage_findings limit 1; -- expect 42501
--     select approved_credit_limit from clients limit 1;  -- expect 42501
--     select name from clients limit 1;                   -- expect no error
--     select day_rate from booking_crew_lines_v limit 1;  -- expect null
--     select case_no from cases limit 1;                  -- expect no error
--     rollback;
--
--     Then as an Owner user: the base-table money reads still raise 42501 —
--     THAT is correct; it is what forces every future call site through a
--     view — and the `_v` reads return real figures.
--
-- Local proof: scripts/check-law6-exposure.mjs (schema-build + role-simulated
-- probes) passes with every money column refused and every _v read serving.
-- ---------------------------------------------------------------------------

commit;

-- >>> END 0130_law6_arm_money_grants_remaining_tables.sql <<<

-- Reset migration probe session setting
select set_config('app.in_create_booking', 'off', false);
