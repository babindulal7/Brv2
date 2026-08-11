-- ============================================================================
-- 0037_client_commercial_and_coupon_policies.sql
--
-- Fifteenth reviewed batch, closing the money-adjacent bucket entirely
-- (§6.10-§6.23 in PLAN.md). Six tables, all client/commercial-facing.
--
-- `membership_plans` and `client_memberships` follow an authoritative
-- design comment already left in `0005_clients.sql` (lines ~1032-1051,
-- "WAREHOUSE SEES NO MONEY... Emitted here as the required column-level
-- revokes, to be applied against the named roles in the roles migration")
-- rather than re-deriving the column split: it names `annual_fee`,
-- `individual_discount_pct`, `bundle_discount_pct`, `default_credit_limit`
-- on `membership_plans` and `fee_paid` on `client_memberships` specifically
-- -- exactly the mixed-row shape this migration builds. That same comment
-- names `client_commercial_overrides` as "the whole table" -- a blanket
-- gate, not a column mask, matching this file's own header ("Identical
-- gate shape to the discount gate"). It also notes "Approve on
-- client_commercial_overrides is Owner/Manager only", narrower than the
-- general read/create gate -- implemented below as a value-conditional
-- `with check`, not flagged as a gap, since (unlike 0036's
-- return_accessory_checks column-write case) restricting a specific
-- proposed COLUMN VALUE on UPDATE is exactly what RLS `with check` is for,
-- no trigger needed.
--
-- `expense_reversals`, `coupons`, `coupon_redemptions` were not named in
-- that comment (it is scoped to the client domain; these three are
-- finance/booking domain) but read the same way: no column in any of the
-- three has floor use, so each gets the whole-row `auth_can_view_money()`
-- shape §6.22 established for `depreciation_logs`/`tax_ledgers`.
--
-- With this migration, the money-adjacent bucket from §6.10's original
-- categorisation is empty. What remains of the original 92-table gap is
-- PII-masking-adjacent (`client_channel_identities`, 1), the `portal_*`
-- auth path (3), and `items`-blocked (3) -- all three still separately
-- open, none of them a role-tier RLS policy in the shape this thread
-- writes.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · expense_reversals — whole-row, entirely a financial correction record.
-- Owner/Admin/Accounts write tier, same finance-function tier §6.22/§6.21
-- used for depreciation_logs/tax_ledgers/bank_accounts.
-- ---------------------------------------------------------------------------

drop policy if exists expense_reversals_select on expense_reversals;
create policy expense_reversals_select on expense_reversals
  for select
  using (auth_can_view_money());

drop policy if exists expense_reversals_manage on expense_reversals;
create policy expense_reversals_manage on expense_reversals
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Accounts'));

-- ---------------------------------------------------------------------------
-- 2 · coupons — whole-row, promotional-code configuration. No column has
-- floor use. Write is a marketing/business-rule decision, narrower than
-- who may merely see an active coupon at booking time.
-- ---------------------------------------------------------------------------

drop policy if exists coupons_select on coupons;
create policy coupons_select on coupons
  for select
  using (auth_can_view_money());

drop policy if exists coupons_manage on coupons;
create policy coupons_manage on coupons
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- ---------------------------------------------------------------------------
-- 3 · coupon_redemptions — whole-row, the audit trail of a coupon applied
-- to a booking. Same write tier as booking_discounts (0036) -- Coordinator
-- routinely applies a coupon at booking time, this is that action's record.
-- ---------------------------------------------------------------------------

drop policy if exists coupon_redemptions_all on coupon_redemptions;
create policy coupon_redemptions_all on coupon_redemptions
  for all
  using (auth_can_view_money())
  with check (auth_can_view_money());

-- ---------------------------------------------------------------------------
-- 4 · membership_plans — mixed row, per 0005's own design comment: mask
-- annual_fee, individual_discount_pct, bundle_discount_pct,
-- default_credit_limit. Everything else (level, label, limits, perks,
-- status) is staff-visible business-rule data. Write is Owner/Admin/Manager
-- -- "every number here is data, never a constant in code", a structural
-- config table, not a routine per-booking write.
-- ---------------------------------------------------------------------------

drop policy if exists membership_plans_select on membership_plans;
create policy membership_plans_select on membership_plans
  for select
  using (auth_is_staff());

drop policy if exists membership_plans_manage on membership_plans;
create policy membership_plans_manage on membership_plans
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke select (annual_fee, individual_discount_pct, bundle_discount_pct, default_credit_limit)
  on membership_plans from authenticated;

create or replace view membership_plans_v as
select
  id, client_uuid, level, label,
  case when auth_can_view_money() then annual_fee else null end as annual_fee,
  case when auth_can_view_money() then individual_discount_pct else null end as individual_discount_pct,
  case when auth_can_view_money() then bundle_discount_pct else null end as bundle_discount_pct,
  monthly_booking_limit, simultaneous_rental_limit, authorized_users,
  case when auth_can_view_money() then default_credit_limit else null end as default_credit_limit,
  term_months, perks, display_order, status, retired_at,
  created_at, created_by, updated_at
from membership_plans;

grant select on membership_plans_v to authenticated;

comment on view membership_plans_v is
  'Column-masked read surface for membership_plans -- see products_v (0019) for the pattern. The four money columns are exactly those named in 0005_clients.sql''s own design comment, not re-derived.';

-- ---------------------------------------------------------------------------
-- 5 · client_memberships — mixed row, per the same 0005 design comment:
-- mask fee_paid only. join_date/plan_id/supersede history stay staff-
-- visible (needed to answer "is this client's membership active").
-- ---------------------------------------------------------------------------

drop policy if exists client_memberships_select on client_memberships;
create policy client_memberships_select on client_memberships
  for select
  using (auth_is_staff());

drop policy if exists client_memberships_all on client_memberships;
create policy client_memberships_all on client_memberships
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

revoke select (fee_paid) on client_memberships from authenticated;

create or replace view client_memberships_v as
select
  id, client_uuid, client_id, plan_id, join_date,
  case when auth_can_view_money() then fee_paid else null end as fee_paid,
  superseded_by_id, superseded_at, created_at, created_by
from client_memberships;

grant select on client_memberships_v to authenticated;

comment on view client_memberships_v is
  'Column-masked read surface for client_memberships -- see products_v (0019) for the pattern. fee_paid is the one column named in 0005_clients.sql''s design comment.';

-- ---------------------------------------------------------------------------
-- 6 · client_commercial_overrides — whole table, per 0005's own comment
-- ("client_commercial_overrides - the whole table"). Split into three
-- policies rather than one `for all`, because the approval action needs a
-- narrower with-check than plain create/read: "Approve... is Owner/Manager
-- only" (same 0005 comment) is a condition on the PROPOSED status value,
-- which RLS with-check can express directly -- no trigger needed here,
-- unlike 0036's return_accessory_checks column-subset-write case.
-- ---------------------------------------------------------------------------

drop policy if exists client_commercial_overrides_select on client_commercial_overrides;
create policy client_commercial_overrides_select on client_commercial_overrides
  for select
  using (auth_can_view_money());

drop policy if exists client_commercial_overrides_insert on client_commercial_overrides;
create policy client_commercial_overrides_insert on client_commercial_overrides
  for insert
  with check (auth_can_view_money());

drop policy if exists client_commercial_overrides_update on client_commercial_overrides;
create policy client_commercial_overrides_update on client_commercial_overrides
  for update
  using (auth_can_view_money())
  with check (
    auth_can_view_money()
    and (status <> 'Approved' or auth_user_role() in ('Owner', 'Admin', 'Manager'))
  );

comment on policy client_commercial_overrides_update on client_commercial_overrides is
  'Any money-visible role may edit a Pending request (e.g. amend the reason); only Owner/Admin/Manager may transition status to Approved -- 0005_clients.sql''s own "Approve... is Owner/Manager only" note, enforced as a value-conditional check rather than a trigger since the rule keys off the single proposed column value being written, not a per-column write-source restriction.';

commit;
