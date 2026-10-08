-- =============================================================================
-- 0089_next_document_number_never_truncates.sql — 4 Sep 2026 · patched 6 Sep 2026
-- (DB-01, DB-13 c, DB-06's `transfer` row)
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
-- as they stand, and re-confirmed 6 Sep:
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
-- ## What this file does and does not un-brick — corrected 6 Sep (DB-13 c)
--
-- The 4 Sep header said "production can be un-bricked immediately without
-- committing to the renumber". That is true for **client, invoice and deposit**
-- and FALSE for **booking**: the booking counter (917) sits inside the seeded
-- B-900…B-945 block, so with the formatter fixed the next mint is `B-918`, which
-- exists. Un-bricking bookings needs the counter re-pointed, which is `0085`
-- step 7. The post-condition below now mints against the owning table, so
-- applying this file to a database whose booking counter still collides FAILS
-- LOUDLY naming 0085, instead of applying and leaving booking creation broken
-- with a green ledger. In filename order (0085 then 0089) it passes.
--
-- ## Why this is still separate from 0085
--
-- `0085` carries the same function fix, but it also renumbers every booking to a
-- bare integer and parks the seed corpus at 90000+. That renumber is a deliberate
-- one-way change. This file is the function, one registry row, and the proof.
--
-- Both are `create or replace` on the same body, so applying them in either order
-- — or both — leaves the same function. This file changes no existing row.
--
-- ## The `transfer` row (DB-06, the routed half)
--
-- `createStockTransfer` (`implemented: true`, dispatched from the Transfer Center)
-- mints `next_document_number('transfer')`, and no migration ever seeded that
-- key — `0012` seeded seven, `0056` three. Every Transfer Center create on live
-- ends in "Number sequence transfer does not exist". R-12 lists the nine
-- unchanged prefixes and names no transfer prefix, so the prefix is NOT ruled;
-- the registry enum `default_system_sequence_prefix` (0001) carries `TRF`, and
-- the retired seed data used `TR-2026-00xx`. The row is added here under the
-- enum's `TRF-` (separator carried by the prefix, like `INV-`/`BND-`), year-less
-- and unpadded like every ruled sequence (R-00: sequences never reset), with
-- `on conflict do nothing` so a ruling that prefers another prefix can seed it
-- first and this insert steps aside. Recorded as PLAN.md §4.48 (b). No transfer
-- has ever been written (0 rows live and on a rebuild), so nothing is renumbered.
--
-- ## The search_path pin
--
-- `0050` pinned this function to `public, pg_temp`; `0055`'s `create or replace`
-- wiped it (live `proconfig` is NULL today). Restated here and asserted below.
--
-- ## Post-condition — assert by MINTING, not by reading the counter
--
-- For every sequence: mint TWICE inside a subtransaction, check the two strings
-- against the formatter's contract, against an independent "the digits at the
-- end are the whole number" test (so a formula bug cannot hide behind a mirrored
-- formula), against the ruled shape, and against the table the key numbers —
-- then roll the subtransaction back so no number is consumed. Also asserts that
-- every key a routed action mints from has a row.
--
-- Verified 4 Sep 2026 on a database rebuilt from all migrations: before the fix
-- `next_document_number('booking')` returned `9`; after it, three consecutive
-- calls returned `900`, `901`, `902`, and `INV-10000` / `EQ1000000` no longer
-- truncate. Re-verified 6 Sep with the two-mint probe below.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · The formatter. Byte-identical to 0085 step 6, pin included.
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
-- 2 · The one routed key with no registry row (DB-06). See the header.
--
-- `current_value` starts at the highest TRF- number already stored, which is 0
-- everywhere today; `on conflict do nothing` keeps a ruled row if one lands
-- first.
-- -----------------------------------------------------------------------------
insert into number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
select
  'transfer',
  'TRF-',
  extract(year from current_date)::int,
  coalesce((select max(substring(transfer_no from 5)::bigint)
              from stock_transfers
             where transfer_no ~ '^TRF-[0-9]+$'), 0),
  1,
  false
on conflict (sequence_key) do nothing;

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions.
-- -----------------------------------------------------------------------------
do $$
declare
  r            record;
  v_year       integer := extract(year from current_date);
  v_expect_val bigint;
  v_expect     text;
  v_expect2    text;
  v_first      text;
  v_second     text;
  v_tail       bigint;
  v_shape      text;
  v_owner      text;
  v_tbl        text;
  v_col        text;
  v_dupes      integer;
  v_after      bigint;
  v_missing    text;
  v_pin        text;
  v_probed     integer := 0;

  -- The ruled shape per key. `booking` admits the pre-0085 `B-` form and
  -- `payment` the pre-R-18 year segment so this file can be applied standalone;
  -- after 0085 both mint the bare form and still match.
  shapes constant jsonb := jsonb_build_object(
    'booking',    '^(B-)?[0-9]+$',
    'client',     '^C-[0-9]+$',
    'invoice',    '^INV-[0-9]+$',
    'deposit',    '^DEP-[0-9]+$',
    'bundle',     '^BND-[0-9]+$',
    'expense',    '^EXP-[0-9]+$',
    'membership', '^M-[0-9]+$',
    'quote',      '^Q-[0-9]+$',
    'equipment',  '^EQ[0-9]{6,}$',
    'payment',    '^PAY-([0-9]{4}-)?[0-9]+$',
    'transfer',   '^TRF-[0-9]+$'
  );

  -- The table and column each key numbers. Keys absent here (membership, quote)
  -- have no owning column in the schema yet and get the shape check only.
  owners constant jsonb := jsonb_build_object(
    'booking',   'bookings.booking_no',
    'client',    'clients.client_code',
    'invoice',   'invoices.invoice_no',
    'payment',   'payments.payment_no',
    'deposit',   'security_deposits.deposit_no',
    'expense',   'expenses.expense_no',
    'bundle',    'bundles.bundle_code',
    'equipment', 'products.asset_code',
    'transfer',  'stock_transfers.transfer_no'
  );
begin
  -- (1) every key a routed action mints from has a row. Read off
  --     `git grep "p_sequence_key: '"` at HEAD plus create_booking's 'booking'
  --     and the two latent finance keys; membership/quote are ruled rows (0056).
  select string_agg(k, ', ' order by k) into v_missing
    from unnest(array['booking','bundle','client','deposit','equipment','expense',
                      'invoice','membership','payment','quote','transfer']) k
   where not exists (select 1 from number_sequences s where s.sequence_key = k);
  if v_missing is not null then
    raise exception 'POST-CONDITION FAILED: number_sequences is missing row(s) an action mints from: %.', v_missing;
  end if;

  -- (2) the pin
  select array_to_string(proconfig, ',') into v_pin
    from pg_proc where oid = 'public.next_document_number(text)'::regprocedure;
  if coalesce(v_pin, '') not like '%search_path=public, pg_temp%' then
    raise exception 'POST-CONDITION FAILED: next_document_number has no search_path pin (0050 convention); proconfig = %.', coalesce(v_pin, '<null>');
  end if;

  -- (3) mint twice per sequence, prove, roll back
  for r in select sequence_key, prefix, padding, current_value, current_year, include_year
             from number_sequences order by sequence_key
  loop
    if r.include_year and r.current_year <> v_year then
      v_expect_val := 1;
    else
      v_expect_val := r.current_value + 1;
    end if;

    v_expect  := r.prefix
              || case when r.include_year then v_year::text || '-' else '' end
              || lpad(v_expect_val::text, greatest(r.padding, length(v_expect_val::text)), '0');
    v_expect2 := r.prefix
              || case when r.include_year then v_year::text || '-' else '' end
              || lpad((v_expect_val + 1)::text, greatest(r.padding, length((v_expect_val + 1)::text)), '0');
    v_shape   := shapes ->> r.sequence_key;
    v_owner   := owners ->> r.sequence_key;

    begin
      v_first  := next_document_number(r.sequence_key);
      v_second := next_document_number(r.sequence_key);

      if v_first <> v_expect or v_second <> v_expect2 then
        raise exception
          'POST-CONDITION FAILED: sequence % minted "%" then "%", expected "%" then "%".',
          r.sequence_key, v_first, v_second, v_expect, v_expect2;
      end if;

      -- Independent of the formula above: the trailing digit run must BE the
      -- number. This is the check `lpad` truncation fails and a mirrored
      -- formula cannot.
      v_tail := (substring(v_first from '([0-9]+)$'))::bigint;
      if v_tail is null or v_tail <> v_expect_val then
        raise exception
          'POST-CONDITION FAILED: sequence % minted "%" — the digits do not read back as % (truncated).',
          r.sequence_key, v_first, v_expect_val;
      end if;
      if v_first = v_second then
        raise exception 'POST-CONDITION FAILED: sequence % minted the same number twice ("%").', r.sequence_key, v_first;
      end if;

      if v_shape is not null and (v_first !~ v_shape or v_second !~ v_shape) then
        raise exception
          'POST-CONDITION FAILED: sequence % minted "%" / "%", which is not the ruled shape %.',
          r.sequence_key, v_first, v_second, v_shape;
      end if;

      if v_owner is not null then
        v_tbl := split_part(v_owner, '.', 1);
        v_col := split_part(v_owner, '.', 2);
        execute format('select count(*) from %I where %I in ($1, $2)', v_tbl, v_col)
           into v_dupes using v_first, v_second;
        if v_dupes > 0 then
          raise exception
            'POST-CONDITION FAILED: sequence % would mint "%" / "%", and %.% already holds %. The counter sits '
            'behind the data, so the formatter fix alone does not un-brick this key%.',
            r.sequence_key, v_first, v_second, v_tbl, v_col, v_dupes,
            case when r.sequence_key = 'booking' then ' — apply 0085 first (it re-points the booking counter)' else '' end;
        end if;
      end if;

      v_probed := v_probed + 1;
      raise exception using message = 'ROLLBACK_MINT_PROBE';
    exception
      when others then
        if sqlerrm <> 'ROLLBACK_MINT_PROBE' then
          raise;
        end if;
    end;

    -- No number consumed by the probe.
    select current_value into v_after from number_sequences where sequence_key = r.sequence_key;
    if v_after <> r.current_value then
      raise exception 'POST-CONDITION FAILED: the mint probe consumed a number on % (counter % -> %).',
        r.sequence_key, r.current_value, v_after;
    end if;
  end loop;

  raise notice '0089 verified: % sequences each mint two distinct, untruncated, ruled-shape, free numbers; no counter consumed; transfer row present; search_path pinned.', v_probed;
end $$;

commit;
