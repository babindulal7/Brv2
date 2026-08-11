-- ============================================================================
-- 0034_incident_and_crew_profile_policies.sql
--
-- Twelfth reviewed batch out of the money-adjacent bucket (§6.10-§6.20 in
-- PLAN.md; 0033 closed the last of the "plain" bucket, so every batch from
-- here on draws from money-adjacent/PII-masking-adjacent/portal/items-blocked).
--
-- Two tables here close a promise their OWN creating migration already made
-- and never kept: `damage_findings` (0003) and `cases` (0023) both carry a
-- "TRIGGER REQUIRED (RLS): Warehouse sees no money columns" comment with no
-- policy or view behind it — `enable row level security` with zero policies,
-- fail-closed (nobody could read either table at all) rather than the
-- column-masked-but-visible row the comment promises. Fixed here with the
-- same view-masking pattern 0019 established for products/product_units/
-- booking_lines. `charges` (0023) gets the OTHER shape its own comment asks
-- for — "Warehouse sees no rows at all... money by definition" — a blanket
-- row-block, same as 0014's invoices/payments/security_deposits/
-- deposit_movements/expenses loop.
--
-- `crew_profiles_v2` and `crew_members` are the two halves of 0009's own
-- documented duplicate-definition TODO(decision): a straight `create table
-- crew_members` collision was resolved by renaming 0009's version to
-- `crew_profiles_v2`, but which of the two crew models is canonical was
-- deliberately left unruled — that decision is NOT made here either. Both
-- tables exist for real today under distinct names, so both get real access
-- control as they stand; merging them is still open, tracked in PLAN.md §4.
--
-- `bank_accounts` and `user_approval_authorities` close out §6.10's original
-- money-adjacent list's two non-crew, non-incident stragglers.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · damage_findings — mixed row, one money column (estimated_cost).
-- Row stays staff-visible (0003's own header: "Warehouse records the
-- finding; a Manager approves the amount" — Warehouse needs the row to do
-- its own job); estimated_cost is masked via view. Closes 0003's own
-- "estimated_cost may only be set by Owner, Manager or Billing" comment —
-- "Billing" restated as "Accounts" per 0013's business-8 rename.
-- ---------------------------------------------------------------------------

drop policy if exists damage_findings_all on damage_findings;
create policy damage_findings_all on damage_findings
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke delete on damage_findings from public, anon, authenticated;
revoke select (estimated_cost) on damage_findings from authenticated;

create or replace view damage_findings_v as
select
  id, client_uuid, source, return_line_id, cleaning_queue_entry_id, unit_id,
  damage_type, description, severity,
  case when auth_can_view_money() then estimated_cost else null end as estimated_cost,
  approval_state, approved_by, approved_at, disposition, case_id, charge_id,
  voided_at, created_at, created_by, updated_at
from damage_findings;

grant select on damage_findings_v to authenticated;

comment on view damage_findings_v is
  'Column-masked read surface for damage_findings -- see products_v (0019) for the pattern. estimated_cost resolves to NULL for Warehouse/Technician/Driver/Client, never zero.';

-- ---------------------------------------------------------------------------
-- 2 · cases — mixed row, the eight §7.3 allocation columns. Closes 0023's
-- own "Warehouse sees no money columns on this table" comment, same shape
-- as damage_findings above.
-- ---------------------------------------------------------------------------

drop policy if exists cases_all on cases;
create policy cases_all on cases
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (
  assessed_amount, deposit_held_amount, charged_to_client_amount,
  deposit_applied_amount, insurance_claimed_amount, warranty_covered_amount,
  recovered_from_partner_amount, absorbed_amount
) on cases from authenticated;

create or replace view cases_v as
select
  id, client_uuid, case_no, type, title, counterparty_kind, counterparty_name,
  priority, status, disposition, linked_booking_id,
  case when auth_can_view_money() then assessed_amount else null end as assessed_amount,
  case when auth_can_view_money() then deposit_held_amount else null end as deposit_held_amount,
  case when auth_can_view_money() then charged_to_client_amount else null end as charged_to_client_amount,
  case when auth_can_view_money() then deposit_applied_amount else null end as deposit_applied_amount,
  case when auth_can_view_money() then insurance_claimed_amount else null end as insurance_claimed_amount,
  case when auth_can_view_money() then warranty_covered_amount else null end as warranty_covered_amount,
  case when auth_can_view_money() then recovered_from_partner_amount else null end as recovered_from_partner_amount,
  case when auth_can_view_money() then absorbed_amount else null end as absorbed_amount,
  owner_id, flags, opened_at, settled_at, created_at, created_by, updated_at
from cases;

grant select on cases_v to authenticated;

comment on view cases_v is
  'Column-masked read surface for cases -- see products_v (0019) for the pattern. All eight section 7.3 allocation columns resolve to NULL for Warehouse/Technician/Driver/Client.';

-- ---------------------------------------------------------------------------
-- 3 · charges — entirely money by its own definition (0023's comment:
-- "Warehouse sees no rows at all... this table is money by definition, not
-- a column-mask case"). Blanket row-block, same shape as 0014's loop;
-- written as its own policy rather than reopening that do-block.
-- ---------------------------------------------------------------------------

drop policy if exists charges_money_blind on charges;
create policy charges_money_blind on charges
  for all
  using (auth_can_view_money())
  with check (auth_can_view_money());

-- ---------------------------------------------------------------------------
-- 4 · crew_profiles_v2 — mixed row: daily_rate, hourly_rate.
--
-- NOTE: the app layer's own field-gating (src/lib/fieldGating.ts) gates crew
-- pay stricter than plain money -- 'asset-finance' explicitly excludes
-- Coordinator too, not just the three floor roles ("no crew pay" per HIS
-- v2.1 §4.1). No DB-level function distinguishes that yet -- auth_can_view_
-- money() is the only money gate this thread has built so far, and using it
-- here is consistent with every other money-adjacent table in this batch,
-- not a claim that it fully matches the app's stricter rule. Not inventing a
-- new DB function unasked -- flagged in PLAN.md §4 instead.
-- ---------------------------------------------------------------------------

drop policy if exists crew_profiles_v2_select on crew_profiles_v2;
create policy crew_profiles_v2_select on crew_profiles_v2
  for select
  using (auth_is_staff());

drop policy if exists crew_profiles_v2_all on crew_profiles_v2;
create policy crew_profiles_v2_all on crew_profiles_v2
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke select (daily_rate, hourly_rate) on crew_profiles_v2 from authenticated;

create or replace view crew_profiles_v2_v as
select
  id, client_uuid, crew_code, full_name, mobile, email, primary_role,
  case when auth_can_view_money() then daily_rate else null end as daily_rate,
  case when auth_can_view_money() then hourly_rate else null end as hourly_rate,
  is_internal_staff, is_active, created_at, created_by, updated_at, updated_by
from crew_profiles_v2;

grant select on crew_profiles_v2_v to authenticated;

comment on view crew_profiles_v2_v is
  'Column-masked read surface for crew_profiles_v2 -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 5 · crew_members — the 0003 model (richer HR profile), the other half of
-- 0009's duplicate-definition TODO(decision). Mixed row: day_rate,
-- withholding_rate; internal_note is masked alongside them per this table's
-- own column comment ("Denied to Warehouse and Viewer"), not because it is
-- money-shaped.
-- ---------------------------------------------------------------------------

drop policy if exists crew_members_select on crew_members;
create policy crew_members_select on crew_members
  for select
  using (auth_is_staff());

drop policy if exists crew_members_all on crew_members;
create policy crew_members_all on crew_members
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke delete on crew_members from public, anon, authenticated;
revoke select (day_rate, withholding_rate, internal_note) on crew_members from authenticated;

create or replace view crew_members_v as
select
  id, client_uuid, full_name, position, phone, engagement_type, pan_status,
  case when auth_can_view_money() then withholding_rate else null end as withholding_rate,
  case when auth_can_view_money() then day_rate else null end as day_rate,
  case when auth_can_view_money() then internal_note else null end as internal_note,
  deactivated_at, created_by, created_at, updated_at
from crew_members;

grant select on crew_members_v to authenticated;

comment on view crew_members_v is
  'Column-masked read surface for crew_members -- see products_v (0019) for the pattern. internal_note is masked alongside the two rate columns per this table''s own "denied to Warehouse" column comment.';

-- ---------------------------------------------------------------------------
-- 6 · bank_accounts — no numeric money column, but account_number is
-- sensitive-by-content (§6.10's own bucketing reason, alongside
-- user_approval_authorities below). Whole-row gate rather than a column
-- mask -- every column here is payment-destination metadata, not a mix of
-- operational and sensitive fields. RLS already enabled by 0007; only the
-- policy was missing.
-- ---------------------------------------------------------------------------

drop policy if exists bank_accounts_money_blind on bank_accounts;
create policy bank_accounts_money_blind on bank_accounts
  for select
  using (auth_can_view_money());

drop policy if exists bank_accounts_all on bank_accounts;
create policy bank_accounts_all on bank_accounts
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Accounts'));

-- ---------------------------------------------------------------------------
-- 7 · user_approval_authorities — approval-limit metadata (max_amount_limit,
-- max_discount_pct), not itself a transaction amount. Structural-config
-- tier, same as audit_settings (0018) / branches (0022): who may see and
-- edit the rules, not who the rules apply to. RLS already enabled by 0007;
-- only the policy was missing.
-- ---------------------------------------------------------------------------

drop policy if exists user_approval_authorities_all on user_approval_authorities;
create policy user_approval_authorities_all on user_approval_authorities
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

commit;
