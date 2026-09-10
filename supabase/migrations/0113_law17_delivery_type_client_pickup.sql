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

alter type delivery_type rename value 'Customer Pickup' to 'Client Pickup';

commit;
