-- ============================================================================
-- 0031_cleaning_and_comms_policies.sql
--
-- Ninth reviewed batch out of the 92-table RLS gap (§6.9-§6.17 in PLAN.md).
-- Two groups: the cleaning/reset floor workflow, and the notifications/
-- comms/automation-log family. `notifications` is the first table in this
-- whole thread to actually need the self-row-scoping shape flagged as a
-- future need back in §6.10 (for `timesheets`/`signatures`) — implemented
-- here for real, against `users_select_own`'s exact pattern (0020).
--
-- Also fixes a fourth phantom-table reference, found while scoping this
-- batch: `category_checklist_tasks.category_id` declared `references
-- categories (id)` — "categories" was never a real table (confirmed by
-- grep, zero `create table categories` anywhere). Unlike `items` (§4.11,
-- genuinely ambiguous between two real candidates), this one has exactly
-- one plausible target — `inventory_categories`, the only category-shaped
-- table in the schema, already created earlier in the same file
-- (`0004_inventory.sql`) — so it's fixed directly, the same mechanical
-- rename `assets`→`product_units`/`documents`→`document_registry` got in
-- §4.10, not a new product decision. See `0004_inventory.sql`'s deferred
-- cross-file foreign key section for the actual fix.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Cleaning/reset floor workflow
--
-- Same domain as the operation-session tables in 0026: Warehouse performs
-- the actual cleaning/reset work, so this mirrors operation_sessions_all's
-- tier (0018) rather than the plain auth_is_staff()-only tables elsewhere
-- in this migration. `category_checklist_tasks` is the checklist
-- *definition* (which tasks exist per category/mode) rather than a
-- per-unit result, so its write tier is the tighter
-- `('Owner', 'Admin', 'Manager')` config tier instead — Warehouse performs
-- the checklist, it doesn't define what's on it.
-- ---------------------------------------------------------------------------

drop policy if exists cleaning_queue_entries_select on cleaning_queue_entries;
create policy cleaning_queue_entries_select on cleaning_queue_entries
  for select
  using (auth_is_staff());

drop policy if exists cleaning_queue_entries_all on cleaning_queue_entries;
create policy cleaning_queue_entries_all on cleaning_queue_entries
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists cleaning_task_results_select on cleaning_task_results;
create policy cleaning_task_results_select on cleaning_task_results
  for select
  using (auth_is_staff());

drop policy if exists cleaning_task_results_all on cleaning_task_results;
create policy cleaning_task_results_all on cleaning_task_results
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse'));

drop policy if exists category_checklist_tasks_select on category_checklist_tasks;
create policy category_checklist_tasks_select on category_checklist_tasks
  for select
  using (auth_is_staff());

drop policy if exists category_checklist_tasks_manage on category_checklist_tasks;
create policy category_checklist_tasks_manage on category_checklist_tasks
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- ---------------------------------------------------------------------------
-- 2 · notifications — self-row-scoped
--
-- Each row is one person's notification (user_id not null). A blanket
-- auth_is_staff() read, the default everywhere else in this thread, would
-- let any staff session read every OTHER user's notifications too --
-- clearly wrong for what is inherently personal inbox data. Reuses
-- users_select_own's exact self-lookup expression (0020) rather than
-- inventing a second idiom, plus an Owner/Admin oversight carve-out.
-- INSERT is broad (auth_is_staff()) because a notification is routinely
-- created by one person's action for a DIFFERENT person (e.g. a
-- Coordinator's booking edit notifies Warehouse) -- restricting insert to
-- self would break that. No DELETE policy -- Law 3, nothing is deleted;
-- update (marking read) is the only mutation a recipient makes.
-- ---------------------------------------------------------------------------

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert
  with check (auth_is_staff());

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin')
  )
  with check (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
    or auth_user_role() in ('Owner', 'Admin')
  );

comment on policy notifications_select on notifications is
  'Self-row-scoped, same pattern as users_select_own (0020) -- personal inbox data, not staff-broad like everything else policed in this thread. First table in this thread to actually need this shape (flagged since §6.10 for timesheets/signatures, not yet implemented there).';

-- ---------------------------------------------------------------------------
-- 3 · Comms / automation logs — staff-readable, admin-managed
-- ---------------------------------------------------------------------------

drop policy if exists message_logs_select on message_logs;
create policy message_logs_select on message_logs
  for select
  using (auth_is_staff());

drop policy if exists message_logs_manage on message_logs;
create policy message_logs_manage on message_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists broadcast_batches_select on broadcast_batches;
create policy broadcast_batches_select on broadcast_batches
  for select
  using (auth_is_staff());

drop policy if exists broadcast_batches_manage on broadcast_batches;
create policy broadcast_batches_manage on broadcast_batches
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists automation_logs_select on automation_logs;
create policy automation_logs_select on automation_logs
  for select
  using (auth_is_staff());

drop policy if exists automation_logs_manage on automation_logs;
create policy automation_logs_manage on automation_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

comment on policy automation_logs_manage on automation_logs is
  'Mirrors automation_rules'' tier (0029) -- automation_logs.rule_id references it directly.';

-- ---------------------------------------------------------------------------
-- 4 · backup_logs — tighter, same reasoning as webhooks (0029)
--
-- storage_location/checksum_sha256 describe backup infrastructure; nothing
-- in this row is useful to non-admin staff. Owner/Admin only, no Manager --
-- same narrow tier as webhooks, not the general config tier.
-- ---------------------------------------------------------------------------

drop policy if exists backup_logs_select on backup_logs;
create policy backup_logs_select on backup_logs
  for select
  using (auth_user_role() in ('Owner', 'Admin'));

drop policy if exists backup_logs_manage on backup_logs;
create policy backup_logs_manage on backup_logs
  for all
  using (auth_user_role() in ('Owner', 'Admin'))
  with check (auth_user_role() in ('Owner', 'Admin'));

commit;
