-- ============================================================================
-- 0038_client_money_masking_corrections.sql
--
-- 0005_clients.sql's own "WAREHOUSE SEES NO MONEY" design comment (lines
-- ~1032-1051 -- the same one a concurrent session used verbatim for
-- membership_plans/client_memberships/client_commercial_overrides in 0037)
-- names FOUR more things this thread got wrong or never built, found only
-- by reading the comment's full scope rather than the slice one batch
-- needed:
--
--   clients                     - approved_credit_limit, payment_terms
--   client_documents            - the whole table (Owner / Manager / Billing only)
--   client_tax_profiles         - the whole table
--   client_flags/client_merges  - Coordinator may see money but may not
--                                 Block (client_flags) or Merge (client_merges)
--
-- `clients` itself was never touched by this whole thread -- it's been
-- `auth_is_staff()`-readable with no money masking since `0020`, one of
-- the original 19 tables this thread started from, predating every batch
-- in it. `client_documents` and `client_tax_profiles` are worse: this
-- thread's OWN `0025_client_subtable_policies.sql` gave them staff-broad
-- read and a `Coordinator`/`Warehouse`-inclusive write tier, directly
-- contradicting this comment -- a real over-permission bug in already-
-- shipped work, not a gap. `client_flags`/`client_merges` also got the
-- generic client-child tier in `0025`, which includes `Coordinator` for
-- write -- this comment says that's specifically wrong for the
-- Block/Merge actions on these two tables.
--
-- Corrects all four. Every `drop policy if exists` below targets a policy
-- `0025` created, not a fresh table.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · clients — was never masked. Row policies (clients_select/insert/
-- update, 0018/0020) stay untouched -- they are correct, staff-broad row
-- access is fine; only the two money columns need masking.
-- ---------------------------------------------------------------------------

revoke select (approved_credit_limit, payment_terms) on clients from authenticated;

create or replace view clients_v as
select
  id, client_uuid, client_code, type_parent, org_subtype, name, phone,
  email, pan_vat, business_registration, website, government_id_kind,
  government_id_number, address_line, city, district, postal_code, country,
  billing_address,
  case when auth_can_view_money() then approved_credit_limit else null end as approved_credit_limit,
  case when auth_can_view_money() then payment_terms else null end as payment_terms,
  client_since, professions, segments, source, referred_by_client_id, tags,
  preferred_contact_channels, marketing_photo_consent, notes,
  assigned_staff_id, status, deactivated_at, deactivated_by, deactivation_reason,
  merged_into_client_id, portal_default_language, created_at, created_by, updated_at
from clients;

grant select on clients_v to authenticated;

comment on view clients_v is
  'Column-masked read surface for clients -- see products_v (0019) for the pattern. approved_credit_limit/payment_terms are the two columns 0005_clients.sql''s own design comment names; this thread never masked them before now, despite clients being one of the first 19 tables ever policed.';

-- ---------------------------------------------------------------------------
-- 2 · client_documents — was wrongly staff-broad (0025). The design
-- comment names it a whole-table gate: "Owner / Manager / Billing only".
-- Verified before use, not assumed: grepped 0013_business_8_roles.sql
-- directly rather than guess what "Billing" became -- it renamed
-- `'Billing'` to `'Coordinator'` specifically (`alter type system_role
-- rename value 'Billing' to 'Coordinator'`), a completely different label
-- from the schema's separate `'Accounts'` role, which was never named
-- "Billing" at any point. Using "Accounts" here would have been a second,
-- self-inflicted version of the exact `inventory_units`/`categories`/
-- `items` phantom-name mistake this whole thread has been catching in
-- other people's code.
-- ---------------------------------------------------------------------------

drop policy if exists client_documents_select on client_documents;
create policy client_documents_select on client_documents
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

drop policy if exists client_documents_all on client_documents;
create policy client_documents_all on client_documents
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

comment on policy client_documents_select on client_documents is
  'Corrects 0025, which wrongly gave this auth_is_staff() read + Coordinator/Warehouse write (right role, wrong shape -- Coordinator belongs, Warehouse does not, and it needs to be the ONLY non-management tier). 0005_clients.sql''s own design comment: "client_documents - the whole table (Owner / Manager / Billing only)" -- "Billing" verified via 0013 to mean Coordinator, not Accounts.';

-- ---------------------------------------------------------------------------
-- 3 · client_tax_profiles — was wrongly staff-broad (0025). Money-blind
-- whole-row gate, same shape as bank_accounts/depreciation_logs/
-- tax_ledgers, not a column mask -- the design comment lists it plainly
-- under "WAREHOUSE SEES NO MONEY", same as the others in that list.
-- ---------------------------------------------------------------------------

drop policy if exists client_tax_profiles_select on client_tax_profiles;
create policy client_tax_profiles_select on client_tax_profiles
  for select
  using (auth_can_view_money());

drop policy if exists client_tax_profiles_all on client_tax_profiles;
create policy client_tax_profiles_all on client_tax_profiles
  for all
  using (auth_can_view_money())
  with check (auth_can_view_money());

comment on policy client_tax_profiles_select on client_tax_profiles is
  'Corrects 0025, which wrongly gave this auth_is_staff() read + Coordinator/Warehouse write. 0005_clients.sql''s own design comment lists client_tax_profiles under "WAREHOUSE SEES NO MONEY" as a whole-table gate.';

-- ---------------------------------------------------------------------------
-- 4 · client_flags / client_merges — Coordinator excluded from the
-- specific actions the design comment names ("may not Block ... or
-- Merge"), not from reading either table. Read stays auth_is_staff()
-- (unchanged from 0025) -- knowing a client is Blocked/VIP is broadly
-- useful; the comment restricts the ACTION, not visibility.
--
-- client_flags: only the 'Blocked' flag_type is restricted -- VIP/Upgrade
-- Candidate are unaffected, since the comment names Block specifically,
-- not every flag. A value-conditional with-check expresses this directly,
-- same technique the concurrent 0037 used for client_commercial_
-- overrides' Approve-only-by-admin-tier rule -- no trigger needed, this
-- keys off the single proposed flag_type value being written.
-- ---------------------------------------------------------------------------

drop policy if exists client_flags_all on client_flags;

create policy client_flags_insert on client_flags
  for insert
  with check (
    (flag_type = 'Blocked' and auth_user_role() in ('Owner', 'Admin', 'Manager'))
    or (flag_type <> 'Blocked' and auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  );

create policy client_flags_update on client_flags
  for update
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (
    (flag_type = 'Blocked' and auth_user_role() in ('Owner', 'Admin', 'Manager'))
    or (flag_type <> 'Blocked' and auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  );

comment on policy client_flags_insert on client_flags is
  'Corrects 0025''s single client_flags_all policy, which let Coordinator set every flag type including Blocked. 0005_clients.sql''s own comment: "Rental Coordinator may see money but may not Block (client_flags)". VIP/Upgrade Candidate are unaffected -- only Blocked is restricted.';

-- client_merges: the comment names Coordinator's exclusion but affirms
-- nothing about Warehouse either way. Treated as the same administrative-
-- tier as override_records/audit_settings rather than assumed included --
-- merging a client record is a relationship decision, not floor work, and
-- nothing else in this schema gives Warehouse that kind of authority.

drop policy if exists client_merges_all on client_merges;
create policy client_merges_all on client_merges
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy client_merges_all on client_merges is
  'Corrects 0025, which included Coordinator and Warehouse. 0005_clients.sql''s own comment: "Rental Coordinator may see money but may not ... Merge (client_merges)". Warehouse dropped too -- merging a client record is a relationship decision nothing else in this schema gives Warehouse authority over.';

commit;
