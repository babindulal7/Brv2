-- =============================================================================
-- Seed corpus — GENERATED FILE. Do not edit by hand.
--
--   source:    src/lib/seed.ts
--   regenerate: npm run seed:sql
--
-- PLAN.md Phase 1's last checklist line asks for seed data "generated through
-- the engines, never hand-typed". Every figure below came out of
-- src/lib/money.ts (calculation order, §2.1/§2.4), src/lib/workflow.ts (the
-- canonical six stages and the §1.6 item invariant), src/lib/discount.ts
-- (Law 10), src/lib/validation.ts (causal order and the day count) and
-- src/lib/bs.ts (Law 7 — BS derived, never stored). The generator refuses to
-- emit if any of them disagrees with Appendix/Sample Data.md, so this file
-- cannot drift away from the engines without the drift being fatal at
-- generation time.
--
-- 0012_seed_data.sql stays exactly as it is: it seeds the reference data this
-- file depends on (branches, warehouses, users, categories, bank accounts,
-- number sequences) and every reference below resolves through those rows'
-- natural keys, never through 0012's literal UUIDs.
--
-- NOT APPLIED. CLAUDE.md: "Never apply a migration to a live Supabase project
-- without explicit approval." This file has been generated and reviewed, not
-- executed — no local Postgres instance exists in this repo.
--
-- Re-applying is a no-op: every insert carries a derived client_uuid (Law 8)
-- and conflicts on its natural key.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Client
-- -----------------------------------------------------------------------------
insert into clients (
  client_uuid, client_code, type_parent, org_subtype, name, phone, email,
  address_line, city, district, country, payment_terms, client_since,
  segments, preferred_contact_channels, status, created_by
) values (
  'b5c9e670-2e69-4df4-814f-dd46153602c4'::uuid,
  'CL-2026-0034',
  'Organisation'::client_type_parent,
  'Production House'::client_organisation_subtype,
  'Sagarmatha Pictures Pvt. Ltd.',
  '+9779801230034',
  'bookings@sagarmathapictures.com.np',
  'Jhamsikhel, Lalitpur',
  'Lalitpur',
  'Lalitpur',
  'Nepal',
  'Immediate'::payment_terms,
  date '2024-03-11',
  array['Documentary', 'Commercial']::client_segment[],
  array['Email', 'WhatsApp']::preferred_contact_channel[],
  'Active'::client_status,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_code) do nothing;

-- -----------------------------------------------------------------------------
-- 2 · Products — the catalogue the booking lines price against
-- -----------------------------------------------------------------------------
insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  'c1367e3b-4c9e-4c8d-8630-742ca24a91e9'::uuid,
  'EQ000234',
  'Sony FX9 Cinema Camera',
  (select id from inventory_categories where code = 'camera'),
  'Sony',
  'PXW-FX9',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  1,
  6500.00,
  1450000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  '052d0fc0-1cf7-40b0-87f1-4d86e690d6b7'::uuid,
  'EQ000235',
  'Sony FX6 Cinema Camera',
  (select id from inventory_categories where code = 'camera'),
  'Sony',
  'ILME-FX6',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  1,
  4500.00,
  890000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  'c4b7f5c6-96c6-4999-8fc8-a2b7b6bd5ab5'::uuid,
  'EQ000236',
  'NISI Athena 35mm',
  (select id from inventory_categories where code = 'lens'),
  'NISI',
  'Athena Prime 35mm T1.9',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  4,
  1000.00,
  260000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  '2a92e065-4b54-4fd1-8a82-db9eba8030b5'::uuid,
  'EQ000237',
  'Aputure LS 600d Pro',
  (select id from inventory_categories where code = 'lighting'),
  'Aputure',
  'LS 600d Pro',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  2,
  1200.00,
  245000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  '75c76669-92f2-4eb0-81dc-ebf925d93522'::uuid,
  'EQ000238',
  'Matthews C-Stand 40in',
  (select id from inventory_categories where code = 'grip'),
  'Matthews',
  'Hollywood C-Stand',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  4,
  150.00,
  32000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  '7061073a-abbb-4706-8426-a2a162958005'::uuid,
  'EQ000239',
  'Manfrotto 504X Tripod System',
  (select id from inventory_categories where code = 'support'),
  'Manfrotto',
  '504X / 645 FAST',
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  6,
  375.00,
  96000.00,
  1,
  true,
  true,
  (select id from users where email = 'owner@babinrentals.com')
)
on conflict (asset_code) do nothing;

-- -----------------------------------------------------------------------------
-- 3 · Product units — one row per physical item
-- -----------------------------------------------------------------------------
insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '7f38e295-c9bb-447e-816a-c03303172fe2'::uuid,
  (select id from products where asset_code = 'EQ000234'),
  'SN-CAM-0001',
  'EQ000234-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-CAM-A'),
  1450000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '95dd2301-7596-4afb-852f-adbb9b6abae2'::uuid,
  (select id from products where asset_code = 'EQ000235'),
  'SN-CAM-0002',
  'EQ000235-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-CAM-A'),
  890000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '9c91df91-2596-4cf6-8cf3-5ff4a8dbec8f'::uuid,
  (select id from products where asset_code = 'EQ000236'),
  'SN-LEN-0035',
  'EQ000236-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-LENS-B'),
  260000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '99b60c36-bfde-4573-8afc-c59732aa5e28'::uuid,
  (select id from products where asset_code = 'EQ000236'),
  'SN-LEN-0036',
  'EQ000236-U02',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-LENS-B'),
  260000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '51980f63-6dc6-4eef-8951-dcdd97456953'::uuid,
  (select id from products where asset_code = 'EQ000236'),
  'SN-LEN-0037',
  'EQ000236-U03',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-LENS-B'),
  260000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'a9ae1a58-82bf-45b6-8cb8-e550c8e40a11'::uuid,
  (select id from products where asset_code = 'EQ000236'),
  'SN-LEN-0038',
  'EQ000236-U04',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-LENS-B'),
  260000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '39f63e75-b139-4cfc-8e51-143f7198c657'::uuid,
  (select id from products where asset_code = 'EQ000237'),
  'SN-LIT-0001',
  'EQ000237-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  245000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '6ea14cd4-7e44-480e-818d-b7a1f6befa84'::uuid,
  (select id from products where asset_code = 'EQ000237'),
  'SN-LIT-0002',
  'EQ000237-U02',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  245000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'd77838bc-e4ca-485b-88ba-60ed0b00caf7'::uuid,
  (select id from products where asset_code = 'EQ000238'),
  'SN-GRP-0001',
  'EQ000238-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  32000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '1bb49609-f93e-43c4-8ec2-2d96364deaba'::uuid,
  (select id from products where asset_code = 'EQ000238'),
  'SN-GRP-0002',
  'EQ000238-U02',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  32000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'ff62a178-34b1-48e9-800b-9377ad2621d9'::uuid,
  (select id from products where asset_code = 'EQ000238'),
  'SN-GRP-0003',
  'EQ000238-U03',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  32000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'fee86c66-dba2-463c-8459-a9f9ad8013ff'::uuid,
  (select id from products where asset_code = 'EQ000238'),
  'SN-GRP-0004',
  'EQ000238-U04',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  32000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'a5df4bd0-93c0-47cd-80cd-3489baf0d309'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0001',
  'EQ000239-U01',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '87944067-c0e4-41c8-888d-34fa5f039016'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0002',
  'EQ000239-U02',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '9f06098a-314a-4f35-8540-a42ceb93434d'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0003',
  'EQ000239-U03',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '17da3b45-f5de-4970-80c4-160bf2c8dd0e'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0004',
  'EQ000239-U04',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  '2ce9548d-5b9a-43ea-859b-9389e7cc10bb'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0005',
  'EQ000239-U05',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  'ab036e4b-a1a0-4f92-8e73-457c7af06b6e'::uuid,
  (select id from products where asset_code = 'EQ000239'),
  'SN-SUP-0006',
  'EQ000239-U06',
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  (select id from storage_zones where code = 'ZONE-GRIP-C'),
  96000.00,
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (asset_tag) do nothing;

-- -----------------------------------------------------------------------------
-- 4 · BK-2026-0715 — Annapurna Circuit — documentary shoot
-- -----------------------------------------------------------------------------
-- 18 item(s) × 3 day(s), 3 crew.
-- Pickup renders as 1 Shrawan 2083 BS (Law 7 — derived, never stored).
-- Engine figures: subtotal Rs 132750.00 · discount 7% Rs 9293.00
--   · taxable Rs 123457.00 · VAT 13% Rs 16049.00
--   · rental total Rs 139506.00 · payments Rs 15000.00
--   · outstanding Rs 124506.00
insert into bookings (
  client_uuid, booking_no, branch_id, client_id, project,
  pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
) values (
  '1d62c741-ccbc-4620-83c5-9bcaf64a11d5'::uuid,
  'BK-2026-0715',
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from clients where client_code = 'CL-2026-0034'),
  'Annapurna Circuit — documentary shoot',
  '2026-07-16T00:15:00.000Z'::timestamptz,
  '2026-07-19T00:15:00.000Z'::timestamptz,
  -- Sample Data.md: transport Rs 0 — the client collects. 'Customer Pickup' is
  -- the delivery_type enum member's own spelling (0001), not UI copy; Law 17
  -- governs what the screens say, and no screen renders this literal.
  'Customer Pickup'::delivery_type,
  50000.00,
  (select id from users where email = 'billing@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (booking_no) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '2b092c8d-cd83-48fa-8604-cf89ea07a732'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000234'),
  'Sony FX9 Cinema Camera',
  1,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  6500.00,
  10,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '103a8893-16a4-4bef-8532-f2a5d5178d23'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000235'),
  'Sony FX6 Cinema Camera',
  1,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  4500.00,
  20,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  'b7783831-921c-4f4a-80f6-6e4f75df0951'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000236'),
  'NISI Athena 35mm',
  4,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  1000.00,
  30,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '0a4de33e-c406-4cf9-843a-146a946a14d2'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000237'),
  'Aputure LS 600d Pro',
  2,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  1200.00,
  40,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  'feb8fb5e-afa0-4d46-8ffd-c897b5e7132f'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000238'),
  'Matthews C-Stand 40in',
  4,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  150.00,
  50,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000239'),
  'Manfrotto 504X Tripod System',
  6,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  3,
  375.00,
  60,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '503885ef-87fc-4b13-8c2e-0f8f13627a7e'::uuid,
  (select id from booking_lines where client_uuid = '2b092c8d-cd83-48fa-8604-cf89ea07a732'::uuid),
  (select id from product_units where asset_tag = 'EQ000234-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'd25d2523-9518-4b27-8f87-555dc9ad6639'::uuid,
  (select id from booking_lines where client_uuid = '103a8893-16a4-4bef-8532-f2a5d5178d23'::uuid),
  (select id from product_units where asset_tag = 'EQ000235-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'a6ed1139-6559-47bd-8593-ca695853ad51'::uuid,
  (select id from booking_lines where client_uuid = 'b7783831-921c-4f4a-80f6-6e4f75df0951'::uuid),
  (select id from product_units where asset_tag = 'EQ000236-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '98c56342-a2e6-4ea1-8103-1c61612ce227'::uuid,
  (select id from booking_lines where client_uuid = 'b7783831-921c-4f4a-80f6-6e4f75df0951'::uuid),
  (select id from product_units where asset_tag = 'EQ000236-U02'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'df934fc1-e970-48a6-8dc1-db7669e6c3af'::uuid,
  (select id from booking_lines where client_uuid = 'b7783831-921c-4f4a-80f6-6e4f75df0951'::uuid),
  (select id from product_units where asset_tag = 'EQ000236-U03'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '77a902bf-2cf2-43a1-88b4-a55a8579cf69'::uuid,
  (select id from booking_lines where client_uuid = 'b7783831-921c-4f4a-80f6-6e4f75df0951'::uuid),
  (select id from product_units where asset_tag = 'EQ000236-U04'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '91753e70-51d1-4c0a-801d-23cc1979e4ed'::uuid,
  (select id from booking_lines where client_uuid = '0a4de33e-c406-4cf9-843a-146a946a14d2'::uuid),
  (select id from product_units where asset_tag = 'EQ000237-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '7bd87b65-213d-4c92-8d6c-277ab65c49fc'::uuid,
  (select id from booking_lines where client_uuid = '0a4de33e-c406-4cf9-843a-146a946a14d2'::uuid),
  (select id from product_units where asset_tag = 'EQ000237-U02'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '14169cce-c961-436a-82d0-0d87f6f8eec4'::uuid,
  (select id from booking_lines where client_uuid = 'feb8fb5e-afa0-4d46-8ffd-c897b5e7132f'::uuid),
  (select id from product_units where asset_tag = 'EQ000238-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '154d4d67-68e9-48fe-8781-af6fa740c2d3'::uuid,
  (select id from booking_lines where client_uuid = 'feb8fb5e-afa0-4d46-8ffd-c897b5e7132f'::uuid),
  (select id from product_units where asset_tag = 'EQ000238-U02'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '5f1c7dbf-24c2-41c4-8c38-bd7aa4ee154c'::uuid,
  (select id from booking_lines where client_uuid = 'feb8fb5e-afa0-4d46-8ffd-c897b5e7132f'::uuid),
  (select id from product_units where asset_tag = 'EQ000238-U03'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '28afb715-1509-472f-8a51-cdfa316bfd9a'::uuid,
  (select id from booking_lines where client_uuid = 'feb8fb5e-afa0-4d46-8ffd-c897b5e7132f'::uuid),
  (select id from product_units where asset_tag = 'EQ000238-U04'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'dc64ceb3-4504-480b-89b1-0b0497f7a7ae'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U01'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'a9842da6-ce9b-4a54-8de1-2a3b2a71e8ba'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U02'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '420a36b5-92f7-4b29-85be-9b4546c77aac'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U03'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'cd3bed39-9e84-4b30-8604-4d2f42da4560'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U04'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  'f355624f-738d-4c2f-878d-f5bdf231c1f8'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U05'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  '75ca2691-3418-40bf-8f58-87051ae9c2ef'::uuid,
  (select id from booking_lines where client_uuid = '48852f7a-e236-46c7-8f7b-47f1521453ea'::uuid),
  (select id from product_units where asset_tag = 'EQ000239-U06'),
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  (select id from users where email = 'warehouse@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_crew_lines (
  client_uuid, booking_id, name, crew_role, day_rate, days, created_by
) values (
  'b04d19cc-be2c-4a66-8631-e9fba52f4f56'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Suman Tamang',
  'Camera Assistant'::crew_role,
  8000.00,
  3,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_crew_lines (
  client_uuid, booking_id, name, crew_role, day_rate, days, created_by
) values (
  'd05c5000-ff1f-4aac-8044-28c1dfc2d346'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Prakash Gurung',
  'Gaffer'::crew_role,
  8000.00,
  3,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_crew_lines (
  client_uuid, booking_id, name, crew_role, day_rate, days, created_by
) values (
  'c953cc9a-7c55-412b-8d04-904b2751a764'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  'Nabin Rai',
  'Grip'::crew_role,
  8000.00,
  3,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

-- Law 10. 7% is at or below the 10% threshold: no reason and no approver, which is what discount.ts returned.
insert into audit_events (
  client_uuid, event_class, category, module, action, severity, status,
  table_name, record_id, actor_id, actor_role, branch_id, reason
) values (
  '7cbc2d3d-fe29-4b0a-859f-275bcd8aa6ac'::uuid,
  'discount'::audit_event_class,
  'Finance'::audit_category,
  'Rentals'::audit_module,
  'Approve'::audit_action,
  'Informational'::audit_severity,
  'Success'::audit_status,
  'booking_discounts',
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator'::system_role,
  (select id from branches where branch_code = 'BR-KTM-01'),
  '7% applied — at or below the Law 10 approval threshold'
)
on conflict (client_uuid) do nothing;

insert into booking_discounts (
  client_uuid, booking_id, branch_id, discount_source, percent, reason, approver_id,
  applied_by, applied_at, audit_event_id
) values (
  '31e61469-66f1-41e0-8e7f-a9111966f7f0'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Manual'::discount_source,
  7.00,
  null,
  null,
  (select id from users where email = 'billing@babinrentals.com'),
  '2026-07-13T00:15:00.000Z'::timestamptz,
  (select id from audit_events where client_uuid = '7cbc2d3d-fe29-4b0a-859f-275bcd8aa6ac'::uuid)
)
on conflict (client_uuid) do nothing;

insert into invoices (
  client_uuid, invoice_no, booking_id, client_id, branch_id, status,
  issue_date, due_date, subtotal, discount_amount, discount_percent, discount_reason,
  discount_approved_by, taxable_amount, vat_rate, vat_amount, total_amount,
  paid_amount, outstanding_amount, created_by, updated_by
) values (
  'f9bc030e-b6b2-4004-8e24-2600df4460bf'::uuid,
  'INV-2026-0001',
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from clients where client_code = 'CL-2026-0034'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Sent'::invoice_status,
  date '2026-07-16',
  date '2026-07-26',
  132750.00,
  9293.00,
  7.00,
  null,
  null,
  123457.00,
  0.1300,
  16049.00,
  139506.00,
  0.00,
  139506.00,
  (select id from users where email = 'billing@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (invoice_no) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  'ce08bb7c-38b8-4870-8e33-61b5ab43127c'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'Sony FX9 Cinema Camera',
  1,
  3,
  6500.00,
  19500.00,
  10
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '41a3470f-a7b0-4aef-870a-6e2b27116939'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'Sony FX6 Cinema Camera',
  1,
  3,
  4500.00,
  13500.00,
  20
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '8585c23e-ab9e-4564-806b-a9653055f7f6'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'NISI Athena 35mm',
  4,
  3,
  1000.00,
  12000.00,
  30
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '0561b3ae-01d7-462a-8339-9018b393fd41'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'Aputure LS 600d Pro',
  2,
  3,
  1200.00,
  7200.00,
  40
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '4e0ff256-0723-4077-8fb3-a2f8cdb8e225'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'Matthews C-Stand 40in',
  4,
  3,
  150.00,
  1800.00,
  50
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  'f81fe0a1-d57e-411c-8c82-262910b6ab82'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Equipment Rental'::line_kind,
  'Manfrotto 504X Tripod System',
  6,
  3,
  375.00,
  6750.00,
  60
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '9b98f81c-74f1-4037-8797-039afc1589e1'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  'Crew Charges'::line_kind,
  'Crew — Camera Assistant, Gaffer, Grip',
  3,
  3,
  8000.00,
  72000.00,
  70
)
on conflict (client_uuid) do nothing;

-- The invoice_lines trigger (recalculate_invoice_totals(), 0010) has just
-- overwritten the four calculated columns with its own arithmetic: it rounds
-- to 2 decimal places rather than §2.4's "Half Up, applied at each displayed
-- step" (whole rupees), and it hardcodes 0.13 instead of reading
-- invoices.vat_rate. On this invoice that is the difference between the
-- engine's Rs 139506.00 and the trigger's own figure. The Financial Engine is
-- authoritative (Foundation §2.4, §2.8), so the engine's figures are restated
-- here. The NOTICE records the deviation at apply time rather than hiding it;
-- fixing the trigger belongs to Phase 1's "constraints and triggers" lines,
-- not to this seed.
do $$
declare
  v_trigger_total numeric(14,2);
begin
  select total_amount into v_trigger_total from invoices where invoice_no = 'INV-2026-0001';
  if v_trigger_total is distinct from 139506.00 then
    raise notice 'Seed %: recalculate_invoice_totals() produced a total of %, the Financial Engine produces %. Engine figure restated.',
      'INV-2026-0001', v_trigger_total, 139506.00;
  end if;
end $$;

update invoices set
  subtotal           = 132750.00,
  discount_amount    = 9293.00,
  taxable_amount     = 123457.00,
  vat_amount         = 16049.00,
  total_amount       = 139506.00,
  outstanding_amount = 139506.00 - paid_amount,
  updated_by         = (select id from users where email = 'billing@babinrentals.com')
where invoice_no = 'INV-2026-0001';

-- Law 5: deposits are liabilities. security_deposits is a separate account
-- from the invoice; nothing below touches total_amount or outstanding_amount,
-- and the assertion block at the foot of this file proves it.
insert into security_deposits (
  client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount, created_by, updated_by
) values (
  'f5e45dd2-c0f1-4d87-8473-68c371980bc1'::uuid,
  'DEP-2026-0001',
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from clients where client_code = 'CL-2026-0034'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  50000.00,
  (select id from users where email = 'billing@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (deposit_no) do nothing;

insert into deposit_movements (
  client_uuid, movement_no, security_deposit_id, movement_type, amount, bank_account_id, handled_by
) values (
  '41608181-7415-414d-808a-bea64cfe2dea'::uuid,
  'DEP-2026-0001-M1',
  (select id from security_deposits where deposit_no = 'DEP-2026-0001'),
  'Received'::deposit_movement_type,
  25000.00,
  (select id from bank_accounts where account_number = '01201017500001'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (movement_no) do nothing;

insert into payments (
  client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
  amount, payment_type, status, payment_date, bank_account_id, received_by
) values (
  'ac61f8b5-3f80-4059-8ed3-3d6cdbef0523'::uuid,
  'PAY-2026-0001',
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from invoices where invoice_no = 'INV-2026-0001'),
  (select id from clients where client_code = 'CL-2026-0034'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  15000.00,
  -- Law 5 again: a deposit is never a payment_type here; the schema forbids it.
  'Advance Payment'::payment_type,
  'Received'::payment_status,
  '2026-07-14T00:15:00.000Z'::timestamptz,
  (select id from bank_accounts where account_number = '01201017500001'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (payment_no) do nothing;

-- Status Engine: Quote → Booked → Packed. Forward-only,
-- no skipping, causal order — checked by workflow.ts at generation time and
-- again by apply_booking_stage_transition() (0021) when these rows land.
insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  'ac1143c6-9911-44ad-8c1b-9fe1172c6be2'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  null,
  'Quote'::booking_stage,
  '2026-07-13T00:15:00.000Z'::timestamptz,
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator',
  'seed'
)
on conflict (client_uuid) do nothing;

insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  '508f96be-0951-4c52-89f1-42de92ec3c6a'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Quote'::booking_stage,
  'Booked'::booking_stage,
  '2026-07-13T01:15:00.000Z'::timestamptz,
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator',
  'seed'
)
on conflict (client_uuid) do nothing;

insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  '331a34c2-86be-463e-8675-74d1ad2826fb'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0715'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Booked'::booking_stage,
  'Packed'::booking_stage,
  '2026-07-13T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'warehouse@babinrentals.com'),
  'Warehouse',
  'seed'
)
on conflict (client_uuid) do nothing;

-- -----------------------------------------------------------------------------
-- 4 · BK-2026-0716 — Kathmandu Valley — brand film
-- -----------------------------------------------------------------------------
-- 3 item(s) × 2 day(s), 0 crew.
-- Pickup renders as 17 Shrawan 2083 BS (Law 7 — derived, never stored).
-- Engine figures: subtotal Rs 17800.00 · discount 15% Rs 2670.00
--   · taxable Rs 15130.00 · VAT 13% Rs 1967.00
--   · rental total Rs 17097.00 · payments Rs 0.00
--   · outstanding Rs 17097.00
insert into bookings (
  client_uuid, booking_no, branch_id, client_id, project,
  pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
) values (
  '0b05117c-c369-40f2-8f53-e0da02cca2de'::uuid,
  'BK-2026-0716',
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from clients where client_code = 'CL-2026-0034'),
  'Kathmandu Valley — brand film',
  '2026-08-01T02:15:00.000Z'::timestamptz,
  '2026-08-03T02:15:00.000Z'::timestamptz,
  -- Sample Data.md: transport Rs 0 — the client collects. 'Customer Pickup' is
  -- the delivery_type enum member's own spelling (0001), not UI copy; Law 17
  -- governs what the screens say, and no screen renders this literal.
  'Customer Pickup'::delivery_type,
  0.00,
  (select id from users where email = 'billing@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (booking_no) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '760e4cec-171d-4378-81ed-544e7316bbb9'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0716'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000234'),
  'Sony FX9 Cinema Camera',
  1,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  2,
  6500.00,
  10,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  '80b730a3-a31e-44e0-87bc-ad4d84c38602'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0716'),
  'Equipment'::booking_line_type,
  (select id from products where asset_code = 'EQ000237'),
  'Aputure LS 600d Pro',
  2,
  -- Law 9: days is written explicitly on every priced line, never by omission.
  2,
  1200.00,
  20,
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (client_uuid) do nothing;

-- Law 10. 15% is above the 10% threshold, so the reason (>=10 chars) and the named approver below are what make this row legal — for anyone, Owner included.
insert into audit_events (
  client_uuid, event_class, category, module, action, severity, status,
  table_name, record_id, actor_id, actor_role, branch_id, reason
) values (
  '9cd77a8d-3079-4089-8535-1058c4accff3'::uuid,
  'discount'::audit_event_class,
  'Finance'::audit_category,
  'Rentals'::audit_module,
  'Approve'::audit_action,
  'Informational'::audit_severity,
  'Success'::audit_status,
  'booking_discounts',
  (select id from bookings where booking_no = 'BK-2026-0716'),
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator'::system_role,
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Repeat production house, three-booking package agreed for Shrawan'
)
on conflict (client_uuid) do nothing;

insert into booking_discounts (
  client_uuid, booking_id, branch_id, discount_source, percent, reason, approver_id,
  applied_by, applied_at, audit_event_id
) values (
  '480f1729-15b8-44d2-808c-c2fb68ec3053'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0716'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Manual'::discount_source,
  15.00,
  'Repeat production house, three-booking package agreed for Shrawan',
  (select id from users where email = 'manager@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com'),
  '2026-07-29T02:15:00.000Z'::timestamptz,
  (select id from audit_events where client_uuid = '9cd77a8d-3079-4089-8535-1058c4accff3'::uuid)
)
on conflict (client_uuid) do nothing;

insert into invoices (
  client_uuid, invoice_no, booking_id, client_id, branch_id, status,
  issue_date, due_date, subtotal, discount_amount, discount_percent, discount_reason,
  discount_approved_by, taxable_amount, vat_rate, vat_amount, total_amount,
  paid_amount, outstanding_amount, created_by, updated_by
) values (
  'b0fb4c96-a453-47f4-8f2c-a905508f623d'::uuid,
  'INV-2026-0002',
  (select id from bookings where booking_no = 'BK-2026-0716'),
  (select id from clients where client_code = 'CL-2026-0034'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Sent'::invoice_status,
  date '2026-08-01',
  date '2026-08-10',
  17800.00,
  2670.00,
  15.00,
  'Repeat production house, three-booking package agreed for Shrawan',
  (select id from users where email = 'manager@babinrentals.com'),
  15130.00,
  0.1300,
  1967.00,
  17097.00,
  0.00,
  17097.00,
  (select id from users where email = 'billing@babinrentals.com'),
  (select id from users where email = 'billing@babinrentals.com')
)
on conflict (invoice_no) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  'a68e458c-efbf-48e3-8edd-46028304a04d'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0002'),
  'Equipment Rental'::line_kind,
  'Sony FX9 Cinema Camera',
  1,
  2,
  6500.00,
  13000.00,
  10
)
on conflict (client_uuid) do nothing;

insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  '482b375a-ef42-4c4b-84e5-dc4d4b9b0890'::uuid,
  (select id from invoices where invoice_no = 'INV-2026-0002'),
  'Equipment Rental'::line_kind,
  'Aputure LS 600d Pro',
  2,
  2,
  1200.00,
  4800.00,
  20
)
on conflict (client_uuid) do nothing;

-- The invoice_lines trigger (recalculate_invoice_totals(), 0010) has just
-- overwritten the four calculated columns with its own arithmetic: it rounds
-- to 2 decimal places rather than §2.4's "Half Up, applied at each displayed
-- step" (whole rupees), and it hardcodes 0.13 instead of reading
-- invoices.vat_rate. On this invoice that is the difference between the
-- engine's Rs 17097.00 and the trigger's own figure. The Financial Engine is
-- authoritative (Foundation §2.4, §2.8), so the engine's figures are restated
-- here. The NOTICE records the deviation at apply time rather than hiding it;
-- fixing the trigger belongs to Phase 1's "constraints and triggers" lines,
-- not to this seed.
do $$
declare
  v_trigger_total numeric(14,2);
begin
  select total_amount into v_trigger_total from invoices where invoice_no = 'INV-2026-0002';
  if v_trigger_total is distinct from 17097.00 then
    raise notice 'Seed %: recalculate_invoice_totals() produced a total of %, the Financial Engine produces %. Engine figure restated.',
      'INV-2026-0002', v_trigger_total, 17097.00;
  end if;
end $$;

update invoices set
  subtotal           = 17800.00,
  discount_amount    = 2670.00,
  taxable_amount     = 15130.00,
  vat_amount         = 1967.00,
  total_amount       = 17097.00,
  outstanding_amount = 17097.00 - paid_amount,
  updated_by         = (select id from users where email = 'billing@babinrentals.com')
where invoice_no = 'INV-2026-0002';

-- Status Engine: Quote → Booked. Forward-only,
-- no skipping, causal order — checked by workflow.ts at generation time and
-- again by apply_booking_stage_transition() (0021) when these rows land.
insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  'adb2ec0a-cdb2-4d33-8bb7-05144f5394e3'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0716'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  null,
  'Quote'::booking_stage,
  '2026-07-29T02:15:00.000Z'::timestamptz,
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator',
  'seed'
)
on conflict (client_uuid) do nothing;

insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  '2201cdf0-c0e1-4b25-8429-e1ed8c34980a'::uuid,
  (select id from bookings where booking_no = 'BK-2026-0716'),
  (select id from branches where branch_code = 'BR-KTM-01'),
  'Quote'::booking_stage,
  'Booked'::booking_stage,
  '2026-07-29T03:15:00.000Z'::timestamptz,
  (select id from users where email = 'billing@babinrentals.com'),
  'Coordinator',
  'seed'
)
on conflict (client_uuid) do nothing;

-- -----------------------------------------------------------------------------
-- 5 · Number sequences — advanced past everything the corpus consumed
-- -----------------------------------------------------------------------------
-- Without this the next booking the app numbers would collide with a seeded
-- one. greatest() so a re-apply, or a sequence already ahead, is never rewound.
update number_sequences
   set current_value = greatest(current_value, 716), updated_at = now()
 where sequence_key = 'booking';
update number_sequences
   set current_value = greatest(current_value, 34), updated_at = now()
 where sequence_key = 'client';
update number_sequences
   set current_value = greatest(current_value, 1), updated_at = now()
 where sequence_key = 'deposit';
update number_sequences
   set current_value = greatest(current_value, 239), updated_at = now()
 where sequence_key = 'equipment';
update number_sequences
   set current_value = greatest(current_value, 2), updated_at = now()
 where sequence_key = 'invoice';
update number_sequences
   set current_value = greatest(current_value, 1), updated_at = now()
 where sequence_key = 'payment';

-- -----------------------------------------------------------------------------
-- 6 · Reconciliation assertions
-- -----------------------------------------------------------------------------
-- Foundation §2.8: "Any screen showing 1,39,208 / 1,24,208 / 91,550 / 1,08,548
-- / 58,548 is rendering superseded seed data and is a defect." These figures
-- are Sample Data.md's, not this generator's — the generator already refused
-- to emit unless money.ts reproduces them, so this block closes the loop by
-- checking the database agrees once every trigger has run.
do $$
declare
  v_subtotal    numeric(14,2);
  v_discount    numeric(14,2);
  v_taxable     numeric(14,2);
  v_vat         numeric(14,2);
  v_total       numeric(14,2);
  v_paid        numeric(14,2);
  v_outstanding numeric(14,2);
  v_status      invoice_status;
  v_lines       numeric(14,2);
  v_pending     numeric(14,2);
  v_stage       booking_stage;
  v_items       integer;
  v_units       integer;
begin
  select subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
         paid_amount, outstanding_amount, status
    into v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding, v_status
    from invoices where invoice_no = 'INV-2026-0001';

  if (v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding)
     is distinct from
     (132750.00, 9293.00, 123457.00, 16049.00, 139506.00, 15000.00, 124506.00) then
    raise exception 'Foundation §2.8 violated on %: got subtotal %, discount %, taxable %, VAT %, total %, paid %, outstanding %.',
      'INV-2026-0001', v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding;
  end if;

  if v_status is distinct from 'Partially Paid'::invoice_status then
    raise exception 'Payment sync failed: % is % after a part payment, expected Partially Paid.', 'INV-2026-0001', v_status;
  end if;

  select coalesce(sum(line_total), 0) into v_lines
    from invoice_lines where invoice_id = (select id from invoices where invoice_no = 'INV-2026-0001');
  if v_lines is distinct from v_subtotal then
    raise exception 'Invoice % does not reconcile: lines sum to % but subtotal is %.', 'INV-2026-0001', v_lines, v_subtotal;
  end if;

  -- Law 5. Rs 25000.00 of deposit has been received against this booking;
  -- outstanding must be untouched by it.
  select pending_amount into v_pending
    from security_deposits where booking_id = (select id from bookings where booking_no = 'BK-2026-0715');
  if v_pending is distinct from 25000.00 then
    raise exception 'Law 5: deposit pending on % is %, expected %.', 'BK-2026-0715', v_pending, 25000.00;
  end if;
  if v_outstanding is distinct from 124506.00 then
    raise exception 'Law 5: the deposit moved Rental Outstanding on % to %.', 'BK-2026-0715', v_outstanding;
  end if;

  -- The "21 items on an 18-item booking" defect, made detectable.
  select coalesce(sum(qty), 0) into v_items from booking_lines where booking_id = (select id from bookings where booking_no = 'BK-2026-0715');
  select count(*) into v_units
    from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
   where bl.booking_id = (select id from bookings where booking_no = 'BK-2026-0715');
  if v_items is distinct from 18 or v_units is distinct from 18 then
    raise exception 'Item invariant violated on %: % line items but % assigned units, expected % of each.',
      'BK-2026-0715', v_items, v_units, 18;
  end if;

  select stage into v_stage from bookings where booking_no = 'BK-2026-0715';
  if v_stage is distinct from 'Packed'::booking_stage then
    raise exception 'Stage machine: % is at %, the corpus put it at %.', 'BK-2026-0715', v_stage, 'Packed';
  end if;

  select stage into v_stage from bookings where booking_no = 'BK-2026-0716';
  if v_stage is distinct from 'Booked'::booking_stage then
    raise exception 'Stage machine: % is at %, the corpus put it at %.', 'BK-2026-0716', v_stage, 'Booked';
  end if;

  raise notice 'Seed corpus verified: % booking(s), Foundation §2.8 reconciles.', 2;
end $$;

commit;
