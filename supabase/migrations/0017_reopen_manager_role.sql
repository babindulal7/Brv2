-- ============================================================================
-- 0017_reopen_manager_role.sql
-- Reopens the 8 Aug 2026 ruling: Manager returns as a role of its own.
--
-- 0013 folded Manager into Admin ("Admin *is* the Ops Manager") by renaming
-- the enum label in place. Hover Intel System v2.1 (9 Aug 2026) reopened that
-- call — its gating tables list Owner / Admin / Manager / Accounts as four
-- distinct roles, not three. This migration does the opposite of 0013: it
-- ADDS a new label rather than renaming one, because the old 'Manager' label
-- no longer exists to be restored — it was consumed by the rename.
--
-- WHY THIS IS A SEPARATE MIGRATION FROM THE POLICY WORK
-- -------------------------------------------------------
-- Same constraint 0013 documented: Postgres will not let a transaction use
-- an enum value the same transaction added. The grants land in
-- 0018_manager_role_policies.sql.
--
-- WHAT "REOPENED" MEANS HERE, CONCRETELY
-- ---------------------------------------
-- HIS v2.1 never states a rule where Admin and Manager diverge — every gate
-- it defines lists them together ("Owner/Admin/Manager/Accounts = all ₨").
-- So this split is additive, not a redefinition of Admin: 0018 gives Manager
-- exactly the grants Admin already has, everywhere. If a future spec wants
-- Admin and Manager to differ on some specific action, that is a new,
-- separate ruling — not assumed here.
-- ============================================================================

alter type system_role add value if not exists 'Manager';

comment on type system_role is
  'The business 9, reopened 9 Aug 2026 (Hover Intel System v2.1): Owner · Admin · '
  'Manager · Coordinator · Warehouse · Technician · Accounts · Driver · Client. '
  'Manager was folded into Admin by the 8 Aug 2026 ruling (0013) and is restored '
  'here as its own label — added, not renamed, so it carries no grants until '
  '0018 states them. Client is EXTERNAL — portal only, never a staff surface.';
