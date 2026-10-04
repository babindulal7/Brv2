-- =============================================================================
-- Migration 0113: Law 17 in the database — delivery_type Client Pickup
--
-- Audit §8: the enum still carries 'Customer Pickup'; the app's CLIENT_PICKUP
-- constant in createRental.ts was the only place the boundary was written down.
-- Law 17: the word appears nowhere.
--
-- Ruled exception to N-6 (R-33/R-38): alter type ... rename value rewrites the
-- catalog, not the rows.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'delivery_type' and e.enumlabel = 'Customer Pickup'
  ) then
    alter type delivery_type rename value 'Customer Pickup' to 'Client Pickup';
  end if;
end $$;

commit;
