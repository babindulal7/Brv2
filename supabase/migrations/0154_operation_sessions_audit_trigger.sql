-- ============================================================================
-- 0154_operation_sessions_audit_trigger.sql — written 06 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- PLAN.md §4.36 / BUG_SWEEP_ENGINES R3-5: a Warehouse actor completing a return commits
-- `operation_sessions`, `return_lines` and movements, and the ONLY record of who did it was an
-- app-written audit_events row (floorVerb.ts) that could fail and be swallowed. The six
-- trigger-covered tables (0010) never included `operation_sessions`.
--
-- WHAT
-- ----
-- Attach the existing universal `log_audit_event()` to `operation_sessions` for INSERT and
-- UPDATE, exactly as 0143 did for the intel tables. The row is written by the database in the
-- same transaction as the session, so it cannot be skipped by a client-side failure.
--
-- WHAT THIS DELIBERATELY DOES NOT DECIDE
-- --------------------------------------
-- §4.36 — whether a failed *app-side* audit write should stop the business verb — stays open.
-- This is the decision-free half: it makes the record exist regardless. The app-written row
-- (floorVerb.ts) is untouched; the two are complementary (trigger = who/what/state before and
-- after; app row = reason and device context).
--
-- RULING 2026-10-06: stricter and additive (B-1), reversible with one statement (B-6).
-- REVERT: drop trigger trg_audit_operation_sessions on operation_sessions;
-- Verified by scripts/test-operation-session-audit.mjs (fails 4/4 without this file).
-- ============================================================================

begin;

drop trigger if exists trg_audit_operation_sessions on operation_sessions;
create trigger trg_audit_operation_sessions after insert or update on operation_sessions
  for each row execute function log_audit_event();

commit;
