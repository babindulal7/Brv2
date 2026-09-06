-- =============================================================================
-- 0085_booking_numbers_bare.sql — 4 Sep 2026 · patched 6 Sep 2026 (DB-01, DB-13)
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
-- 4 Sep and re-verified read-only on 6 Sep: bookings run to B-945 while
-- `number_sequences.booking.current_value` sits at 917. `next_document_number`
-- returns `current_value + 1`, so the very next call returns `B-918`, which
-- already exists, and `bookings_booking_no_key` rejects it. Every OS-created
-- booking errors out, and because the counter UPDATE runs inside the failing
-- transaction it rolls back too, so the system never gets past it. Step 7 below
-- re-points the counter to the highest real booking number (899 on live), so the
-- next mint is the first free number.
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
-- step 7. Numbers already issued are NOT rewritten (R-18).
--
-- ## Where the counter lands, and why it is not 946 — read before "correcting" it
--
-- The 5 Sep audit (DB-01, option B) proposed re-pointing to 945 so the next OS
-- mint is 946, because R-10 says "the next real order is #946". Its own refuter
-- (DB-13) found that step 7 implements SPEC-P0-3 §3.4 verbatim and §7's
-- acceptance ("`next_document_number('booking')` returns `900`"), and that the
-- collision the audit fears — an OS booking taking a number Booqable later
-- issues — is the question SPEC-P0-3 §6 and PLAN.md §4.43(a) leave OPEN.
--
-- Reading R-10 in full settles what THIS file may do: the counter "continues
-- Booqable's order numbers" and, at bridge end, `next_document_number` takes
-- over "continuing from the last imported number". The last imported number is
-- 899 (the 200 imported bookings are 700-899; `external_refs` holds no `orders`
-- row for anything above it). So the spec's target and R-10 agree on the value
-- the counter holds; what neither rules is whether the OS may mint from 900
-- while Booqable is still issuing. That is a product decision, recorded as
-- PLAN.md §4.48 with the options, and a migration must not invent it.
--
-- So step 7 stays as the spec wrote it, and step 8 proves the thing that
-- actually matters whatever value is eventually ruled: the next mint is above
-- every real booking number, below the parked band, and does not collide with
-- any existing `booking_no`. If §4.48 rules 946, the change is one `greatest()`
-- in step 7 and nothing in step 8 needs touching.
--
-- ## What the 5 Sep audit found in the 4 Sep draft, fixed here (DB-13)
--
-- 1. `booking_no_migration_map` was created with NO row level security. Under
--    the hosted platform's default ACL, anon and authenticated hold full DML on
--    every new relation, so anyone with the public anon key could rewrite the
--    old->new map support will rely on for a year. Step 3 now enables RLS with a
--    staff-only SELECT policy and no write policy at all, and revokes the table
--    from anon. Note that `0093_state_the_grants` later restores the platform
--    baseline TABLE-level grants on every relation (anon/authenticated get
--    SELECT/INSERT/UPDATE, never DELETE) — by design, because on this schema RLS
--    is the control that governs anon writes, not the grant. With RLS on and no
--    policy admitting anon or any write, the map is readable by staff only and
--    writable by nobody but `postgres`/`service_role`, which is the same posture
--    as every other table here. The 0085 post-condition asserts the RLS shape
--    (which survives 0093) and the anon revoke (true at this point in the set).
-- 2. `next_document_number` was re-created without a `search_path` pin. `0050`
--    pinned it (`public, pg_temp`), `0055`'s `create or replace` silently wiped
--    that — live `pg_proc.proconfig` for it is NULL today — and this draft would
--    have kept it wiped. Step 6 carries the pin, per the convention `0050`
--    established, and step 8 asserts it.
-- 3. The header called the re-point "step 4"; it is step 7.
-- 4. It was not re-runnable: the pre-condition raised on a database it had
--    already renumbered. It now converges — every step is guarded or a no-op on
--    a second run, and the counter is never rewound below a number already
--    issued.
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
--
-- ## What this does NOT change
--
-- No booking row is created or removed; no other sequence's prefix or padding;
-- nothing in the app (`formatBookingNo` / `parseBookingNoSearch` are already in
-- `src/lib/format.ts`, and the mock's `B-<n>` minting is SPEC-P0-3 §4's P3-3,
-- not this file's). The numeric index belongs to `0088` — see step 5 for why it
-- cannot live here.
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
-- migration is applied. Confirmed 46 there on 4 Sep and again on 6 Sep.
--
-- On a database this file has already renumbered there are no `B-` rows left;
-- every check below then sees zero and the file proceeds as a no-op.
-- -----------------------------------------------------------------------------
do $$
declare
  v_band  integer;
  v_total integer;
  v_bad   integer;
  v_real  integer;
  v_old   integer;
begin
  select count(*) into v_bad from bookings
   where booking_no !~ '^B-[0-9]+$' and booking_no !~ '^[0-9]+$';
  if v_bad > 0 then
    raise exception
      'PRE-CONDITION FAILED: % booking_no value(s) are in neither the B-<n> nor '
      'the bare-digits shape. The renumber below assumes every row is; fix them first.', v_bad;
  end if;

  select count(*) into v_total from bookings;
  select count(*) into v_old from bookings where booking_no like 'B-%';

  select count(*) into v_band from bookings
   where booking_no like 'B-%'
     and substring(booking_no from 3)::int between 900 and 945;

  select count(*) into v_real
    from bookings b
    join external_refs r
      on r.entity = 'orders' and r.local_id = b.id
   where b.booking_no like 'B-%'
     and substring(b.booking_no from 3)::int between 900 and 945;

  if v_real > 0 then
    raise exception
      'PRE-CONDITION FAILED: % booking(s) in 900-945 carry an external_refs '
      'orders row, so they are REAL Booqable orders, not seed. Parking them in '
      'the 90000 band would destroy their identity. Stop and re-identify the '
      'seed set before renumbering.', v_real;
  end if;

  if v_old = 0 then
    raise notice '0085 pre-conditions: % bookings, none in the B-<n> shape — already renumbered; the rest of this file converges as a no-op.', v_total;
  else
    raise notice '0085 pre-conditions: % bookings, % still B-<n>, % in the 900-945 band, 0 of them real orders.', v_total, v_old, v_band;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · Drop the shape CHECK. See the header — 0055's `^B-[0-9]+$` would reject
--     every renumbered row. Replaced in step 5, inside this same transaction, so
--     the column is never left unconstrained to a committed reader.
-- -----------------------------------------------------------------------------
alter table bookings drop constraint if exists bookings_booking_no_format;

-- -----------------------------------------------------------------------------
-- 3 · Record the mapping BEFORE changing anything — under RLS.
--
-- The audit trigger logs the updates, but support staff need a direct old -> new
-- lookup, and clients will hold paperwork carrying the old number for a year at
-- least. This table is the only thing that can answer "what is B-880 now?".
--
-- Read by staff, written by nobody through the API: the only policy is a staff
-- SELECT (`auth_is_staff()`, the same predicate `number_sequences_select` uses,
-- 0033:46-49), there is deliberately no INSERT/UPDATE/DELETE policy, and anon is
-- revoked outright. `postgres` (this file) and `service_role` bypass RLS, which
-- is how the rows get here and how a future correction would be made.
-- -----------------------------------------------------------------------------
create table if not exists booking_no_migration_map (
  old_no      text primary key,
  new_no      text not null unique,
  migrated_at timestamptz not null default now()
);

comment on table booking_no_migration_map is
  'Old B-<n> booking number -> new bare number, written by 0085. Support lookup '
  'for paperwork and links issued before 4 Sep 2026. Never dropped. Read-only '
  'for staff (RLS); no API role can write it.';

alter table booking_no_migration_map enable row level security;

revoke all on booking_no_migration_map from anon, public;
grant select on booking_no_migration_map to authenticated;

drop policy if exists booking_no_migration_map_select on booking_no_migration_map;
create policy booking_no_migration_map_select on booking_no_migration_map
  for select
  using (auth_is_staff());

comment on policy booking_no_migration_map_select on booking_no_migration_map is
  'Staff read the old->new booking number map; no role writes it through the API. '
  'Mirrors number_sequences_select (0033). Added 6 Sep 2026 after DB-13 found the '
  'table open to anon under the platform default ACL.';

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
-- 4 · The renumber, in one statement. Matches nothing on a second run.
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
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bookings'::regclass
       and conname  = 'bookings_booking_no_is_digits'
  ) then
    alter table bookings add constraint bookings_booking_no_is_digits
      check (booking_no ~ '^[0-9]+$');
  end if;
end $$;

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
--
-- This body is byte-identical to `0089`'s, so applying the two files in either
-- order, or both, leaves the same function. The `search_path` pin is the one
-- `0050` put on this function and `0055` wiped; every `create or replace` of a
-- function must restate it, because the statement replaces the SET clauses too.
-- -----------------------------------------------------------------------------
create or replace function next_document_number(p_sequence_key text)
returns text
language plpgsql
set search_path = public, pg_temp
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
-- booking: prefix drops, counter moves to the highest REAL booking number
-- (SPEC-P0-3 §3.4; R-10 "continuing from the last imported number"). The 90000
-- band is excluded deliberately — it is a parking range for the seed, not part
-- of the issuing sequence — so the next mint is the first number above the real
-- ones, and the freed range is consumed first. Whether the OS may consume it
-- while Booqable is still issuing is PLAN.md §4.48 (open); if that rules 946,
-- wrap the subquery in `greatest(…, 945)` and nothing else here changes.
--
-- Convergent: on the first run (prefix still 'B-') the counter is SET to the
-- max, because live's 917 is above it and must come down; on any later run the
-- counter is never rewound below a number already issued.
--
-- payment: R-18. `include_year = false` stops the yearly reset.
-- -----------------------------------------------------------------------------
update number_sequences
   set prefix = '',
       padding = 1,
       current_value = case
         when prefix = 'B-' then
           (select coalesce(max((booking_no)::bigint), 0)
              from bookings
             where (booking_no)::bigint < 90000)
         else
           greatest(current_value,
                    (select coalesce(max((booking_no)::bigint), 0)
                       from bookings
                      where (booking_no)::bigint < 90000))
       end,
       updated_at = now()
 where sequence_key = 'booking';

update number_sequences
   set include_year = false,
       updated_at = now()
 where sequence_key = 'payment'
   and include_year;

-- -----------------------------------------------------------------------------
-- 8 · Post-conditions — SPEC-P0-3 §7 acceptance, asserted rather than assumed.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad       integer;
  v_seed      integer;
  v_expected  integer;
  v_free      integer;
  v_max_real  bigint;
  v_counter   bigint;
  v_prefix    text;
  v_padding   integer;
  v_after     bigint;
  v_first     text;
  v_second    text;
  v_pay_year  boolean;
  v_rls       boolean;
  v_select    integer;
  v_writes    integer;
  v_pin       text;
begin
  -- (a) every booking number is bare digits
  select count(*) into v_bad from bookings where booking_no !~ '^[0-9]+$';
  if v_bad > 0 then
    raise exception 'POST-CONDITION FAILED: % booking_no value(s) are not digits.', v_bad;
  end if;

  -- (b) the seed is parked, relative to what step 3 actually recorded — so this
  --     holds for live's 46 and a rebuild's 23 alike. An absolute count here is
  --     what broke the rebuild.
  select count(*) into v_expected from booking_no_migration_map
   where (new_no)::bigint >= 90000;
  select count(*) into v_seed from bookings
   where (booking_no)::bigint between 90000 and 90045;
  if v_seed <> v_expected then
    raise exception 'POST-CONDITION FAILED: expected % bookings at 90000-90045, found %.', v_expected, v_seed;
  end if;

  -- (c) 900-945 is empty
  select count(*) into v_free from bookings
   where (booking_no)::bigint between 900 and 945;
  if v_free <> 0 then
    raise exception 'POST-CONDITION FAILED: 900-945 should be empty, found % row(s).', v_free;
  end if;

  -- (d) the map is under RLS: staff SELECT only, no write policy, anon revoked
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.booking_no_migration_map'::regclass;
  if not coalesce(v_rls, false) then
    raise exception 'POST-CONDITION FAILED: booking_no_migration_map has no row level security (DB-13 a).';
  end if;
  select count(*) filter (where cmd = 'SELECT'),
         count(*) filter (where cmd <> 'SELECT')
    into v_select, v_writes
    from pg_policies
   where schemaname = 'public' and tablename = 'booking_no_migration_map';
  if v_select <> 1 or v_writes <> 0 then
    raise exception
      'POST-CONDITION FAILED: booking_no_migration_map should carry exactly one SELECT policy and no write policy; found % SELECT, % other.',
      v_select, v_writes;
  end if;
  if has_table_privilege('anon', 'public.booking_no_migration_map', 'SELECT')
     or has_table_privilege('anon', 'public.booking_no_migration_map', 'INSERT')
     or has_table_privilege('anon', 'public.booking_no_migration_map', 'UPDATE')
     or has_table_privilege('anon', 'public.booking_no_migration_map', 'DELETE') then
    raise exception 'POST-CONDITION FAILED: anon still holds a privilege on booking_no_migration_map.';
  end if;

  -- (e) the counter: bare, unpadded, above every real number, below the band
  select coalesce(max((booking_no)::bigint), 0) into v_max_real
    from bookings where (booking_no)::bigint < 90000;
  select current_value, prefix, padding into v_counter, v_prefix, v_padding
    from number_sequences where sequence_key = 'booking';
  if v_prefix <> '' or v_padding <> 1 then
    raise exception 'POST-CONDITION FAILED: booking sequence is prefix "%" padding %, expected bare and unpadded (R-10).', v_prefix, v_padding;
  end if;
  if v_counter < v_max_real then
    raise exception 'POST-CONDITION FAILED: booking counter % sits below the highest real booking number %; the next mint would collide.', v_counter, v_max_real;
  end if;
  if v_counter + 1 >= 90000 then
    raise exception 'POST-CONDITION FAILED: booking counter % would mint into the parked 90000 band.', v_counter;
  end if;

  -- (f) Mint for real — TWICE — inside a subtransaction that is then rolled back.
  --
  -- Checking the COUNTER alone is exactly what let `padding = 1` through: the
  -- stored value was a correct 899, and every minted string came back '9'
  -- because `lpad` truncates. The only assertion that catches that is the one
  -- that asks the function what the next two bookings will actually be called,
  -- and checks that neither is a number a booking already holds. Two mints,
  -- because "the second one collides" is the live failure mode. No number is
  -- consumed: the sentinel raise undoes the counter moves, the block below
  -- verifies that.
  begin
    v_first  := next_document_number('booking');
    v_second := next_document_number('booking');

    if v_first !~ '^[0-9]+$' or v_second !~ '^[0-9]+$' then
      raise exception
        'POST-CONDITION FAILED: booking minted "%" then "%"; expected bare digits.', v_first, v_second;
    end if;
    if (v_first)::bigint <> v_counter + 1 or (v_second)::bigint <> v_counter + 2 then
      raise exception
        'POST-CONDITION FAILED: booking minted "%" then "%", expected % then %. '
        'The counter is right, so this is a formatting fault — check padding and '
        'the lpad width in next_document_number.', v_first, v_second, v_counter + 1, v_counter + 2;
    end if;
    if exists (select 1 from bookings where booking_no in (v_first, v_second)) then
      raise exception
        'POST-CONDITION FAILED: the next booking numbers (% / %) already exist in bookings; creation would still collide.',
        v_first, v_second;
    end if;

    raise notice '0085 mint probe: next two bookings would be % and % — both free.', v_first, v_second;
    raise exception using message = 'ROLLBACK_MINT_PROBE';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_MINT_PROBE' then
        raise;
      end if;
  end;

  select current_value into v_after from number_sequences where sequence_key = 'booking';
  if v_after <> v_counter then
    raise exception 'POST-CONDITION FAILED: the mint probe consumed a number (counter % -> %).', v_counter, v_after;
  end if;

  -- (g) payment is year-less (R-18)
  select include_year into v_pay_year from number_sequences where sequence_key = 'payment';
  if v_pay_year then
    raise exception 'POST-CONDITION FAILED: payment sequence still resets yearly (R-18).';
  end if;

  -- (h) the search_path pin 0050 put on next_document_number is back
  select array_to_string(proconfig, ',') into v_pin
    from pg_proc where oid = 'public.next_document_number(text)'::regprocedure;
  if coalesce(v_pin, '') not like '%search_path=public, pg_temp%' then
    raise exception 'POST-CONDITION FAILED: next_document_number has no search_path pin (0050 convention); proconfig = %.', coalesce(v_pin, '<null>');
  end if;

  raise notice '0085 verified: digits only, % parked at 90000+, 900-945 free, map under RLS, next mint % (free), payment year-less, search_path pinned.',
    v_expected, v_counter + 1;
end $$;

commit;
