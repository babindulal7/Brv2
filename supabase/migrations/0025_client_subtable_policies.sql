-- ============================================================================
-- 0025_client_subtable_policies.sql
--
-- Third reviewed batch out of the 92-table RLS gap (§6.9/§6.10/§6.11 in
-- PLAN.md). Same shape as 0024: `clients`' own child tables, mirroring the
-- parent's already-decided tier (`clients_select` = `auth_is_staff()` from
-- 0020; `clients_insert`/`clients_update` = `('Owner', 'Admin', 'Manager',
-- 'Coordinator', 'Warehouse')` from 0018) rather than inventing per-table
-- distinctions.
--
-- §6.10's first-pass sweep put all ten `client_*` sub-tables in the "plain"
-- bucket. Reading their actual columns before writing policy (the same
-- discipline that caught `booking_discounts` in 0024) found three that
-- don't belong there — excluded here, moved to the appropriate bucket in
-- PLAN.md §6.12:
--
--   - `client_memberships.fee_paid` (numeric) — money, sweep missed it
--     because the suffix sweep only matches columns *ending* in `_fee`,
--     not `fee_` as a prefix.
--   - `client_commercial_overrides.requested_credit_limit` (numeric) —
--     money, same class of miss as `user_approval_authorities.max_amount_
--     limit` in §6.10 (the sweep's suffix list doesn't cover `_limit`).
--   - `client_channel_identities` — not money, but its own column comment
--     already states a requirement a plain `auth_is_staff()` policy cannot
--     satisfy: "`address` ... Masked to last four for every role below
--     Manager/Accounts." That needs the same column-masking-view treatment
--     `0019` gave money columns, not a row-level policy. A new bucket,
--     not the money one — call it "PII-masking-adjacent."
--
-- Seven tables covered here: `client_contacts`, `client_flags`,
-- `client_merges`, `client_documents`, `client_tax_profiles`,
-- `client_change_requests`, `client_marketing_consents`.
-- ============================================================================

begin;

drop policy if exists client_contacts_select on client_contacts;
create policy client_contacts_select on client_contacts
  for select
  using (auth_is_staff());

drop policy if exists client_contacts_all on client_contacts;
create policy client_contacts_all on client_contacts
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_flags_select on client_flags;
create policy client_flags_select on client_flags
  for select
  using (auth_is_staff());

drop policy if exists client_flags_all on client_flags;
create policy client_flags_all on client_flags
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_merges_select on client_merges;
create policy client_merges_select on client_merges
  for select
  using (auth_is_staff());

drop policy if exists client_merges_all on client_merges;
create policy client_merges_all on client_merges
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_documents_select on client_documents;
create policy client_documents_select on client_documents
  for select
  using (auth_is_staff());

drop policy if exists client_documents_all on client_documents;
create policy client_documents_all on client_documents
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_tax_profiles_select on client_tax_profiles;
create policy client_tax_profiles_select on client_tax_profiles
  for select
  using (auth_is_staff());

drop policy if exists client_tax_profiles_all on client_tax_profiles;
create policy client_tax_profiles_all on client_tax_profiles
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_change_requests_select on client_change_requests;
create policy client_change_requests_select on client_change_requests
  for select
  using (auth_is_staff());

drop policy if exists client_change_requests_all on client_change_requests;
create policy client_change_requests_all on client_change_requests
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists client_marketing_consents_select on client_marketing_consents;
create policy client_marketing_consents_select on client_marketing_consents
  for select
  using (auth_is_staff());

drop policy if exists client_marketing_consents_all on client_marketing_consents;
create policy client_marketing_consents_all on client_marketing_consents
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy client_contacts_all on client_contacts is
  'Mirrors clients_insert/clients_update (0018) exactly -- this is a child of clients, not a new tier.';
comment on policy client_merges_all on client_merges is
  'Same tier as client_contacts_all. Merging is a desk action in practice, but no policy anywhere in this schema yet distinguishes "desk" from "floor" within the existing five-role tier -- not invented here.';
comment on policy client_documents_all on client_documents is
  'Staff side only. client_documents also has uploaded_by_portal_user_id/signed_by_portal_user_id -- the portal-user access path is separate, not-system_role-based auth, deferred with the rest of portal_* (PLAN.md §6.10).';
comment on policy client_change_requests_all on client_change_requests is
  'Staff side only, same portal-auth caveat as client_documents_all -- proposed_changes originates from a portal_user_id, reviewed here by staff.';

commit;
