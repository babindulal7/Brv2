-- =============================================================================
-- The 12 Aug 2026 identifier ruling, brought into the schema.
--
-- `WIREFRAME_RULINGS_2026-08-12.md` §2 closes `PLAN.md` §4.4 and fixes six
-- entities as PREFIX + counter, with **no year segment and no zero padding**:
--
--     Booking B-  ·  Client C-  ·  Membership M-
--     Invoice INV-  ·  Quote Q-  ·  Bundle BND-
--
-- `src/data/numbering.ts` was moved to that scheme; the database was not. Two
-- CHECK constraints still enforce the retired shapes, so the seed corpus
-- rejects itself on apply:
--
--   0002_bookings.sql:58  booking_no  ~ '^BK-[0-9]{4}-[0-9]{4}$'
--   0005_clients.sql:89   client_code ~ '^CL-[0-9]{4}-[0-9]{4}$'
--
-- against 0047_seed_reference_corpus.sql, which now carries 36 `B-<n>` booking
-- numbers and `C-34`. Applying migrations in order fails at 0047's first client
-- insert. This migration is what makes 0047 runnable.
--
-- ⚠ UPDATED 3 Sep 2026 — the dependency described below is now SYMMETRIC.
--
-- 0047 no longer needs this migration to have run first, and this migration no
-- longer needs 0047's rows to be in the retired shape. 0047 carries a guarded
-- prologue (right after its `begin;`) that performs exactly the two CHECK swaps
-- below — same constraint names, same regexes, copied verbatim — but ONLY if the
-- retired CL-/BK- shape is still in force. So:
--
--   · filename order (0047, then this file): 0047 swaps the CHECKs, seeds the
--     ruled C-<n> / B-<n>; this file's `drop if exists` / `add` re-issues the
--     same constraints and its `update … where ~ '^CL-'` rewrite finds no rows.
--   · production order (this file, then 0047 — what actually happened on
--     12 Aug): the CHECKs are already ruled, 0047's prologue is a no-op, the
--     seed inserts as-is.
--
-- Both orders were built and compared on 3 Sep: filename order (0047 then 0055) and production order (everything but 0047,
-- then 0047 alone onto the built database) both seed 40 clients / 120 bookings
-- in the ruled shape, and pg_get_constraintdef for both CHECKs is byte-identical
-- to this file's text afterwards; a second apply of 0047 skips every insert on
-- its arbiter and then fails closed on its own issuance self-check — one-shot by
-- design, see 0047's header (PROGRESS.md 3 Sep). The
-- `drop if exists` on lines 75-76 is what makes this file idempotent over the
-- prologue; keep it. The regexes on lines 101-105 are the source of truth —
-- 0047's copies must stay byte-identical to them.
--
-- (The paragraph that follows is the 12 Aug account and is kept as history. Its
-- "this migration is what makes 0047 runnable" was true until 2 Sep, when an
-- audit found that the reverse dependency — seeding the retired shape so this
-- file could rewrite it — shape-locked 0047 to pre-0055 and broke `--from 0047`
-- on every built database. PLAN.md §4.42(a) has the measurement.)
--
-- ⚠ APPLIED 12 Aug 2026, with approval, BEFORE 0047 — the application order is
-- deliberately not the file order. Everything above this line describes the
-- state that made this migration necessary; it is history, not the live rule.
--
-- ⚠ Corrected 15 Aug 2026. This header used to end "⚠ NOT APPLIED … Written and
-- reviewed, not executed", and that line outlived the apply. It was still being
-- read as current: two separate audits on 15 Aug quoted it (and the doc comments
-- it had seeded across `src/actions/rentals`) to conclude that the booking-number
-- format was in conflict with itself and that `createRental` was blocked. It is
-- not, and it was not. Read from project sxguwvgoserhdolewibb on 15 Aug 2026 —
-- every section of this file is present in the live schema:
--
--   §2  bookings: 121 rows, B-715 … B-917. 121 match '^B-[0-9]+$', 0 match the
--       retired '^BK-[0-9]{4}-[0-9]{4}$'.
--   §3  bookings_booking_no_format CHECK (booking_no ~ '^B-[0-9]+$')
--       clients_client_code_format  CHECK (client_code ~ '^C-[0-9]+$')
--   §4  number_sequences: booking B- · client C- · invoice INV-,
--       all padding 1, all include_year false.
--
-- PROGRESS.md agrees twice over: "0055 had a fatal ordering bug, found by
-- applying it … It applied cleanly after that", and the census line counting 41
-- clients "with the pre-existing C-102, rewritten from CL-2026-0102 by 0055" —
-- a row only this file's UPDATE could have rewritten. 0047 then applied on top
-- of it, which the retired CHECK would have refused.
--
-- SCOPE. Only the two ruled columns move. `crew_bookings.crew_booking_no`
-- (CB-), `products.asset_code` (EQ), `cases.case_no` (CASE-) and
-- `charges.charge_no` (CHG-) are **not** in the ruling's table and are left
-- exactly as they are — renaming them would be inventing a product decision
-- (PLAN.md §0). `invoices.invoice_no` carries a unique constraint but no format
-- CHECK, so `INV-1` already satisfies the schema and nothing here touches it.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Drop the retired constraints, BEFORE rewriting the rows they reject
-- -----------------------------------------------------------------------------
-- ⚠ Order corrected 12 Aug 2026, on the first attempt to apply this file.
--
-- The rewrite used to come first, and could not work: the retired CHECKs carry
-- the SAME NAMES this section drops — `bookings_booking_no_format` (0002:58) and
-- `clients_client_code_format` (0005:89) — so an UPDATE writing `C-102` was
-- still being judged against `^CL-[0-9]{4}-[0-9]{4}$` and failed as a row
-- violation, aborting the migration before a single constraint had been
-- touched. Live apply reported exactly that:
--
--   ERROR 23514: new row for relation "clients" violates check constraint
--   "clients_client_code_format" · DETAIL: Failing row contains (…, C-102, …)
--
-- Dropping first leaves the columns briefly unconstrained INSIDE this
-- transaction, which is the only window in which the retired shape and the
-- ruled one both have to exist. Nothing else can observe it.

alter table bookings drop constraint if exists bookings_booking_no_format;
alter table clients  drop constraint if exists clients_client_code_format;

-- -----------------------------------------------------------------------------
-- 2 · Existing rows, into the ruled shape
-- -----------------------------------------------------------------------------
-- Idempotent and shape-guarded: only rows still in the retired form are
-- rewritten, so re-running is a no-op and a row already reading `B-715` is left
-- alone. `BK-2026-0715` → `B-715`: keep the counter segment, strip its leading
-- zeros (`nullif(..., '')` covers an all-zero counter, which becomes `0`).

update bookings
set booking_no = 'B-' || coalesce(nullif(regexp_replace(split_part(booking_no, '-', 3), '^0+', ''), ''), '0')
where booking_no ~ '^BK-[0-9]{4}-[0-9]{4}$';

update clients
set client_code = 'C-' || coalesce(nullif(regexp_replace(split_part(client_code, '-', 3), '^0+', ''), ''), '0')
where client_code ~ '^CL-[0-9]{4}-[0-9]{4}$';

-- -----------------------------------------------------------------------------
-- 3 · The ruled constraints
-- -----------------------------------------------------------------------------
-- `BR-` stays reserved as the branch token (ruling requirement 3,
-- `branches_code_format` in 0007). A one-letter `B-` booking prefix cannot
-- collide with it: `^B-[0-9]+$` admits digits only, so `BR-KTM-01` fails it.

alter table bookings add constraint bookings_booking_no_format
  check (booking_no ~ '^B-[0-9]+$');

alter table clients add constraint clients_client_code_format
  check (client_code ~ '^C-[0-9]+$');

-- -----------------------------------------------------------------------------
-- 3 · The generator
-- -----------------------------------------------------------------------------
-- `next_document_number()` (0007:359) hardcoded a year segment for every
-- sequence but EQ, and reset the counter to 1 on a year change (0007:375).
-- Both are wrong for a year-less format: a Calendar Year reset on `B-N`
-- re-issues `B-1` every January, which is a duplicate identifier, not a new
-- one. `src/data/numbering.ts` records the same reasoning for the app side.
--
-- Which sequences are year-less is data, not a branch in the function body —
-- the ruling can add an entity, and a `prefix = 'EQ'`-style test is the SQL
-- twin of the hardcoded prefix §2.2 exists to remove.

alter table number_sequences add column if not exists include_year boolean not null default true;

comment on column number_sequences.include_year is
  'False for the sequences ruled year-less on 12 Aug 2026 (WIREFRAME_RULINGS §2). '
  'Drives both the rendered format and whether a year change may reset the counter.';

update number_sequences set prefix = 'B-',   padding = 1, include_year = false where sequence_key = 'booking';
update number_sequences set prefix = 'C-',   padding = 1, include_year = false where sequence_key = 'client';
update number_sequences set prefix = 'INV-', padding = 1, include_year = false where sequence_key = 'invoice';

-- `equipment` was previously carried by an explicit `prefix = 'EQ'` test inside
-- the function. It is year-less in exactly the same sense as the ruled three,
-- so it moves onto the same flag rather than keeping a second mechanism that
-- says the same thing. Its prefix and padding are untouched: EQ is not in the
-- ruling's table and keeps its separator-less six-digit form, `EQ000824`.
update number_sequences set include_year = false where sequence_key = 'equipment';

-- payment, deposit and expense keep their year segment and their Calendar Year
-- reset, both unchanged — none of the three is in the ruling's table.

create or replace function next_document_number(p_sequence_key text)
returns text
language plpgsql
as $$
declare
  v_rec record;
  v_year integer := extract(year from current_date);
  v_next_val bigint;
  v_formatted text;
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

  if v_rec.include_year then
    v_formatted := v_rec.prefix || v_year::text || '-' || lpad(v_next_val::text, v_rec.padding, '0');
  else
    -- Prefix carries its own separator where it has one ('B-', 'INV-'); EQ has
    -- none, which is how `EQ000824` keeps working through the same branch.
    v_formatted := v_rec.prefix || lpad(v_next_val::text, v_rec.padding, '0');
  end if;

  return v_formatted;
end;
$$;

commit;
