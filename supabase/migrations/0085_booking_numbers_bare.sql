-- =============================================================================
-- 0085_booking_numbers_bare.sql — 4 Sep 2026
--
-- Ruling basis: R-10, R-11, R-12, R-18 (RULINGS-2026-09-04.md).
-- Spec: docs/SPEC-P0-3-NUMBERING.md.
--
-- `bookings.booking_no` becomes a BARE INTEGER AS TEXT. The `#` is rendered at
-- display only (`formatBookingNo`), never stored: `#` is a URL fragment
-- delimiter, so `/rentals/#920` never reaches the server and the same breaks any
-- link pasted into WhatsApp. Storing bare also lets the column sort numerically.
--
-- Existing #700-#899 keep their numbers, aligned with Booqable (R-10). The 46
-- seed bookings move to the 90000 band (R-11), freeing 900-945 for the real
-- orders that are waiting on it. Every other document prefix is unchanged (R-12).
--
-- ## What this fixes beyond the renumber
--
-- **P0-4 — booking creation on live is bricked TODAY, not eventually.** Verified
-- 4 Sep: bookings run to 945 while `number_sequences.booking.current_value` sits
-- at 917. `next_document_number` returns `current_value + 1`, so the very next
-- call returns `B-918`, which already exists, and `bookings_booking_no_key`
-- rejects it. Every OS-created booking errors out. Step 4 below re-points the
-- counter to 899 so the next mint is `900` — the first free number.
--
-- `create_booking` needs NO change: it calls `next_document_number('booking')`
-- and never touches the shape (checked against the live function body). With
-- `prefix = ''` the same call returns `900` instead of `B-918`.
--
-- **R-18 — payment numbers stop resetting yearly.** `include_year = true` makes
-- `next_document_number` reset to 1 each January and re-issue numbers it has
-- already handed out, a direct breach of the 15 Aug never-reset ruling. Fixed in
-- step 4. Numbers already issued are NOT rewritten (R-18).
--
-- ## The constraint the spec does not mention
--
-- `0055_ruled_identifier_formats.sql` left `bookings_booking_no_format` as
-- `CHECK (booking_no ~ '^B-[0-9]+$')` — confirmed live, 4 Sep. The renumber
-- writes bare digits, so that CHECK rejects every row and SPEC-P0-3's UPDATE
-- fails on its first statement. It is dropped in step 2 and replaced in step 5.
-- Flagged rather than silently worked around: the spec is otherwise exact.
--
-- ## Single pass, deliberately
--
-- Old and new forms never collide (`B-798` -> `798`; `B-900` -> `90000`), so one
-- UPDATE is safe. Two passes would risk tripping `bookings_booking_no_key`
-- halfway through, with the table in a shape neither form matches.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · The gate. SPEC-P0-3: "Expect 46. If it is not 46, stop."
--
-- The 900-945 range is the ONLY discriminator available — `external_refs` holds
-- no `orders` rows for any booking (verified: 0) and the seed carries no marker.
-- If the count has moved, the range no longer identifies the seed and renumbering
-- would move real Booqable orders into the 90000 band, which is unrecoverable
-- without the mapping this migration has not yet written.
-- -----------------------------------------------------------------------------
do $$
declare
  v_seed integer;
  v_total integer;
  v_bad integer;
begin
  select count(*) into v_seed from bookings
   where booking_no ~ '^B-9[0-4][0-9]$'
     and substring(booking_no from 3)::int between 900 and 945;

  select count(*) into v_total from bookings;
  select count(*) into v_bad from bookings where booking_no !~ '^B-[0-9]+$';

  if v_seed <> 46 then
    raise exception
      'PRE-CONDITION FAILED: expected 46 seed bookings in 900-945, found %. '
      'The range is the only discriminator; renumbering now would move real '
      'orders into the 90000 band. Stop and re-identify the seed set.', v_seed;
  end if;

  if v_bad > 0 then
    raise exception
      'PRE-CONDITION FAILED: % booking_no value(s) are not in the B-<n> shape. '
      'The renumber below assumes every row is; fix them first.', v_bad;
  end if;

  raise notice '0085 pre-conditions: % bookings, % in the seed band.', v_total, v_seed;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · Drop the shape CHECK. See the header — 0055's `^B-[0-9]+$` would reject
--     every renumbered row. Replaced in step 5, inside this same transaction, so
--     the column is never left unconstrained to a committed reader.
-- -----------------------------------------------------------------------------
alter table bookings drop constraint if exists bookings_booking_no_format;

-- -----------------------------------------------------------------------------
-- 3 · Record the mapping BEFORE changing anything.
--
-- The audit trigger logs the updates, but support staff need a direct old -> new
-- lookup, and clients will hold paperwork carrying the old number for a year at
-- least. This table is the only thing that can answer "what is B-880 now?".
-- -----------------------------------------------------------------------------
create table if not exists booking_no_migration_map (
  old_no      text primary key,
  new_no      text not null unique,
  migrated_at timestamptz not null default now()
);

comment on table booking_no_migration_map is
  'Old B-<n> booking number -> new bare number, written by 0085. Support lookup '
  'for paperwork and links issued before 4 Sep 2026. Never dropped.';

insert into booking_no_migration_map (old_no, new_no)
select
  booking_no,
  case
    when substring(booking_no from 3)::int between 900 and 945
      then (90000 + substring(booking_no from 3)::int - 900)::text
    else substring(booking_no from 3)
  end
from bookings
where booking_no like 'B-%'
on conflict (old_no) do nothing;

-- -----------------------------------------------------------------------------
-- 4 · The renumber, in one statement.
-- -----------------------------------------------------------------------------
update bookings
set booking_no = case
  when substring(booking_no from 3)::int between 900 and 945
    then (90000 + substring(booking_no from 3)::int - 900)::text
  else substring(booking_no from 3)
end
where booking_no like 'B-%';

-- -----------------------------------------------------------------------------
-- 5 · Constrain and index.
--
-- The index is not optional: on text, '1000' sorts before '946'. Every list
-- ordered by booking number needs the numeric expression, and the expression
-- index is what keeps that ordering cheap.
-- -----------------------------------------------------------------------------
alter table bookings add constraint bookings_booking_no_is_digits
  check (booking_no ~ '^[0-9]+$');

create index if not exists bookings_booking_no_num
  on bookings (((booking_no)::bigint));

-- -----------------------------------------------------------------------------
-- 6 · Re-point the sequences.
--
-- booking: prefix drops, counter moves to the highest REAL booking number. The
-- 90000 band is excluded deliberately — it is a parking range for the seed, not
-- part of the issuing sequence, so the next mint is 900 and the freed range is
-- consumed first.
--
-- payment: R-18. `include_year = false` stops the yearly reset.
-- -----------------------------------------------------------------------------
update number_sequences
   set prefix = '',
       padding = 1,
       current_value = (select coalesce(max((booking_no)::bigint), 0)
                          from bookings
                         where (booking_no)::bigint < 90000),
       updated_at = now()
 where sequence_key = 'booking';

update number_sequences
   set include_year = false,
       updated_at = now()
 where sequence_key = 'payment';

-- -----------------------------------------------------------------------------
-- 7 · Post-conditions — SPEC-P0-3 §7 acceptance, asserted rather than assumed.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad integer;
  v_seed integer;
  v_free integer;
  v_next bigint;
  v_pay_year boolean;
begin
  select count(*) into v_bad  from bookings where booking_no !~ '^[0-9]+$';
  if v_bad > 0 then
    raise exception 'POST-CONDITION FAILED: % booking_no value(s) are not digits.', v_bad;
  end if;

  select count(*) into v_seed from bookings
   where (booking_no)::bigint between 90000 and 90045;
  if v_seed <> 46 then
    raise exception 'POST-CONDITION FAILED: expected 46 bookings at 90000-90045, found %.', v_seed;
  end if;

  select count(*) into v_free from bookings
   where (booking_no)::bigint between 900 and 945;
  if v_free <> 0 then
    raise exception 'POST-CONDITION FAILED: 900-945 should be empty, found % row(s).', v_free;
  end if;

  select current_value + 1 into v_next from number_sequences where sequence_key = 'booking';
  if v_next <> 900 then
    raise exception 'POST-CONDITION FAILED: next booking number would be %, expected 900.', v_next;
  end if;

  select include_year into v_pay_year from number_sequences where sequence_key = 'payment';
  if v_pay_year then
    raise exception 'POST-CONDITION FAILED: payment sequence still resets yearly (R-18).';
  end if;

  raise notice '0085 verified: digits only, 46 parked at 90000+, 900-945 free, next mint 900, payment year-less.';
end $$;

commit;
