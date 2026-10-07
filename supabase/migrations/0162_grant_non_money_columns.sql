-- ============================================================================
-- 0162_grant_non_money_columns.sql
--
-- Renumbered from an uncommitted 0159 on 8 Oct 2026 (0159 is saved views). The
-- bookings line repeats 0161 and is harmless; the other three tables are new here.
--
-- Law 6 (0062, 0077, 0130) armed column-level masking by revoking table-level
-- SELECT on tables carrying money columns from `authenticated` and granting
-- column-level SELECT on non-money columns only.
--
-- Subsequent migrations added new non-money columns to several tables without
-- extending the column-level SELECT grants for `authenticated`. This caused
-- any authenticated query selecting those columns (e.g. `confirmRental`'s
-- `readBooking` selecting `project_type`) to fail with:
--   "permission denied for table bookings"
--
-- This migration grants SELECT on all missing non-money columns to `authenticated`:
-- 1. `bookings`: project_type, project_type_other (0144)
-- 2. `booking_lines`: updated_at, rate_overridden, subrental_return_by (0138)
-- 3. `products`: service_interval_days, service_interval_rental_days, service_interval_meter_hours, service_grace_days
-- 4. `product_units`: meter_hours_recorded_at, service_meter_baseline
-- ============================================================================

begin;

grant select (project_type, project_type_other) on bookings to authenticated;
grant select (updated_at, rate_overridden, subrental_return_by) on booking_lines to authenticated;
grant select (service_interval_days, service_interval_rental_days, service_interval_meter_hours, service_grace_days) on products to authenticated;
grant select (meter_hours_recorded_at, service_meter_baseline) on product_units to authenticated;

commit;
