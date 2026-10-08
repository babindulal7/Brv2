-- =============================================================================
-- 0127_query_optimization_indexes.sql — Database Query Optimization Indexes
--
-- Performance Optimization Pass:
-- Adds essential B-tree indexes for foreign keys, sort orders, and lookup
-- queries identified across Rentals, Clients, Operations, and Finance modules.
--
-- Laws preserved:
--   - Strictly additive (CREATE INDEX IF NOT EXISTS).
--   - No constraints, tables, views, or triggers are altered.
--   - Full idempotency guaranteed.
-- =============================================================================

begin;

-- 1. Bookings lookups & default sorting
-- Accelerates client detail lookups: listBookings({ chips: { client_id } })
create index if not exists idx_bookings_client_id
  on public.bookings (client_id);

-- Accelerates default reverse-chronological sorting in RentalsList
create index if not exists idx_bookings_created_at_desc
  on public.bookings (created_at desc);

-- 2. Booking lines joins & sub-rental badge lookups
-- Foreign key index for lines belonging to a booking
create index if not exists idx_booking_lines_booking_id
  on public.booking_lines (booking_id);

-- Foreign key index for product lines
create index if not exists idx_booking_lines_product_id
  on public.booking_lines (product_id);

-- Partial composite index for fast sub-rental detection without sequential table scan
create index if not exists idx_booking_lines_subrental_lookup
  on public.booking_lines (booking_id, line_type)
  where voided_at is null;

-- 3. Product units scanner & barcode lookups
-- High-frequency barcode scanning in floor workspaces & modal
create index if not exists idx_product_units_barcode
  on public.product_units (barcode)
  where barcode is not null;

-- Serial number lookups in scanner & stock check
create index if not exists idx_product_units_serial_no
  on public.product_units (serial_no)
  where serial_no is not null;

-- Asset tag index for unit identification
create index if not exists idx_product_units_asset_tag
  on public.product_units (asset_tag);

-- 4. Clients fast directory search
-- Phone search in client combobox and directory
create index if not exists idx_clients_phone
  on public.clients (phone);

-- Email search in client combobox
create index if not exists idx_clients_email
  on public.clients (email)
  where email is not null;

-- 5. Invoices & Payments joins
-- Invoice lookup by booking in BookingDetail
create index if not exists idx_invoices_booking_id
  on public.invoices (booking_id);

-- Payment lookup by booking in BookingDetail
create index if not exists idx_payments_booking_id
  on public.payments (booking_id);

-- Sorted payment ledger
create index if not exists idx_payments_created_at_desc
  on public.payments (created_at desc);

-- 6. Operations & Reset queue
-- Booking lookup in reset queue (completeResetQueue)
create index if not exists idx_cleaning_queue_entries_booking_id
  on public.cleaning_queue_entries (booking_id);

-- Unit queue status in readOpenCleaning
create index if not exists idx_cleaning_queue_entries_unit_id
  on public.cleaning_queue_entries (unit_id);

commit;
