-- ============================================================================
-- 0026_operation_session_line_policies.sql
--
-- Fourth reviewed batch out of the 92-table RLS gap (§6.9-§6.12 in PLAN.md).
-- Same pattern as `0024`/`0025`: mirror an already-decided parent tier
-- rather than invent one. `operation_sessions_all` (0018, current/live
-- version -- NOT the aspirational Technician-inclusive one some comments in
-- 0014 describe but never actually wired into this policy) is
-- `('Owner', 'Admin', 'Manager', 'Warehouse')`. Applied here, unchanged, to
-- six tables that are all per-session floor-operational detail:
-- `session_line_movements`, `packing_lines`, `handover_lines`,
-- `return_lines`, `scan_events`, `scan_sync_conflicts`.
--
-- Deliberately NOT extended to include Technician here, even though 0014's
-- own comments say "return triage is SHARED -- Warehouse and Technician can
-- both act": that gap already exists on `operation_sessions` itself and is
-- already tracked (PLAN.md §6.8's "21 of 32 0011 policies still not
-- retrofitted" item, and 0014's own TODO(decision) on `auth_is_staff()`).
-- Copying the parent's actual current tier here is staying consistent with
-- what is actually enacted; fixing the Technician gap is that separate,
-- already-logged item's job, not this migration's.
--
-- `return_accessory_checks`, the seventh table in this same file
-- (0003_operations.sql) next to these six, is NOT included -- it carries
-- `replacement_cost numeric(14,2)`, and its own column comment already
-- states the exact Law-6 gate needed: "Writable by Owner, Manager or
-- Billing only and hidden from Warehouse entirely." That is a column-mask
-- case (the same shape 0019 handles for money), not a plain policy, so it
-- stays in the money-adjacent bucket for that pass.
-- ============================================================================

begin;

drop policy if exists session_line_movements_select on session_line_movements;
create policy session_line_movements_select on session_line_movements
  for select
  using (auth_is_staff());

drop policy if exists session_line_movements_all on session_line_movements;
create policy session_line_movements_all on session_line_movements
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists packing_lines_select on packing_lines;
create policy packing_lines_select on packing_lines
  for select
  using (auth_is_staff());

drop policy if exists packing_lines_all on packing_lines;
create policy packing_lines_all on packing_lines
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists handover_lines_select on handover_lines;
create policy handover_lines_select on handover_lines
  for select
  using (auth_is_staff());

drop policy if exists handover_lines_all on handover_lines;
create policy handover_lines_all on handover_lines
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists return_lines_select on return_lines;
create policy return_lines_select on return_lines
  for select
  using (auth_is_staff());

drop policy if exists return_lines_all on return_lines;
create policy return_lines_all on return_lines
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists scan_events_select on scan_events;
create policy scan_events_select on scan_events
  for select
  using (auth_is_staff());

drop policy if exists scan_events_all on scan_events;
create policy scan_events_all on scan_events
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists scan_sync_conflicts_select on scan_sync_conflicts;
create policy scan_sync_conflicts_select on scan_sync_conflicts
  for select
  using (auth_is_staff());

drop policy if exists scan_sync_conflicts_all on scan_sync_conflicts;
create policy scan_sync_conflicts_all on scan_sync_conflicts
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

comment on policy session_line_movements_all on session_line_movements is
  'Mirrors operation_sessions_all (0018) exactly -- this and the other five tables here are all per-session floor detail, not a new tier.';

commit;
