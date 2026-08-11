-- ============================================================================
-- 0022_branch_zone_role_lookup_policies.sql
--
-- First reviewed batch out of the 92-table RLS gap found in §6.9 (9 Aug
-- 2026): 111 tables have RLS enabled, 19 had ever had a policy written.
-- §6.9 named branches/warehouses/storage_zones/user_roles/
-- user_approval_authorities specifically as the highest-leverage slice of
-- that gap -- they are the tables any future branch/zone/approval-limit
-- row-scoping policy would itself need to read, so leaving them
-- fail-closed blocks that work before it can start, the same shape as the
-- `users`/`auth_user_role()` bug 0020 fixed.
--
-- Four of those five tables are covered here. `user_approval_authorities`
-- is deliberately NOT included -- it carries real money columns
-- (`max_amount_limit`, `max_discount_pct`), which puts it in the Law-6
-- money-visibility category, not the plain-reference-data category the
-- other four fall into. Batching it in here would mean guessing a Law-6
-- gate under time pressure instead of giving it the same considered pass
-- 0019's money-masking migration got. Left for that pass -- see PLAN.md
-- §6.10.
--
-- Categorisation method: diffed every `alter table ... enable row level
-- security` against every *resolved* `create policy ... on <table>`
-- statement across all 21 migration files -- resolved meaning the two
-- `execute format(...)` loops in 0014 were expanded against their actual
-- array literals rather than left as text, since a naive text grep both
-- over- and under-counts (it would count 0014's dead
-- `maintenance_tickets` conditional, which never fires because no such
-- table exists, and would miss 0014's real `booking_transport`/
-- `expenses`-among-others policies, which fire because those table names
-- are real). Cross-checked against the actual `create table` list, not
-- assumed: confirms 111 real tables, 19 with real policy coverage before
-- this migration, matching §6.9's count exactly once the loops are
-- resolved correctly.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · branches / warehouses / storage_zones
--
-- Pure operational location data -- no money columns, no client-facing
-- content. Every internal role needs to resolve "which branch/warehouse/
-- zone" to do its own job (Warehouse picks from a zone, Driver reads a
-- branch address, Coordinator routes work across branches), so read is
-- `auth_is_staff()` rather than a narrower allow-list -- the same
-- reasoning 0021 used to broaden `booking_stage_transitions_select`.
--
-- Structural changes (opening a branch, renaming a warehouse, adding a
-- zone) are administrative, not floor work: gated to the
-- `('Owner', 'Admin', 'Manager')` tier, the same literal set already used
-- for `audit_settings` (0018) -- the established "who edits configuration"
-- tier in this schema, not a new one invented here.
-- ---------------------------------------------------------------------------

drop policy if exists branches_select on branches;
create policy branches_select on branches
  for select
  using (auth_is_staff());

drop policy if exists branches_manage on branches;
create policy branches_manage on branches
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists warehouses_select on warehouses;
create policy warehouses_select on warehouses
  for select
  using (auth_is_staff());

drop policy if exists warehouses_manage on warehouses;
create policy warehouses_manage on warehouses
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists storage_zones_select on storage_zones;
create policy storage_zones_select on storage_zones
  for select
  using (auth_is_staff());

drop policy if exists storage_zones_manage on storage_zones;
create policy storage_zones_manage on storage_zones
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy branches_select on branches is
  'Operational location data, no money columns -- every staff role reads it to do its own job.';
comment on policy warehouses_select on warehouses is
  'Same reasoning as branches_select.';
comment on policy storage_zones_select on storage_zones is
  'Same reasoning as branches_select.';

-- ---------------------------------------------------------------------------
-- 2 · user_roles
--
-- Unlike the three above, this is access-control metadata, not operational
-- reference data -- it states who holds which system role. A Driver has no
-- operational need to see the schema's role roster, so this does NOT get
-- the broad `auth_is_staff()` read `branches`/`warehouses`/`storage_zones`
-- got; read and write share the same `('Owner', 'Admin', 'Manager')` tier
-- as `audit_settings` (0018), the closest existing precedent for
-- "administrative, not floor, data."
--
-- Note this table is NOT what `auth_user_role()` reads (that function
-- reads `users.primary_role` directly, per 0011/0014/0020) -- so unlike
-- the `users_select_own` fix in 0020, there is no auth-bootstrapping
-- dependency here to worry about breaking.
-- ---------------------------------------------------------------------------

drop policy if exists user_roles_select on user_roles;
create policy user_roles_select on user_roles
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists user_roles_manage on user_roles;
create policy user_roles_manage on user_roles
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy user_roles_select on user_roles is
  'Access-control metadata, not operational data -- Owner/Admin/Manager only, same tier as audit_settings.';

commit;
