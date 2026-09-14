-- Migration 0122_inspection_operation_session.sql
-- Resolution of PLAN.md §4.29(a):
-- Adds 'Inspection' to operation_kind enum and updates operation_sessions check constraint.
-- Operation sessions RLS policies (operation_sessions_all) already admit ('Owner', 'Admin', 'Manager', 'Warehouse').
-- This maps inspection.create, inspection.pass, inspection.fail to canWriteFloor.

alter type operation_kind add value if not exists 'Inspection';

begin;

alter table operation_sessions drop constraint if exists operation_sessions_operation_is_a_session;
alter table operation_sessions add constraint operation_sessions_operation_is_a_session
  check (operation::text in ('Packing', 'Handover', 'Return', 'Inspection'));

commit;