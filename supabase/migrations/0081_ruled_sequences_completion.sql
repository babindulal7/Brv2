-- =============================================================================
-- Finish the 12 Aug identifier ruling in the sequence registry.
--
-- ✅ APPLIED to sxguwvgoserhdolewibb, 13 Aug 2026, and verified by querying the
-- catalog afterwards — not by reading this file. (`migration-headers-lie`: the
-- NOT APPLIED banners in this directory have caused wrong diagnoses before.
-- Query `number_sequences` and the rows, never trust a comment.)
--
-- `0055` moved the two columns carrying a format CHECK. It did not touch
-- `number_sequences`, and a live census found the ruling two-thirds done:
--
--   RULED, PRESENT, CORRECT   booking B- · client C- · invoice INV-
--   RULED, ABSENT ENTIRELY    membership M- · quote Q- · bundle BND-
--   NOT RULED, OLD SHAPE      deposit DEP- · payment PAY- · expense EXP-
--
-- Three of the six ruled entities had no way to mint a number at all.
--
-- User ruling, 13 Aug 2026: add the three, convert the neighbours.
--
-- `equipment` (EQ, padding 6) is deliberately untouched — not in the ruling's
-- table, separator-less by design, and `products_asset_code_format` (0004:140)
-- enforces `^EQ[0-9]{6}$`. Changing it would invent a product decision.
--
-- -----------------------------------------------------------------------------
-- ⛔ WHAT THIS FILE DOES NOT DO, AND WHY — read before "finishing" it
-- -----------------------------------------------------------------------------
-- The first version of this migration also renumbered `payments.payment_no`
-- (93 rows, `PAY-2026-0001` → `PAY-1`) and moved the `payment` sequence with its
-- neighbours. **The database refused it**, and was right to:
--
--   P0001: Law 3 (append-only): UPDATE on payments is rejected for every role
--   including Owner and service_role. Correction: insert a payment_reversals
--   row referencing this payment.
--
-- That is `trg_payments_reject_update` from `0046`. The argument for proceeding
-- was that a renumber is not a *correction* — the amount, method, date, invoice
-- link and every reversal relationship were untouched, and this is a pre-launch
-- seed corpus no client has ever been handed on a receipt. The enforcement does
-- not accept that distinction, and an immutability rule with an exception for
-- well-intentioned bulk updates is not an immutability rule. The whole
-- transaction rolled back; nothing half-applied.
--
-- So **the 93 existing payment numbers are permanent**, and the `payment`
-- sequence is deliberately LEFT at padding 4 / include_year true, so that table
-- stays internally consistent rather than splitting across two shapes at row 94.
--
-- Whether payments should diverge from every other document in the product is a
-- product decision, not a migration detail. It is recorded in
-- `WIREFRAME_RULINGS_2026-08-12.md` §9 as open. If it is ever ruled that new
-- payments should mint `PAY-94`, that is a one-line UPDATE on this table — and
-- the historical rows still cannot move.
--
-- The append-only trigger covers `payments`, `payment_reversals`, `audit_events`,
-- `backup_logs` and `booking_stage_transitions`. It does NOT cover
-- `security_deposits` or `expenses`, which is why those two could be rewritten.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · The three ruled sequences that did not exist
-- -----------------------------------------------------------------------------
-- `current_value` starts at 0 because `next_document_number()` returns
-- `current_value + 1` — so the first membership issued is `M-1`, matching the
-- ruling's own worked example rather than starting at `M-2`.

insert into number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
values
  ('membership', 'M-',   extract(year from current_date)::int, 0, 1, false),
  ('quote',      'Q-',   extract(year from current_date)::int, 0, 1, false),
  ('bundle',     'BND-', extract(year from current_date)::int, 0, 1, false)
on conflict (sequence_key) do nothing;

-- -----------------------------------------------------------------------------
-- 2 · The two convertible neighbours
-- -----------------------------------------------------------------------------
-- `payment` is excluded — see the header. Idempotent.

update number_sequences
set padding = 1, include_year = false, updated_at = now()
where sequence_key in ('deposit', 'expense')
  and (padding <> 1 or include_year);

-- -----------------------------------------------------------------------------
-- 3 · Existing rows, into the ruled shape
-- -----------------------------------------------------------------------------
-- Shape-guarded like `0055`: only rows still in the retired four-segment form are
-- rewritten, so this is a no-op on a second run. `expenses` carries 0 rows today;
-- its UPDATE is written for completeness, so a row seeded later in the old shape
-- cannot survive the migration meant to catch it.

-- ⚠ NOTE, 3 Sep 2026 — the deposit rewrite below is now a NO-OP on a fresh
-- build, on purpose. Until 3 Sep, 0047_seed_reference_corpus.sql wrote deposits
-- in the retired `DEP-YYYY-NNNN` shape (its SEQUENCES spec still said DEP was
-- unruled — this file ruled it), so this rewrite renumbered the seeded rows and a
-- SECOND apply of 0047 then missed its own `on conflict (deposit_no)` arbiter
-- and died on `security_deposits_client_uuid_key`. Measured: DEP-2026-0001
-- written, DEP-1 stored. The seed now emits `DEP-<n>` directly (src/lib/seed.ts,
-- SEQUENCES.deposit), so the `where deposit_no ~ '^DEP-[0-9]{4}-[0-9]+$'` below
-- matches nothing seeded and the post-condition passes untouched. The rewrite
-- stays: it is still what a database seeded before 3 Sep needs.
--
update security_deposits
set deposit_no = 'DEP-' || coalesce(nullif(regexp_replace(split_part(deposit_no, '-', 3), '^0+', ''), ''), '0')
where deposit_no ~ '^DEP-[0-9]{4}-[0-9]+$';

update expenses
set expense_no = 'EXP-' || coalesce(nullif(regexp_replace(split_part(expense_no, '-', 3), '^0+', ''), ''), '0')
where expense_no ~ '^EXP-[0-9]{4}-[0-9]+$';

-- -----------------------------------------------------------------------------
-- 4 · Prove it, in the same transaction
-- -----------------------------------------------------------------------------
-- A migration that silently half-applies is worse than one that fails: the next
-- reader inherits a corpus where some rows carry one shape and some another, with
-- nothing recording which pass produced which.

do $$
declare
  v_missing text;
  v_stale   int;
begin
  select string_agg(k, ', ') into v_missing
  from unnest(array['booking','client','invoice','membership','quote','bundle']) k
  where not exists (
    select 1 from number_sequences s
    where s.sequence_key = k and s.prefix is not null
      and s.padding = 1 and s.include_year = false
  );
  if v_missing is not null then
    raise exception 'ruled sequences missing or not in the ruled shape: %', v_missing;
  end if;

  select count(*) into v_stale from security_deposits where deposit_no !~ '^DEP-[0-9]+$';
  if v_stale > 0 then
    raise exception '% deposit(s) still carry the retired number shape', v_stale;
  end if;
end $$;

commit;

-- Verified live after apply:
--   booking B-/1/f 917 · client C-/1/f 73 · invoice INV-/1/f 120
--   membership M-/1/f 0 · quote Q-/1/f 0 · bundle BND-/1/f 0
--   deposit DEP-/1/f 89 · expense EXP-/1/f 0
--   payment PAY-/4/TRUE 93  ← deliberately unchanged, see header
--   equipment EQ/6/f 289    ← out of scope
--   security_deposits: DEP-1 … DEP-89 (89 rows, 0 malformed)
--   payments: PAY-2026-0001 … PAY-2026-0093 (93 rows, permanent)
