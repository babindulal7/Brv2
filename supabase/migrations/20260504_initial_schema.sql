create extension if not exists pgcrypto;

create type rental_status as enum ('booked','active','completed','overdue','cancelled');
create type payment_status as enum ('pending','paid','partial','failed','refunded');
create type item_condition as enum ('new','excellent','good','worn','retire');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'NPR',
  timezone text not null default 'Asia/Kathmandu',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  risk_score int not null default 0,
  vip boolean not null default false,
  total_spend numeric(14,2) not null default 0,
  late_payment_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  category text not null,
  specs jsonb not null default '{}'::jsonb,
  price_per_day numeric(12,2) not null,
  purchase_price numeric(12,2) not null,
  purchase_date date not null,
  expected_life_days int not null,
  depreciation_rate_daily numeric(8,4) not null,
  condition item_condition not null default 'excellent',
  service_interval_days int not null default 180,
  cleaning_interval_days int not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.equipment_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  serial_number text,
  qr_code text,
  barcode text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_id uuid not null references clients(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status rental_status not null default 'booked',
  subtotal numeric(12,2) not null,
  discount_percent numeric(6,2) not null default 0,
  total numeric(12,2) not null,
  payment_status payment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table public.rental_items (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references rentals(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  equipment_unit_id uuid references equipment_units(id),
  qty int not null default 1,
  price_per_day numeric(12,2) not null,
  days int not null,
  line_total numeric(12,2) not null
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  rental_id uuid not null unique references rentals(id) on delete cascade,
  invoice_number text not null,
  amount_due numeric(12,2) not null,
  due_date date not null,
  pdf_path text,
  fonepay_reference text,
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  category text not null,
  type text not null check (type in ('fixed','variable')),
  amount numeric(12,2) not null,
  expense_date date not null,
  recurring boolean not null default false,
  notes text
);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  equipment_id uuid not null references equipment(id),
  log_type text not null check (log_type in ('cleaning','service','damage')),
  description text,
  cost numeric(12,2) not null default 0,
  penalty numeric(12,2) not null default 0,
  logged_at timestamptz not null default now()
);

create table public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  period_start date not null,
  period_end date not null,
  granularity text not null check (granularity in ('weekly','monthly')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end, granularity)
);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  recommendation_type text not null,
  entity_id uuid,
  confidence numeric(5,2) not null,
  details jsonb not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
