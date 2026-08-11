-- ============================================================================
-- 0033_fleet_bundle_and_sequence_policies.sql
--
-- Eleventh reviewed batch out of the 92-table RLS gap (§6.9-§6.19 in
-- PLAN.md). This closes out the "plain" bucket entirely: recomputed the
-- exact remaining set mechanically (diffed every prior migration's real
-- `create policy ... on <table>` statements against the original 92,
-- rather than trust the running "≈N" estimates in PLAN.md, which had
-- drifted from the true count) and found 32 tables still uncovered, of
-- which 29 are already correctly bucketed as money-adjacent (22),
-- PII-masking-adjacent (1, `client_channel_identities`), the `portal_*`
-- auth path (3), or transitively blocked on the `items` decision (3,
-- `crew_documents`/`evidence_files`/`evidence_references`). The remaining
-- three are genuinely plain and simply never got a migration written for
-- them:
--
--   - `number_sequences` — corrected to "plain" back in §6.10 (a
--     document-numbering counter, not money) but never actually policed
--     in any subsequent batch. Closed here.
--   - `vehicles` — the fleet master record `vehicle_trip_logs` (0032)
--     already references. Same domain, same tier: mirrors
--     `vehicle_trip_logs_all` exactly (Driver included).
--   - `bundle_items` — bundle composition (qty/days per product in a
--     bundle). No money itself (`bundles` carries the price, still
--     money-adjacent), so it can be policed independently. Mirrors
--     `product_compatibilities_all` (0027) — same catalog-composition
--     shape.
--
-- With this migration, every table this thread's categorisation calls
-- "plain" has a real policy. What's left of the original 92 is entirely
-- the four deliberately-deferred buckets above.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · number_sequences
--
-- Shared document-numbering infrastructure (prefix, current_year,
-- current_value, padding) — no secret content, and legitimately advanced
-- by any staff action that creates a numbered document (invoice, PO,
-- booking reference). No reason to restrict who can read or advance it the
-- way branches/webhooks restrict who edits structural config.
-- ---------------------------------------------------------------------------

drop policy if exists number_sequences_select on number_sequences;
create policy number_sequences_select on number_sequences
  for select
  using (auth_is_staff());

drop policy if exists number_sequences_all on number_sequences;
create policy number_sequences_all on number_sequences
  for all
  using (auth_is_staff())
  with check (auth_is_staff());

comment on policy number_sequences_all on number_sequences is
  'Deliberately broader than most write policies in this thread -- a shared counter every staff role legitimately advances by creating documents, not structural config only admins edit.';

-- ---------------------------------------------------------------------------
-- 2 · vehicles — mirrors vehicle_trip_logs_all (0032) exactly
-- ---------------------------------------------------------------------------

drop policy if exists vehicles_select on vehicles;
create policy vehicles_select on vehicles
  for select
  using (auth_is_staff());

drop policy if exists vehicles_all on vehicles;
create policy vehicles_all on vehicles
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Driver'));

-- ---------------------------------------------------------------------------
-- 3 · bundle_items — mirrors product_compatibilities_all (0027)
-- ---------------------------------------------------------------------------

drop policy if exists bundle_items_select on bundle_items;
create policy bundle_items_select on bundle_items
  for select
  using (auth_is_staff());

drop policy if exists bundle_items_all on bundle_items;
create policy bundle_items_all on bundle_items
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

commit;
