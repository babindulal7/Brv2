-- ============================================================================
-- 0036_crew_booking_and_vehicle_expense_policies.sql
--
-- Fourteenth reviewed batch out of the money-adjacent bucket (§6.10-§6.22 in
-- PLAN.md). Continues straight from §6.22's list of 13 untouched tables,
-- same `0019` view-masking pattern. Seven tables, grouped by domain:
--
--   - `crew_bookings` / `crew_assignments` / `booking_crew_lines` — three
--     separate "a crew member costs money on a booking" tables (the first
--     two are the two halves of 0009's still-open crew-model duplication,
--     §6.21; the third is bookings' own inline crew-charge line, unrelated
--     to either crew-identity table). Each masks its own rate/line-total
--     columns independently rather than assuming one shared tier.
--   - `booking_discounts` — checked column by column: every field is
--     approval/finance metadata (percent, reason, approver, applied_by,
--     coupon linkage), nothing a floor role has a reason to read. Whole-row
--     gate, same shape 0035 used for depreciation_logs/tax_ledgers.
--   - `vehicle_fuel_logs` / `purchase_requests` — mixed rows, same shape as
--     0034/0035's mixed-row tables.
--   - `return_accessory_checks` — mixed row, but its own column comment
--     ("Writable by Owner, Manager or Billing only and hidden from
--     Warehouse entirely") asks for something plain REVOKE/GRANT cannot
--     give: a column-level WRITE restricted to a role SUBSET, where the
--     actual Postgres connection role is uniformly `authenticated` and the
--     real role lives in `users.primary_role`, read per-row. Column GRANTs
--     are static, not row-aware, so they cannot express "authenticated may
--     write this column, but only when auth_user_role() is one of three
--     values" -- that needs a BEFORE INSERT/UPDATE trigger. Flagged as
--     TRIGGER REQUIRED below rather than left silently unenforced or
--     papered over with a REVOKE that would block Owner/Manager too.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · crew_bookings — mixed row, one money column (day_rate). Everything
-- else (state, payout_state, conflict_override_*, travel_warning_*,
-- cancel_reason) is workflow/operational, exactly the shape Warehouse/
-- Coordinator need to see to do their own jobs.
-- ---------------------------------------------------------------------------

drop policy if exists crew_bookings_all on crew_bookings;
create policy crew_bookings_all on crew_bookings
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (day_rate) on crew_bookings from authenticated;

create or replace view crew_bookings_v as
select
  id, client_uuid, crew_booking_no, production_id, booking_id, crew_member_id,
  position,
  case when auth_can_view_money() then day_rate else null end as day_rate,
  days, start_date, end_date, location, state, payout_state,
  conflict_override_by, conflict_override_reason, conflict_override_at,
  travel_warning_acknowledged_by, travel_warning_acknowledged_at,
  cancelled_at, cancel_reason, created_by, created_at, updated_at
from crew_bookings;

grant select on crew_bookings_v to authenticated;

comment on view crew_bookings_v is
  'Column-masked read surface for crew_bookings -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 2 · crew_assignments — mixed row, two money columns (daily_rate,
-- line_total). The 0009 crew model's own booking-assignment table.
-- ---------------------------------------------------------------------------

drop policy if exists crew_assignments_all on crew_assignments;
create policy crew_assignments_all on crew_assignments
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (daily_rate, line_total) on crew_assignments from authenticated;

create or replace view crew_assignments_v as
select
  id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time,
  case when auth_can_view_money() then daily_rate else null end as daily_rate,
  days,
  case when auth_can_view_money() then line_total else null end as line_total,
  notes, created_at, created_by, updated_at, updated_by
from crew_assignments;

grant select on crew_assignments_v to authenticated;

comment on view crew_assignments_v is
  'Column-masked read surface for crew_assignments -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 3 · booking_crew_lines — mixed row, four money columns (day_rate,
-- overtime, accommodation, meals). A booking's own inline crew charge line
-- -- distinct from both crew-identity tables above.
-- ---------------------------------------------------------------------------

drop policy if exists booking_crew_lines_all on booking_crew_lines;
create policy booking_crew_lines_all on booking_crew_lines
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (day_rate, overtime, accommodation, meals) on booking_crew_lines from authenticated;

create or replace view booking_crew_lines_v as
select
  id, client_uuid, booking_id, crew_member_id, name, crew_role, phone,
  case when auth_can_view_money() then day_rate else null end as day_rate,
  days,
  case when auth_can_view_money() then overtime else null end as overtime,
  case when auth_can_view_money() then accommodation else null end as accommodation,
  case when auth_can_view_money() then meals else null end as meals,
  voided_at, created_at, created_by
from booking_crew_lines;

grant select on booking_crew_lines_v to authenticated;

comment on view booking_crew_lines_v is
  'Column-masked read surface for booking_crew_lines -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 4 · booking_discounts — whole-row, not mixed. Every column is discount-
-- approval metadata (percent, reason, approver, applied_by, coupon
-- linkage) with no floor use, same reasoning 0035 used for depreciation_
-- logs/tax_ledgers. Broader than that finance-function tier, though:
-- Coordinator legitimately applies discounts on a booking (Foundation's own
-- discount gate, lib/money.ts's discountGate()), not just Accounts.
-- ---------------------------------------------------------------------------

drop policy if exists booking_discounts_money_blind on booking_discounts;
create policy booking_discounts_money_blind on booking_discounts
  for all
  using (auth_can_view_money())
  with check (auth_can_view_money());

-- ---------------------------------------------------------------------------
-- 5 · vehicle_fuel_logs — mixed row, one money column (cost_amount).
-- Mirrors vehicles_all/vehicle_trip_logs_all (0032/0033): Driver included,
-- since a driver is who actually logs a fuel purchase.
-- ---------------------------------------------------------------------------

drop policy if exists vehicle_fuel_logs_all on vehicle_fuel_logs;
create policy vehicle_fuel_logs_all on vehicle_fuel_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'));

revoke select (cost_amount) on vehicle_fuel_logs from authenticated;

create or replace view vehicle_fuel_logs_v as
select
  id, client_uuid, vehicle_id, fuel_date, odometer, fuel_liters,
  case when auth_can_view_money() then cost_amount else null end as cost_amount,
  receipt_url, branch_id, recorded_by, created_at
from vehicle_fuel_logs;

grant select on vehicle_fuel_logs_v to authenticated;

comment on view vehicle_fuel_logs_v is
  'Column-masked read surface for vehicle_fuel_logs -- see products_v (0019) for the pattern. cost_amount resolves to NULL for Driver/Warehouse/Technician -- a driver may still WRITE the receipt total when logging a fill-up (this view only governs SELECT), just never read it back.';

-- ---------------------------------------------------------------------------
-- 6 · purchase_requests — mixed row, two money columns
-- (estimated_unit_cost, total_estimated_cost). Warehouse initiates PRs
-- operationally; the cost estimate is the money-adjacent part.
-- ---------------------------------------------------------------------------

drop policy if exists purchase_requests_all on purchase_requests;
create policy purchase_requests_all on purchase_requests
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (estimated_unit_cost, total_estimated_cost) on purchase_requests from authenticated;

create or replace view purchase_requests_v as
select
  id, client_uuid, pr_no, product_id, supplier_id, quantity,
  case when auth_can_view_money() then estimated_unit_cost else null end as estimated_unit_cost,
  case when auth_can_view_money() then total_estimated_cost else null end as total_estimated_cost,
  reason_type, urgency, status, requested_by, approved_by, rejection_reason,
  created_at, created_by, updated_at, updated_by
from purchase_requests;

grant select on purchase_requests_v to authenticated;

comment on view purchase_requests_v is
  'Column-masked read surface for purchase_requests -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 7 · return_accessory_checks — mixed row, one money column
-- (replacement_cost). Row visibility unchanged (Warehouse records Present/
-- Missing, per this table's own header); replacement_cost masked for
-- SELECT the same way as everywhere else in this batch. Its own column
-- comment additionally asks for WRITE restricted to Owner/Manager/Accounts
-- specifically -- see the file header for why that needs a trigger, not a
-- REVOKE/GRANT, and is flagged rather than built here.
-- ---------------------------------------------------------------------------

drop policy if exists return_accessory_checks_all on return_accessory_checks;
create policy return_accessory_checks_all on return_accessory_checks
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (replacement_cost) on return_accessory_checks from authenticated;

create or replace view return_accessory_checks_v as
select
  id, client_uuid, return_line_id, accessory_id, accessory_name, present,
  case when auth_can_view_money() then replacement_cost else null end as replacement_cost,
  created_at, created_by
from return_accessory_checks;

grant select on return_accessory_checks_v to authenticated;

comment on view return_accessory_checks_v is
  'Column-masked read surface for return_accessory_checks -- see products_v (0019) for the pattern.';

-- TRIGGER REQUIRED: replacement_cost may only be WRITTEN by Owner, Manager
--   or Accounts -- this table's own column comment. auth_is_staff() above
--   only governs row visibility and covers every other column; a column-
--   level write restriction to a role SUBSET needs a BEFORE INSERT/UPDATE
--   trigger checking auth_user_role(), since Postgres column GRANTs are
--   static and cannot key off a per-row role lookup. Not built in this
--   migration -- same "flag, do not invent" rule as every other TRIGGER
--   REQUIRED note in this schema.

commit;
