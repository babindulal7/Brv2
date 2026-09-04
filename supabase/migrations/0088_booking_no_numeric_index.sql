-- =============================================================================
-- 0088_booking_no_numeric_index.sql — 4 Sep 2026
--
-- The numeric index for `bookings.booking_no`, split out of `0085`.
--
-- ## Why this is a separate file, and must stay one
--
-- `0085` renumbers every booking from `B-<n>` to bare digits. The obvious place
-- for this index is right after that UPDATE, inside the same transaction. It
-- does not work, and the failure is not obvious:
--
--     ERROR:  invalid input syntax for type bigint: "B-918"
--
-- raised by CREATE INDEX, *after* `bookings_booking_no_is_digits` has already
-- been added and validated — so every LIVE row is provably digits at that point.
--
-- A non-concurrent CREATE INDEX does not scan with the transaction's MVCC
-- snapshot. It scans with SnapshotAny and indexes recently-dead tuples as well,
-- because another transaction may still be able to see them. The pre-UPDATE row
-- versions from `0085` are exactly that, and they still contain `B-918`, so the
-- index expression is evaluated against them and the cast fails.
--
-- Ordinary statements are unaffected — `0085`'s own `max((booking_no)::bigint)`
-- and its post-condition casts all run on the normal snapshot and see only the
-- renumbered rows. This is a CREATE INDEX property, not a cast problem.
--
-- Reproduced and confirmed on a from-scratch build, 4 Sep 2026: identical
-- statements fail in one transaction and succeed across two.
--
-- ## Apply-time note
--
-- Run this when no long-lived transaction is holding a snapshot older than
-- `0085`'s commit; otherwise those same dead tuples are still "recently dead"
-- and the build fails again. Applying the migration set sequentially, as
-- `scripts/check-rebuild.mjs` and the apply script both do, satisfies this.
-- Re-running after a failure is safe — `if not exists` makes it idempotent.
--
-- ## Why an expression index at all
--
-- On text, '1000' sorts before '946'. Every list ordered by booking number needs
-- the numeric expression, and this keeps that ordering cheap. The expression is
-- written exactly as a query would write it — `(booking_no)::bigint` — so the
-- planner can match it.
-- =============================================================================

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bookings'::regclass
       and conname  = 'bookings_booking_no_is_digits'
  ) then
    raise exception
      'PRE-CONDITION FAILED: bookings_booking_no_is_digits is missing, so 0085 '
      'has not run. Building a bigint index over B-<n> values would fail; '
      'apply 0085 first.';
  end if;
end $$;

create index if not exists bookings_booking_no_num
  on bookings (((booking_no)::bigint));

do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'bookings_booking_no_num'
  ) then
    raise exception 'POST-CONDITION FAILED: bookings_booking_no_num was not created.';
  end if;
  raise notice '0088 verified: numeric booking-number index in place.';
end $$;

commit;
