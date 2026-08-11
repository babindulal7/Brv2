-- ============================================================================
-- 0043_booking_flags_overdue_rename.sql — generated 10 Aug 2026
-- (Master Data Map v2.1 audit, fix group: booking_flags CHECK still using the
--  retired flag name 'Late Return'. Evidence: PROGRESS.md, 10 Aug entry.)
--
-- WHY
-- ----
-- src/lib/workflow.ts:149-167 is the CLOSED 17-flag registry, and 'Late
-- Return' is not a member — the overdue flag is 'Overdue' (FLAGS.Overdue,
-- "Red badge, blocks Close, triggers late-fee calculation").
-- src/data/returnInspection.ts (file header, §4 note) records the explicit
-- ruling: the render's "Late Return" flag is "not in the closed registry";
-- the overrun is rendered as informational text, never a badge.
-- Yet 0002_bookings.sql's booking_flags_recorded_subset_only CHECK
-- (0002:535-537) still names the retired string 'Late Return' as one of its
-- four storable flags. 0015_canonical_six_stages.sql:53-59 flagged exactly
-- this gap and deliberately did NOT fix it ("flagged back to the Build
-- agent's caller rather than invented here"). This migration performs the
-- settled rename and nothing else.
--
-- ORDER (rename-safe)
-- --------------------
-- 1. Convert any stored 'Late Return' rows to 'Overdue' BEFORE the new CHECK
--    exists. Both strings are members of the booking_flag enum
--    (0001_enums.sql:329-342), so no type rebuild is needed. Zero booking
--    rows exist today (0015:60-62), so the UPDATE is a no-op safety net.
--    flag_type is left untouched: the registry-matching trigger (0002:556)
--    does not exist yet, and no row exists to have carried a stale value.
-- 2. Drop the old CHECK and recreate it under the SAME name with the SAME
--    four-flag width — only 'Late Return' → 'Overdue'.
-- 3. Refresh the two column comments that still teach the retired
--    vocabulary (0002:87 bookings.actual_return_at, 0002:552
--    booking_flags.observed_at).
--
-- TODO(decision) — which of the 17 registry flags PERSIST vs DERIVE is a
-- genuinely open design question, deliberately NOT decided here. Note the
-- inherited tension: 0002's own subset comment (0002:531-534) lists Overdue
-- among the DERIVED flags, while the row this table stored under the old
-- name recorded a once-observed historical fact ("raised at the return
-- session, survives a later extension" — 0002:557-559). This migration only
-- renames the retired string inside the existing four-flag width; widening
-- to (or shrinking from) the full registry, and whether the stored 'Overdue'
-- row keeps the recorded-observation semantics, stay open.
--
-- FILE ONLY — never applied to any live Supabase project (repo hard rule).
-- ============================================================================

-- 1 ▸ rename-safe order: convert stored rows before the new CHECK is added.
update booking_flags
   set flag = 'Overdue'
 where flag = 'Late Return';

-- 2 ▸ same name, same four-flag width; retired string replaced.
alter table booking_flags
  drop constraint booking_flags_recorded_subset_only;

alter table booking_flags
  add constraint booking_flags_recorded_subset_only check (
    flag in ('Returned Early', 'Overdue', 'Missing', 'Damaged')
  );

-- 3 ▸ DB self-documentation follows the registry vocabulary.
comment on column bookings.actual_return_at is
  'Set by the Return workspace. Compared to return_at once, at the return session, to raise Returned Early or Overdue.';
comment on column booking_flags.observed_at is
  'The instant the fact was true. This is why Overdue survives a later extension: the flag records what happened, the dates record what was agreed.';
