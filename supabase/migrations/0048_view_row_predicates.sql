-- ============================================================================
-- 0048_view_row_predicates.sql — generated 11 Aug 2026
-- (written as 0043, renumbered on collision: a concurrent session had already
--  taken 0043-0047. Nothing here depends on those five files, and nothing in
--  them touches any of the twenty views below — checked, not assumed.)
--
-- WHY
-- ---
-- Supabase's security advisor reports ERROR `security_definer_view` against
-- all twenty `_v` masking views. The finding is real but the obvious
-- remediation is wrong for this schema, so this migration fixes the actual
-- hole and deliberately leaves the lint standing. Both halves are explained
-- here so the next reader does not "fix" it by breaking it.
--
-- These views exist to mask money and PII columns per role — each one wraps
-- its sensitive columns in `case when auth_can_view_money() then col else
-- null end` (or, for `client_channel_identities_v`, a role-list check on
-- `address`). That masking only works because the view runs as its owner
-- (`postgres`) rather than as the querying session — Postgres's default
-- view semantics, which is exactly what the linter flags.
--
-- Switching them to `security_invoker = true` — the linter's suggested
-- remediation — would break the product. The masking expressions *reference*
-- the sensitive base columns, so an invoker-rights view requires the calling
-- session to hold SELECT on those very columns. The design intent is that it
-- must not. An invoker view would therefore either fail outright or, once the
-- grants were loosened to make it succeed, hand the caller the unmasked
-- column directly. So the views stay definer-rights, and the twenty ERRORs
-- stay on the advisor report as an accepted, documented deviation.
--
-- THE REAL HOLE THIS CLOSES
-- -------------------------
-- Definer-rights views bypass the base table's ROW policies as well as its
-- column grants. Every one of these twenty views was `select ... from <table>`
-- with no WHERE clause at all (verified against `pg_views.definition`, not
-- against the migration that created them). So the only row gate left in
-- front of them was the blanket `grant select ... to authenticated` — i.e.
-- none. A Client-role session hitting `clients_v` got every client row, with
-- money nulled but every other column intact.
--
-- Each view below re-emits with its base table's real SELECT row predicate
-- inlined. The predicate for each was read from `pg_policies` on the live
-- database rather than inferred from the migration that wrote it:
--
--   * eighteen views  -> `auth_is_staff()`
--     (their base tables' SELECT gate; where a table also carries a narrower
--     ALL policy, the two are PERMISSIVE and therefore OR together, so the
--     broader `auth_is_staff()` is the effective read gate — the ALL policy
--     governs writes, which a view does not perform.)
--   * accessories_v       -> Owner/Admin/Manager/Warehouse
--   * vehicle_fuel_logs_v -> Owner/Admin/Manager/Coordinator/Warehouse/Driver
--     (these two tables carry only an ALL policy and no separate SELECT
--     policy, so that role list *is* the read gate.)
--
-- No view here needed `auth_can_view_money()` as a row gate: that function
-- appears in these tables only as a column mask, never as a row policy. Each
-- of the twenty base tables' `qual` was checked individually.
--
-- HOW THE §6.23 / §6.25 COLUMN-LOSS BUG IS PREVENTED THIS TIME
-- ------------------------------------------------------------
-- This thread has twice shipped or nearly shipped a masking view that
-- silently dropped base-table columns, because a `create table` block ran
-- past the end of one read (§6.23 `vehicle_fuel_logs_v`, §6.25 `clients_v`).
-- Both were caught by a human re-read, which is not a control.
--
-- Two mechanical controls replace that re-read here:
--
--  1. The body of every statement below is Postgres's own deparse of the
--     currently-live view (`pg_views.definition`), with nothing but a WHERE
--     clause appended. No column list was retyped, so none can be mistyped.
--  2. `create or replace view` — not `drop` + `create` — is used throughout.
--     Postgres rejects a replacement whose column names, order, or types
--     differ from the existing view. A dropped column is therefore a hard
--     error at apply time rather than a silent behaviour change. This is the
--     specific reason `drop view ... cascade` must not be used here.
--
-- Column counts are asserted at the end of this file as a third check.
--
-- WHAT THIS MIGRATION DOES NOT FIX — READ THIS
-- --------------------------------------------
-- The column masking these views implement is, as of this migration, still
-- INERT at the base tables. `0019_column_level_money_masking.sql` revokes the
-- money columns with `revoke select (purchase_price, ...) on products from
-- authenticated`, but a column-level REVOKE cannot subtract from a
-- table-level GRANT, and Supabase grants table-level SELECT on every table in
-- `public` to `authenticated`. Verified on the live database: `pg_class.relacl`
-- shows `authenticated=arwDxtm/postgres` (the `r` is table-wide SELECT) and
-- *no* table in the set has a single column-level ACL entry
-- (`pg_attribute.attacl is null` for every column of every one of them).
--
-- So today any authenticated session can read `products.purchase_price` or
-- `clients.approved_credit_limit` straight off the base table, bypassing
-- these views entirely. The row predicates added here are still a strict
-- improvement — they close the view-shaped hole — but they are not the whole
-- fix, and this file must not be read as having delivered money masking.
--
-- That repair is deliberately NOT bundled here. It requires, per table,
-- `revoke select on <t> from authenticated, anon` followed by an explicit
-- `grant select (<non-money columns>)`, and it only becomes safe once the
-- application reads the `_v` views instead of the base tables. It currently
-- does neither: `src/` contains zero references to any `_v` view and reads
-- base tables directly. Applying the grant repair without that application
-- change would break reads at runtime, which neither `tsc` nor `npm run
-- build` would catch. Logged in PLAN.md §6.32 as the top open item.
-- ============================================================================

create or replace view public.accessories_v as
 SELECT id,
    client_uuid,
    product_id,
    name,
    quantity,
    is_mandatory,
        CASE
            WHEN auth_can_view_money() THEN replacement_cost
            ELSE NULL::numeric
        END AS replacement_cost,
    sort_order,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM accessories
  where auth_user_role() = any (array['Owner','Admin','Manager','Warehouse']::system_role[]);

create or replace view public.booking_crew_lines_v as
 SELECT id,
    client_uuid,
    booking_id,
    crew_member_id,
    name,
    crew_role,
    phone,
        CASE
            WHEN auth_can_view_money() THEN day_rate
            ELSE NULL::numeric
        END AS day_rate,
    days,
        CASE
            WHEN auth_can_view_money() THEN overtime
            ELSE NULL::numeric
        END AS overtime,
        CASE
            WHEN auth_can_view_money() THEN accommodation
            ELSE NULL::numeric
        END AS accommodation,
        CASE
            WHEN auth_can_view_money() THEN meals
            ELSE NULL::numeric
        END AS meals,
    voided_at,
    created_at,
    created_by
   FROM booking_crew_lines
  where auth_is_staff();

create or replace view public.booking_lines_v as
 SELECT id,
    client_uuid,
    booking_id,
    line_type,
    parent_line_id,
    product_id,
    bundle_id,
    description,
    qty,
    days,
        CASE
            WHEN auth_can_view_money() THEN rate
            ELSE NULL::numeric
        END AS rate,
        CASE
            WHEN auth_can_view_money() THEN discount_amount
            ELSE NULL::numeric
        END AS discount_amount,
    is_included,
    service_basis,
    supplier_id,
        CASE
            WHEN auth_can_view_money() THEN supplier_cost
            ELSE NULL::numeric
        END AS supplier_cost,
        CASE
            WHEN auth_can_view_money() THEN markup_amount
            ELSE NULL::numeric
        END AS markup_amount,
    line_note,
    sort_order,
    voided_at,
    voided_reason,
    created_at,
    created_by
   FROM booking_lines
  where auth_is_staff();

create or replace view public.bundles_v as
 SELECT id,
    client_uuid,
    bundle_code,
    name,
    description,
    category_id,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
        CASE
            WHEN auth_can_view_money() THEN weekly_rate
            ELSE NULL::numeric
        END AS weekly_rate,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM bundles
  where auth_is_staff();

create or replace view public.cases_v as
 SELECT id,
    client_uuid,
    case_no,
    type,
    title,
    counterparty_kind,
    counterparty_name,
    priority,
    status,
    disposition,
    linked_booking_id,
        CASE
            WHEN auth_can_view_money() THEN assessed_amount
            ELSE NULL::numeric
        END AS assessed_amount,
        CASE
            WHEN auth_can_view_money() THEN deposit_held_amount
            ELSE NULL::numeric
        END AS deposit_held_amount,
        CASE
            WHEN auth_can_view_money() THEN charged_to_client_amount
            ELSE NULL::numeric
        END AS charged_to_client_amount,
        CASE
            WHEN auth_can_view_money() THEN deposit_applied_amount
            ELSE NULL::numeric
        END AS deposit_applied_amount,
        CASE
            WHEN auth_can_view_money() THEN insurance_claimed_amount
            ELSE NULL::numeric
        END AS insurance_claimed_amount,
        CASE
            WHEN auth_can_view_money() THEN warranty_covered_amount
            ELSE NULL::numeric
        END AS warranty_covered_amount,
        CASE
            WHEN auth_can_view_money() THEN recovered_from_partner_amount
            ELSE NULL::numeric
        END AS recovered_from_partner_amount,
        CASE
            WHEN auth_can_view_money() THEN absorbed_amount
            ELSE NULL::numeric
        END AS absorbed_amount,
    owner_id,
    flags,
    opened_at,
    settled_at,
    created_at,
    created_by,
    updated_at
   FROM cases
  where auth_is_staff();

create or replace view public.client_channel_identities_v as
 SELECT id,
    client_uuid,
    client_id,
    contact_id,
    channel,
        CASE
            WHEN (auth_user_role() = ANY (ARRAY['Owner'::system_role, 'Admin'::system_role, 'Manager'::system_role, 'Accounts'::system_role])) THEN address
            ELSE ('•••• '::text || "right"(address, 4))
        END AS address,
    is_on_whatsapp,
    is_active,
    deactivated_at,
    deactivation_reason,
    created_at,
    created_by
   FROM client_channel_identities
  where auth_is_staff();

create or replace view public.client_memberships_v as
 SELECT id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
        CASE
            WHEN auth_can_view_money() THEN fee_paid
            ELSE NULL::numeric
        END AS fee_paid,
    superseded_by_id,
    superseded_at,
    created_at,
    created_by
   FROM client_memberships
  where auth_is_staff();

create or replace view public.clients_v as
 SELECT id,
    client_uuid,
    client_code,
    type_parent,
    org_subtype,
    name,
    phone,
    email,
    pan_vat,
    business_registration,
    website,
    government_id_kind,
    government_id_number,
    address_line,
    city,
    district,
    postal_code,
    country,
    billing_address,
        CASE
            WHEN auth_can_view_money() THEN approved_credit_limit
            ELSE NULL::numeric
        END AS approved_credit_limit,
        CASE
            WHEN auth_can_view_money() THEN payment_terms
            ELSE NULL::payment_terms
        END AS payment_terms,
    client_since,
    professions,
    segments,
    source,
    referred_by_client_id,
    tags,
    preferred_contact_channels,
    marketing_photo_consent,
    notes,
    assigned_staff_id,
    status,
    deactivated_at,
    deactivated_by,
    deactivation_reason,
    merged_into_client_id,
    portal_default_language,
    created_at,
    created_by,
    updated_at
   FROM clients
  where auth_is_staff();

create or replace view public.crew_assignments_v as
 SELECT id,
    client_uuid,
    booking_id,
    crew_id,
    role_on_shoot,
    call_time,
    wrap_time,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
    days,
        CASE
            WHEN auth_can_view_money() THEN line_total
            ELSE NULL::numeric
        END AS line_total,
    notes,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM crew_assignments
  where auth_is_staff();

create or replace view public.crew_bookings_v as
 SELECT id,
    client_uuid,
    crew_booking_no,
    production_id,
    booking_id,
    crew_member_id,
    "position",
        CASE
            WHEN auth_can_view_money() THEN day_rate
            ELSE NULL::numeric
        END AS day_rate,
    days,
    start_date,
    end_date,
    location,
    state,
    payout_state,
    conflict_override_by,
    conflict_override_reason,
    conflict_override_at,
    travel_warning_acknowledged_by,
    travel_warning_acknowledged_at,
    cancelled_at,
    cancel_reason,
    created_by,
    created_at,
    updated_at
   FROM crew_bookings
  where auth_is_staff();

create or replace view public.crew_members_v as
 SELECT id,
    client_uuid,
    full_name,
    "position",
    phone,
    engagement_type,
    pan_status,
        CASE
            WHEN auth_can_view_money() THEN withholding_rate
            ELSE NULL::numeric
        END AS withholding_rate,
        CASE
            WHEN auth_can_view_money() THEN day_rate
            ELSE NULL::numeric
        END AS day_rate,
        CASE
            WHEN auth_can_view_money() THEN internal_note
            ELSE NULL::text
        END AS internal_note,
    deactivated_at,
    created_by,
    created_at,
    updated_at
   FROM crew_members
  where auth_is_staff();

create or replace view public.crew_profiles_v2_v as
 SELECT id,
    client_uuid,
    crew_code,
    full_name,
    mobile,
    email,
    primary_role,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
        CASE
            WHEN auth_can_view_money() THEN hourly_rate
            ELSE NULL::numeric
        END AS hourly_rate,
    is_internal_staff,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM crew_profiles_v2
  where auth_is_staff();

create or replace view public.damage_findings_v as
 SELECT id,
    client_uuid,
    source,
    return_line_id,
    cleaning_queue_entry_id,
    unit_id,
    damage_type,
    description,
    severity,
        CASE
            WHEN auth_can_view_money() THEN estimated_cost
            ELSE NULL::numeric
        END AS estimated_cost,
    approval_state,
    approved_by,
    approved_at,
    disposition,
    case_id,
    charge_id,
    voided_at,
    created_at,
    created_by,
    updated_at
   FROM damage_findings
  where auth_is_staff();

create or replace view public.late_fee_findings_v as
 SELECT id,
    client_uuid,
    booking_id,
    return_session_id,
    scheduled_return_at,
    actual_return_at,
    overage_minutes,
    band,
    full_days_charged,
        CASE
            WHEN auth_can_view_money() THEN day_rate_amount
            ELSE NULL::numeric
        END AS day_rate_amount,
        CASE
            WHEN auth_can_view_money() THEN fee_amount
            ELSE NULL::numeric
        END AS fee_amount,
    approval_state,
    approved_by,
    approved_at,
    voided_at,
    voided_reason,
    created_at,
    created_by
   FROM late_fee_findings
  where auth_is_staff();

create or replace view public.membership_plans_v as
 SELECT id,
    client_uuid,
    level,
    label,
        CASE
            WHEN auth_can_view_money() THEN annual_fee
            ELSE NULL::numeric
        END AS annual_fee,
        CASE
            WHEN auth_can_view_money() THEN individual_discount_pct
            ELSE NULL::numeric
        END AS individual_discount_pct,
        CASE
            WHEN auth_can_view_money() THEN bundle_discount_pct
            ELSE NULL::numeric
        END AS bundle_discount_pct,
    monthly_booking_limit,
    simultaneous_rental_limit,
    authorized_users,
        CASE
            WHEN auth_can_view_money() THEN default_credit_limit
            ELSE NULL::numeric
        END AS default_credit_limit,
    term_months,
    perks,
    display_order,
    status,
    retired_at,
    created_at,
    created_by,
    updated_at
   FROM membership_plans
  where auth_is_staff();

create or replace view public.product_units_v as
 SELECT id,
    client_uuid,
    product_id,
    serial_no,
    asset_tag,
    barcode,
    qr_code,
    status,
    condition,
    branch_id,
    warehouse_id,
    storage_zone_id,
    rack,
    shelf,
    bin,
    container_id,
    purchase_date,
        CASE
            WHEN auth_can_view_money() THEN purchase_price
            ELSE NULL::numeric
        END AS purchase_price,
        CASE
            WHEN auth_can_view_money() THEN replacement_value
            ELSE NULL::numeric
        END AS replacement_value,
    warranty_expires_at,
    insurance_expires_at,
    running_hours,
    last_maintenance_at,
    next_maintenance_at,
    retired_at,
    retired_by,
    retirement_reason,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM product_units
  where auth_is_staff();

create or replace view public.products_v as
 SELECT id,
    client_uuid,
    asset_code,
    name,
    short_name,
    category_id,
    brand,
    model,
    manufacturer,
    description,
    thumbnail_url,
    tracking_mode,
    status,
    total_quantity,
    reorder_level,
    quantity_unit,
    purchase_date,
        CASE
            WHEN auth_can_view_money() THEN purchase_price
            ELSE NULL::numeric
        END AS purchase_price,
        CASE
            WHEN auth_can_view_money() THEN replacement_value
            ELSE NULL::numeric
        END AS replacement_value,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
        CASE
            WHEN auth_can_view_money() THEN weekly_rate
            ELSE NULL::numeric
        END AS weekly_rate,
        CASE
            WHEN auth_can_view_money() THEN monthly_rate
            ELSE NULL::numeric
        END AS monthly_rate,
        CASE
            WHEN auth_can_view_money() THEN hourly_rate
            ELSE NULL::numeric
        END AS hourly_rate,
        CASE
            WHEN auth_can_view_money() THEN weekend_rate
            ELSE NULL::numeric
        END AS weekend_rate,
        CASE
            WHEN auth_can_view_money() THEN deposit_percent
            ELSE NULL::numeric
        END AS deposit_percent,
        CASE
            WHEN auth_can_view_money() THEN deposit_fixed
            ELSE NULL::numeric
        END AS deposit_fixed,
    min_rental_days,
    rental_enabled,
    prep_time_minutes,
    cleaning_time_minutes,
    inspection_required,
    packing_required,
    is_subrental_only,
    weight_kg,
    case_capacity,
    supplier_id,
    notes_internal,
    notes_warehouse,
    notes_rental,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM products
  where auth_is_staff();

create or replace view public.purchase_requests_v as
 SELECT id,
    client_uuid,
    pr_no,
    product_id,
    supplier_id,
    quantity,
        CASE
            WHEN auth_can_view_money() THEN estimated_unit_cost
            ELSE NULL::numeric
        END AS estimated_unit_cost,
        CASE
            WHEN auth_can_view_money() THEN total_estimated_cost
            ELSE NULL::numeric
        END AS total_estimated_cost,
    reason_type,
    urgency,
    status,
    requested_by,
    approved_by,
    rejection_reason,
    created_at,
    created_by,
    updated_at,
    updated_by
   FROM purchase_requests
  where auth_is_staff();

create or replace view public.return_accessory_checks_v as
 SELECT id,
    client_uuid,
    return_line_id,
    accessory_id,
    accessory_name,
    present,
        CASE
            WHEN auth_can_view_money() THEN replacement_cost
            ELSE NULL::numeric
        END AS replacement_cost,
    created_at,
    created_by
   FROM return_accessory_checks
  where auth_is_staff();

create or replace view public.vehicle_fuel_logs_v as
 SELECT id,
    client_uuid,
    vehicle_id,
    fuel_date,
    odometer,
    fuel_liters,
        CASE
            WHEN auth_can_view_money() THEN cost_amount
            ELSE NULL::numeric
        END AS cost_amount,
    receipt_url,
    branch_id,
    recorded_by,
    created_at
   FROM vehicle_fuel_logs
  where auth_is_staff();

-- ---------------------------------------------------------------------------
-- Post-conditions, asserted rather than assumed.
--
-- Check 1 — column counts are unchanged from the pre-migration values. These
-- twenty numbers were read off `information_schema.columns` before any
-- statement above ran. `create or replace view` already rejects a changed
-- column list, so this is belt-and-braces against the §6.23/§6.25 bug class.
--
-- Check 2 — every one of the twenty views now carries a WHERE clause. A view
-- that silently kept its unfiltered definition is the exact failure this
-- migration exists to prevent, so it fails loudly here instead.
-- ---------------------------------------------------------------------------
do $$
declare
  expected constant jsonb := '{
    "accessories_v": 12, "booking_crew_lines_v": 15, "booking_lines_v": 23,
    "bundles_v": 13, "cases_v": 26, "client_channel_identities_v": 12,
    "client_memberships_v": 10, "clients_v": 40, "crew_assignments_v": 15,
    "crew_bookings_v": 24, "crew_members_v": 14, "crew_profiles_v2_v": 15,
    "damage_findings_v": 20, "late_fee_findings_v": 18, "membership_plans_v": 19,
    "product_units_v": 31, "products_v": 44, "purchase_requests_v": 18,
    "return_accessory_checks_v": 9, "vehicle_fuel_logs_v": 11
  }'::jsonb;
  k text;
  actual int;
  missing_where text[];
begin
  for k in select jsonb_object_keys(expected) loop
    select count(*) into actual
      from information_schema.columns
     where table_schema = 'public' and table_name = k;
    if actual is distinct from (expected ->> k)::int then
      raise exception
        '0048 post-condition failed: view %.% has % columns, expected % — a column was lost',
        'public', k, actual, (expected ->> k)::int;
    end if;
  end loop;

  select array_agg(viewname order by viewname) into missing_where
    from pg_views
   where schemaname = 'public'
     and viewname = any (select jsonb_object_keys(expected))
     and definition !~* '\swhere\s';

  if missing_where is not null then
    raise exception
      '0048 post-condition failed: these views still have no row predicate: %',
      array_to_string(missing_where, ', ');
  end if;

  raise notice '0048 OK — 20 views re-emitted with row predicates, all column counts unchanged';
end $$;
