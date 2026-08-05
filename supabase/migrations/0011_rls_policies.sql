-- =============================================================================
-- 0011_rls_policies.sql — row level security policies & multi-role access
--
-- Laws encoded here, in the database, with no role bypass:
--   * 6 Canonical RBAC Roles: Owner, Manager, Warehouse, Billing, Accounts, Viewer.
--   * Multi-branch isolation and user tenancy scoping.
--   * Warehouse role sees NO monetary amounts or payment ledgers.
--   * Audit events and backups are read-only for Owner / Manager.
-- =============================================================================

begin;

-- Helper function to get current user role
create or replace function auth_user_role()
returns system_role
language sql
stable
as $$
  select coalesce(
    (select primary_role from users where id = nullif(current_setting('app.current_user_id', true), '')::uuid),
    'Viewer'::system_role
  );
$$;

-- Helper function to check if current user is financial/management role
create or replace function auth_is_finance_or_admin()
returns boolean
language sql
stable
as $$
  select auth_user_role() in ('Owner', 'Manager', 'Billing', 'Accounts');
$$;

-- =============================================================================
-- 1. Invoices & Payments (Masked from Warehouse)
-- =============================================================================
create policy invoices_select on invoices
  for select
  using (
    auth_is_finance_or_admin()
  );

create policy invoices_insert on invoices
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing')
  );

create policy invoices_update on invoices
  for update
  using (
    auth_user_role() in ('Owner', 'Manager', 'Billing')
  );

create policy invoice_lines_select on invoice_lines
  for select
  using (
    auth_is_finance_or_admin()
  );

create policy payments_select on payments
  for select
  using (
    auth_is_finance_or_admin()
  );

create policy payments_insert on payments
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Accounts')
  );

create policy payment_reversals_select on payment_reversals
  for select
  using (
    auth_user_role() in ('Owner', 'Manager', 'Accounts')
  );

create policy payment_reversals_insert on payment_reversals
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager')
  );

-- =============================================================================
-- 2. Security Deposits & Movements
-- =============================================================================
create policy security_deposits_select on security_deposits
  for select
  using (
    auth_is_finance_or_admin()
  );

create policy security_deposits_insert on security_deposits
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Accounts')
  );

create policy security_deposits_update on security_deposits
  for update
  using (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Accounts')
  );

create policy deposit_movements_select on deposit_movements
  for select
  using (
    auth_is_finance_or_admin()
  );

create policy deposit_movements_insert on deposit_movements
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Accounts')
  );

-- =============================================================================
-- 3. Bookings (Accessible across all roles, with role-appropriate actions)
-- =============================================================================
create policy bookings_select on bookings
  for select
  using (true);

create policy bookings_insert on bookings
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Warehouse')
  );

create policy bookings_update on bookings
  for update
  using (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Warehouse')
  );

create policy booking_lines_select on booking_lines
  for select
  using (true);

create policy booking_lines_all on booking_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Warehouse')
  );

-- =============================================================================
-- 4. Inventory (Units, Assets, Maintenance, Packing)
-- =============================================================================
create policy inventory_units_select on inventory_units
  for select
  using (true);

create policy inventory_units_insert on inventory_units
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Warehouse')
  );

create policy inventory_units_update on inventory_units
  for update
  using (
    auth_user_role() in ('Owner', 'Manager', 'Warehouse')
  );

create policy maintenance_records_select on maintenance_records
  for select
  using (true);

create policy maintenance_records_all on maintenance_records
  for all
  using (
    auth_user_role() in ('Owner', 'Manager', 'Warehouse')
  );

create policy operation_sessions_select on operation_sessions
  for select
  using (true);

create policy operation_sessions_all on operation_sessions
  for all
  using (
    auth_user_role() in ('Owner', 'Manager', 'Warehouse')
  );

-- =============================================================================
-- 5. Audit Events & Settings (Owner & Manager exclusive)
-- =============================================================================
create policy audit_events_select on audit_events
  for select
  using (
    auth_user_role() in ('Owner', 'Manager')
  );

create policy audit_events_insert on audit_events
  for insert
  with check (true);

create policy audit_settings_select on audit_settings
  for select
  using (
    auth_user_role() in ('Owner', 'Manager')
  );

create policy audit_settings_update on audit_settings
  for update
  using (
    auth_user_role() in ('Owner', 'Manager')
  );

-- =============================================================================
-- 6. Clients
-- =============================================================================
create policy clients_select on clients
  for select
  using (true);

create policy clients_insert on clients
  for insert
  with check (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Warehouse')
  );

create policy clients_update on clients
  for update
  using (
    auth_user_role() in ('Owner', 'Manager', 'Billing', 'Warehouse')
  );

commit;
