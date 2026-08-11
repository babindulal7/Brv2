-- ============================================================================
-- 0035_accessory_bundle_and_ledger_masking.sql
--
-- Continues the money-adjacent bucket (§6.10-§6.20 in PLAN.md), same view-
-- masking pattern 0019 established and 0034 (a concurrent session) just
-- extended to damage_findings/cases/crew_profiles_v2/crew_members. Five
-- tables here, split by whether the row is genuinely mixed or entirely
-- accounting:
--
--   - `accessories`, `bundles`, `late_fee_findings` — mixed rows. Warehouse
--     needs the operational columns (accessory name/qty, bundle
--     code/name, the late-fee finding's band/overage) to do its own job;
--     only the money columns are masked. Same shape as 0034's
--     `damage_findings`.
--   - `depreciation_logs`, `tax_ledgers` — checked column by column and
--     found NOT mixed: every column in both is either a money figure
--     itself or accounting metadata with no floor use (fiscal year,
--     depreciation method, tax direction, PAN/VAT number). No column
--     survives a mask worth building a view for. Whole-row
--     `auth_can_view_money()` gate instead, same shape as `bank_accounts`
--     (0034) — not a new pattern, just the other branch 0019's own "WHY A
--     VIEW, NOT A ROW POLICY" reasoning already implies for rows that
--     aren't actually mixed.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · accessories — mixed row, one money column (replacement_cost)
-- ---------------------------------------------------------------------------

drop policy if exists accessories_all on accessories;
create policy accessories_all on accessories
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

revoke select (replacement_cost) on accessories from authenticated;

create or replace view accessories_v as
select
  id, client_uuid, product_id, name, quantity, is_mandatory,
  case when auth_can_view_money() then replacement_cost else null end as replacement_cost,
  sort_order, created_at, created_by, updated_at, updated_by
from accessories;

grant select on accessories_v to authenticated;

comment on view accessories_v is
  'Column-masked read surface for accessories -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 2 · bundles — mixed row, two money columns (daily_rate, weekly_rate)
-- ---------------------------------------------------------------------------

drop policy if exists bundles_select on bundles;
create policy bundles_select on bundles
  for select
  using (auth_is_staff());

drop policy if exists bundles_manage on bundles;
create policy bundles_manage on bundles
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke select (daily_rate, weekly_rate) on bundles from authenticated;

create or replace view bundles_v as
select
  id, client_uuid, bundle_code, name, description, category_id,
  case when auth_can_view_money() then daily_rate else null end as daily_rate,
  case when auth_can_view_money() then weekly_rate else null end as weekly_rate,
  is_active, created_at, created_by, updated_at, updated_by
from bundles;

grant select on bundles_v to authenticated;

comment on view bundles_v is
  'Column-masked read surface for bundles -- see products_v (0019) for the pattern.';

-- ---------------------------------------------------------------------------
-- 3 · late_fee_findings — mixed row, two money columns
-- (day_rate_amount, fee_amount). band/overage_minutes/full_days_charged
-- stay visible -- Warehouse/Coordinator need to see why a return is
-- flagged late, just not what it costs. Same approval shape as
-- damage_findings (0034): a finding Warehouse/floor records or triggers,
-- a Manager/Accounts approves the amount on.
-- ---------------------------------------------------------------------------

drop policy if exists late_fee_findings_all on late_fee_findings;
create policy late_fee_findings_all on late_fee_findings
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

revoke select (day_rate_amount, fee_amount) on late_fee_findings from authenticated;

create or replace view late_fee_findings_v as
select
  id, client_uuid, booking_id, return_session_id, scheduled_return_at,
  actual_return_at, overage_minutes, band, full_days_charged,
  case when auth_can_view_money() then day_rate_amount else null end as day_rate_amount,
  case when auth_can_view_money() then fee_amount else null end as fee_amount,
  approval_state, approved_by, approved_at, voided_at, voided_reason,
  created_at, created_by
from late_fee_findings;

grant select on late_fee_findings_v to authenticated;

comment on view late_fee_findings_v is
  'Column-masked read surface for late_fee_findings -- see products_v (0019) for the pattern. band/overage_minutes stay visible so floor/coordination roles can see WHY a return is flagged late without seeing what it costs.';

-- ---------------------------------------------------------------------------
-- 4 · depreciation_logs — whole-row, not mixed
--
-- Every column is either a money figure (initial_cost, residual_value,
-- annual_depreciation, accumulated_depreciation, book_value) or pure
-- accounting metadata (fiscal_year, depreciation_method, useful_life_years)
-- with no floor use. Owner/Admin/Accounts tier, same as bank_accounts
-- (0034) -- the finance-function tier, not the general config tier, since
-- this is accounting output, not something Coordinator/Manager configure.
-- ---------------------------------------------------------------------------

drop policy if exists depreciation_logs_select on depreciation_logs;
create policy depreciation_logs_select on depreciation_logs
  for select
  using (auth_can_view_money());

drop policy if exists depreciation_logs_manage on depreciation_logs;
create policy depreciation_logs_manage on depreciation_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Accounts'));

-- ---------------------------------------------------------------------------
-- 5 · tax_ledgers — whole-row, not mixed
--
-- taxable_amount/tax_rate/tax_amount are money; entry_no/tax_type/
-- tax_direction/pan_vat_no/party_name/entry_date are VAT-ledger metadata
-- with no floor use either. Same tier as depreciation_logs.
-- ---------------------------------------------------------------------------

drop policy if exists tax_ledgers_select on tax_ledgers;
create policy tax_ledgers_select on tax_ledgers
  for select
  using (auth_can_view_money());

drop policy if exists tax_ledgers_manage on tax_ledgers;
create policy tax_ledgers_manage on tax_ledgers
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Accounts'));

commit;
