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
