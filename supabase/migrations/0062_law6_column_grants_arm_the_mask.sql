-- =============================================================================
-- 0062 — Arm Law 6. Revoke table-level SELECT, grant the non-money columns.
--
-- ⛔ DO NOT APPLY THIS BEFORE 0061 **AND** THE CALL-SITE CHANGE HAVE SHIPPED.
--    Read 0061's header for the three-step order. Applying this early takes the
--    app down for every role, Owner included.
--
-- ## What this fixes
--
-- `0019` tried to mask money with `revoke select (col) … from authenticated` and
-- it has never worked, because `authenticated` also holds TABLE-level SELECT and
-- a table grant covers every column. A column revoke cannot subtract from a
-- table grant; PostgreSQL does not even record it (`pg_attribute.attacl` is null
-- on all four tables). The masking VIEWS from 0019 are correct and always were —
-- `booking_lines_v.rate` reads null for a Warehouse session today. Nothing
-- forced anyone through them.
--
-- The correct sequence, which this file performs, is the reverse of 0019's:
--
--     revoke select on <table> from authenticated;          -- drop the blanket
--     grant  select (<every non-money column>) to authenticated;  -- hand back the rest
--
-- After this, the ONLY path to a money column on these four tables is the
-- matching `_v` view, which re-applies `auth_can_view_money()` per role. That is
-- what 0019 claimed and did not deliver.
--
-- ## The column lists are generated, not typed
--
-- Every list below was produced by querying `information_schema.columns` on the
-- live project on 16 Aug 2026 and subtracting the money columns 0019 named
-- (plus `bookings.deposit_required`, which 0019 never covered at all). Counts
-- are stated so a future column addition shows up as a mismatch rather than as a
-- silently ungranted column.
--
-- ⚠ A column added to any of these tables later will be UNREADABLE until it is
-- added here. That is the fail-closed direction and it is deliberate, but it is
-- a real maintenance obligation: `alter table … add column` is now a two-file
-- change. The alternative — re-granting at table level — is exactly the bug this
-- migration exists to undo.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · bookings — 27 granted, 1 masked (`deposit_required` → bookings_deposit_v)
-- ---------------------------------------------------------------------------
revoke select on bookings from authenticated;
grant select (
  id, client_uuid, booking_no, branch_id, client_id, contact_id,
  authorized_contact_id, project, pickup_at, return_at, actual_return_at,
  delivery_type, pickup_location, return_location, quote_expires_at,
  cancelled_at, cancelled_by, cancellation_reason, closed_at, locked_by,
  locked_at, version, created_at, created_by, updated_at, updated_by, stage
) on bookings to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · booking_lines — 19 granted, 4 masked (→ booking_lines_v)
-- ---------------------------------------------------------------------------
revoke select on booking_lines from authenticated;
grant select (
  id, client_uuid, booking_id, line_type, parent_line_id, product_id,
  bundle_id, description, qty, days, is_included, service_basis, supplier_id,
  line_note, sort_order, voided_at, voided_reason, created_at, created_by
) on booking_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · products — 35 granted, 9 masked (→ products_v)
-- ---------------------------------------------------------------------------
revoke select on products from authenticated;
grant select (
  id, client_uuid, asset_code, name, short_name, category_id, brand, model,
  manufacturer, description, thumbnail_url, tracking_mode, status,
  total_quantity, reorder_level, quantity_unit, purchase_date, min_rental_days,
  rental_enabled, prep_time_minutes, cleaning_time_minutes, inspection_required,
  packing_required, is_subrental_only, weight_kg, case_capacity, supplier_id,
  notes_internal, notes_warehouse, notes_rental, is_active, created_at,
  created_by, updated_at, updated_by
) on products to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · product_units — 29 granted, 2 masked (→ product_units_v)
-- ---------------------------------------------------------------------------
revoke select on product_units from authenticated;
grant select (
  id, client_uuid, product_id, serial_no, asset_tag, barcode, qr_code, status,
  condition, branch_id, warehouse_id, storage_zone_id, rack, shelf, bin,
  container_id, purchase_date, warranty_expires_at, insurance_expires_at,
  running_hours, last_maintenance_at, next_maintenance_at, retired_at,
  retired_by, retirement_reason, created_at, created_by, updated_at, updated_by
) on product_units to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · The check that proves it. Run AFTER applying, as a Warehouse session:
--
--     begin;
--     set local role authenticated;
--     set local "app.current_user_id" = '00000000-0000-0000-0000-000000000103';
--     select sum(deposit_required) from bookings;   -- expect: 42501 denied
--     select sum(rate) from booking_lines;          -- expect: 42501 denied
--     select sum(daily_rate) from products;         -- expect: 42501 denied
--     select sum(deposit_required) from bookings_deposit_v;  -- expect: null
--     select sum(rate) from booking_lines_v;                 -- expect: null
--     rollback;
--
-- An Owner session must get real figures from the three `_v` reads and the same
-- 42501 from the three base-table reads. **`42501` for Owner on a base table is
-- the CORRECT outcome here** — it is what forces every call site through a view.
-- ---------------------------------------------------------------------------

commit;
