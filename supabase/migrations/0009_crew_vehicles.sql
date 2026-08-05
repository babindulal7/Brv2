-- =============================================================================
-- 0009_crew_vehicles.sql — domain: crew, vehicles, transport & document registry
--
-- Laws encoded here, in the database, with no role bypass:
--   * NOTHING IS DELETED. Terminal states are Inactive / Retired / Void.
--   * Every user-written table carries client_uuid uuid not null unique.
--   * Days is mandatory on priced crew lines (days >= 1).
--   * Vehicle transport & trip logs are append-only.
--   * Document registry guarantees immutable document audit trail.
-- =============================================================================

begin;

-- =============================================================================
-- 1. crew_members
-- In-house and freelance production crew profiles.
-- =============================================================================
create table crew_members (
  id                 uuid           not null default gen_random_uuid() primary key,
  client_uuid        uuid           not null,
  crew_code          text           not null,
  full_name          text           not null,
  mobile             text           not null,
  email              text,
  primary_role       text           not null,
  daily_rate         numeric(14,2)  not null default 0,
  hourly_rate        numeric(14,2)  not null default 0,
  is_internal_staff  boolean        not null default false,
  is_active          boolean        not null default true,
  created_at         timestamptz    not null default now(),
  created_by         uuid           references users (id),
  updated_at         timestamptz    not null default now(),
  updated_by         uuid           references users (id),

  constraint crew_members_client_uuid_key unique (client_uuid),
  constraint crew_members_code_key unique (crew_code),
  constraint crew_members_rates_valid check (daily_rate >= 0 and hourly_rate >= 0)
);

create index idx_crew_members_code on crew_members (crew_code);
create index idx_crew_members_active on crew_members (is_active);


-- =============================================================================
-- 2. crew_skills
-- Skills, licenses, and certifications (e.g. Drone Pilot, Heavy Vehicle License).
-- =============================================================================
create table crew_skills (
  id                         uuid         not null default gen_random_uuid() primary key,
  client_uuid                uuid         not null,
  crew_id                    uuid         not null references crew_members (id),
  skill_name                 text         not null,
  proficiency_level          text         not null default 'Expert',
  certification_name         text,
  certification_expiry_date  date,
  created_at                 timestamptz  not null default now(),

  constraint crew_skills_client_uuid_key unique (client_uuid)
);

create index idx_crew_skills_crew on crew_skills (crew_id);


-- =============================================================================
-- 3. crew_assignments
-- Crew booking schedule and rate allocation per rental booking.
-- =============================================================================
create table crew_assignments (
  id            uuid           not null default gen_random_uuid() primary key,
  client_uuid   uuid           not null,
  booking_id    uuid           not null references bookings (id),
  crew_id       uuid           not null references crew_members (id),
  role_on_shoot text           not null,
  call_time     timestamptz    not null,
  wrap_time     timestamptz,
  daily_rate    numeric(14,2)  not null default 0,
  days          integer        not null default 1,
  line_total    numeric(14,2)  not null default 0,
  notes         text,
  created_at    timestamptz    not null default now(),
  created_by    uuid           references users (id),
  updated_at    timestamptz    not null default now(),
  updated_by    uuid           references users (id),

  constraint crew_assignments_client_uuid_key unique (client_uuid),
  constraint crew_assignments_days_mandatory check (days >= 1),
  constraint crew_assignments_amounts_valid check (daily_rate >= 0 and line_total >= 0)
);

create index idx_crew_assignments_booking on crew_assignments (booking_id);
create index idx_crew_assignments_crew on crew_assignments (crew_id);


-- =============================================================================
-- 4. vehicles
-- Fleet vehicles used for transport, generator, and mobile equipment transport.
-- =============================================================================
create table vehicles (
  id                 uuid          not null default gen_random_uuid() primary key,
  client_uuid        uuid          not null,
  vehicle_code       text          not null,
  vehicle_type       vehicle_type  not null default 'Pickup Van',
  registration_plate text          not null,
  make               text          not null,
  model              text          not null,
  manufacturing_year integer,
  branch_id          uuid          not null references branches (id),
  current_odometer   numeric(10,2) not null default 0,
  is_active          boolean       not null default true,
  created_at         timestamptz   not null default now(),
  created_by         uuid          references users (id),
  updated_at         timestamptz   not null default now(),
  updated_by         uuid          references users (id),

  constraint vehicles_client_uuid_key unique (client_uuid),
  constraint vehicles_code_key unique (vehicle_code),
  constraint vehicles_plate_key unique (registration_plate),
  constraint vehicles_odometer_positive check (current_odometer >= 0)
);

create index idx_vehicles_code on vehicles (vehicle_code);
create index idx_vehicles_branch on vehicles (branch_id);


-- =============================================================================
-- 5. vehicle_trip_logs
-- Trip records, delivery routing, and odometer verification.
-- =============================================================================
create table vehicle_trip_logs (
  id                 uuid           not null default gen_random_uuid() primary key,
  client_uuid        uuid           not null,
  vehicle_id         uuid           not null references vehicles (id),
  booking_id         uuid           references bookings (id),
  driver_id          uuid           references users (id),
  start_odometer     numeric(10,2)  not null,
  end_odometer       numeric(10,2),
  start_time         timestamptz    not null default now(),
  end_time           timestamptz,
  route_description  text           not null,
  purpose            text           not null default 'Equipment Delivery',
  created_at         timestamptz    not null default now(),

  constraint vehicle_trip_logs_client_uuid_key unique (client_uuid),
  constraint vehicle_trip_logs_odometer_order check (end_odometer is null or start_odometer <= end_odometer)
);

create index idx_vehicle_trips_vehicle on vehicle_trip_logs (vehicle_id);
create index idx_vehicle_trips_booking on vehicle_trip_logs (booking_id);


-- =============================================================================
-- 6. vehicle_fuel_logs
-- Fuel replenishment, receipt logging, and vehicle efficiency tracking.
-- =============================================================================
create table vehicle_fuel_logs (
  id            uuid           not null default gen_random_uuid() primary key,
  client_uuid   uuid           not null,
  vehicle_id    uuid           not null references vehicles (id),
  fuel_date     date           not null default current_date,
  odometer      numeric(10,2)  not null,
  fuel_liters   numeric(8,2)   not null,
  cost_amount   numeric(14,2)  not null,
  receipt_url   text,
  branch_id     uuid           not null references branches (id),
  recorded_by   uuid           not null references users (id),
  created_at    timestamptz    not null default now(),

  constraint vehicle_fuel_logs_client_uuid_key unique (client_uuid),
  constraint vehicle_fuel_logs_values_positive check (odometer >= 0 and fuel_liters > 0 and cost_amount > 0)
);

create index idx_vehicle_fuel_vehicle on vehicle_fuel_logs (vehicle_id);


-- =============================================================================
-- 7. document_registry
-- Central registry of all generated and signed official PDF documents.
-- =============================================================================
create table document_registry (
  id                uuid                      not null default gen_random_uuid() primary key,
  client_uuid       uuid                      not null,
  document_no       text                      not null,
  document_type     document_type             not null default 'Quotation',
  booking_id        uuid                      references bookings (id),
  client_id         uuid                      references clients (id),
  lifecycle_status  document_lifecycle_status not null default 'Draft',
  file_url          text                      not null,
  file_size_bytes   bigint,
  generated_by      uuid                      references users (id),
  signed_at         timestamptz,
  signed_by_name    text,
  signature_url     text,
  voided_at         timestamptz,
  void_reason       text,
  created_at        timestamptz               not null default now(),
  created_by        uuid                      references users (id),
  updated_at        timestamptz               not null default now(),
  updated_by        uuid                      references users (id),

  constraint document_registry_client_uuid_key unique (client_uuid),
  constraint document_registry_no_key unique (document_no),
  constraint document_registry_void_reason check (
    (voided_at is null and void_reason is null) or
    (voided_at is not null and length(trim(coalesce(void_reason, ''))) >= 10)
  )
);

create index idx_doc_registry_booking on document_registry (booking_id);
create index idx_doc_registry_type on document_registry (document_type);
create index idx_doc_registry_status on document_registry (lifecycle_status);


-- =============================================================================
-- 8. document_deliveries
-- Delivery audit trail for sent, viewed, and downloaded documents.
-- =============================================================================
create table document_deliveries (
  id                    uuid                     not null default gen_random_uuid() primary key,
  client_uuid           uuid                     not null,
  document_id           uuid                     not null references document_registry (id),
  recipient_type        text                     not null default 'Client',
  recipient_destination text                     not null,
  channel               channel_code             not null default 'Email',
  delivery_event        document_delivery_event  not null default 'Sent',
  recorded_at           timestamptz              not null default now(),

  constraint document_deliveries_client_uuid_key unique (client_uuid)
);

create index idx_doc_deliveries_document on document_deliveries (document_id);


-- =============================================================================
-- Revocations & RLS
-- =============================================================================
revoke delete on
  crew_members,
  crew_skills,
  crew_assignments,
  vehicles,
  vehicle_trip_logs,
  vehicle_fuel_logs,
  document_registry,
  document_deliveries
from public, anon, authenticated;

-- Immutable audit tables
revoke update on
  vehicle_trip_logs,
  vehicle_fuel_logs,
  document_deliveries
from public, anon, authenticated;

alter table crew_members enable row level security;
alter table crew_skills enable row level security;
alter table crew_assignments enable row level security;
alter table vehicles enable row level security;
alter table vehicle_trip_logs enable row level security;
alter table vehicle_fuel_logs enable row level security;
alter table document_registry enable row level security;
alter table document_deliveries enable row level security;

commit;
