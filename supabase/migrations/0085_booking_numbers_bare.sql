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
-- `create_booking` needs no change: it calls `next_document_number('booking')`
-- and never touches the shape (checked against the live function body).
-- `next_document_number` itself DOES need one — see step 6. Re-pointing the
-- sequence alone is NOT sufficient, which is the opposite of what this header
-- claimed until the migration was actually run: with `padding = 1` every mint
-- came back as the single character '9'.
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
-- 1 · The gate.
--
-- SPEC-P0-3 §3 says "Expect 46. If it is not 46, stop." That 46 is a fact about
-- LIVE on 4 Sep 2026, NOT an invariant of the schema. A database built from
-- these migrations alone holds 23 in the band, because
-- `0076_seed_operational_stage_corpus` sizes its corpus against `now()` and
-- yields fewer rows the later it runs (its own header still claims B-900…B-945).
-- Asserting 46 here made the migration set impossible to build from scratch,
-- undoing the guarantee `check:rebuild` exists to hold (PLAN §4.42(a)).
--
-- So the count is REPORTED, and the gate asserts what the count was standing in
-- for: that nothing in 900-945 is a genuine Booqable order. `external_refs` is
-- the real discriminator, so it is checked directly. This degrades correctly in
-- both directions — it passes on live (46 seed, 0 order refs) and on a rebuild
-- (23 seed, 0 order refs), and it FAILS the moment the Booqable back-fill has
-- put real orders in the band, which is the case worth stopping for.
--
-- The 46 gate still runs against live: PHASE-0-PLAN step 2.1, before this
-- migration is applied. Confirmed 46 there on 4 Sep.
-- -----------------------------------------------------------------------------
do $$
declare
  v_band  integer;
  v_total integer;
  v_bad   integer;
  v_real  integer;
begin
  select count(*) into v_bad from bookings where booking_no !~ '^B-[0-9]+$';
  if v_bad > 0 then
    raise exception
      'PRE-CONDITION FAILED: % booking_no value(s) are not in the B-<n> shape. '
      'The renumber below assumes every row is; fix them first.', v_bad;
  end if;

  select count(*) into v_total from bookings;

  select count(*) into v_band from bookings
   where substring(booking_no from 3)::int between 900 and 945;

  select count(*) into v_real
    from bookings b
    join external_refs r
      on r.entity = 'orders' and r.local_id = b.id
   where substring(b.booking_no from 3)::int between 900 and 945;

  if v_real > 0 then
    raise exception
      'PRE-CONDITION FAILED: % booking(s) in 900-945 carry an external_refs '
      'orders row, so they are REAL Booqable orders, not seed. Parking them in '
      'the 90000 band would destroy their identity. Stop and re-identify the '
      'seed set before renumbering.', v_real;
  end if;

  raise notice '0085 pre-conditions: % bookings, % in the 900-945 band, 0 of them real orders.', v_total, v_band;
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
-- 5 · Constrain.
--
-- ⚠ The numeric index that belongs with this CHECK is in `0088`, and it CANNOT
-- be moved back here. A non-concurrent CREATE INDEX scans the heap with
-- SnapshotAny, so it evaluates its expression over RECENTLY-DEAD tuples too —
-- including the pre-UPDATE versions this very transaction just superseded, which
-- still hold `B-918`. The build then dies with:
--
--     ERROR:  invalid input syntax for type bigint: "B-918"
--
-- even though every live row is digits and this CHECK has already validated
-- them. Verified by running it, 4 Sep 2026. The index must therefore be built in
-- a LATER transaction, once those old versions are fully dead. See 0088.
-- -----------------------------------------------------------------------------
alter table bookings add constraint bookings_booking_no_is_digits
  check (booking_no ~ '^[0-9]+$');

-- -----------------------------------------------------------------------------
-- 6 · Stop `lpad` truncating, so a bare number survives formatting.
--
-- `next_document_number` formats as `prefix || lpad(v::text, padding, '0')`, and
-- Postgres `lpad` TRUNCATES when the value is longer than the width:
--
--     lpad('900',   1, '0') = '9'        <- bare booking numbers, after step 7
--     lpad('10000', 4, '0') = '1000'     <- INV- today, at invoice 10000
--
-- The first breaks this migration: step 7 sets `padding = 1` because a bare
-- number must not be zero-padded, and every mint would then come back as a
-- single digit. Caught by calling the function, 4 Sep 2026 — the stored
-- `current_value` was correct (899), so a post-condition that checks the COUNTER
-- passes while every minted STRING is wrong. The assertion in step 8 now mints.
--
-- The second is pre-existing and independent of bookings: every sequence here
-- silently truncates once it outgrows its padding, and the truncated value
-- collides with a number already issued. `INV-10000` minting as `INV-1000` is a
-- duplicate-key error at best and a mis-numbered invoice at worst.
--
-- `greatest(padding, length(v))` fixes both: pad up to the width, never cut.
-- Nothing already issued changes shape, because for every value inside its
-- padding width the expression is exactly the old one.
-- -----------------------------------------------------------------------------
create or replace function next_document_number(p_sequence_key text)
returns text
language plpgsql
as $$
declare
  v_rec record;
  v_year integer := extract(year from current_date);
  v_next_val bigint;
  v_formatted text;
  v_width integer;
begin
  select * into v_rec from number_sequences where sequence_key = p_sequence_key for update;

  if not found then
    raise exception 'Number sequence % does not exist', p_sequence_key;
  end if;

  -- A year-less sequence must never reset on a year change: it would re-issue
  -- a number it has already handed out.
  if v_rec.include_year and v_rec.current_year <> v_year then
    v_next_val := 1;
    update number_sequences
    set current_year = v_year, current_value = 1, updated_at = now()
    where sequence_key = p_sequence_key;
  else
    v_next_val := v_rec.current_value + 1;
    update number_sequences
    set current_value = v_next_val, current_year = v_year, updated_at = now()
    where sequence_key = p_sequence_key;
  end if;

  -- Never narrower than the number itself. See the header: a fixed width here
  -- silently truncates and re-issues a number that already exists.
  v_width := greatest(v_rec.padding, length(v_next_val::text));

  if v_rec.include_year then
    v_formatted := v_rec.prefix || v_year::text || '-' || lpad(v_next_val::text, v_width, '0');
  else
    -- Prefix carries its own separator where it has one ('B-', 'INV-'); EQ has
    -- none, which is how `EQ000824` keeps working through the same branch.
    v_formatted := v_rec.prefix || lpad(v_next_val::text, v_width, '0');
  end if;

  return v_formatted;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7 · Re-point the sequences.
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
-- 8 · Post-conditions — SPEC-P0-3 §7 acceptance, asserted rather than assumed.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad integer;
  v_seed integer;
  v_expected integer;
  v_free integer;
  v_next bigint;
  v_minted text;
  v_pay_year boolean;
begin
  select count(*) into v_bad  from bookings where booking_no !~ '^[0-9]+$';
  if v_bad > 0 then
    raise exception 'POST-CONDITION FAILED: % booking_no value(s) are not digits.', v_bad;
  end if;

  -- Relative to what step 3 actually recorded, so this holds for live's 46 and
  -- a rebuild's 23 alike. An absolute count here is what broke the rebuild.
  select count(*) into v_expected from booking_no_migration_map
   where (new_no)::bigint >= 90000;
  select count(*) into v_seed from bookings
   where (booking_no)::bigint between 90000 and 90045;
  if v_seed <> v_expected then
    raise exception 'POST-CONDITION FAILED: expected % bookings at 90000-90045, found %.', v_expected, v_seed;
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

  -- Mint for real, then put the counter back.
  --
  -- Checking the COUNTER alone is exactly what let `padding = 1` through: the
  -- stored value was a correct 899, and every minted string came back '9'
  -- because `lpad` truncates. The only assertion that catches that is the one
  -- that asks the function what the next booking will actually be called.
  select next_document_number('booking') into v_minted;
  if v_minted <> v_next::text then
    raise exception
      'POST-CONDITION FAILED: the next booking mints as "%", expected "%". '
      'The counter is right, so this is a formatting fault — check padding and '
      'the lpad width in next_document_number.', v_minted, v_next;
  end if;
  update number_sequences
     set current_value = current_value - 1, updated_at = now()
   where sequence_key = 'booking';

  select include_year into v_pay_year from number_sequences where sequence_key = 'payment';
  if v_pay_year then
    raise exception 'POST-CONDITION FAILED: payment sequence still resets yearly (R-18).';
  end if;

  raise notice '0085 verified: digits only, % parked at 90000+, 900-945 free, next mint 900, payment year-less.', v_expected;
end $$;

commit;
