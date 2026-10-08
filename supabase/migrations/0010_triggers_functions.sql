-- =============================================================================
-- 0010_triggers_functions.sql — triggers, automation functions & state machines
--
-- Laws encoded here, in the database, with no role bypass:
--   * Central audit logging trigger automatically writing to audit_events.
--   * Booking state machine forward-only transition validator.
--   * Pricing engine calculation function (Law 1, Law 10).
--   * Security deposit balance recalculation function (Law 5).
--   * Inventory unit state sync with booking lifecycle events.
--   * Handover and Closure gate checklist validation triggers.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Universal Audit Logger Trigger Function
-- Automatically captures every INSERT and UPDATE on tracked tables.
-- =============================================================================
create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_actor_id uuid;
  v_client_uuid uuid := gen_random_uuid();
  v_action audit_action;
  v_event_class audit_event_class := 'status change';
  v_category audit_category := 'Rentals';
  v_module audit_module := 'Rentals';
begin
  -- Resolve actor from session setting or default to system
  begin
    v_actor_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  exception when others then
    v_actor_id := null;
  end;

  if (TG_OP = 'INSERT') then
    v_action := 'Create';
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
      new_values
    ) values (
      v_client_uuid,
      v_event_class,
      v_category,
      v_module,
      v_action,
      'Informational',
      'Success',
      TG_TABLE_NAME,
      NEW.id,
      /* Read through to_jsonb(NEW), never as a hard field reference: this
         trigger is attached to tables that do not define the column at all
         (payments has neither created_by nor updated_by; clients has
         created_by but no updated_by), and in PL/pgSQL `NEW.created_by` on such a row
         raises 42703 and aborts the statement. A missing key yields NULL
         here, so the coalesce fallback that was always the intent runs.
         Backported from 0051, which diagnosed it — that file still applies
         the same fix, harmlessly, and records the outage it caused. Without
         the fix HERE, 0047's seed cannot insert and no database can be
         built from scratch (BUG-010, PLAN.md §4.42a). */
      coalesce(nullif(to_jsonb(NEW) ->> 'created_by', '')::uuid, v_actor_id),
      to_jsonb(NEW)
    );
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    v_action := 'Update';
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
      old_values,
      new_values
    ) values (
      v_client_uuid,
      v_event_class,
      v_category,
      v_module,
      v_action,
      'Informational',
      'Success',
      TG_TABLE_NAME,
      NEW.id,
      coalesce(nullif(to_jsonb(NEW) ->> 'updated_by', '')::uuid, v_actor_id),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    return NEW;
  end if;

  return null;
end;
$$;


-- =============================================================================
-- 2. Attach Universal Audit Trigger to Core Tables
-- =============================================================================
create trigger trg_audit_bookings after insert or update on bookings
  for each row execute function log_audit_event();

create trigger trg_audit_clients after insert or update on clients
  for each row execute function log_audit_event();

create trigger trg_audit_invoices after insert or update on invoices
  for each row execute function log_audit_event();

create trigger trg_audit_payments after insert on payments
  for each row execute function log_audit_event();

create trigger trg_audit_security_deposits after insert or update on security_deposits
  for each row execute function log_audit_event();

-- Retargeted 9 Aug 2026 (see 0020): written against a table named
-- `inventory_units`, which does not exist anywhere in this schema --
-- `product_units` (0004_inventory.sql) is the real table. As written this
-- statement would fail with "relation does not exist" the moment this file
-- was applied, aborting the whole migration.
create trigger trg_audit_product_units after insert or update on product_units
  for each row execute function log_audit_event();


-- =============================================================================
-- 3. Pricing Engine Calculation Trigger
-- Enforces: Subtotal -> Discount -> Taxable -> VAT (13%) -> Total -> Outstanding.
-- =============================================================================
create or replace function recalculate_invoice_totals()
returns trigger
language plpgsql
as $$
declare
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_outstanding numeric(14,2);
  v_target_invoice_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_target_invoice_id := OLD.invoice_id;
  else
    v_target_invoice_id := NEW.invoice_id;
  end if;

  -- 1. Calculate sum of line totals
  select coalesce(sum(line_total), 0)
  into v_subtotal
  from invoice_lines
  where invoice_id = v_target_invoice_id;

  -- 2. Fetch invoice discount percentage and paid amount
  select discount_percent, coalesce(paid_amount, 0)
  into STRICT v_discount, v_paid
  from invoices
  where id = v_target_invoice_id;

  -- 3. Calculate step-by-step
  v_discount := round(v_subtotal * (v_discount / 100.0), 2);
  v_taxable := v_subtotal - v_discount;
  v_vat := round(v_taxable * 0.13, 2);
  v_total := v_taxable + v_vat;
  v_outstanding := v_total - v_paid;

  -- 4. Update the invoice summary fields atomically
  update invoices
  set
    subtotal = v_subtotal,
    discount_amount = v_discount,
    taxable_amount = v_taxable,
    vat_amount = v_vat,
    total_amount = v_total,
    outstanding_amount = v_outstanding,
    updated_at = now()
  where id = v_target_invoice_id;

  return null;
end;
$$;

create trigger trg_recalc_invoice_lines after insert or update or delete on invoice_lines
  for each row execute function recalculate_invoice_totals();


-- =============================================================================
-- 4. Security Deposit Balance Sync Trigger
-- Reconciles Received, Refunded, Applied, and Pending from deposit_movements.
-- =============================================================================
create or replace function sync_deposit_balances()
returns trigger
language plpgsql
as $$
declare
  v_deposit_id uuid := NEW.security_deposit_id;
  v_received numeric(14,2);
  v_released numeric(14,2);
  v_applied numeric(14,2);
  v_required numeric(14,2);
  v_pending numeric(14,2);
begin
  select required_amount into v_required
  from security_deposits
  where id = v_deposit_id;

  select
    coalesce(sum(case when movement_type = 'Received' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'Released' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'Applied' then amount else 0 end), 0)
  into v_received, v_released, v_applied
  from deposit_movements
  where security_deposit_id = v_deposit_id;

  v_pending := greatest(0, v_required - v_received);

  update security_deposits
  set
    received_amount = v_received,
    refunded_amount = v_released,
    applied_amount = v_applied,
    pending_amount = v_pending,
    updated_at = now()
  where id = v_deposit_id;

  return NEW;
end;
$$;

create trigger trg_sync_deposit_movements after insert on deposit_movements
  for each row execute function sync_deposit_balances();


-- =============================================================================
-- 5. Payment Received Sync Trigger
-- Updates invoice paid_amount and outstanding_amount when a payment arrives.
-- =============================================================================
create or replace function sync_payment_to_invoice()
returns trigger
language plpgsql
as $$
declare
  v_total_paid numeric(14,2);
  v_total_amount numeric(14,2);
  v_outstanding numeric(14,2);
begin
  if NEW.invoice_id is not null then
    select total_amount into v_total_amount
    from invoices
    where id = NEW.invoice_id;

    select coalesce(sum(amount), 0) into v_total_paid
    from payments
    where invoice_id = NEW.invoice_id and status = 'Received';

    v_outstanding := greatest(0, v_total_amount - v_total_paid);

    update invoices
    set
      paid_amount = v_total_paid,
      outstanding_amount = v_outstanding,
      status = case
        when v_outstanding = 0 then 'Paid'::invoice_status
        when v_total_paid > 0 then 'Partially Paid'::invoice_status
        else status
      end,
      updated_at = now()
    where id = NEW.invoice_id;
  end if;

  return NEW;
end;
$$;

create trigger trg_sync_payments after insert on payments
  for each row execute function sync_payment_to_invoice();


-- =============================================================================
-- 6. Booking Handover & Closure Gate Enforcement Trigger
-- Validates:
--   * Handover (transition to 'On Rent') requires zero blocking issues.
--   * Closed (transition to 'Closed') requires settled invoice and deposit.
--
-- Retargeted 9 Aug 2026 (see 0020): originally written against
-- `NEW.stage_number` / `OLD.stage_number` -- a numbered-stage column from
-- the retired 13-stage model that was never a real column on `bookings` in
-- this schema (`stage_number` matches nothing in any of the 19 migration
-- files; grep confirms these two lines were its only occurrences anywhere).
-- As written, this trigger would raise "record 'new' has no field
-- 'stage_number'" on every single UPDATE to `bookings`, live or not.
-- `bookings.stage` (enum `booking_stage`, canonical six stages, declared in
-- lifecycle order per 0015) is the real column; Postgres enum comparison
-- (`<`) follows that declared order, so `OLD.stage < 'On Rent'` reproduces
-- the old ordinal `OLD.stage_number < 6` check exactly. Old "Stage 6"
-- (Handover -- equipment leaves the warehouse) maps to the new 'On Rent'
-- stage; old "Stage 10" (Closed) maps directly to the new 'Closed' stage,
-- same name. The gate LOGIC itself (deposit/invoice settlement checks) is
-- unchanged -- only the broken column reference is fixed.
-- =============================================================================
create or replace function validate_booking_gates()
returns trigger
language plpgsql
as $$
declare
  v_deposit_pending numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
begin
  -- 1. Check Handover Gate (Transition to 'On Rent')
  if NEW.stage = 'On Rent' and (OLD.stage is null or OLD.stage < 'On Rent') then
    -- Check deposit pending
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Handover blocked due to pending deposit balance (Rs. %).', v_deposit_pending;
    end if;

    -- Check payment outstanding on invoices
    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Handover blocked due to outstanding rental payment (Rs. %).', v_rental_outstanding;
    end if;
  end if;

  -- 2. Check Closed Gate (Transition to 'Closed')
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

create trigger trg_booking_gate_check before update on bookings
  for each row execute function validate_booking_gates();

commit;
