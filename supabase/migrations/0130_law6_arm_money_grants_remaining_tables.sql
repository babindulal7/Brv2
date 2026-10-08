-- =============================================================================
-- 0130 — Law 6: arm the money column grants on the remaining staff-visible
--        tables. NOT APPLIED to live (N-5) — this file is written and verified
--        locally; Babin applies it after the backup step.
--
-- ## What this closes
--
-- 0062 armed `bookings`, `products`, `product_units`, `booking_lines`; 0077
-- armed `accessories`/`booking_transport`/`maintenance_records`/`vehicle_fuel_
-- logs`. PLAN.md Phase 1 kept the item at [~] on the strength of one sentence:
-- "The remaining ~30 money base tables still carry the blanket grant, so their
-- `_v` mask stays bypassable." This file is that remainder, scoped.
--
-- The mechanical note from 0062/0077 still governs: Supabase's default
-- privileges give `authenticated` TABLE-level SELECT on every public table, and
-- `revoke select (col)` cannot subtract from a table grant (PostgreSQL records
-- nothing; pg_attribute.attacl stays null). The working sequence is the
-- reverse — drop the table grant, hand back the named non-money columns:
--
--     revoke select on <table> from authenticated;
--     grant  select (<every non-money column>) to authenticated;
--
-- After this, the money columns are reachable only through the `_v` views,
-- which re-apply `auth_can_view_money()` per role.
--
-- ## How the target list was measured, not inferred
--
-- scripts/check-law6-exposure.mjs builds the full chain in PGlite, seeds the
-- nine lifecycle users, and probes every money-pattern column as Warehouse /
-- Technician / Driver with `set local role authenticated` +
-- `app.current_user_id`. Its read on the pre-0130 schema:
--
--   · PROVEN TODAY: `booking_crew_lines` — Warehouse/Technician/Driver read all
--     120 rows WITH `day_rate` = 8000.00. Crew payout rates were live-readable
--     by money-blind roles. A real Law 6 breach.
--   · `clients.pan_vat` (40 rows) and `number_sequences.current_value` (12 rows)
--     are also readable: they are handled under "Deliberately not in this file"
--     below — neither is a money figure.
--   · Everything else: money columns readable, zero rows admitted today
--     (latent; activates with the first admitted row — 0077's prelude).
--
-- ## The money set per table comes from the project's own mask, not this file
--
-- 0048/0035–0039 already wrote masking views for 14 of the 16 tables; their
-- `case when auth_can_view_money() then <col>` arms ARE the declared money set.
-- This migration revokes exactly those columns at the base — no more, no less.
-- The two tables with no view get one here, same convention, and the columns
-- chosen there are stated in their section below.
--
--   Table                    | Masked at the base after this file
--   -------------------------+----------------------------------------------------
--   booking_crew_lines       | day_rate, overtime, accommodation, meals
--   bundles                  | daily_rate, weekly_rate
--   cases                    | assessed_amount, deposit_held_amount,
--                            |   charged_to_client_amount, deposit_applied_amount,
--                            |   insurance_claimed_amount, warranty_covered_amount,
--                            |   recovered_from_partner_amount, absorbed_amount
--   client_memberships       | fee_paid
--   clients                  | approved_credit_limit, payment_terms
--   crew_assignments         | daily_rate, line_total
--   crew_bookings            | day_rate
--   crew_members             | withholding_rate, day_rate, internal_note
--   crew_profiles_v2         | daily_rate, hourly_rate
--   damage_findings          | estimated_cost
--   fulfillment_outcomes     | estimated_revenue_lost
--   late_fee_findings        | day_rate_amount, fee_amount
--   membership_limit_breaches| limit_value, actual_value
--   membership_plans         | annual_fee, individual_discount_pct,
--                            |   bundle_discount_pct, default_credit_limit
--   purchase_requests        | estimated_unit_cost, total_estimated_cost
--   return_accessory_checks  | replacement_cost
--
-- Three of those sets carry their own note:
--
--   · crew_members.internal_note is not money — the existing view hides it,
--     so the base grant does too. A grant list that hands back what the view
--     was written to hide is a leak with extra steps. (B-1: stricter wins.)
--   · membership_limit_breaches.limit_value / actual_value are breach sizes —
--     counts in kind, money when the limit is a credit line. Not in §5's table
--     by name; masked because the cheaper reading is the wrong one to leak.
--   · clients.payment_terms is an enum, not a figure — but 0019's own masking
--     taxonomy treats it as commercial terms (it is masked in clients_v), and
--     §5's "credit limit, pay-later" row is this column's family.
--
-- `pan_vat` on clients/branches/suppliers stays granted: a registration number
-- is business identity, not a money figure, and 0048's clients_v leaves it
-- unmasked — same visibility today, plus a note for the PII pass (§10), which
-- is where identity narrowing belongs. Not silently dropped; consciously out
-- of scope for Law 6.
--
-- ## What this file deliberately does NOT arm
--
-- Row-gated money tables stay row-gated: `payments`, `invoices`,
-- `invoice_lines`, `security_deposits`, `deposit_movements`, `charges`,
-- `credit_notes`, `payment_reversals`, `expenses`, `expense_reversals`,
-- `depreciation_logs`, `tax_ledgers`, `coupons`, `coupon_redemptions`,
-- `external_invoices`. Their SELECT policies already refuse every money-blind
-- role (`auth_can_view_money()` / `auth_is_finance_or_admin()`), so a Warehouse
-- session gets zero rows today. Column grants would be the second layer; this
-- file is the layer that was MISSING (staff-visible tables), not a restack of
-- the one that holds. If one of those policies is ever loosened, that change
-- must add the column grants in the same diff.
--
-- Also skipped: `number_sequences.current_value` (a counter — order volume is
-- not a price), `stock_audits` totals / `broadcast_batches.total_recipients` /
-- `timesheets.total_hours` (counts and hours), `system_settings` (role-gated),
-- `sync_conflicts` (Owner/Admin), `user_approval_authorities` (Owner/Admin/
-- Manager).
--
-- ## The app was moved first — every money read already sits on a view
--
-- Call-site audit (2026-09-19, both quote styles, whole of src/): the tables
-- were either read only through their `_v` view, or moved to it in the same
-- change as this file —
--
--   · queries/bundles.ts, queries/addBundle.ts            → bundles_v
--   · queries/cases.ts, queries/damage.ts                 → cases_v
--   · queries/invoicePreview.ts (payment_terms)           → clients_v
--   · queries/purchaseRequests.ts                         → purchase_requests_v
--
-- Three write paths issued a bare `RETURNING *` on tables armed here and would
-- have thrown 42501 AFTER commit (the AUDIT_0062 phantom-write class). Fixed in
-- the same change by naming an echo or dropping it:
--
--   · actions/clients/createClient.ts          → returningColumns id, client_code
--   · actions/rentals/floorVerb.ts × 2         → returnRow: false (finding rows
--                                                were never read back)
--   · actions/inventory/approvePurchaseRequest → returningColumns id, pr_no, status
--
-- `actions/clients/mergeClients.ts` repoints by bare UPDATE (no RETURNING, so
-- the grants do not touch it) and now checks every repoint's error: the case
-- branch previously queried `cases.client_id`, a column that has never existed,
-- so it error'd silently on every merge — it is gone, and case attachment
-- follows the booking.
--
-- ⚠ FORWARD OBLIGATION (0065's, restated): PostgREST issues RETURNING * on a
-- bare insert/update; on these 16 tables that names an ungranted column and
-- fails after the commit. Any future writer passes `returnRow: false` or names
-- granted columns. `dataAccess`'s option docs carry the same warning text.
--
-- ⚠ MAINTENANCE OBLIGATION: a column ADDED to any of these 16 tables is
-- unreadable by `authenticated` until it is added to the grant list below. The
-- post-conditions count-check against information_schema, so an added column
-- fails the apply loudly rather than reading back nothing forever.
-- =============================================================================

begin;

-- 1 · booking_crew_lines — 15 columns, 11 granted
revoke select on booking_crew_lines from authenticated;
grant select (
  id, client_uuid, booking_id, crew_member_id, name, crew_role, phone,
  days, voided_at, created_at, created_by
) on booking_crew_lines to authenticated;

-- 2 · bundles — 13 columns, 11 granted
revoke select on bundles from authenticated;
grant select (
  id, client_uuid, bundle_code, name, description, category_id, is_active,
  created_at, created_by, updated_at, updated_by
) on bundles to authenticated;

-- 3 · cases — 26 columns, 18 granted
revoke select on cases from authenticated;
grant select (
  id, client_uuid, case_no, type, title, counterparty_kind, counterparty_name,
  priority, status, disposition, linked_booking_id, owner_id, flags,
  opened_at, settled_at, created_at, created_by, updated_at
) on cases to authenticated;

-- 4 · client_memberships — 10 columns, 9 granted
revoke select on client_memberships from authenticated;
grant select (
  id, client_uuid, client_id, plan_id, join_date,
  superseded_by_id, superseded_at, created_at, created_by
) on client_memberships to authenticated;

-- 5 · clients — 40 columns, 38 granted
revoke select on clients from authenticated;
grant select (
  id, client_uuid, client_code, type_parent, org_subtype, name, phone, email,
  pan_vat, business_registration, website, government_id_kind,
  government_id_number, address_line, city, district, postal_code, country,
  billing_address, client_since, professions, segments, source,
  referred_by_client_id, tags, preferred_contact_channels,
  marketing_photo_consent, notes, assigned_staff_id, status, deactivated_at,
  deactivated_by, deactivation_reason, merged_into_client_id,
  portal_default_language, created_at, created_by, updated_at
) on clients to authenticated;

-- 6 · crew_assignments — 15 columns, 13 granted
revoke select on crew_assignments from authenticated;
grant select (
  id, client_uuid, booking_id, crew_id, role_on_shoot, call_time, wrap_time,
  days, notes, created_at, created_by, updated_at, updated_by
) on crew_assignments to authenticated;

-- 7 · crew_bookings — 24 columns, 23 granted
revoke select on crew_bookings from authenticated;
grant select (
  id, client_uuid, crew_booking_no, production_id, booking_id, crew_member_id,
  position, days, start_date, end_date, location, state, payout_state,
  conflict_override_by, conflict_override_reason, conflict_override_at,
  travel_warning_acknowledged_by, travel_warning_acknowledged_at, cancelled_at,
  cancel_reason, created_by, created_at, updated_at
) on crew_bookings to authenticated;

-- 8 · crew_members — 14 columns, 11 granted
revoke select on crew_members from authenticated;
grant select (
  id, client_uuid, full_name, position, phone, engagement_type, pan_status,
  deactivated_at, created_by, created_at, updated_at
) on crew_members to authenticated;

-- 9 · crew_profiles_v2 — 15 columns, 13 granted
revoke select on crew_profiles_v2 from authenticated;
grant select (
  id, client_uuid, crew_code, full_name, mobile, email, primary_role,
  is_internal_staff, is_active, created_at, created_by, updated_at, updated_by
) on crew_profiles_v2 to authenticated;

-- 10 · damage_findings — 20 columns, 19 granted
revoke select on damage_findings from authenticated;
grant select (
  id, client_uuid, source, return_line_id, cleaning_queue_entry_id, unit_id,
  damage_type, description, severity, approval_state, approved_by,
  approved_at, disposition, case_id, charge_id, voided_at, created_at,
  created_by, updated_at
) on damage_findings to authenticated;

-- 11 · fulfillment_outcomes — 21 columns, 20 granted
revoke select on fulfillment_outcomes from authenticated;
grant select (
  id, client_uuid, booking_id, booking_line_id, requested_model_id,
  requested_qty, delivered_qty, fulfillment_status, substituted_model_id,
  swap_type, sub_rental_id, waiting_since, resolved_at, delivery_method,
  assigned_staff_id, due_date_ad, branch_id, warehouse_id, created_at,
  created_by
) on fulfillment_outcomes to authenticated;

-- 12 · late_fee_findings — 18 columns, 16 granted
revoke select on late_fee_findings from authenticated;
grant select (
  id, client_uuid, booking_id, return_session_id, scheduled_return_at,
  actual_return_at, overage_minutes, band, full_days_charged, approval_state,
  approved_by, approved_at, voided_at, voided_reason, created_at, created_by
) on late_fee_findings to authenticated;

-- 13 · membership_limit_breaches — 10 columns, 8 granted
revoke select on membership_limit_breaches from authenticated;
grant select (
  id, client_uuid, client_id, membership_id, breach_kind, booking_id,
  created_at, approved_by
) on membership_limit_breaches to authenticated;

-- 14 · membership_plans — 19 columns, 15 granted
revoke select on membership_plans from authenticated;
grant select (
  id, client_uuid, level, label, monthly_booking_limit,
  simultaneous_rental_limit, authorized_users, term_months, perks,
  display_order, status, retired_at, created_at, created_by, updated_at
) on membership_plans to authenticated;

-- 15 · purchase_requests — 18 columns, 16 granted
revoke select on purchase_requests from authenticated;
grant select (
  id, client_uuid, pr_no, product_id, supplier_id, quantity, reason_type,
  urgency, status, requested_by, approved_by, rejection_reason, created_at,
  created_by, updated_at, updated_by
) on purchase_requests to authenticated;

-- 16 · return_accessory_checks — 9 columns, 8 granted
revoke select on return_accessory_checks from authenticated;
grant select (
  id, client_uuid, return_line_id, accessory_id, accessory_name, present,
  created_at, created_by
) on return_accessory_checks to authenticated;

-- ---------------------------------------------------------------------------
-- The two masking views that were never written — created here, never apart
-- from the revoke (0019/0035/0036/0077 convention). Definer rights, explicit
-- row predicate copied from the effective read policy, money through
-- auth_can_view_money(). Do NOT set security_invoker on either view: under
-- this migration that re-applies the caller's revoked grants and kills the
-- read for every role (0061's bug, 0065's repair).
-- ---------------------------------------------------------------------------

create or replace view public.fulfillment_outcomes_v as
select
  id,
  client_uuid,
  booking_id,
  booking_line_id,
  requested_model_id,
  requested_qty,
  delivered_qty,
  fulfillment_status,
  substituted_model_id,
  swap_type,
  sub_rental_id,
  waiting_since,
  resolved_at,
  delivery_method,
  assigned_staff_id,
  due_date_ad,
  branch_id,
  warehouse_id,
  case when auth_can_view_money() then estimated_revenue_lost else null::numeric end as estimated_revenue_lost,
  created_at,
  created_by
from fulfillment_outcomes
where auth_is_staff();

grant select on public.fulfillment_outcomes_v to authenticated;

comment on view public.fulfillment_outcomes_v is
  'Law 6. The only path to fulfillment_outcomes.estimated_revenue_lost once 0130 '
  'arms the mask. Definer rights + explicit row predicate (0048): the effective '
  'read gate is auth_is_staff() — fulfillment_outcomes_select plus the role-listed '
  'fulfillment_outcomes_all are PERMISSIVE and OR together. Do NOT set '
  'security_invoker on this view.';

create or replace view public.membership_limit_breaches_v as
select
  id,
  client_uuid,
  client_id,
  membership_id,
  breach_kind,
  booking_id,
  case when auth_can_view_money() then limit_value else null::integer end as limit_value,
  case when auth_can_view_money() then actual_value else null::integer end as actual_value,
  created_at,
  approved_by
from membership_limit_breaches
where auth_is_staff();

grant select on public.membership_limit_breaches_v to authenticated;

comment on view public.membership_limit_breaches_v is
  'Law 6. The only path to membership_limit_breaches.limit_value / actual_value '
  'once 0130 arms the mask. Definer rights + auth_is_staff() row gate (effective '
  'gate of the two PERMISSIVE policies). Do NOT set security_invoker.';

-- ---------------------------------------------------------------------------
-- Post-conditions — the checks 0019/0035/0036 never had. Refuse to leave this
-- half-landed: blanket grant gone per table, every masked column refused, a
-- neighbouring operational column still readable, base-table column counts
-- still match this file's written lists, and every masking view present,
-- row-gated and definer-rights.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tables constant text[] := array[
    'booking_crew_lines', 'bundles', 'cases', 'client_memberships', 'clients',
    'crew_assignments', 'crew_bookings', 'crew_members', 'crew_profiles_v2',
    'damage_findings', 'fulfillment_outcomes', 'late_fee_findings',
    'membership_limit_breaches', 'membership_plans', 'purchase_requests',
    'return_accessory_checks'
  ];
  v_money constant jsonb := '{
    "booking_crew_lines":       ["day_rate", "overtime", "accommodation", "meals"],
    "bundles":                  ["daily_rate", "weekly_rate"],
    "cases":                    ["assessed_amount", "deposit_held_amount", "charged_to_client_amount", "deposit_applied_amount", "insurance_claimed_amount", "warranty_covered_amount", "recovered_from_partner_amount", "absorbed_amount"],
    "client_memberships":       ["fee_paid"],
    "clients":                  ["approved_credit_limit", "payment_terms"],
    "crew_assignments":         ["daily_rate", "line_total"],
    "crew_bookings":            ["day_rate"],
    "crew_members":             ["withholding_rate", "day_rate", "internal_note"],
    "crew_profiles_v2":         ["daily_rate", "hourly_rate"],
    "damage_findings":          ["estimated_cost"],
    "fulfillment_outcomes":     ["estimated_revenue_lost"],
    "late_fee_findings":        ["day_rate_amount", "fee_amount"],
    "membership_limit_breaches":["limit_value", "actual_value"],
    "membership_plans":         ["annual_fee", "individual_discount_pct", "bundle_discount_pct", "default_credit_limit"],
    "purchase_requests":        ["estimated_unit_cost", "total_estimated_cost"],
    "return_accessory_checks":  ["replacement_cost"]
  }'::jsonb;
  v_keep constant jsonb := '{
    "booking_crew_lines": "name",             "bundles": "bundle_code",
    "cases": "case_no",                        "client_memberships": "plan_id",
    "clients": "name",                         "crew_assignments": "crew_id",
    "crew_bookings": "crew_booking_no",        "crew_members": "full_name",
    "crew_profiles_v2": "crew_code",           "damage_findings": "unit_id",
    "fulfillment_outcomes": "booking_id",      "late_fee_findings": "booking_id",
    "membership_limit_breaches": "client_id",  "membership_plans": "level",
    "purchase_requests": "pr_no",              "return_accessory_checks": "accessory_name"
  }'::jsonb;
  v_counts constant jsonb := '{
    "booking_crew_lines": 15, "bundles": 13, "cases": 26, "client_memberships": 10,
    "clients": 40, "crew_assignments": 15, "crew_bookings": 24, "crew_members": 14,
    "crew_profiles_v2": 15, "damage_findings": 20, "fulfillment_outcomes": 21,
    "late_fee_findings": 18, "membership_limit_breaches": 10, "membership_plans": 19,
    "purchase_requests": 18, "return_accessory_checks": 9
  }'::jsonb;
  v_views constant text[] := array[
    'booking_crew_lines_v', 'bundles_v', 'cases_v', 'client_memberships_v',
    'clients_v', 'crew_assignments_v', 'crew_bookings_v', 'crew_members_v',
    'crew_profiles_v2_v', 'damage_findings_v', 'fulfillment_outcomes_v',
    'late_fee_findings_v', 'membership_limit_breaches_v', 'membership_plans_v',
    'purchase_requests_v', 'return_accessory_checks_v'
  ];
  t text;
  c text;
  v_actual int;
begin
  foreach t in array v_tables loop
    -- 1 · the blanket is gone
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      raise exception
        '0130 post-condition failed: authenticated still holds TABLE-level SELECT on public.% -- the mask is inert, exactly as in 0019/0035/0036.', t;
    end if;

    -- 2a · every masked column is refused
    for c in select jsonb_array_elements_text(v_money -> t) loop
      if has_column_privilege('authenticated', format('public.%I', t), c, 'SELECT') then
        raise exception
          '0130 post-condition failed: authenticated can still read %.% -- Law 6 is not armed on this column.', t, c;
      end if;
    end loop;

    -- 2b · the operational half survived
    if not has_column_privilege('authenticated', format('public.%I', t), v_keep ->> t, 'SELECT') then
      raise exception
        '0130 post-condition failed: %.% is no longer readable -- the revoke was over-broad and took an operational column with it.', t, v_keep ->> t;
    end if;

    -- 3 · the column list this file was written against still holds
    select count(*) into v_actual
      from information_schema.columns
     where table_schema = 'public' and table_name = t;
    if v_actual is distinct from (v_counts ->> t)::int then
      raise exception
        '0130 post-condition failed: public.% has % columns, expected % -- a column was added or dropped since this file was drafted and is now ungranted (fail-closed). Update the grant list above.', t, v_actual, (v_counts ->> t)::int;
    end if;
  end loop;

  -- 4 · every masking view is present, row-gated, and definer-rights
  foreach t in array v_views loop
    if not exists (
      select 1 from pg_views where schemaname = 'public' and viewname = t
    ) then
      raise exception '0130 post-condition failed: view public.% does not exist -- the money columns have no sanctioned read path at all.', t;
    end if;

    if not exists (
      select 1 from pg_views
       where schemaname = 'public' and viewname = t and definition ilike '%where%'
    ) then
      raise exception '0130 post-condition failed: view public.% has no WHERE clause (0048''s stated failure mode).', t;
    end if;

    if exists (
      select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
       where n.nspname = 'public' and k.relname = t
         and coalesce(k.reloptions, '{}') && array['security_invoker=on', 'security_invoker=true']
    ) then
      raise exception '0130 post-condition failed: view public.% is security_invoker -- under this migration the caller''s revoked grants apply and the read dies for every role (0061''s bug, 0065''s repair).', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The check that proves it, by hand. Run AFTER applying, inside a transaction
-- that rolls back — the MCP/service connection bypasses RLS and proves nothing
-- on its own (0077's §7 ritual):
--
--     begin;
--     set local role authenticated;
--     select set_config('app.current_user_id', '<a Warehouse user uuid>', true);
--
--     select day_rate from booking_crew_lines limit 1;   -- expect 42501
--     select estimated_cost from damage_findings limit 1; -- expect 42501
--     select approved_credit_limit from clients limit 1;  -- expect 42501
--     select name from clients limit 1;                   -- expect no error
--     select day_rate from booking_crew_lines_v limit 1;  -- expect null
--     select case_no from cases limit 1;                  -- expect no error
--     rollback;
--
--     Then as an Owner user: the base-table money reads still raise 42501 —
--     THAT is correct; it is what forces every future call site through a
--     view — and the `_v` reads return real figures.
--
-- Local proof: scripts/check-law6-exposure.mjs (schema-build + role-simulated
-- probes) passes with every money column refused and every _v read serving.
-- ---------------------------------------------------------------------------

commit;
