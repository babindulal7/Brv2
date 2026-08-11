-- ============================================================================
-- 0019_column_level_money_masking.sql
-- (originally drafted as 0017 — renumbered 9 Aug 2026 after a numbering
-- collision was found with the concurrent session's own 0017/0018, which
-- reopen the Manager role. No content change from the collision itself.)
--
-- Closes concrete, demonstrated holes in Law 6 ("Warehouse sees no money —
-- enforced by RLS, not the UI") found by a full audit of 0001-0016 against
-- PLAN.md Phase 1's checklist and gate (9 Aug 2026):
--
--   1. `booking_lines_select` (0011) is `using (true)` with NO role check at
--      all. `booking_lines` carries `rate`, `discount_amount`,
--      `supplier_cost` and `markup_amount` — every one of the three
--      money-blind floor roles (Warehouse, Technician, Driver — 0014) can
--      currently read them.
--   2. `products` (0004) had RLS enabled with ZERO policies anywhere across
--      all 16 prior files — confirmed by grep. Fail-closed, so safe but
--      broken: the floor's entire daily job is reading this table. `0004`'s
--      own header comment already promises "Warehouse sees NO monetary
--      values (purchase price, replacement value, rates)" — a promise
--      nothing enforced.
--   3. `product_units` looked the same as `products` at first read (RLS
--      enabled, no policy matching `on product_units\b` anywhere) — but a
--      follow-up audit (this session, same day) found the real cause: 0011
--      always had a SELECT/INSERT/UPDATE policy set for this table, just
--      written against a table name that was never created —
--      `inventory_units` — evidently renamed to `product_units` at some
--      point in drafting without updating 0011 or 0010's audit trigger. Left
--      as-is, those statements would have raised "relation does not exist"
--      and aborted the whole migration chain the moment 0010/0011 were
--      applied. Fixed at the source in 0010/0011/0018 (this session); the
--      `product_units_select` policy below is now a deliberate, idempotent
--      restatement of that fix (DROP-then-CREATE), not a fill of a true
--      gap — harmless if it runs after 0011's fixed version already created
--      the same policy.
--
-- WHY A VIEW, NOT A ROW POLICY
-- ----------------------------
-- Row-level security decides whether a ROW is visible; it cannot decide that
-- one column of a visible row is null while its neighbour is not. These three
-- tables are genuinely mixed: Warehouse must see `product_id`, `qty`, `days`,
-- `status`, `warehouse_id` — the operational half — while `Law 6` forbids the
-- money half in the very same row. Checklist item 6 ("column-level money
-- hiding") names this exactly; nothing in 0001-0016 implements it, only a
-- table-wide `_money_blind` pattern (0014) for tables that are *entirely*
-- money (invoices, payments, security_deposits, deposit_movements, expenses)
-- and can therefore be hidden a whole row at a time.
--
-- The mechanism: revoke SELECT on the specific money columns of the base
-- table from `authenticated` outright, then grant SELECT on a view that
-- reads those same columns and substitutes NULL per row unless
-- `auth_can_view_money()` (0014) is true. A view's underlying query runs
-- with its OWNER's privileges by default (Postgres has done this since
-- before RLS existed; PG15's `security_invoker` would opt back OUT of it,
-- and is deliberately not set here) — so the view itself can still read the
-- revoked columns to decide what to return, while every session connecting
-- as `authenticated` cannot reach them any other way. This is the standard
-- Postgres/Supabase idiom for masking, not a new one invented for this file.
--
-- WHAT THIS DOES NOT DO — read before assuming the gap is fully closed
-- ----------------------------------------------------------------------
-- The application's data-access layer does not exist yet (PLAN.md Phase 2:
-- "One booking query module"), and nothing in this codebase currently reads
-- Supabase at all — every screen still runs on hand-typed seed arrays. So
-- there is no query today to repoint at `booking_lines_v` /
-- `products_v` / `product_units_v` instead of the base tables. Whoever
-- builds Phase 2's data layer MUST query the `_v` views for these three
-- tables, never the base tables directly, or this migration's entire
-- protection is dead code sitting next to the exact tables it was written to
-- guard. Recorded as a hard requirement for Phase 2, not a nice-to-have.
--
-- WHAT IS DELIBERATELY LEFT FOR A LATER PASS
-- --------------------------------------------
-- The same audit found four more gaps this file does not touch, ranked by
-- how much each blocks Phase 1's gate — left here rather than folded into an
-- already-large, single-purpose migration:
--   - RLS has no branch / warehouse-zone / approval-limit dimension anywhere
--     (checklist item 5 is role-only, ~25% of what it asks for).
--   - No trigger enforces forward-only booking-stage transitions.
--     `0015_canonical_six_stages.sql`'s own column comment claims one exists
--     ("a direct UPDATE is rejected") — it does not, anywhere in 0001-0016.
--     That comment is currently false and should be corrected or made true
--     in the same pass.
--   - `invoices.outstanding_amount` / `paid_amount` are plain stored columns
--     with no CHECK tying them to `subtotal - paid` — the gate's
--     deposit-cannot-reduce-Outstanding claim holds only because no FK path
--     exists from deposits into invoices today, not because a constraint
--     forbids a direct tamper-UPDATE.
--   - `invoice_lines` and `products`/`product_units`'s `deposit_percent` are
--     the same "mixed row" shape as the three tables here but were not
--     covered.
--   - `0012_seed_data.sql` is hand-typed INSERTs; PLAN.md's checklist asks
--     for seed data "generated through the engines."
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · products / product_units — the SELECT policy that never existed
--
-- `auth_is_staff()` (0014) was defined for exactly this and left unwired
-- everywhere else because retrofitting it into 0011's 22 existing policies
-- is its own careful pass (0014's own TODO(decision)). Adopting it here, on
-- two brand-new policies rather than 22 existing ones, is a much smaller,
-- self-contained decision: Client is external and portal-scoped and has no
-- business reading the internal fleet catalogue at all, masked or not.
-- ---------------------------------------------------------------------------

drop policy if exists products_select on products;
create policy products_select on products
  for select
  using (auth_is_staff());

drop policy if exists product_units_select on product_units;
create policy product_units_select on product_units
  for select
  using (auth_is_staff());

-- ---------------------------------------------------------------------------
-- 2 · booking_lines — replace the unconditional row policy
--
-- Kept row-visible to every staff role (Warehouse needs the row to pack
-- against), same as 0011 intended — only the blanket "and no role check at
-- all" is removed. Money safety for this table is entirely the view's job
-- below, not this policy's.
-- ---------------------------------------------------------------------------

drop policy if exists booking_lines_select on booking_lines;
create policy booking_lines_select on booking_lines
  for select
  using (auth_is_staff());

-- ---------------------------------------------------------------------------
-- 3 · Revoke the money columns from the shared application role
--
-- `authenticated` is every application session regardless of business role
-- (`system_role` is looked up per-row from `users.primary_role`, not from
-- the Postgres connection role — see 0011's `auth_user_role()`). Revoking
-- here is therefore blunt on purpose: it removes the columns from
-- `authenticated` entirely, Owner and Accounts included, so the *only* path
-- back to a real value for anyone is through a view that re-applies the
-- real per-role check below. There is no direct-table path left that could
-- accidentally bypass the mask.
-- ---------------------------------------------------------------------------

revoke select (
  purchase_price, replacement_value, daily_rate, weekly_rate,
  monthly_rate, hourly_rate, weekend_rate, deposit_percent, deposit_fixed
) on products from authenticated;

revoke select (purchase_price, replacement_value) on product_units from authenticated;

revoke select (rate, discount_amount, supplier_cost, markup_amount) on booking_lines from authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The masking views
--
-- Every non-money column is passed through unchanged; every money column is
-- `case when auth_can_view_money() then <col> else null end`. Column order
-- and names match the base table exactly, so a future Phase 2 query can
-- swap the table name for the view name with no other change.
-- ---------------------------------------------------------------------------

create or replace view products_v as
select
  id, client_uuid, asset_code, name, short_name, category_id, brand, model,
  manufacturer, description, thumbnail_url, tracking_mode, status,
  total_quantity, reorder_level, quantity_unit,
  purchase_date,
  case when auth_can_view_money() then purchase_price else null end as purchase_price,
  case when auth_can_view_money() then replacement_value else null end as replacement_value,
  case when auth_can_view_money() then daily_rate else null end as daily_rate,
  case when auth_can_view_money() then weekly_rate else null end as weekly_rate,
  case when auth_can_view_money() then monthly_rate else null end as monthly_rate,
  case when auth_can_view_money() then hourly_rate else null end as hourly_rate,
  case when auth_can_view_money() then weekend_rate else null end as weekend_rate,
  case when auth_can_view_money() then deposit_percent else null end as deposit_percent,
  case when auth_can_view_money() then deposit_fixed else null end as deposit_fixed,
  min_rental_days, rental_enabled, prep_time_minutes, cleaning_time_minutes,
  inspection_required, packing_required, is_subrental_only,
  weight_kg, case_capacity, supplier_id,
  notes_internal, notes_warehouse, notes_rental,
  is_active, created_at, created_by, updated_at, updated_by
from products;

create or replace view product_units_v as
select
  id, client_uuid, product_id, serial_no, asset_tag, barcode, qr_code,
  status, condition,
  branch_id, warehouse_id, storage_zone_id, rack, shelf, bin, container_id,
  purchase_date,
  case when auth_can_view_money() then purchase_price else null end as purchase_price,
  case when auth_can_view_money() then replacement_value else null end as replacement_value,
  warranty_expires_at, insurance_expires_at, running_hours,
  last_maintenance_at, next_maintenance_at,
  retired_at, retired_by, retirement_reason,
  created_at, created_by, updated_at, updated_by
from product_units;

create or replace view booking_lines_v as
select
  id, client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
  description, qty, days,
  case when auth_can_view_money() then rate else null end as rate,
  case when auth_can_view_money() then discount_amount else null end as discount_amount,
  is_included, service_basis, supplier_id,
  case when auth_can_view_money() then supplier_cost else null end as supplier_cost,
  case when auth_can_view_money() then markup_amount else null end as markup_amount,
  line_note, sort_order, voided_at, voided_reason, created_at, created_by
from booking_lines;

grant select on products_v to authenticated;
grant select on product_units_v to authenticated;
grant select on booking_lines_v to authenticated;

comment on view products_v is
  'Column-masked read surface for products — query this, never the base table, '
  'from any screen a Warehouse/Technician/Driver session can reach. Money columns '
  'resolve to NULL for those three roles via auth_can_view_money() (0014), never '
  'a formatted "hidden" placeholder — Foundation §8.3: the field is absent, not masked-and-shown.';

comment on view product_units_v is
  'Column-masked read surface for product_units — see products_v for the pattern.';

comment on view booking_lines_v is
  'Column-masked read surface for booking_lines — see products_v for the pattern. '
  'Row visibility is unchanged from 0011 (auth_is_staff(), every staff role); only '
  'the four money columns are masked.';

commit;
