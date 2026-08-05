-- =============================================================================
-- 0004_inventory.sql — domain: inventory
--
-- Laws encoded here, in the database, with no role bypass:
--   * NOTHING IS DELETED. Terminal actions are state changes (Retired/Archived/Cancelled).
--   * Every user-written table carries client_uuid uuid not null unique (idempotency).
--   * Timestamps are timestamptz in UTC (AD). No BS columns.
--   * Money is numeric(14,2). Never float.
--   * Serial numbers are unique system-wide when present.
--   * Asset tags are auto/custom printed labels (e.g. EQ000234-01).
--   * Parent asset value = sum of child units/accessories.
--   * Three tracking modes: Serialised, Quantity, Consumable.
--   * Bundles store models (products), never serials (serials assigned at packing).
--   * Transfers follow 7-state lifecycle.
--   * Reorder level is a display signal only, never auto-fires purchase requests.
--   * Warehouse sees NO monetary values (purchase price, replacement value, rates).
-- =============================================================================

begin;

-- =============================================================================
-- 1. inventory_categories
-- The category taxonomy for equipment and accessories.
-- =============================================================================
create table inventory_categories (
  id           uuid                 not null default gen_random_uuid() primary key,
  client_uuid  uuid                 not null,
  code         text                 not null,
  name         product_category     not null,
  description  text,
  parent_id    uuid                 references inventory_categories (id),
  sort_order   integer              not null default 0,
  is_active    boolean              not null default true,
  created_at   timestamptz          not null default now(),
  created_by   uuid                 references users (id),
  updated_at   timestamptz          not null default now(),
  updated_by   uuid                 references users (id),

  constraint inventory_categories_client_uuid_key unique (client_uuid),
  constraint inventory_categories_code_key unique (code),
  constraint inventory_categories_no_self_parent check (parent_id is null or parent_id <> id)
);

create index idx_inventory_categories_parent on inventory_categories (parent_id);


-- =============================================================================
-- 2. suppliers
-- Equipment vendors, sub-rental partners, and maintenance service providers.
-- =============================================================================
create table suppliers (
  id                  uuid         not null default gen_random_uuid() primary key,
  client_uuid         uuid         not null,
  supplier_code       text         not null,
  name                text         not null,
  contact_person      text,
  phone               text,
  email               text,
  address             text,
  pan_vat_no          text,
  payment_terms_days  integer      not null default 30,
  rating              numeric(3,2),
  notes               text,
  is_active           boolean      not null default true,
  created_at          timestamptz  not null default now(),
  created_by          uuid         references users (id),
  updated_at          timestamptz  not null default now(),
  updated_by          uuid         references users (id),

  constraint suppliers_client_uuid_key unique (client_uuid),
  constraint suppliers_code_key unique (supplier_code),
  constraint suppliers_payment_terms_positive check (payment_terms_days >= 0)
);

create index idx_suppliers_code on suppliers (supplier_code);
create index idx_suppliers_active on suppliers (is_active);


-- =============================================================================
-- 3. products
-- The fleet item / master catalog definition (e.g. Sony FX3 Camera Body).
-- =============================================================================
create table products (
  id                      uuid                   not null default gen_random_uuid() primary key,
  client_uuid             uuid                   not null,
  asset_code              text                   not null,
  name                    text                   not null,
  short_name              text,
  category_id             uuid                   not null references inventory_categories (id),
  brand                   text                   not null,
  model                   text,
  manufacturer            text,
  description             text,
  thumbnail_url           text,
  tracking_mode           product_tracking_mode  not null default 'Serialised',
  status                  product_record_state   not null default 'Draft',
  total_quantity          integer                not null default 0,
  reorder_level           integer,
  quantity_unit           product_unit_of_measure,
  
  -- Financial properties (hidden from Warehouse role)
  purchase_date           date,
  purchase_price          numeric(14,2),
  replacement_value       numeric(14,2),
  daily_rate              numeric(14,2),
  weekly_rate             numeric(14,2),
  monthly_rate            numeric(14,2),
  hourly_rate             numeric(14,2),
  weekend_rate            numeric(14,2),
  deposit_percent         numeric(5,2),
  deposit_fixed           numeric(14,2),
  
  -- Rental & Operational rules
  min_rental_days         integer                not null default 1,
  rental_enabled          boolean                not null default true,
  prep_time_minutes       integer                not null default 0,
  cleaning_time_minutes   integer                not null default 0,
  inspection_required     boolean                not null default true,
  packing_required        boolean                not null default true,
  is_subrental_only       boolean                not null default false,
  
  -- Physical & Case properties
  weight_kg               numeric(8,3),
  case_capacity           integer,
  supplier_id             uuid                   references suppliers (id),
  
  -- Notes
  notes_internal          text,
  notes_warehouse         text,
  notes_rental            text,
  
  is_active               boolean                not null default true,
  created_at              timestamptz            not null default now(),
  created_by              uuid                   references users (id),
  updated_at              timestamptz            not null default now(),
  updated_by              uuid                   references users (id),

  constraint products_client_uuid_key unique (client_uuid),
  constraint products_asset_code_key unique (asset_code),
  constraint products_asset_code_format check (asset_code ~ '^EQ[0-9]{6}$'),
  constraint products_min_rental_days_positive check (min_rental_days >= 1),
  constraint products_total_quantity_non_negative check (total_quantity >= 0),
  constraint products_deposit_pct_range check (deposit_percent is null or (deposit_percent >= 0 and deposit_percent <= 100))
);

create index idx_products_category on products (category_id);
create index idx_products_tracking on products (tracking_mode);
create index idx_products_status on products (status);
create index idx_products_asset_code on products (asset_code);


-- =============================================================================
-- 4. containers
-- Physical transit cases and bags that contain assets.
-- =============================================================================
create table containers (
  id                uuid             not null default gen_random_uuid() primary key,
  client_uuid       uuid             not null,
  code              text             not null,
  name              text             not null,
  barcode           text,
  qr_code           text,
  category          text,
  capacity_slots    integer          not null default 1,
  max_weight_kg     numeric(8,3),
  branch_id         uuid             not null references branches (id),
  warehouse_id      uuid             not null references warehouses (id),
  storage_zone_id   uuid             references storage_zones (id),
  status            text             not null default 'Available',
  is_active         boolean          not null default true,
  created_at        timestamptz      not null default now(),
  created_by        uuid             references users (id),
  updated_at        timestamptz      not null default now(),
  updated_by        uuid             references users (id),

  constraint containers_client_uuid_key unique (client_uuid),
  constraint containers_code_key unique (code),
  constraint containers_capacity_positive check (capacity_slots >= 1)
);

create index idx_containers_code on containers (code);
create index idx_containers_warehouse on containers (warehouse_id);


-- =============================================================================
-- 5. product_units
-- The individual physical serialized asset instances.
-- Enforces the locked ten inventory_state lifecycle states.
-- =============================================================================
create table product_units (
  id                    uuid             not null default gen_random_uuid() primary key,
  client_uuid           uuid             not null,
  product_id            uuid             not null references products (id),
  serial_no             text,
  asset_tag             text             not null,
  barcode               text,
  qr_code               text,
  status                inventory_state  not null default 'In Stock',
  condition             unit_condition   not null default 'Good',
  
  -- Physical location
  branch_id             uuid             not null references branches (id),
  warehouse_id          uuid             not null references warehouses (id),
  storage_zone_id       uuid             references storage_zones (id),
  rack                  text,
  shelf                 text,
  bin                   text,
  container_id          uuid             references containers (id),
  
  -- Financial & warranty tracking (hidden from Warehouse role)
  purchase_date         date,
  purchase_price        numeric(14,2),
  replacement_value     numeric(14,2),
  warranty_expires_at   date,
  insurance_expires_at  date,
  running_hours         numeric(10,2)    not null default 0,
  
  -- Maintenance schedule
  last_maintenance_at   timestamptz,
  next_maintenance_at   timestamptz,
  
  -- Retirement (terminal lifecycle)
  retired_at            timestamptz,
  retired_by            uuid             references users (id),
  retirement_reason     text,
  
  created_at            timestamptz      not null default now(),
  created_by            uuid             references users (id),
  updated_at            timestamptz      not null default now(),
  updated_by            uuid             references users (id),

  constraint product_units_client_uuid_key unique (client_uuid),
  constraint product_units_asset_tag_key unique (asset_tag),
  constraint product_units_serial_no_key unique (serial_no),
  constraint product_units_retirement_requires_reason check (
    (retired_at is null and retired_by is null and retirement_reason is null) or
    (retired_at is not null and retired_by is not null and length(trim(retirement_reason)) >= 10)
  )
);

create index idx_product_units_product on product_units (product_id);
create index idx_product_units_status on product_units (status);
create index idx_product_units_branch on product_units (branch_id);
create index idx_product_units_warehouse on product_units (warehouse_id);
create index idx_product_units_container on product_units (container_id);


-- =============================================================================
-- 6. accessories
-- Child checklist items attached to products/units (un-serialized, never scanned).
-- =============================================================================
create table accessories (
  id                uuid         not null default gen_random_uuid() primary key,
  client_uuid       uuid         not null,
  product_id        uuid         not null references products (id),
  name              text         not null,
  quantity          integer      not null default 1,
  is_mandatory      boolean      not null default true,
  replacement_cost  numeric(14,2) not null default 0,
  sort_order        integer      not null default 0,
  created_at        timestamptz  not null default now(),
  created_by        uuid         references users (id),
  updated_at        timestamptz  not null default now(),
  updated_by        uuid         references users (id),

  constraint accessories_client_uuid_key unique (client_uuid),
  constraint accessories_quantity_positive check (quantity >= 1)
);

create index idx_accessories_product on accessories (product_id);


-- =============================================================================
-- 7. product_compatibilities
-- Informational / warning relationships between products.
-- =============================================================================
create table product_compatibilities (
  id                     uuid                not null default gen_random_uuid() primary key,
  client_uuid            uuid                not null,
  product_id             uuid                not null references products (id),
  compatible_product_id  uuid                not null references products (id),
  relationship_kind      compatibility_kind  not null default 'Compatible with',
  notes                  text,
  created_at             timestamptz         not null default now(),
  created_by             uuid                references users (id),

  constraint product_compatibilities_client_uuid_key unique (client_uuid),
  constraint product_compatibilities_no_self check (product_id <> compatible_product_id)
);

create index idx_product_compatibilities_product on product_compatibilities (product_id);
create index idx_product_compatibilities_target on product_compatibilities (compatible_product_id);


-- =============================================================================
-- 8. bundles
-- Commercial packages of gear (e.g. FX3 Documentary Package).
-- Stores models (products), never specific serial numbers.
-- =============================================================================
create table bundles (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  bundle_code  text         not null,
  name         text         not null,
  description  text,
  category_id  uuid         references inventory_categories (id),
  daily_rate   numeric(14,2) not null default 0,
  weekly_rate  numeric(14,2) not null default 0,
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),

  constraint bundles_client_uuid_key unique (client_uuid),
  constraint bundles_code_key unique (bundle_code),
  constraint bundles_rates_non_negative check (daily_rate >= 0 and weekly_rate >= 0)
);

create index idx_bundles_code on bundles (bundle_code);


-- =============================================================================
-- 9. bundle_items
-- Component items within a commercial bundle.
-- =============================================================================
create table bundle_items (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  bundle_id    uuid         not null references bundles (id),
  product_id   uuid         not null references products (id),
  quantity     integer      not null default 1,
  days         integer      not null default 1,
  is_mandatory boolean      not null default true,
  sort_order   integer      not null default 0,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),

  constraint bundle_items_client_uuid_key unique (client_uuid),
  constraint bundle_items_qty_positive check (quantity >= 1),
  constraint bundle_items_days_mandatory check (days >= 1)
);

create index idx_bundle_items_bundle on bundle_items (bundle_id);
create index idx_bundle_items_product on bundle_items (product_id);


-- =============================================================================
-- 10. stock_transfers
-- Transfer Center tracking movements between branches, warehouses, and zones.
-- Seven-state flow: Pending -> Approved -> Packing -> In Transit -> Received -> Completed / Cancelled
-- =============================================================================
create table stock_transfers (
  id                        uuid             not null default gen_random_uuid() primary key,
  client_uuid               uuid             not null,
  transfer_no               text             not null,
  transfer_type             transfer_kind    not null default 'Branch Transfers',
  status                    transfer_status  not null default 'Pending',
  
  source_branch_id          uuid             not null references branches (id),
  source_warehouse_id       uuid             not null references warehouses (id),
  source_zone_id            uuid             references storage_zones (id),
  
  destination_branch_id     uuid             not null references branches (id),
  destination_warehouse_id  uuid             not null references warehouses (id),
  destination_zone_id       uuid             references storage_zones (id),
  
  requested_by              uuid             not null references users (id),
  approved_by               uuid             references users (id),
  dispatched_by             uuid             references users (id),
  received_by               uuid             references users (id),
  
  requested_at              timestamptz      not null default now(),
  approved_at               timestamptz,
  dispatched_at             timestamptz,
  received_at               timestamptz,
  completed_at              timestamptz,
  
  cancelled_at              timestamptz,
  cancelled_by              uuid             references users (id),
  cancellation_reason       text,
  
  notes                     text,
  created_at                timestamptz      not null default now(),
  created_by                uuid             references users (id),
  updated_at                timestamptz      not null default now(),
  updated_by                uuid             references users (id),

  constraint stock_transfers_client_uuid_key unique (client_uuid),
  constraint stock_transfers_no_key unique (transfer_no),
  constraint stock_transfers_cancelled_requires_reason check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null) or
    (cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) >= 10)
  )
);

create index idx_stock_transfers_no on stock_transfers (transfer_no);
create index idx_stock_transfers_status on stock_transfers (status);
create index idx_stock_transfers_source on stock_transfers (source_warehouse_id);
create index idx_stock_transfers_dest on stock_transfers (destination_warehouse_id);


-- =============================================================================
-- 11. stock_transfer_lines
-- Specific units or quantity items transferred.
-- =============================================================================
create table stock_transfer_lines (
  id                    uuid            not null default gen_random_uuid() primary key,
  client_uuid           uuid            not null,
  transfer_id           uuid            not null references stock_transfers (id),
  product_id            uuid            not null references products (id),
  product_unit_id       uuid            references product_units (id),
  requested_quantity    integer         not null default 1,
  transferred_quantity  integer         not null default 0,
  received_quantity     integer         not null default 0,
  condition_on_receipt  unit_condition,
  notes                 text,
  created_at            timestamptz     not null default now(),

  constraint stock_transfer_lines_client_uuid_key unique (client_uuid),
  constraint stock_transfer_lines_quantities_valid check (
    requested_quantity >= 1 and transferred_quantity >= 0 and received_quantity >= 0
  )
);

create index idx_stock_transfer_lines_transfer on stock_transfer_lines (transfer_id);


-- =============================================================================
-- 12. maintenance_records
-- Preventive and corrective maintenance events for serialized units.
-- =============================================================================
create table maintenance_records (
  id               uuid         not null default gen_random_uuid() primary key,
  client_uuid      uuid         not null,
  record_no        text         not null,
  product_unit_id  uuid         not null references product_units (id),
  maintenance_type text         not null,
  priority         text         not null default 'Normal',
  status           text         not null default 'Scheduled',
  description      text         not null,
  findings         text,
  actions_taken    text,
  vendor_name      text,
  cost             numeric(14,2) not null default 0,
  scheduled_date   date         not null,
  started_at       timestamptz,
  completed_at     timestamptz,
  performed_by     uuid         references users (id),
  approved_by      uuid         references users (id),
  created_at       timestamptz  not null default now(),
  created_by       uuid         references users (id),
  updated_at       timestamptz  not null default now(),
  updated_by       uuid         references users (id),

  constraint maintenance_records_client_uuid_key unique (client_uuid),
  constraint maintenance_records_no_key unique (record_no),
  constraint maintenance_cost_non_negative check (cost >= 0)
);

create index idx_maintenance_unit on maintenance_records (product_unit_id);
create index idx_maintenance_status on maintenance_records (status);


-- =============================================================================
-- 13. depreciation_logs
-- Straight-line asset depreciation calculations with 10% residual.
-- =============================================================================
create table depreciation_logs (
  id                        uuid         not null default gen_random_uuid() primary key,
  client_uuid               uuid         not null,
  product_id                uuid         not null references products (id),
  product_unit_id           uuid         references product_units (id),
  fiscal_year               text         not null,
  depreciation_method       text         not null default 'Straight Line',
  initial_cost              numeric(14,2) not null,
  residual_value            numeric(14,2) not null,
  useful_life_years         integer      not null default 5,
  annual_depreciation       numeric(14,2) not null,
  accumulated_depreciation  numeric(14,2) not null,
  book_value                numeric(14,2) not null,
  calculated_at             timestamptz  not null default now(),
  calculated_by             uuid         references users (id),

  constraint depreciation_logs_client_uuid_key unique (client_uuid),
  constraint depreciation_logs_residual_calc check (residual_value >= 0 and residual_value <= initial_cost)
);

create index idx_depreciation_unit on depreciation_logs (product_unit_id);
create index idx_depreciation_fy on depreciation_logs (fiscal_year);


-- =============================================================================
-- 14. purchase_requests
-- Purchase Requests generated manually or from demand observation.
-- Never auto-fired by a static stock threshold (locked rule).
-- =============================================================================
create table purchase_requests (
  id                    uuid                    not null default gen_random_uuid() primary key,
  client_uuid           uuid                    not null,
  pr_no                 text                    not null,
  product_id            uuid                    not null references products (id),
  supplier_id           uuid                    references suppliers (id),
  quantity              integer                 not null default 1,
  estimated_unit_cost   numeric(14,2)           not null default 0,
  total_estimated_cost  numeric(14,2)           not null default 0,
  reason_type           purchase_request_reason not null default 'Manual',
  urgency               text                    not null default 'Normal',
  status                purchase_request_status not null default 'Draft',
  requested_by          uuid                    not null references users (id),
  approved_by           uuid                    references users (id),
  rejection_reason      text,
  created_at            timestamptz             not null default now(),
  created_by            uuid                    references users (id),
  updated_at            timestamptz             not null default now(),
  updated_by            uuid                    references users (id),

  constraint purchase_requests_client_uuid_key unique (client_uuid),
  constraint purchase_requests_no_key unique (pr_no),
  constraint purchase_requests_qty_positive check (quantity >= 1)
);

create index idx_purchase_requests_no on purchase_requests (pr_no);
create index idx_purchase_requests_status on purchase_requests (status);


-- =============================================================================
-- 15. stock_audits
-- Physical stock take and inventory reconciliation sessions.
-- =============================================================================
create table stock_audits (
  id                    uuid               not null default gen_random_uuid() primary key,
  client_uuid           uuid               not null,
  audit_no              text               not null,
  branch_id             uuid               not null references branches (id),
  warehouse_id          uuid               not null references warehouses (id),
  scope                 stock_check_scope  not null default 'Full warehouse',
  status                text               not null default 'Draft',
  scheduled_date        date               not null,
  started_at            timestamptz,
  completed_at          timestamptz,
  audited_by            uuid               references users (id),
  total_expected        integer            not null default 0,
  total_scanned         integer            not null default 0,
  total_discrepancies   integer            not null default 0,
  notes                 text,
  created_at            timestamptz        not null default now(),
  created_by            uuid               references users (id),
  updated_at            timestamptz        not null default now(),
  updated_by            uuid               references users (id),

  constraint stock_audits_client_uuid_key unique (client_uuid),
  constraint stock_audits_no_key unique (audit_no)
);

create index idx_stock_audits_no on stock_audits (audit_no);


-- =============================================================================
-- 16. stock_audit_items
-- Per-unit scan reconciliation line in a stock audit.
-- =============================================================================
create table stock_audit_items (
  id                 uuid                  not null default gen_random_uuid() primary key,
  client_uuid        uuid                  not null,
  stock_audit_id     uuid                  not null references stock_audits (id),
  product_unit_id    uuid                  not null references product_units (id),
  expected_state     inventory_state       not null,
  scanned_state      inventory_state,
  outcome            stock_check_outcome   not null default 'Left unverified',
  exclusion_reason   stock_check_exclusion,
  discrepancy_notes  text,
  scanned_at         timestamptz,
  scanned_by         uuid                  references users (id),

  constraint stock_audit_items_client_uuid_key unique (client_uuid)
);

create index idx_stock_audit_items_audit on stock_audit_items (stock_audit_id);
create index idx_stock_audit_items_unit on stock_audit_items (product_unit_id);


-- =============================================================================
-- 17. product_documents
-- Invoices, warranties, user manuals, and certificates for assets (up to 50MB).
-- =============================================================================
create table product_documents (
  id             uuid                  not null default gen_random_uuid() primary key,
  client_uuid    uuid                  not null,
  product_id     uuid                  not null references products (id),
  product_unit_id uuid                 references product_units (id),
  kind           product_document_kind not null default 'Manual',
  file_name      text                  not null,
  file_size      bigint                not null,
  mime_type      text                  not null,
  file_url       text                  not null,
  description    text,
  created_at     timestamptz           not null default now(),
  created_by     uuid                  references users (id),

  constraint product_documents_client_uuid_key unique (client_uuid),
  constraint product_documents_file_size_limit check (file_size > 0 and file_size <= 52428800) -- 50MB cap
);

create index idx_product_documents_product on product_documents (product_id);


-- =============================================================================
-- Revocations & Permissions
-- =============================================================================
revoke delete on
  inventory_categories,
  suppliers,
  products,
  product_units,
  accessories,
  product_compatibilities,
  bundles,
  bundle_items,
  stock_transfers,
  stock_transfer_lines,
  maintenance_records,
  depreciation_logs,
  purchase_requests,
  stock_audits,
  stock_audit_items,
  product_documents
from public, anon, authenticated;

revoke update on
  depreciation_logs
from public, anon, authenticated;

alter table inventory_categories enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table containers enable row level security;
alter table product_units enable row level security;
alter table accessories enable row level security;
alter table product_compatibilities enable row level security;
alter table bundles enable row level security;
alter table bundle_items enable row level security;
alter table stock_transfers enable row level security;
alter table stock_transfer_lines enable row level security;
alter table maintenance_records enable row level security;
alter table depreciation_logs enable row level security;
alter table purchase_requests enable row level security;
alter table stock_audits enable row level security;
alter table stock_audit_items enable row level security;
alter table product_documents enable row level security;

commit;
