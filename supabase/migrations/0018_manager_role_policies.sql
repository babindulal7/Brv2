-- ============================================================================
-- 0018_manager_role_policies.sql
-- Grants for the reopened Manager role (0017): everywhere Admin can act,
-- Manager can act too — see 0017's header for why this is additive, not a
-- redefinition.
--
-- Every one of the 20 policy expressions below was originally written in
-- 0011 against the Foundation-6 label 'Manager', renamed to 'Admin' in place
-- by 0013. This migration is not editing those 20 policies' *intent* — it is
-- restoring the second seat that intent always had, now that 'Manager' is a
-- distinct label again instead of a synonym for 'Admin'.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Helper functions — restated with Manager alongside Admin
-- ---------------------------------------------------------------------------

create or replace function auth_is_finance_or_admin()
returns boolean
language sql
stable
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts');
$$;

comment on function auth_is_finance_or_admin is
  'Reopened 9 Aug 2026 (Hover Intel System v2.1): Manager sits alongside Admin '
  'here, same as every gate in the spec that lists them together.';

-- ---------------------------------------------------------------------------
-- 2 · Invoices & Payments
-- ---------------------------------------------------------------------------

drop policy if exists invoices_insert on invoices;
create policy invoices_insert on invoices
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

drop policy if exists payments_insert on payments;
create policy payments_insert on payments
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

drop policy if exists payment_reversals_select on payment_reversals;
create policy payment_reversals_select on payment_reversals
  for select
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
  );

drop policy if exists payment_reversals_insert on payment_reversals;
create policy payment_reversals_insert on payment_reversals
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- ---------------------------------------------------------------------------
-- 3 · Security Deposits & Movements
-- ---------------------------------------------------------------------------

drop policy if exists security_deposits_insert on security_deposits;
create policy security_deposits_insert on security_deposits
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

drop policy if exists security_deposits_update on security_deposits;
create policy security_deposits_update on security_deposits
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

drop policy if exists deposit_movements_insert on deposit_movements;
create policy deposit_movements_insert on deposit_movements
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

-- ---------------------------------------------------------------------------
-- 4 · Bookings
-- ---------------------------------------------------------------------------

drop policy if exists bookings_insert on bookings;
create policy bookings_insert on bookings
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

drop policy if exists bookings_update on bookings;
create policy bookings_update on bookings
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

drop policy if exists booking_lines_all on booking_lines;
create policy booking_lines_all on booking_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

-- ---------------------------------------------------------------------------
-- 5 · Inventory (Units, Maintenance, Operations)
-- ---------------------------------------------------------------------------

-- Retargeted 9 Aug 2026 (see 0020): 0011 originally named this table
-- `inventory_units`, which does not exist (the real table is
-- `product_units`); fixed at the source in 0011 and here for consistency.
drop policy if exists product_units_insert on product_units;
create policy product_units_insert on product_units
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse')
  );

drop policy if exists product_units_update on product_units;
create policy product_units_update on product_units
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse')
  );

drop policy if exists maintenance_records_all on maintenance_records;
create policy maintenance_records_all on maintenance_records
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse')
  );

drop policy if exists operation_sessions_all on operation_sessions;
create policy operation_sessions_all on operation_sessions
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse')
  );

-- 0014 added Technician onto this same policy after 0011 first wrote it;
-- restated a second time here so Manager lands without dropping that grant.
-- (Fixed 10 Aug 2026, first real apply: the bare `drop policy` below sat
-- OUTSIDE this to_regclass guard — `drop policy if exists` tolerates a
-- missing policy, not a missing table, so it aborted the whole migration on
-- a table 0014 already knew was phantom. Moved inside the guard.)
do $$
begin
  if to_regclass('public.maintenance_tickets') is not null then
    execute $p$
      drop policy if exists maintenance_technician_write on maintenance_tickets;
      create policy maintenance_technician_write on maintenance_tickets
        for all
        using      (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'))
        with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'));
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6 · Audit Events & Settings (Owner / Admin / Manager exclusive)
-- ---------------------------------------------------------------------------

drop policy if exists audit_events_select on audit_events;
create policy audit_events_select on audit_events
  for select
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

drop policy if exists audit_settings_select on audit_settings;
create policy audit_settings_select on audit_settings
  for select
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

drop policy if exists audit_settings_update on audit_settings;
create policy audit_settings_update on audit_settings
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- ---------------------------------------------------------------------------
-- 7 · Clients
-- ---------------------------------------------------------------------------

drop policy if exists clients_insert on clients;
create policy clients_insert on clients
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

drop policy if exists clients_update on clients;
create policy clients_update on clients
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

-- ---------------------------------------------------------------------------
-- 8 · Money-blind floor roles — restated so the allow-list above cannot be
--     misread as also widening who is money-blind. Law 6 is untouched:
--     Manager is not in this set, same as Admin.
-- ---------------------------------------------------------------------------

create or replace function auth_can_view_money()
returns boolean
language sql
stable
as $$
  select auth_user_role() not in ('Warehouse', 'Technician', 'Driver', 'Client');
$$;

commit;
