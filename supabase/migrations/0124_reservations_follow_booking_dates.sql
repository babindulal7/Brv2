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
