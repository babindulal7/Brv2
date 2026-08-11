-- ============================================================================
-- 0046_law4_payment_and_audit_immutability_backstops.sql — generated 11 Aug 2026
-- (written as 0045, renumbered on collision: a concurrent session took 0045
--  for reservation_capacity_ceiling. Nothing here depends on that file.)
-- (PLAN.md Phase 1 audit, checklist item: "Triggers: payment immutability,
--  audit append-only, forward-only stages, causal order". Forward-only stages
--  and causal order are genuinely triggers already — apply_booking_stage_
--  transition() / trg_apply_booking_stage_transition, 0021:95-183. The other
--  two were not triggers at all; they are written here.)
--
-- WHY — payment immutability was a revoke, not a trigger
-- ------------------------------------------------------
-- 0006:173-174 states, above `create table payments`: "Immutable payment
-- ledger entries (Law 4). UPDATE and DELETE are prohibited by database
-- triggers and revocations." Only the revocations were ever written
-- (0006:537-562). Grepped every migration file: the sole trigger on `payments` is
-- `trg_audit_payments after insert` (0010:116), and `trg_sync_payments after
-- insert` (0010:282). Nothing fires on UPDATE or DELETE.
--
-- The one real immutability trigger in 0006 is for invoices, not payments:
-- reject_invoice_edit_after_issue() / trg_invoices_immutable_once_issued
-- (0006:487-531).
--
-- WHY — audit append-only was a revoke, not a trigger
-- ----------------------------------------------------
-- Identically, 0007:234-235 states above `create table audit_events`:
-- "Centralized append-only audit trail (Law 3, Law 4). UPDATE and DELETE are
-- prohibited on this table." Enforced only by `revoke update on audit_events,
-- backup_logs` and the delete revoke (0007:401-421). No trigger exists.
--
-- WHY A REVOKE IS NOT ENOUGH — the same argument 0044 made for law 3
-- -------------------------------------------------------------------
-- A revoke binds role grants and nothing else. It does not bind the table
-- owner, which keeps every privilege regardless, and it does not bind
-- `service_role`, a documented writer on this schema (0040:60-68) that
-- bypasses RLS and grants by Supabase design. PLAN.md §5 says flatly
-- "Never: a DELETE; an UPDATE on payments or audit", and the Phase 1 gate
-- says "no path updates a payment" — a BEFORE trigger is the only mechanism
-- that makes that true for every role, which is exactly what 0006:172 and
-- 0007:235 already claimed was in place.
--
-- NOTHING IS BROKEN BY THIS — verified, not assumed
-- --------------------------------------------------
-- No UPDATE or DELETE statement against payments, payment_reversals,
-- audit_events or backup_logs exists anywhere: not in any migration file (no
-- `update <table>`, no `delete from <table>`, no `on conflict ... do update`),
-- not in `src/` (the Booqable bridge reads payments and payment_reversals with
-- `.select()` only and is explicitly insert-only by its own comments —
-- src/lib/booqable/sync.ts:1386, :1441), and there is no UPDATE policy on any
-- of the four. log_audit_event() (0010:19-105) only ever INSERTs, so the audit
-- trail keeps writing normally.
--
-- Nor does payment_status need an UPDATE path: 'Refunded' has a matching
-- payment_type 'Refund' (0001:1021-1025), so a refund is a new row, and a
-- mistaken payment takes a payment_reversals row (0006:209-229). Law 4's
-- correction mechanism is a row, never an edit.
--
-- REUSES 0044's two functions rather than defining near-duplicates:
-- reject_update_append_only(text) and reject_delete_nothing_is_deleted(text)
-- (0044:105-202). Both are already documented as the generic law 3/4
-- backstops and take the table's own correction path as TG_ARGV[0].
--
-- FORWARD-ONLY, not an edit to 0006/0007 — the same choice 0015, 0021, 0043
-- and 0044 made for defects found in the original schema files.
--
-- FILE ONLY — never applied to any live Supabase project (repo hard rule).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 ▸ law 4 · payments are immutable for every role, including the table
--     owner and service_role. Correction is a payment_reversals row
--     referencing the original — 0006:208-209, law 4 verbatim.
-- ---------------------------------------------------------------------------
create trigger trg_payments_reject_update
  before update on payments
  for each row execute function reject_update_append_only('insert a payment_reversals row referencing this payment');

create trigger trg_payments_reject_delete
  before delete on payments
  for each row execute function reject_delete_nothing_is_deleted('Reverse — insert a payment_reversals row referencing this payment');


-- ---------------------------------------------------------------------------
-- 2 ▸ law 4 · a reversal row is the correction record for a payment, so it
--     needs the same protection the payment has. An editable reversal makes
--     the correction itself forgeable, which defeats the mechanism law 4
--     names. 0006:555-562 already revokes UPDATE on it for the app roles;
--     this is the owner/service_role backstop.
--
--     No further correction path is asserted here, because the schema does not
--     define one and inventing it would be a product decision — the message
--     says only what 0006:208-209 says.
-- ---------------------------------------------------------------------------
create trigger trg_payment_reversals_reject_update
  before update on payment_reversals
  for each row execute function reject_update_append_only('none — a payment_reversals row is itself the correction record for a payment');

create trigger trg_payment_reversals_reject_delete
  before delete on payment_reversals
  for each row execute function reject_delete_nothing_is_deleted('none — a payment_reversals row is itself the correction record for a payment');


-- ---------------------------------------------------------------------------
-- 3 ▸ law 3 · the audit trail is append-only. A wrong audit row is not
--     edited or removed; the next event is simply appended. 0007:234-235.
-- ---------------------------------------------------------------------------
create trigger trg_audit_events_reject_update
  before update on audit_events
  for each row execute function reject_update_append_only('none — append the next event; an audit row is never edited');

create trigger trg_audit_events_reject_delete
  before delete on audit_events
  for each row execute function reject_delete_nothing_is_deleted('none — append the next event; an audit row is never removed');

-- 0007:291-292 — "Immutable logs of database snapshots and encrypted backups."
-- Same revoke statement as audit_events (0007:418-421), same gap, same fix.
-- backup_logs rows are written after the backup completes (`completed_at` is
-- `not null`), so nothing legitimately edits one in place.
create trigger trg_backup_logs_reject_update
  before update on backup_logs
  for each row execute function reject_update_append_only('none — record the next backup as a new row');

create trigger trg_backup_logs_reject_delete
  before delete on backup_logs
  for each row execute function reject_delete_nothing_is_deleted('none — record the next backup as a new row');


-- ---------------------------------------------------------------------------
-- 4 ▸ DELIBERATELY NOT DONE HERE — three residuals, each recorded so the next
--     session does not have to rediscover them.
--
-- (a) The other four tables in 0006:555-562's `revoke update` list —
--     deposit_movements, expense_reversals, coupon_redemptions, tax_ledgers —
--     have exactly the same revoke-without-backstop shape, but they are law 5
--     (deposits) and general-ledger concerns, not "payment immutability", and
--     one of them cannot be pinned mechanically: coupon_redemptions carries
--     `unique (coupon_id, booking_id)` (0006:427), so once UPDATE and DELETE
--     are both blocked a wrongly-redeemed coupon has NO correction path at all
--     — a compensating row is impossible under that constraint.
--     TODO(decision): how a coupon redemption is withdrawn. Until that is
--     ruled, pinning the table shut would trade one law for another.
--
-- (b) The eight remaining tables in 0006:537-552's `revoke delete` list
--     (bank_accounts, fiscal_periods, invoices, invoice_lines,
--     security_deposits, expense_categories, expenses, coupons) have no DELETE
--     backstop either. That is the law 3 sweep 0044 ran across 0002/0016,
--     continued into 0006/0007 — a separate checklist item ("constraints that
--     enforce laws 3, 4, 5, 9, 10"), not this one.
--
-- (c) log_audit_event() (0010:19-105) is attached to 6 tables of 121 —
--     bookings, clients, invoices, payments, security_deposits, product_units
--     (0010:107-128). The other 115 write nothing to audit_events, so law 3's
--     "nothing is deleted" has no audit trail for most of the schema and the
--     Phase 3 Audit engine has nothing to read for them.
--     TODO(decision): which tables the universal audit trigger covers. This is
--     not a mechanical gap — it is a retention and cost question against
--     audit_settings.retention_period (0007:280, default '7 Years'), and it
--     interacts with audit_settings being per-`audit_module` while the trigger
--     is per-table and hardcodes module 'Rentals' (0010:30). Attaching it to
--     115 more tables without that ruling would write a large volume of rows
--     under a module label known to be wrong for most of them.
--
--     Related, surfaced by the audit_events triggers above: audit_settings
--     .retention_period promises a 7-year window, and nothing implements it.
--     With DELETE now blocked for every role, any future retention job must
--     drop or replace trg_audit_events_reject_delete deliberately, in its own
--     migration, rather than discovering the block at run time.
-- ---------------------------------------------------------------------------
