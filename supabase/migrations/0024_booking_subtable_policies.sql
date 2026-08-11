-- ============================================================================
-- 0024_booking_subtable_policies.sql
--
-- Second reviewed batch out of the 92-table RLS gap (§6.9/§6.10 in PLAN.md).
-- 0022 covered the branch/zone/role-lookup slice; this one covers five of
-- `bookings`' own child/lookup tables: `booking_line_units`, `booking_flags`,
-- `booking_documents`, `booking_notes`, `booking_client_state_map`.
--
-- `booking_discounts` — originally sorted "plain" in §6.10's first-pass sweep
-- — is deliberately NOT included here. It carries `percent`/`reason`/
-- `approver_id`, the same shape as `user_approval_authorities`
-- (`max_discount_pct`), which §6.10 *did* place in the money-adjacent bucket.
-- Treating one and not the other inconsistently would be worse than leaving
-- both for the same considered pass. Correcting §6.10's categorisation for
-- `booking_discounts` in the same edit that makes this observation.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · booking_line_units / booking_flags / booking_documents / booking_notes
--
-- All four are per-booking operational detail, written during the same
-- floor workflows (packing/handover/return) that already write
-- `booking_lines` itself. Mirroring `booking_lines_all`'s exact tier
-- (0018) rather than inventing a narrower one: `booking_line_units.packed`/
-- `packed_by` is set by Warehouse during packing, `booking_flags` records
-- Damaged/Missing observed on the floor, `booking_documents` links
-- documents produced in an operation session, `booking_notes` can be added
-- during the same floor work. None carries a money column — read is the
-- same broad `auth_is_staff()` `bookings_select` (0020) already uses.
-- ---------------------------------------------------------------------------

drop policy if exists booking_line_units_select on booking_line_units;
create policy booking_line_units_select on booking_line_units
  for select
  using (auth_is_staff());

drop policy if exists booking_line_units_all on booking_line_units;
create policy booking_line_units_all on booking_line_units
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists booking_flags_select on booking_flags;
create policy booking_flags_select on booking_flags
  for select
  using (auth_is_staff());

drop policy if exists booking_flags_all on booking_flags;
create policy booking_flags_all on booking_flags
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists booking_documents_select on booking_documents;
create policy booking_documents_select on booking_documents
  for select
  using (auth_is_staff());

drop policy if exists booking_documents_all on booking_documents;
create policy booking_documents_all on booking_documents
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists booking_notes_select on booking_notes;
create policy booking_notes_select on booking_notes
  for select
  using (auth_is_staff());

drop policy if exists booking_notes_all on booking_notes;
create policy booking_notes_all on booking_notes
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy booking_line_units_all on booking_line_units is
  'Same tier as booking_lines_all (0018) -- Warehouse packs/returns these directly.';
comment on policy booking_flags_all on booking_flags is
  'Same tier as booking_line_units_all -- flags are observed and cleared during floor work.';
comment on policy booking_documents_all on booking_documents is
  'Same tier as booking_line_units_all -- documents are produced inside operation sessions.';
comment on policy booking_notes_all on booking_notes is
  'Same tier as booking_line_units_all -- notes can originate from floor work, not just the desk.';

-- ---------------------------------------------------------------------------
-- 2 · booking_client_state_map
--
-- Unlike the four above, this is not per-booking data -- it has no
-- booking_id and no client_uuid column at all. It is a fixed, global lookup
-- (one row per booking_stage value) that the client portal's timeline reads
-- to translate an internal stage into what a client is allowed to see.
-- Structurally this is configuration, the same shape as branches/
-- warehouses/storage_zones (0022): every internal role needs to read it
-- (whatever resolves a client-facing state has to be able to look it up),
-- but changing the mapping itself changes what every client sees across the
-- whole system, so writes get the same `('Owner', 'Admin', 'Manager')` tier
-- 0022 used for structural changes, not the wider floor-inclusive tier
-- above.
-- ---------------------------------------------------------------------------

drop policy if exists booking_client_state_map_select on booking_client_state_map;
create policy booking_client_state_map_select on booking_client_state_map
  for select
  using (auth_is_staff());

drop policy if exists booking_client_state_map_manage on booking_client_state_map;
create policy booking_client_state_map_manage on booking_client_state_map
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy booking_client_state_map_select on booking_client_state_map is
  'Global stage-to-client-state lookup, not per-booking data -- config-shaped, same tier as branches/warehouses/storage_zones (0022).';

commit;
