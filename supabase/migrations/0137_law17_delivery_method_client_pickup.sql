-- =============================================================================
-- Migration 0137: Law 17 in the database — delivery_method Client Pickup
--
-- BUG (live, 28 Sep 2026): Confirm Handover fails with
--   `[DataAccess] Insert failed on operation_sessions: invalid input value for
--    enum delivery_method: "Client Pickup"`
--
-- Root cause: floorVerb.ts:1112 writes `booking.delivery_type` into
-- `operation_sessions.delivery_method`. 0113 renamed `delivery_type`'s member
-- to 'Client Pickup', so the booking row now carries 'Client Pickup' — but the
-- sibling `delivery_method` enum (0001:33) was never renamed and still holds
-- 'Customer Pickup'. Every write except 'Client Pickup' passed the enum cast
-- (the 0113 test only exercised 'Babin Delivery'), which is why only a Client
-- Pickup handover broke.
--
-- Ruled exception to N-6 (R-33/R-38), same as 0113: alter type ... rename value
-- rewrites the catalog, not the rows. The 0003 check constraints that name the
-- member literally (operation_sessions_pickup_person_method :95,
-- operation_sessions_address_not_on_customer_pickup :107) store enum OIDs, so
-- they follow the rename — verified on PGlite: post-rename they deparse as
-- 'Client Pickup'::delivery_method, existing rows relabel in place, a pickup
-- with an address is still rejected, and 'Customer Pickup' is unrepresentable.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'delivery_method' and e.enumlabel = 'Customer Pickup'
  ) then
    alter type delivery_method rename value 'Customer Pickup' to 'Client Pickup';
  end if;
end $$;

commit;
