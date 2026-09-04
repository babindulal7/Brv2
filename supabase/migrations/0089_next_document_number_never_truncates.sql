-- =============================================================================
-- 0089_next_document_number_never_truncates.sql — 4 Sep 2026
--
-- **P0, LIVE TODAY.** Four production sequences mint a truncated number, and the
-- second create of each collides on its unique index.
--
-- ## The defect
--
-- `next_document_number` formats as `prefix || lpad(v::text, padding, '0')`.
-- Postgres `lpad` **truncates** when the value is longer than the width — it is
-- "pad OR cut to exactly n", not "pad to at least n":
--
--     lpad('918',   1, '0') = '9'
--     lpad('10000', 4, '0') = '1000'
--
-- Measured against the live project on 4 Sep 2026 (read-only), with the counters
-- as they stand:
--
--   | sequence | current_value | would mint | should be |
--   |----------|---------------|------------|-----------|
--   | booking  | 917           | B-9        | B-918     |
--   | client   | 750           | C-7        | C-751     |
--   | invoice  | 120           | INV-1      | INV-121   |
--   | deposit  | 89            | DEP-9      | DEP-90    |
--
-- So the first booking, client, invoice or deposit created on production gets a
-- wrong number, and the second one raises a unique violation. Creating any of
-- those four is broken right now.
--
-- ## The fix
--
-- `greatest(padding, length(v))` — pad up to the configured width, never cut.
-- For every value that fits inside its padding the expression is byte-identical
-- to the old one, so **nothing already issued changes shape**: `EQ001151` still
-- formats as `EQ001151`, `PAY-2026-0094` still formats as `PAY-2026-0094`.
--
-- ## Why this is separate from 0085
--
-- `0085` carries the same function fix, but it also renumbers every booking to a
-- bare integer and parks the seed corpus at 90000+. That renumber is a deliberate
-- one-way change awaiting its own go-ahead. This file is **only** the function,
-- so production can be un-bricked immediately without committing to the renumber.
--
-- Both are `create or replace` on the same body, so applying them in either order
-- — or both — leaves the same function. Applying this file changes no data.
--
-- Verified 4 Sep 2026 on a database rebuilt from all migrations: before the fix
-- `next_document_number('booking')` returned `9`; after it, three consecutive
-- calls returned `900`, `901`, `902`, and `INV-10000` / `EQ1000000` no longer
-- truncate.
-- =============================================================================

begin;

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

  -- Never narrower than the number itself. A fixed width here silently truncates
  -- and re-issues a number that already exists — see the header.
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
-- Post-condition — assert by MINTING, not by reading the counter.
--
-- A counter check is exactly what let this defect through: `current_value` was
-- correct throughout, and every formatted string was wrong. This mints one number
-- per sequence, compares it against the number it should be, and rolls the
-- counter back so no document number is consumed by the check.
-- -----------------------------------------------------------------------------
do $$
declare
  r        record;
  v_minted text;
  v_expect text;
begin
  for r in select sequence_key, prefix, padding, current_value, current_year, include_year, updated_at
             from number_sequences order by sequence_key
  loop
    v_expect := r.prefix
             || case when r.include_year then extract(year from current_date)::text || '-' else '' end
             || lpad((r.current_value + 1)::text, greatest(r.padding, length((r.current_value + 1)::text)), '0');

    select next_document_number(r.sequence_key) into v_minted;

    if v_minted <> v_expect then
      raise exception
        'POST-CONDITION FAILED: sequence % minted "%", expected "%".',
        r.sequence_key, v_minted, v_expect;
    end if;

    -- Put the counter back; this check must not consume a number.
    update number_sequences
       set current_value = r.current_value, current_year = r.current_year, updated_at = r.updated_at
     where sequence_key = r.sequence_key;
  end loop;

  raise notice '0089 verified: every sequence mints its full number; no counter consumed.';
end $$;

commit;
