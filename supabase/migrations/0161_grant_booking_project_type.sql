-- ============================================================================
-- 0161_grant_booking_project_type.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Found by driving the app against live, signed in as Owner: the Today screen and the Rentals list
-- both failed with "listBookings failed: permission denied for table bookings". Probing column by
-- column, every booking column read fine except `project_type` and `project_type_other`.
--
-- `bookings` carries COLUMN-level grants since 0062 (the table grant was dropped and the non-money
-- columns handed back by name, Law 6). 0144 added the two columns and granted nothing, so live —
-- where 0144 is applied — refuses any select that names them. PGlite did not catch it because the
-- lifecycle runs as the table owner.
--
-- WHAT
-- ----
-- Grant SELECT on the two columns to `authenticated`. Neither is a money figure (a production
-- category and its free-text description), so money-blind roles may read them.
--
-- The app already falls back to the pre-0144 projection on this error (bookings.ts,
-- `missingProjectTypeColumn`), so the screens work before this is applied — minus Project Type.
--
-- RULING 2026-10-07: stricter-neutral (no money column, no new role), one-statement revert (B-6).
-- REVERT: revoke select (project_type, project_type_other) on bookings from authenticated;
-- ============================================================================

begin;

grant select (project_type, project_type_other) on bookings to authenticated;

-- Post-condition: proven by the catalogue, the same check 0091 uses for its grant.
do $$
begin
  if not has_column_privilege('authenticated', 'public.bookings', 'project_type', 'SELECT')
     or not has_column_privilege('authenticated', 'public.bookings', 'project_type_other', 'SELECT') then
    raise exception 'POST-CONDITION FAILED: authenticated cannot select bookings.project_type / project_type_other.';
  end if;
end $$;

commit;
