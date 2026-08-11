-- =============================================================================
-- 0007_admin_security.sql — domain: admin & security
--
-- Laws encoded here, in the database, with no role bypass:
--   * NOTHING IS DELETED. Terminal states are Deactivated/Archived.
--   * Every user-written table carries client_uuid uuid not null unique.
--   * 6 Canonical RBAC Roles: Owner, Manager, Warehouse, Billing, Accounts, Viewer.
--   * Audit records are IMMUTABLE and APPEND-ONLY (Law 3).
--   * Centralized atomic number sequence generator for document codes.
--   * Multi-branch and warehouse scoping isolation.
-- =============================================================================

begin;

-- =============================================================================
-- 1. branches
-- Operating branches (e.g. BR-KTM-01 Kathmandu Main, BR-PKR-01 Pokhara).
-- =============================================================================
create table branches (
  id               uuid         not null default gen_random_uuid() primary key,
  client_uuid      uuid         not null,
  branch_code      text         not null,
  name             text         not null,
  address          text         not null,
  phone            text         not null,
  email            text,
  pan_vat_no       text         not null default '623587106',
  is_headquarters  boolean      not null default false,
  is_active        boolean      not null default true,
  created_at       timestamptz  not null default now(),
  created_by       uuid,  -- FK -> users added in 0042 (cross-file forward ref)
  updated_at       timestamptz  not null default now(),
  updated_by       uuid,  -- FK -> users added in 0042 (cross-file forward ref)

  constraint branches_client_uuid_key unique (client_uuid),
  constraint branches_code_key unique (branch_code),
  constraint branches_code_format check (branch_code ~ '^BR-[A-Z0-9-]+$')
);

create index idx_branches_code on branches (branch_code);
create index idx_branches_active on branches (is_active);


-- =============================================================================
-- 2. warehouses
-- Storage facilities associated with branches.
-- =============================================================================
create table warehouses (
  id              uuid              not null default gen_random_uuid() primary key,
  client_uuid     uuid              not null,
  warehouse_code  text              not null,
  branch_id       uuid              not null references branches (id),
  name            text              not null,
  address         text,
  status          warehouse_status  not null default 'Active',
  is_primary      boolean           not null default false,
  is_active       boolean           not null default true,
  created_at      timestamptz       not null default now(),
  created_by      uuid,  -- FK -> users added in 0042 (cross-file forward ref)
  updated_at      timestamptz       not null default now(),
  updated_by      uuid,  -- FK -> users added in 0042 (cross-file forward ref)

  constraint warehouses_client_uuid_key unique (client_uuid),
  constraint warehouses_code_key unique (warehouse_code),
  constraint warehouses_code_format check (warehouse_code ~ '^WH-[A-Z0-9-]+$')
);

create index idx_warehouses_branch on warehouses (branch_id);
create index idx_warehouses_status on warehouses (status);


-- =============================================================================
-- 3. storage_zones
-- Granular storage locations (Room, Zone, Rack, Shelf, Bin).
-- =============================================================================
create table storage_zones (
  id            uuid           not null default gen_random_uuid() primary key,
  client_uuid   uuid           not null,
  warehouse_id  uuid           not null references warehouses (id),
  code          text           not null,
  name          text           not null,
  level         storage_level  not null default 'Zone',
  description   text,
  parent_id     uuid           references storage_zones (id),
  is_active     boolean        not null default true,
  created_at    timestamptz    not null default now(),
  created_by    uuid,  -- FK -> users added in 0042 (cross-file forward ref)
  updated_at    timestamptz    not null default now(),
  updated_by    uuid,  -- FK -> users added in 0042 (cross-file forward ref)

  constraint storage_zones_client_uuid_key unique (client_uuid),
  constraint storage_zones_no_self_parent check (parent_id is null or parent_id <> id)
);

create index idx_storage_zones_warehouse on storage_zones (warehouse_id);
create index idx_storage_zones_code on storage_zones (code);


-- =============================================================================
-- 4. users
-- System identity and profile for staff, managers, and administrators.
-- =============================================================================
create table users (
  id              uuid         not null default gen_random_uuid() primary key,
  client_uuid     uuid         not null,
  employee_code   text         not null,
  email           text         not null,
  full_name       text         not null,
  mobile          text         not null,
  primary_role    system_role  not null default 'Warehouse',
  department      text,
  branch_id       uuid         not null references branches (id),
  warehouse_id    uuid         references warehouses (id),
  is_active       boolean      not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz  not null default now(),
  created_by      uuid         references users (id),
  updated_at      timestamptz  not null default now(),
  updated_by      uuid         references users (id),

  constraint users_client_uuid_key unique (client_uuid),
  constraint users_employee_code_key unique (employee_code),
  constraint users_email_key unique (email)
);

create index idx_users_email on users (email);
create index idx_users_primary_role on users (primary_role);
create index idx_users_branch on users (branch_id);
create index idx_users_active on users (is_active);


-- =============================================================================
-- 5. user_roles
-- Mapping of users to canonical roles (supports multi-role or delegation).
-- =============================================================================
create table user_roles (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  user_id      uuid         not null references users (id),
  role         system_role  not null,
  assigned_by  uuid         references users (id),
  assigned_at  timestamptz  not null default now(),

  constraint user_roles_client_uuid_key unique (client_uuid),
  constraint user_roles_user_role_unique unique (user_id, role)
);

create index idx_user_roles_user on user_roles (user_id);
create index idx_user_roles_role on user_roles (role);


-- =============================================================================
-- 6. user_approval_authorities
-- Granular monetary and operational approval limits per user.
-- =============================================================================
create table user_approval_authorities (
  id                 uuid                not null default gen_random_uuid() primary key,
  client_uuid        uuid                not null,
  user_id            uuid                not null references users (id),
  permission_type    approval_permission not null,
  max_amount_limit   numeric(14,2),
  max_discount_pct   numeric(5,2),
  is_active          boolean             not null default true,
  granted_by         uuid                references users (id),
  granted_at         timestamptz         not null default now(),

  constraint user_approval_authorities_client_uuid_key unique (client_uuid),
  constraint user_approval_authorities_unique unique (user_id, permission_type),
  constraint user_approval_discount_cap check (max_discount_pct is null or (max_discount_pct >= 0 and max_discount_pct <= 25))
);

create index idx_user_approvals_user on user_approval_authorities (user_id);


-- =============================================================================
-- 7. shifts
-- Working shift configurations per branch.
-- =============================================================================
create table shifts (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  shift_name   text         not null,
  start_time   time         not null,
  end_time     time         not null,
  branch_id    uuid         not null references branches (id),
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),

  constraint shifts_client_uuid_key unique (client_uuid)
);

create index idx_shifts_branch on shifts (branch_id);


-- =============================================================================
-- 8. timesheets
-- Staff clock-in/out and timesheet approval ledger.
-- =============================================================================
create table timesheets (
  id                uuid                       not null default gen_random_uuid() primary key,
  client_uuid       uuid                       not null,
  timesheet_no      text                       not null,
  user_id           uuid                       not null references users (id),
  branch_id         uuid                       not null references branches (id),
  shift_id          uuid                       references shifts (id),
  clock_in          timestamptz                not null,
  clock_out         timestamptz,
  break_minutes     integer                    not null default 0,
  total_hours       numeric(5,2),
  submission_state  timesheet_submission_state not null default 'Not Submitted',
  approval_state    timesheet_approval_state   not null default 'Pending',
  approved_by       uuid                       references users (id),
  approved_at       timestamptz,
  notes             text,
  created_at        timestamptz                not null default now(),
  created_by        uuid                       references users (id),
  updated_at        timestamptz                not null default now(),
  updated_by        uuid                       references users (id),

  constraint timesheets_client_uuid_key unique (client_uuid),
  constraint timesheets_no_key unique (timesheet_no),
  constraint timesheets_time_order check (clock_out is null or clock_in < clock_out)
);

create index idx_timesheets_user on timesheets (user_id);
create index idx_timesheets_approval on timesheets (approval_state);


-- =============================================================================
-- 9. audit_events
-- Centralized append-only audit trail (Law 3, Law 4).
-- UPDATE and DELETE are prohibited on this table.
-- =============================================================================
create table audit_events (
  id            uuid              not null default gen_random_uuid() primary key,
  client_uuid   uuid              not null,
  event_class   audit_event_class not null default 'status change',
  category      audit_category    not null default 'Rentals',
  module        audit_module      not null default 'Rentals',
  action        audit_action      not null default 'Update',
  severity      audit_severity    not null default 'Informational',
  status        audit_status      not null default 'Success',
  table_name    text              not null,
  record_id     uuid              not null,
  actor_id      uuid              references users (id),
  actor_role    system_role,
  branch_id     uuid              references branches (id),
  ip_address    inet,
  user_agent    text,
  device_type   device_type       not null default 'Desktop',
  old_values    jsonb,
  new_values    jsonb,
  diff          jsonb,
  reason        text,
  created_at    timestamptz       not null default now(),

  constraint audit_events_client_uuid_key unique (client_uuid)
);

create index idx_audit_events_class on audit_events (event_class);
create index idx_audit_events_module on audit_events (module);
create index idx_audit_events_table_record on audit_events (table_name, record_id);
create index idx_audit_events_actor on audit_events (actor_id);
create index idx_audit_events_created_at on audit_events (created_at desc);


-- =============================================================================
-- 10. audit_settings
-- Configurable retention and logging policies per module.
-- =============================================================================
create table audit_settings (
  id                   uuid              not null default gen_random_uuid() primary key,
  client_uuid          uuid              not null,
  module               audit_module      not null,
  is_enabled           boolean           not null default true,
  granularity          audit_granularity not null default 'Standard',
  retention_period     retention_period  not null default '7 Years',
  min_severity_alert   audit_severity    not null default 'High',
  updated_at           timestamptz       not null default now(),
  updated_by           uuid              references users (id),

  constraint audit_settings_client_uuid_key unique (client_uuid),
  constraint audit_settings_module_key unique (module)
);


-- =============================================================================
-- 11. backup_logs
-- Immutable logs of database snapshots and encrypted backups.
-- =============================================================================
create table backup_logs (
  id                uuid         not null default gen_random_uuid() primary key,
  client_uuid       uuid         not null,
  backup_no         text         not null,
  backup_type       text         not null default 'Full',
  status            text         not null default 'Completed',
  storage_location  text         not null,
  file_size_bytes   bigint       not null,
  checksum_sha256   text         not null,
  started_at        timestamptz  not null,
  completed_at      timestamptz  not null,
  initiated_by      uuid         references users (id),
  error_message     text,
  created_at        timestamptz  not null default now(),

  constraint backup_logs_client_uuid_key unique (client_uuid),
  constraint backup_logs_no_key unique (backup_no)
);

create index idx_backup_logs_status on backup_logs (status);


-- =============================================================================
-- 12. system_settings
-- Key-value operational configuration dictionary.
-- =============================================================================
create table system_settings (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  key          text         not null,
  value        jsonb        not null,
  description  text,
  is_public    boolean      not null default false,
  is_encrypted boolean      not null default false,
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),

  constraint system_settings_client_uuid_key unique (client_uuid),
  constraint system_settings_key_unique unique (key)
);

create index idx_system_settings_key on system_settings (key);


-- =============================================================================
-- 13. number_sequences
-- Centralized atomic sequence generator for standard document numbers:
--   BK-YYYY-NNNN   (Bookings)
--   CL-YYYY-NNNN   (Clients)
--   INV-YYYY-NNNN  (Invoices)
--   PAY-YYYY-NNNN  (Payments)
--   DEP-YYYY-NNNN  (Deposits)
--   EXP-YYYY-NNNN  (Expenses)
--   EQNNNNNN       (Equipment)
-- =============================================================================
create table number_sequences (
  sequence_key   text     not null primary key,
  prefix         text     not null,
  current_year   integer  not null default extract(year from current_date),
  current_value  bigint   not null default 0,
  padding        integer  not null default 4,
  updated_at     timestamptz not null default now()
);

-- Stored function for atomic next document number generation
create or replace function next_document_number(p_sequence_key text)
returns text
language plpgsql
as $$
declare
  v_rec record;
  v_year integer := extract(year from current_date);
  v_next_val bigint;
  v_formatted text;
begin
  select * into v_rec from number_sequences where sequence_key = p_sequence_key for update;
  
  if not found then
    raise exception 'Number sequence % does not exist', p_sequence_key;
  end if;
  
  if v_rec.current_year <> v_year then
    v_next_val := 1;
    update number_sequences
    set current_year = v_year, current_value = 1, updated_at = now()
    where sequence_key = p_sequence_key;
  else
    v_next_val := v_rec.current_value + 1;
    update number_sequences
    set current_value = v_next_val, updated_at = now()
    where sequence_key = p_sequence_key;
  end if;
  
  if v_rec.prefix = 'EQ' then
    v_formatted := v_rec.prefix || lpad(v_next_val::text, v_rec.padding, '0');
  else
    v_formatted := v_rec.prefix || v_year::text || '-' || lpad(v_next_val::text, v_rec.padding, '0');
  end if;
  
  return v_formatted;
end;
$$;


-- =============================================================================
-- Revocations & Permissions
-- =============================================================================
revoke delete on
  branches,
  warehouses,
  storage_zones,
  users,
  user_roles,
  user_approval_authorities,
  shifts,
  timesheets,
  audit_events,
  audit_settings,
  backup_logs,
  system_settings,
  number_sequences
from public, anon, authenticated;

-- Law 3: UPDATE strictly prohibited on audit logs and backup logs
revoke update on
  audit_events,
  backup_logs
from public, anon, authenticated;

alter table branches enable row level security;
alter table warehouses enable row level security;
alter table storage_zones enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table user_approval_authorities enable row level security;
alter table shifts enable row level security;
alter table timesheets enable row level security;
alter table audit_events enable row level security;
alter table audit_settings enable row level security;
alter table backup_logs enable row level security;
alter table system_settings enable row level security;
alter table number_sequences enable row level security;

commit;
