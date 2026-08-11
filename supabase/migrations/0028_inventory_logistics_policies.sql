-- ============================================================================
-- 0028_inventory_logistics_policies.sql
--
-- Sixth reviewed batch out of the 92-table RLS gap (§6.9-§6.14 in PLAN.md).
-- Eight warehouse/logistics tables, none carrying a money column, split into
-- three tiers by who actually acts on them day to day rather than given one
-- uniform grant:
--
--   A. `inventory_categories`, `suppliers` — taxonomy/vendor master data.
--      Structural/config, same shape as `branches`/`warehouses`/
--      `storage_zones` (0022): every role reads it, only
--      `('Owner', 'Admin', 'Manager')` edits it. Warehouse uses these
--      values day to day but doesn't create new categories or suppliers.
--   B. `containers`, `stock_transfers`, `stock_transfer_lines`,
--      `stock_audits`, `stock_audit_items` — the actual floor work
--      (packing containers, dispatching/receiving transfers, scanning a
--      physical count). Same tier as `product_units` (0018):
--      `('Owner', 'Admin', 'Manager', 'Warehouse')`.
--   C. `inventory_reservations` — sits between both domains: a hold placed
--      against inventory *for a specific booking line*
--      (`booking_line_id` not null). Given the same tier as
--      `booking_lines_all` (0018) instead of tier B: `('Owner', 'Admin',
--      'Manager', 'Coordinator', 'Warehouse')` — Coordinator manages
--      booking fulfillment and needs to place/release a hold without
--      Warehouse's floor-only tier excluding them.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A · Taxonomy / vendor master data
-- ---------------------------------------------------------------------------

drop policy if exists inventory_categories_select on inventory_categories;
create policy inventory_categories_select on inventory_categories
  for select
  using (auth_is_staff());

drop policy if exists inventory_categories_manage on inventory_categories;
create policy inventory_categories_manage on inventory_categories
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists suppliers_select on suppliers;
create policy suppliers_select on suppliers
  for select
  using (auth_is_staff());

drop policy if exists suppliers_manage on suppliers;
create policy suppliers_manage on suppliers
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- ---------------------------------------------------------------------------
-- B · Floor logistics work
-- ---------------------------------------------------------------------------

drop policy if exists containers_select on containers;
create policy containers_select on containers
  for select
  using (auth_is_staff());

drop policy if exists containers_all on containers;
create policy containers_all on containers
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists stock_transfers_select on stock_transfers;
create policy stock_transfers_select on stock_transfers
  for select
  using (auth_is_staff());

drop policy if exists stock_transfers_all on stock_transfers;
create policy stock_transfers_all on stock_transfers
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists stock_transfer_lines_select on stock_transfer_lines;
create policy stock_transfer_lines_select on stock_transfer_lines
  for select
  using (auth_is_staff());

drop policy if exists stock_transfer_lines_all on stock_transfer_lines;
create policy stock_transfer_lines_all on stock_transfer_lines
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists stock_audits_select on stock_audits;
create policy stock_audits_select on stock_audits
  for select
  using (auth_is_staff());

drop policy if exists stock_audits_all on stock_audits;
create policy stock_audits_all on stock_audits
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists stock_audit_items_select on stock_audit_items;
create policy stock_audit_items_select on stock_audit_items
  for select
  using (auth_is_staff());

drop policy if exists stock_audit_items_all on stock_audit_items;
create policy stock_audit_items_all on stock_audit_items
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

-- ---------------------------------------------------------------------------
-- C · Booking-scoped inventory holds
-- ---------------------------------------------------------------------------

drop policy if exists inventory_reservations_select on inventory_reservations;
create policy inventory_reservations_select on inventory_reservations
  for select
  using (auth_is_staff());

drop policy if exists inventory_reservations_all on inventory_reservations;
create policy inventory_reservations_all on inventory_reservations
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy inventory_reservations_all on inventory_reservations is
  'Booking-scoped hold, not pure floor data -- mirrors booking_lines_all (0018), Coordinator included, unlike the plain product_units-tier tables in this same migration.';

commit;
