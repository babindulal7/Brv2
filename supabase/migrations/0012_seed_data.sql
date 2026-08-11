-- =============================================================================
-- 0012_seed_data.sql — initial seed data
--
-- Inserts foundational records:
--   * Headquarter & Branch setup (Kathmandu Main & Pokhara)
--   * Warehouses & Storage Zones
--   * Standard Number Sequences
--   * System Roles & Admin Superuser
--   * Primary Bank Accounts & Digital Wallets
--   * Current Nepali Fiscal Year (FY 2083/84)
--   * Standard Expense Categories & Tax Groups
--   * Equipment Categories & Top Products
-- =============================================================================

begin;

-- =============================================================================
-- 1. Number Sequences Seed
-- =============================================================================
insert into number_sequences (sequence_key, prefix, current_year, current_value, padding)
values
  ('booking', 'BK-', 2026, 0, 4),
  ('client', 'CL-', 2026, 0, 4),
  ('invoice', 'INV-', 2026, 0, 4),
  ('payment', 'PAY-', 2026, 0, 4),
  ('deposit', 'DEP-', 2026, 0, 4),
  ('expense', 'EXP-', 2026, 0, 4),
  ('equipment', 'EQ', 2026, 0, 6)
on conflict (sequence_key) do nothing;


-- =============================================================================
-- 2. Branches Seed
-- =============================================================================
insert into branches (id, client_uuid, branch_code, name, address, phone, email, pan_vat_no, is_headquarters, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'BR-KTM-01', 'Kathmandu Main HQ', 'Anamnagar, Kathmandu, Nepal', '+977-1-4770000', 'hq@babinrentals.com', '623587106', true, true),
  ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'BR-PKR-01', 'Pokhara Branch', 'Lakeside, Pokhara, Nepal', '+977-61-530000', 'pokhara@babinrentals.com', '623587106', false, true)
on conflict (branch_code) do nothing;


-- =============================================================================
-- 3. Warehouses & Storage Zones Seed
-- =============================================================================
insert into warehouses (id, client_uuid, warehouse_code, branch_id, name, address, status, is_primary, is_active)
values
  ('00000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000011', 'WH-KTM-MAIN', '00000000-0000-0000-0000-000000000001', 'Central Camera Vault', 'Anamnagar, Kathmandu', 'Active', true, true),
  ('00000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000012', 'WH-PKR-MAIN', '00000000-0000-0000-0000-000000000002', 'Lakeside Equipment Hub', 'Lakeside, Pokhara', 'Active', true, true)
on conflict (warehouse_code) do nothing;

insert into storage_zones (id, client_uuid, warehouse_id, code, name, level, description, is_active)
values
  ('00000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'ZONE-CAM-A', 'Cinema Cameras Room A', 'Room', 'High-end cinema camera bodies', true),
  ('00000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000011', 'ZONE-LENS-B', 'Cine Optics Rack B', 'Rack', 'Prime and zoom cinema lenses', true),
  ('00000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000011', 'ZONE-GRIP-C', 'Heavy Grip & Lighting Bay', 'Zone', 'Aputure, Arri, C-Stands, Jibs', true)
on conflict (client_uuid) do nothing;


-- =============================================================================
-- 4. Initial Users Seed
-- =============================================================================
insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, department, branch_id, warehouse_id, is_active)
values
  ('00000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000101', 'EMP-001', 'owner@babinrentals.com', 'Babin Shrestha', '+977-9800000001', 'Owner', 'Executive', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', true),
  ('00000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000102', 'EMP-002', 'manager@babinrentals.com', 'Operations Manager', '+977-9800000002', 'Manager', 'Operations', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', true),
  ('00000000-0000-0000-0000-000000000103', 'd0000000-0000-0000-0000-000000000103', 'EMP-003', 'warehouse@babinrentals.com', 'Senior Gear Tech', '+977-9800000003', 'Warehouse', 'Warehouse', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', true),
  ('00000000-0000-0000-0000-000000000104', 'd0000000-0000-0000-0000-000000000104', 'EMP-004', 'billing@babinrentals.com', 'Rental Billing Officer', '+977-9800000004', 'Billing', 'Finance', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', true)
on conflict (email) do nothing;


-- =============================================================================
-- 5. Fiscal Year Seed (Nepali FY 2083/84)
-- =============================================================================
insert into fiscal_periods (id, client_uuid, fiscal_year_bs, start_date_ad, end_date_ad, is_closed)
values
  ('00000000-0000-0000-0000-000000000201', 'e0000000-0000-0000-0000-000000000201', '2083/84', '2026-07-16', '2027-07-15', false)
on conflict (fiscal_year_bs) do nothing;


-- =============================================================================
-- 6. Bank Accounts Seed
-- =============================================================================
insert into bank_accounts (id, client_uuid, account_name, bank_name, account_number, branch_name, channel_group, is_primary, is_active)
values
  ('00000000-0000-0000-0000-000000000301', 'f0000000-0000-0000-0000-000000000301', 'Babin Rentals Pvt. Ltd.', 'Nabil Bank Ltd.', '01201017500001', 'Anamnagar', 'Bank', true, true),
  ('00000000-0000-0000-0000-000000000302', 'f0000000-0000-0000-0000-000000000302', 'Babin Rentals Corporate', 'eSewa Digital Wallet', '9800000001', 'Merchant Portal', 'Digital wallets', false, true)
on conflict (account_number) do nothing;


-- =============================================================================
-- 7. Operating Expense Categories Seed
-- =============================================================================
insert into expense_categories (id, client_uuid, code, name, description, is_active)
values
  ('00000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000401', 'EXP-MAINT', 'Equipment Maintenance & Repair', 'Vendor repairs, sensor cleaning, parts', true),
  ('00000000-0000-0000-0000-000000000402', '10000000-0000-0000-0000-000000000402', 'EXP-FUEL', 'Vehicle Fuel & Transport', 'Diesel, petrol, delivery tolls', true),
  ('00000000-0000-0000-0000-000000000403', '10000000-0000-0000-0000-000000000403', 'EXP-SUBRENT', 'Sub-Rental Cross-Hire Outflow', 'Equipment hired in from partner rental houses', true),
  ('00000000-0000-0000-0000-000000000404', '10000000-0000-0000-0000-000000000404', 'EXP-UTIL', 'Office & Warehouse Utilities', 'Electricity, internet, studio rent', true)
on conflict (code) do nothing;


-- =============================================================================
-- 8. Equipment Categories Seed
--
-- Fixed 10 Aug 2026 (first real apply attempt): the original insert targeted
-- `equipment_categories` — a table that has never existed in this schema
-- (`inventory_categories`, 0004, is the real one — the same phantom-name bug
-- class as assets/documents/categories/items, PLAN.md §4.10/§4.11/§6.27, this
-- time on an INSERT target the FK sweep couldn't see). The real table has
-- `code` (unique text) not `slug`, and `name` is the `product_category` ENUM
-- (0001), so the five free-text names are remapped to the enum's own locked
-- labels — "Grip & Support" splits into the enum's two distinct labels rather
-- than losing one, with the description divided to match.
-- =============================================================================
insert into inventory_categories (id, client_uuid, code, name, description, sort_order, is_active)
values
  ('00000000-0000-0000-0000-000000000501', '20000000-0000-0000-0000-000000000501', 'camera', 'Camera', 'Cinema & Mirrorless Cameras', 1, true),
  ('00000000-0000-0000-0000-000000000502', '20000000-0000-0000-0000-000000000502', 'lens', 'Lens', 'Cinema Primes, Zooms, Anamorphic', 2, true),
  ('00000000-0000-0000-0000-000000000503', '20000000-0000-0000-0000-000000000503', 'lighting', 'Lighting', 'Continuous LED, COB, Softboxes', 3, true),
  ('00000000-0000-0000-0000-000000000504', '20000000-0000-0000-0000-000000000504', 'audio', 'Audio', 'Wireless Mics, Boom, Field Recorders', 4, true),
  ('00000000-0000-0000-0000-000000000505', '20000000-0000-0000-0000-000000000505', 'grip', 'Grip', 'C-Stands, Jibs, Heavy Grip', 5, true),
  ('00000000-0000-0000-0000-000000000506', '20000000-0000-0000-0000-000000000506', 'support', 'Support', 'Tripods, Gimbals, Sliders', 6, true)
on conflict (code) do nothing;

commit;
