-- ============================================================================
-- 0076_booking_line_units_release.sql — PLAN.md §4.39, RULED option (a), 31 Aug 2026
--
-- ✅ APPLIED to the live project (sxguwvgoserhdolewibb) on 31 Aug 2026 with the
-- owner's explicit approval — recorded in supabase_migrations.schema_migrations
-- as 20260831213343.
--
-- ⚠ THIS LINE IS STILL NOT EVIDENCE. Three wrong diagnoses in this repo came
-- from trusting a migration header over the database. Verify by query:
--   select * from information_schema.columns
--    where table_name='booking_line_units' and column_name like 'released%';
--
-- What was verified at apply time (not assumed): both columns present with
-- the right types; the both-or-neither CHECK; the FK on released_by resolving
-- to public.users(id), matching this table's existing created_by/packed_by;
-- both triggers registered (0044's delete backstop plus this file's freeze);
-- the partial index. Behaviour was exercised on real rows inside a
-- deliberately-rolled-back transaction: a live insert succeeded, the release
-- UPDATE succeeded, a SECOND update on the released row was rejected by the
-- freeze trigger, `released_at` without `released_by` was rejected by the
-- CHECK, and DELETE was still refused by 0044. Zero rows persisted.
--
-- WHY — the removable serial chip's missing mechanism
-- ---------------------------------------------------
-- REFERENCE_SPEC v2.5 §10.4 ruled a visible removal control for creation-time
-- unit assignments, and named deletion of the `booking_line_units` row as the
-- mechanism. Law 3 forbids exactly that, at two layers verified against the
-- live project on 31 Aug 2026: DELETE is granted to no signed-in role, and
-- 0044's `trg_booking_line_units_reject_delete` raises for every role
-- including Owner and service_role. Meanwhile 0002:295-296 promises "every
-- assignment stays reversible until the booking is Confirmed" and provides no
-- mechanism. §4.39 recorded the collision; the owner ruled option (a):
-- an append-style release pair, leaving the row — the same shape
-- `inventory_reservations` has used for its holds since 0003 (`released_at`
-- in its GiST exclusion's WHERE), so the vocabulary is the schema's own.
--
-- WHAT
-- ----
-- 1. `released_at` / `released_by` on `booking_line_units`, both-or-neither.
-- 2. A freeze trigger: a released row is HISTORY — no further UPDATE touches
--    it, which also makes release irreversible (un-releasing would be
--    fabricating that the assignment never ended; re-assigning is a NEW row,
--    the same shape as every other correction in this schema).
-- 3. A partial index over live assignments, mirroring
--    `booking_lines_product_live_idx` (0002:219).
--
-- READERS — DONE in the same session as the apply
-- ------------------------------------------------
-- `queries/bookings.ts` FLOOR_COLUMNS named `released_at` in the mock branch
-- only while this file was a draft (42703 would have broken every live floor
-- read). With the migration applied, both schemas carry the column, the
-- branch was collapsed, and the embed names `released_at` unconditionally.
-- `RawFloorUnit.released_at` tightened from optional to required at the same
-- time. The floor mapper's `released_at == null` filter is unchanged.
--
-- Deliberately NOT changed: `readUsageCounts` (queries/availability.ts) keeps
-- counting released rows — an assignment that happened is usage history for
-- the least-used ranking even if it was later released. If the ranking should
-- ignore released assignments, that is a §4.37(e)-adjacent tuning question,
-- not a correctness bug, and it is noted there rather than decided here.
--
-- RLS / GRANTS — nothing to add
-- ------------------------------
-- The release is an UPDATE, and UPDATE is already live for the desk five:
-- `booking_line_units_all` (0024) = Owner/Admin/Manager/Coordinator/Warehouse,
-- confirmed against pg_policies on 31 Aug 2026. The `unit.release` capability
-- in actions/core.ts mirrors that policy per §4.20's ruled method.
-- ============================================================================

begin;

alter table booking_line_units
  add column released_at timestamptz,
  add column released_by uuid references users (id);

comment on column booking_line_units.released_at is
  '§4.39(a): the assignment ended here — the row stays (Law 3). NULL = live assignment. Set once, never cleared; the freeze trigger makes a released row immutable.';
comment on column booking_line_units.released_by is
  'Who released it. Required with released_at (both-or-neither CHECK) so a release always names its operator — the Law 10 shape, without the ceremony.';

alter table booking_line_units
  add constraint booking_line_units_release_pair check (
    (released_at is null and released_by is null)
    or (released_at is not null and released_by is not null)
  );

-- A released row is history. UPDATE after release is rejected for everyone —
-- the same all-roles reach as 0044's DELETE backstop, and for the same reason:
-- revokes do not bind the table owner or service_role; a trigger does.
create or replace function reject_update_released_unit()
returns trigger
language plpgsql
as $$
begin
  if OLD.released_at is not null then
    raise exception
      'This unit assignment was released at % and is history (§4.39a): it cannot be edited, un-released, or re-released. Assign the unit again with a new row.',
      OLD.released_at;
  end if;
  return NEW;
end;
$$;

comment on function reject_update_released_unit() is
  '§4.39(a) freeze: released booking_line_units rows are append-only history. Fires BEFORE UPDATE so it binds Owner and service_role, which no revoke reaches.';

create trigger trg_booking_line_units_freeze_released
  before update on booking_line_units
  for each row execute function reject_update_released_unit();

-- Live assignments are what the floor and availability read; released rows are
-- only read by history. Same shape as booking_lines_product_live_idx (0002).
create index booking_line_units_line_live_idx
  on booking_line_units (booking_line_id)
  where released_at is null;

commit;
