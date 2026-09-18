-- =============================================================================
-- 0126_performance_indexes.sql — Database Indexing Optimization
--
-- Adds targeted B-tree indexes for foreign keys, join relationships, and hot
-- query paths identified in the system-wide performance audit.
--
-- Laws preserved:
--   - All operations are strictly additive (CREATE INDEX IF NOT EXISTS).
--   - No constraints, tables, views, or triggers are altered.
--   - Full idempotency guaranteed.
-- =============================================================================

begin;

-- 1. Unit Status Engine & Availability Checks
-- Accelerates trigger lookups in 0114_unit_status_engine (blu.asset_id = p_asset_id)
create index if not exists idx_booking_line_units_asset
  on public.booking_line_units (asset_id)
  where asset_id is not null;

-- 2. Inventory Reservations
-- Accelerates reservation lookups and releases by booking
create index if not exists idx_inventory_reservations_booking
  on public.inventory_reservations (booking_id);

create index if not exists idx_inventory_reservations_booking_line
  on public.inventory_reservations (booking_line_id);

-- 3. Operations Workspaces & Movement Ledger
-- Eliminates sequential table scans when loading warehouse session workspaces
create index if not exists idx_session_line_movements_session
  on public.session_line_movements (session_id);

create index if not exists idx_session_line_movements_booking_line
  on public.session_line_movements (booking_line_id);

create index if not exists idx_session_line_movements_unit
  on public.session_line_movements (unit_id)
  where unit_id is not null;

create index if not exists idx_packing_lines_session
  on public.packing_lines (session_id);

create index if not exists idx_return_lines_session
  on public.return_lines (session_id)
  where session_id is not null;

create index if not exists idx_handover_lines_completed_session
  on public.handover_lines (completed_session_id)
  where completed_session_id is not null;

create index if not exists idx_handover_lines_first_session
  on public.handover_lines (first_session_id)
  where first_session_id is not null;

-- 4. Client Directory & Contacts
-- Standard btree index on client_contacts for parent lookups
create index if not exists idx_client_contacts_client
  on public.client_contacts (client_id);

-- Speeds up alphabetical sorting and directory searching
create index if not exists idx_clients_name
  on public.clients (name);

-- Speeds up filtering by client status (Active vs Deactivated)
create index if not exists idx_clients_status
  on public.clients (status);

-- 5. Booking Line Hierarchy
-- Accelerates bundle child line resolution
create index if not exists idx_booking_lines_parent
  on public.booking_lines (parent_line_id)
  where parent_line_id is not null;

-- 6. Operations & Today Active Booking Paths
-- Partial composite indexes for operational date & stage queries
create index if not exists idx_bookings_active_pickup
  on public.bookings (stage, pickup_at)
  where cancelled_at is null;

create index if not exists idx_bookings_active_return
  on public.bookings (stage, return_at)
  where cancelled_at is null;

commit;
