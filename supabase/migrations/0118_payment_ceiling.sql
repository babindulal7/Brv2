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