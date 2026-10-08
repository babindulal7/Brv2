-- =============================================================================
-- preflight_0062.sql — run this IMMEDIATELY BEFORE applying 0065 + 0062.
--
-- Read-only. Run it in the Supabase SQL editor against the target database, or
-- against the local stack during the mandatory rehearsal. It takes no
-- credentials beyond the ones the editor already has and writes nothing.
--
-- ## Why a pre-flight exists at all
--
-- 0062 revokes table-level SELECT on four tables and hands back an explicit
-- column list. Its own header states the consequence: "A column added to any of
-- these tables later will be UNREADABLE until it is added here." That list was
-- generated from the live schema on 16 Aug 2026. Every day since is a day a
-- migration could have added a column, and the failure is SILENT — the grant
-- succeeds, the column simply becomes invisible to every role including Owner.
--
-- This has already happened once in a different shape: 0069 was drafted calling
-- `auth_role()`, which does not exist. It failed loudly at apply, which was
-- lucky. A missing column grant would not fail at all.
--
-- Verified clean 27 Aug 2026: 28/27+1, 23/19+4, 44/35+9, 31/29+2, and
-- `bookings_deposit_v` was the only invoker-rights view. Re-run it anyway —
-- the point is the answer on the day, not the answer that day.
--
-- ## How to read the output
--
-- Every check returns ZERO ROWS when it passes. Any row is a problem, and the
-- `problem` column says what it is. If all four sections are empty, 0062's
-- assumptions still hold.
-- =============================================================================


-- ── 1 · Columns 0062 would leave UNREADABLE ─────────────────────────────────
-- Every column on the four tables, minus the ones 0062 grants, minus the money
-- columns it deliberately withholds. Anything left is a column that has been
-- added since the list was generated and that will silently vanish from the app.
--
-- The granted lists below are transcribed from 0062. If you edit 0062, edit
-- these too — a pre-flight that checks a stale copy of the thing it is
-- pre-flighting is worse than no pre-flight.
with granted(tbl, col) as (
  select 'bookings', unnest(array[
    'id','client_uuid','booking_no','branch_id','client_id','contact_id',
    'authorized_contact_id','project','pickup_at','return_at','actual_return_at',
    'delivery_type','pickup_location','return_location','quote_expires_at',
    'cancelled_at','cancelled_by','cancellation_reason','closed_at','locked_by',
    'locked_at','version','created_at','created_by','updated_at','updated_by','stage'])
  union all
  select 'booking_lines', unnest(array[
    'id','client_uuid','booking_id','line_type','parent_line_id','product_id',
    'bundle_id','description','qty','days','is_included','service_basis',
    'supplier_id','line_note','sort_order','voided_at','voided_reason',
    'created_at','created_by'])
  union all
  select 'products', unnest(array[
    'id','client_uuid','asset_code','name','short_name','category_id','brand',
    'model','manufacturer','description','thumbnail_url','tracking_mode','status',
    'total_quantity','reorder_level','quantity_unit','purchase_date',
    'min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes',
    'inspection_required','packing_required','is_subrental_only','weight_kg',
    'case_capacity','supplier_id','notes_internal','notes_warehouse','notes_rental',
    'is_active','created_at','created_by','updated_at','updated_by'])
  union all
  select 'product_units', unnest(array[
    'id','client_uuid','product_id','serial_no','asset_tag','barcode','qr_code',
    'status','condition','branch_id','warehouse_id','storage_zone_id','rack',
    'shelf','bin','container_id','purchase_date','warranty_expires_at',
    'insurance_expires_at','running_hours','last_maintenance_at',
    'next_maintenance_at','retired_at','retired_by','retirement_reason',
    'created_at','created_by','updated_at','updated_by'])
),
-- The money columns 0062 withholds on purpose. These SHOULD be absent from the
-- grant; they reach the app through the matching `_v` view.
masked(tbl, col) as (
  select 'bookings', unnest(array['deposit_required'])
  union all select 'booking_lines', unnest(array['rate','discount_amount','supplier_cost','markup_amount'])
  union all select 'products', unnest(array['purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed'])
  union all select 'product_units', unnest(array['purchase_price','replacement_value'])
),
live(tbl, col) as (
  select c.relname::text, a.attname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('bookings','booking_lines','products','product_units')
)
select '1. COLUMN ADDED SINCE 0062 WAS WRITTEN — would become unreadable' as problem,
       l.tbl, l.col
from live l
where not exists (select 1 from granted g where g.tbl = l.tbl and g.col = l.col)
  and not exists (select 1 from masked m where m.tbl = l.tbl and m.col = l.col)

union all

-- ── 2 · Columns 0062 grants that no longer exist ────────────────────────────
-- A dropped column makes the GRANT itself raise 42703 and the whole migration
-- rolls back. Loud rather than silent, but better caught here.
select '2. COLUMN DROPPED — the GRANT would error (42703)', g.tbl, g.col
from (
  select 'bookings' as tbl, unnest(array[
    'id','client_uuid','booking_no','branch_id','client_id','contact_id',
    'authorized_contact_id','project','pickup_at','return_at','actual_return_at',
    'delivery_type','pickup_location','return_location','quote_expires_at',
    'cancelled_at','cancelled_by','cancellation_reason','closed_at','locked_by',
    'locked_at','version','created_at','created_by','updated_at','updated_by','stage']) as col
  union all
  select 'booking_lines', unnest(array[
    'id','client_uuid','booking_id','line_type','parent_line_id','product_id',
    'bundle_id','description','qty','days','is_included','service_basis',
    'supplier_id','line_note','sort_order','voided_at','voided_reason',
    'created_at','created_by'])
  union all
  select 'products', unnest(array[
    'id','client_uuid','asset_code','name','short_name','category_id','brand',
    'model','manufacturer','description','thumbnail_url','tracking_mode','status',
    'total_quantity','reorder_level','quantity_unit','purchase_date',
    'min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes',
    'inspection_required','packing_required','is_subrental_only','weight_kg',
    'case_capacity','supplier_id','notes_internal','notes_warehouse','notes_rental',
    'is_active','created_at','created_by','updated_at','updated_by'])
  union all
  select 'product_units', unnest(array[
    'id','client_uuid','product_id','serial_no','asset_tag','barcode','qr_code',
    'status','condition','branch_id','warehouse_id','storage_zone_id','rack',
    'shelf','bin','container_id','purchase_date','warranty_expires_at',
    'insurance_expires_at','running_hours','last_maintenance_at',
    'next_maintenance_at','retired_at','retired_by','retirement_reason',
    'created_at','created_by','updated_at','updated_by'])
) g
where not exists (
  select 1 from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname='public' and c.relname = g.tbl and a.attname = g.col
)

union all

-- ── 3 · Masking views still on INVOKER rights ───────────────────────────────
-- 0062 revokes the caller's column grants, so an invoker-rights view reads the
-- base table AS THE CALLER and dies with the paths it was meant to replace.
-- 0065 converts `bookings_deposit_v`; it converts nothing else. Any OTHER view
-- listed here is one 0065 does not cover and 0062 will break.
select '3. INVOKER-RIGHTS VIEW — 0062 will break it (0065 only fixes bookings_deposit_v)',
       c.relname::text, 'security_invoker = on'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='v'
  and c.relname <> 'bookings_deposit_v'
  and exists (select 1 from pg_options_to_table(c.reloptions)
              where option_name='security_invoker' and option_value='on')

union all

-- ── 4 · 0065's hardcoded row predicate still matches the live policy ────────
-- 0065 Fix 2 writes `where auth_is_staff()` into the view body, copied from
-- `bookings_select` on 23 Aug. If that policy has since changed, the view would
-- enforce a DIFFERENT row rule than the table — silently, and in the direction
-- nobody checks.
select '4. bookings_select NO LONGER auth_is_staff() — 0065 would hardcode a stale predicate',
       'bookings_select', coalesce(pg_get_expr(p.polqual, p.polrelid), '(null)')
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname='bookings' and p.polname='bookings_select'
  and coalesce(pg_get_expr(p.polqual, p.polrelid), '') <> 'auth_is_staff()';

-- ZERO ROWS = 0062 and 0065 are still safe to apply.
-- Any row = fix it before applying. Do not apply and then investigate; this
-- database has no backup unless you took one, and 0062 changes money-table
-- permissions.

-- =============================================================================
-- PROVING THIS FILE IS NOT INERT
--
-- A checker that returns zero rows because it is broken looks exactly like one
-- that returns zero rows because it passed. That failure has bitten this project
-- twice — `check-db` printing PASS for a session that could see nothing, and a
-- `pointer-events: none` pseudo-element whose comment described a hit area it
-- did not create. So this file was proved to FAIL before its PASS was believed.
--
-- Negative control, run against the live project 27 Aug 2026: two granted
-- columns removed from the lists (`bookings.stage`, `booking_lines.qty`), one
-- phantom column added (`NONEXISTENT_COL`), and `bookings_deposit_v` left in
-- the section-3 scan. All four sections fired:
--
--   1. COLUMN ADDED …            booking_lines  qty
--   1. COLUMN ADDED …            bookings       stage
--   2. COLUMN DROPPED …          booking_lines  NONEXISTENT_COL
--   3. INVOKER-RIGHTS VIEW       bookings_deposit_v
--
-- The unmodified file returned zero rows against the same database in the same
-- session. Re-run the negative control if you ever doubt a green result: edit a
-- column out of a `granted` array, confirm it reports, put it back.
-- =============================================================================
