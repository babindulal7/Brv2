-- ============================================================================
-- 0030_crew_scheduling_and_document_registry_policies.sql
--
-- Eighth reviewed batch out of the 92-table RLS gap (§6.9-§6.16 in PLAN.md).
-- Two unrelated groups, batched together because both turned out small
-- after excluding blocked/money-adjacent tables:
--
--   A. Crew scheduling: `crew_skills`, `crew_shoot_days`, `crew_leaves` —
--      desk/coordination data (who can do what, who's on a shoot day,
--      who's unavailable), not floor-scan work.
--      `crew_equipment_assignments` IS floor-touched (Warehouse hands
--      equipment to crew, `released_by` records who took it back), so it
--      gets Warehouse added.
--      `crew_documents`, the fifth sibling, is NOT included — it has
--      `evidence_file_id not null references evidence_files (id)`, and
--      `evidence_files` itself cannot be created in a real deploy today
--      (its own `matched_item_id` dangles to the phantom `items` table —
--      §4.11). A policy on a table that can't exist yet is premature;
--      transitively blocked, not forgotten.
--   B. `document_registry`/`document_deliveries` — the central document
--      store `booking_documents`/`client_tax_profiles`/`client_documents`
--      (0024/0025) already reference, but which itself has had zero
--      policy this whole time. Same class of gap as `products`' missing
--      write policies (§6.14): dependents were policed before the table
--      they depend on was. Mirrors `booking_documents_all`'s tier (0024)
--      since documents are generated during the same booking workflow,
--      including floor sessions.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A · Crew scheduling
-- ---------------------------------------------------------------------------

drop policy if exists crew_skills_select on crew_skills;
create policy crew_skills_select on crew_skills
  for select
  using (auth_is_staff());

drop policy if exists crew_skills_all on crew_skills;
create policy crew_skills_all on crew_skills
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

drop policy if exists crew_shoot_days_select on crew_shoot_days;
create policy crew_shoot_days_select on crew_shoot_days
  for select
  using (auth_is_staff());

drop policy if exists crew_shoot_days_all on crew_shoot_days;
create policy crew_shoot_days_all on crew_shoot_days
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

drop policy if exists crew_leaves_select on crew_leaves;
create policy crew_leaves_select on crew_leaves
  for select
  using (auth_is_staff());

drop policy if exists crew_leaves_all on crew_leaves;
create policy crew_leaves_all on crew_leaves
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

drop policy if exists crew_equipment_assignments_select on crew_equipment_assignments;
create policy crew_equipment_assignments_select on crew_equipment_assignments
  for select
  using (auth_is_staff());

drop policy if exists crew_equipment_assignments_all on crew_equipment_assignments;
create policy crew_equipment_assignments_all on crew_equipment_assignments
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy crew_equipment_assignments_all on crew_equipment_assignments is
  'Warehouse included, unlike its three siblings above -- this is floor equipment handout, released_by records who physically took gear back.';

-- ---------------------------------------------------------------------------
-- B · document_registry / document_deliveries
-- ---------------------------------------------------------------------------

drop policy if exists document_registry_select on document_registry;
create policy document_registry_select on document_registry
  for select
  using (auth_is_staff());

drop policy if exists document_registry_all on document_registry;
create policy document_registry_all on document_registry
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy document_registry_all on document_registry is
  'Was uncovered despite booking_documents/client_tax_profiles/client_documents already referencing it (0024/0025) -- mirrors booking_documents_all''s tier.';

drop policy if exists document_deliveries_select on document_deliveries;
create policy document_deliveries_select on document_deliveries
  for select
  using (auth_is_staff());

drop policy if exists document_deliveries_all on document_deliveries;
create policy document_deliveries_all on document_deliveries
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

commit;
