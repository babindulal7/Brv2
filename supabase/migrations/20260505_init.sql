create extension if not exists "pgcrypto";

create type rental_status as enum ('booked','active','completed','overdue','cancelled');
create type payment_status as enum ('pending','partial','paid','failed','refunded');

create table clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text not null,
  company text,
  risk_score int not null default 50,
  is_vip boolean not null default false,
  total_spent numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table equipment_categories (id uuid primary key default gen_random_uuid(), name text unique not null);
create table equipment (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category_id uuid references equipment_categories(id),
  day_rate numeric(10,2) not null,
  condition_grade text not null,
  depreciation_rate_daily numeric(10,4) not null,
  purchase_price numeric(12,2) not null,
  purchase_date date not null,
  lifespan_days int not null,
  maintenance_interval_days int not null default 180,
  cleaning_interval_days int not null default 15,
  specs jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table equipment_units (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  serial_number text unique,
  barcode text unique,
  qr_code text unique,
  status text not null default 'available'
);

create table rentals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  status rental_status not null,
  start_date date not null,
  end_date date not null,
  discount_amount numeric(10,2) not null default 0,
  subtotal numeric(12,2) not null,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  security_deposit numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create table rental_items (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  equipment_unit_id uuid not null references equipment_units(id),
  unit_day_rate numeric(10,2) not null,
  quantity int not null default 1,
  rental_days int not null,
  line_total numeric(12,2) generated always as (unit_day_rate * quantity * rental_days) stored
);

create table invoices (
 id uuid primary key default gen_random_uuid(), rental_id uuid references rentals(id), invoice_number text unique not null,
 payment_status payment_status not null default 'pending', due_date date not null, issue_date date not null default current_date,
 total_amount numeric(12,2) not null, paid_amount numeric(12,2) not null default 0, fonepay_reference text
);

create table payments (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 provider text not null, provider_ref text, amount numeric(12,2) not null, status payment_status not null,
 payload jsonb not null default '{}'::jsonb, paid_at timestamptz
);

create table expenses (
 id uuid primary key default gen_random_uuid(), category text not null, amount numeric(12,2) not null,
 expense_date date not null, recurring boolean not null default false, notes text
);

create table maintenance_logs (id uuid primary key default gen_random_uuid(), equipment_unit_id uuid references equipment_units(id), service_date date not null, cost numeric(10,2), notes text);
create table cleaning_logs (id uuid primary key default gen_random_uuid(), equipment_unit_id uuid references equipment_units(id), cleaned_at timestamptz not null default now(), cleaned_by text, notes text);
create table damage_logs (id uuid primary key default gen_random_uuid(), equipment_unit_id uuid references equipment_units(id), client_id uuid references clients(id), report_date date not null, repair_cost numeric(10,2) default 0, penalty_amount numeric(10,2) default 0, status text not null default 'open');

create table ai_insights (
 id uuid primary key default gen_random_uuid(),
 period_start date not null,
 period_end date not null,
 insight_type text not null,
 severity text not null,
 title text not null,
 details text not null,
 recommendation text,
 created_at timestamptz not null default now()
);

create table pricing_actions (
 id uuid primary key default gen_random_uuid(), equipment_id uuid references equipment(id),
 old_rate numeric(10,2) not null, new_rate numeric(10,2) not null,
 change_percent numeric(5,2) not null, auto_applied boolean not null default false,
 action_reason text not null, created_at timestamptz not null default now()
);

create table bundle_definitions (
 id uuid primary key default gen_random_uuid(), name text not null, discount_percent numeric(5,2) not null,
 generated_by_ai boolean not null default true, active boolean not null default true
);
create table bundle_items (
 id uuid primary key default gen_random_uuid(), bundle_id uuid references bundle_definitions(id) on delete cascade,
 equipment_id uuid references equipment(id), quantity int not null default 1
);
