-- ============================================================================
-- 0032_hr_and_misc_operational_policies.sql
--
-- Tenth reviewed batch out of the 92-table RLS gap (§6.9-§6.18 in PLAN.md).
-- Nine tables, each read individually rather than assumed from its name —
-- this batch corrects two earlier assumptions on top of policing new ones.
--
-- `expense_reversals` was on this batch's original candidate list, drawn
-- from a "no obvious money name" read of the table list. Its actual column
-- `amount numeric(14,2)` is money — the automated sweep from §6.10 missed
-- it because the column is bare `amount`, not `xxx_amount`, so the
-- suffix-match `_amount` never matched. Same root cause as
-- `fee_paid`/`max_amount_limit` in §6.12, a different surface of it.
-- Excluded, moved to the money-adjacent bucket.
--
-- `signatures` was flagged back in §6.10 as needing the same self-row
-- treatment as `timesheets` — on reading its actual columns for this batch,
-- that was wrong. It's evidence attached to an operation session
-- (`session_id not null`), not one person's own record — `signer_name` is
-- often a CLIENT's name captured on a handover screen, not the acting
-- staff member. Whoever is working that session needs to see it, the same
-- as any other session artifact. Corrected here: mirrors
-- `operation_sessions_all`'s tier, not a self-row policy.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · timesheets — self-row-scoped, same shape as notifications (0031)
--
-- One person's clock-in/out record. Self read/update, plus the
-- Owner/Admin/Manager tier `approved_by`/`approval_state` imply approvers
-- need (matches audit_settings' tier, the closest existing "who approves
-- HR-adjacent things" precedent). INSERT restricted to self — you clock
-- yourself in, not someone else -- unlike notifications_insert (0031),
-- which stayed broad because one person routinely notifies another.
-- ---------------------------------------------------------------------------

drop policy if exists timesheets_select on timesheets;
create policy timesheets_select on timesheets
  for select
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

drop policy if exists timesheets_insert on timesheets;
create policy timesheets_insert on timesheets
  for insert
  with check (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

drop policy if exists timesheets_update on timesheets;
create policy timesheets_update on timesheets
  for update
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin', 'Manager')
  )
  with check (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- ---------------------------------------------------------------------------
-- 2 · signatures — corrected from §6.10's assumption, see header
-- ---------------------------------------------------------------------------

drop policy if exists signatures_select on signatures;
create policy signatures_select on signatures
  for select
  using (auth_is_staff());

drop policy if exists signatures_all on signatures;
create policy signatures_all on signatures
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

comment on policy signatures_all on signatures is
  'Corrected from an earlier assumption (PLAN.md §6.10) that this needed self-row-scoping like timesheets. It does not -- session_id-scoped evidence, not one person''s own record. Mirrors operation_sessions_all.';

-- ---------------------------------------------------------------------------
-- 3 · override_records — gate-bypass audit trail, admin-tier only
--
-- Records who overrode a gate and why (reason has its own 10-char CHECK,
-- same idiom as booking_discounts). Exception/compliance data, not routine
-- floor work -- same tier as audit_settings, not the operational tables
-- elsewhere in this migration.
-- ---------------------------------------------------------------------------

drop policy if exists override_records_select on override_records;
create policy override_records_select on override_records
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists override_records_insert on override_records;
create policy override_records_insert on override_records
  for insert
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- ---------------------------------------------------------------------------
-- 4 · fulfillment_outcomes — booking substitution/sub-rental tracking
-- ---------------------------------------------------------------------------

drop policy if exists fulfillment_outcomes_select on fulfillment_outcomes;
create policy fulfillment_outcomes_select on fulfillment_outcomes
  for select
  using (auth_is_staff());

drop policy if exists fulfillment_outcomes_all on fulfillment_outcomes;
create policy fulfillment_outcomes_all on fulfillment_outcomes
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

-- ---------------------------------------------------------------------------
-- 5 · fiscal_periods / expense_categories / shifts — config tables
-- ---------------------------------------------------------------------------

drop policy if exists fiscal_periods_select on fiscal_periods;
create policy fiscal_periods_select on fiscal_periods
  for select
  using (auth_is_staff());

drop policy if exists fiscal_periods_manage on fiscal_periods;
create policy fiscal_periods_manage on fiscal_periods
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists expense_categories_select on expense_categories;
create policy expense_categories_select on expense_categories
  for select
  using (auth_is_staff());

drop policy if exists expense_categories_manage on expense_categories;
create policy expense_categories_manage on expense_categories
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists shifts_select on shifts;
create policy shifts_select on shifts
  for select
  using (auth_is_staff());

drop policy if exists shifts_manage on shifts;
create policy shifts_manage on shifts
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- ---------------------------------------------------------------------------
-- 6 · vehicle_trip_logs — Driver's own domain
--
-- Mirrors the role set 0014's driver_read policy intended for exactly this
-- kind of table (its actual target, `vehicle_trips`, was a phantom name
-- that never matched anything real -- AUDIT_FINDINGS.md P1 #1).
-- ---------------------------------------------------------------------------

drop policy if exists vehicle_trip_logs_select on vehicle_trip_logs;
create policy vehicle_trip_logs_select on vehicle_trip_logs
  for select
  using (auth_is_staff());

drop policy if exists vehicle_trip_logs_all on vehicle_trip_logs;
create policy vehicle_trip_logs_all on vehicle_trip_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'));

-- ---------------------------------------------------------------------------
-- 7 · membership_limit_breaches — mirrors clients' own tier
-- ---------------------------------------------------------------------------

drop policy if exists membership_limit_breaches_select on membership_limit_breaches;
create policy membership_limit_breaches_select on membership_limit_breaches
  for select
  using (auth_is_staff());

drop policy if exists membership_limit_breaches_all on membership_limit_breaches;
create policy membership_limit_breaches_all on membership_limit_breaches
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

commit;
