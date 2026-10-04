-- ====================================================================
-- Babin Rentals OS — Cutover Batch: supabase_cutover_batch_1_0079_to_0105.sql
-- Scope: Migrations 79 to 105
-- Purpose: Core booking transitions, RLS guards, RPCs (create_invoice), floor stage gates
-- Paste into Supabase SQL Editor and click RUN
-- ====================================================================

-- Ensure migration probes and seed operations can insert lines under 0119 money guard
select set_config('app.in_create_booking', 'on', false);

-- >>> START 0079_invoice_vat_rate_is_authoritative.sql <<<
-- =============================================================================
-- 0079 - PLAN.md 4.42(c): make `invoices.vat_rate` authoritative.
--        DRAFT - **NOT APPLIED**. CLAUDE.md forbids applying a migration to the
--        live project without explicit approval. Verify the ledger
--        (`supabase_migrations.schema_migrations`) before trusting this header;
--        headers in this directory have been wrong before.
--
-- `recalculate_invoice_totals()` hardcodes `0.13` and never reads `vat_rate`,
-- proved against `pg_proc.prosrc` on the LIVE function rather than by reading
-- SQL files. So `invoices.vat_rate` can hold any value and change nothing: a
-- column that looks authoritative, is typed and defaulted like a setting, and is
-- inert. That is BUG-012.
--
-- ## Why this is safe, and why now
--
-- `vat_rate` is `numeric(5,4) NOT NULL DEFAULT 0.1300` - **no row can hold
-- NULL**, and the default is exactly the constant being replaced. Reading the
-- column is therefore behaviour-preserving for every row that can exist, today
-- and historically. 4.42(c) worried that "every existing row needs checking";
-- the live count is **0 invoices**, and post-condition (4) proves the no-op for
-- whatever exists at apply time rather than assuming it.
--
-- Units match: the column stores a FRACTION (0.1300), not a percent, which is
-- the same form as the literal `0.13` it replaces. `discount_percent` beside it
-- IS a percent and keeps its `/ 100.0`. Getting that backwards multiplies VAT
-- by one hundred.
--
-- ## What this deliberately does NOT change
--
-- The 2-dp rounding stays exactly as it is. Whether the trigger should round to
-- paisa or to the whole rupee like `src/lib/money.ts` `price()` is **4.42(b)**,
-- an unruled finance question rather than an engineering preference; changing it
-- here would smuggle a ruling into a bug fix. The measured gap is Rs 0.98 per
-- invoice, Rs 0.48 of it VAT, on the 2.8 reference case.
--
-- ## Two corrections to 4.42(c) itself
--
-- 1. **`invoice_lines.tax_rate` does not exist.** 4.42(c) cites it at
--    `0006:450` as "the same shape needing the same answer". Line 450 of
--    `0006_finance.sql` is inside `create table tax_ledgers` (which begins at
--    :439), not `invoice_lines` - whose full column list carries no tax column,
--    because tax is applied once at invoice level over the sum of `line_total`.
--    Confirmed against `information_schema.columns` on the live project: the
--    only `tax_rate` in `public` is on `tax_ledgers`.
-- 2. **`tax_ledgers.tax_rate` is a different problem.** It is real and shares
--    the type and default, but it is not an ignored column - **nothing writes
--    `tax_ledgers` at all**, which `src/modules/finance/Expenses.tsx:105`
--    already states ("purchase VAT would come from tax_ledgers.expense_id,
--    which no query reads yet"). An unwritten table is a Phase gap, not a dead
--    column, and no fix belongs here.
--
-- Attributes reproduced from the live function (`pg_proc`): invoker rights (NOT
-- security definer), volatile, `search_path = public, pg_temp`. `create or
-- replace` keeps the existing binding - `trg_recalc_invoice_lines` on
-- `invoice_lines` - which post-condition (2) re-asserts.
-- =============================================================================

begin;

create or replace function recalculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_outstanding numeric(14,2);
  v_vat_rate numeric(5,4);
  v_target_invoice_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_target_invoice_id := OLD.invoice_id;
  else
    v_target_invoice_id := NEW.invoice_id;
  end if;

  -- 1. Calculate sum of line totals
  select coalesce(sum(line_total), 0)
  into v_subtotal
  from invoice_lines
  where invoice_id = v_target_invoice_id;

  -- 2. Fetch invoice discount percentage, VAT rate and paid amount.
  --    `vat_rate` joins this select rather than being hardcoded below. It is
  --    NOT NULL, so STRICT remains the right failure mode: a missing invoice
  --    row raises, it does not silently price at zero VAT.
  select discount_percent, vat_rate, coalesce(paid_amount, 0)
  into STRICT v_discount, v_vat_rate, v_paid
  from invoices
  where id = v_target_invoice_id;

  -- 3. Calculate step-by-step
  v_discount := round(v_subtotal * (v_discount / 100.0), 2);
  v_taxable := v_subtotal - v_discount;
  v_vat := round(v_taxable * v_vat_rate, 2);   -- was: a hardcoded rate, not the column
                                               -- (the old literal is deliberately
                                               --  NOT written here: the post-condition
                                               --  below greps prosrc, and a comment
                                               --  mentioning it fails this migration)
  v_total := v_taxable + v_vat;
  v_outstanding := v_total - v_paid;

  -- 4. Update the invoice summary fields atomically
  update invoices
  set
    subtotal = v_subtotal,
    discount_amount = v_discount,
    taxable_amount = v_taxable,
    vat_amount = v_vat,
    total_amount = v_total,
    outstanding_amount = v_outstanding,
    updated_at = now()
  where id = v_target_invoice_id;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Post-conditions. These fail the migration rather than leaving a wrong belief
-- in a header - the failure mode 0077's own header warns about.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_src text;
  v_bad bigint;
begin
  select prosrc into v_src from pg_proc where proname = 'recalculate_invoice_totals';

  -- (1) The hardcode is gone and the column is read.
  if position('0.13' in v_src) > 0 then
    raise exception 'POST-CONDITION FAILED: a 0.13 literal survives in recalculate_invoice_totals()';
  end if;
  if position('vat_rate' in v_src) = 0 then
    raise exception 'POST-CONDITION FAILED: recalculate_invoice_totals() does not read vat_rate';
  end if;

  -- (2) The trigger binding survived `create or replace`. Without this the
  --     function is corrected and then simply never fires again.
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    where p.proname = 'recalculate_invoice_totals'
      and c.relname = 'invoice_lines'
      and not tg.tgisinternal
  ) then
    raise exception 'POST-CONDITION FAILED: the recalc trigger is no longer bound to invoice_lines';
  end if;

  -- (3) Invoker rights and search_path preserved. A silent promotion to
  --     SECURITY DEFINER here would hand a money-writing function to any role
  --     that can insert a line (Law 6).
  if exists (select 1 from pg_proc where proname = 'recalculate_invoice_totals' and prosecdef) then
    raise exception 'POST-CONDITION FAILED: recalculate_invoice_totals() became SECURITY DEFINER';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'recalculate_invoice_totals'
      and proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception 'POST-CONDITION FAILED: search_path was not preserved';
  end if;

  -- (4) The change is a no-op for the data that exists. An invoice already
  --     carrying a non-default rate would silently restate on its next line
  --     write, so name it here rather than discovering it in a total.
  select count(*) into v_bad from invoices where vat_rate <> 0.1300;
  if v_bad > 0 then
    raise exception
      'POST-CONDITION FAILED: % invoice(s) carry a vat_rate other than 0.1300; their totals would change on the next line write. Restate them deliberately, not as a side effect of this migration.',
      v_bad;
  end if;
end;
$chk$;

commit;

-- >>> END 0079_invoice_vat_rate_is_authoritative.sql <<<

-- >>> START 0080_draft_is_sticky.sql <<<
-- =============================================================================
-- 0080 — R-14: a Draft invoice stays Draft until it is explicitly issued.
--        DRAFT — **NOT APPLIED**. PHASE-0-PLAN.md Step 0 (live dump, restore
--        test, token rotation) must land first; Steps 1–3 change money and
--        lifecycle triggers on a database with no backup. CLAUDE.md forbids
--        applying to live without explicit approval either way.
--
-- Implements SPEC-P0-1 §2.1 — PHASE-0-PLAN.md Step 1.1. The status expression
-- below is the one that spec prescribes, not a variant of it.
--
-- ## Why this is a blocker rather than a nicety
--
-- `sync_payment_to_invoice()` sets `status = 'Partially Paid'` on the first
-- payment. That pushes the invoice out of Draft **mid-rental**, and
-- `reject_invoice_edit_after_issue()` then guards its figures — so appending a
-- damage line at return raises:
--
--     Law 4/finance: invoice % is issued (status %) — its figures are immutable.
--
-- R-02 (an invoice is Draft for the whole rental, issued once at return) and
-- R-03 (damage and late fees append as lines to that Draft) are therefore
-- **mutually impossible** under the live trigger. This is the smallest change
-- that makes both true.
--
-- `paid_amount` and `outstanding_amount` keep updating on a Draft, so the Draft
-- carries a true running balance through the rental — which is exactly what the
-- handover warning (R-06) reads.
-- =============================================================================

begin;

create or replace function public.sync_payment_to_invoice()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total_paid numeric(14,2);
  v_total_amount numeric(14,2);
  v_outstanding numeric(14,2);
  v_status invoice_status;
begin
  if NEW.invoice_id is not null then
    select total_amount, status
      into v_total_amount, v_status
      from invoices
     where id = NEW.invoice_id;

    select coalesce(sum(amount), 0) into v_total_paid
      from payments
     where invoice_id = NEW.invoice_id and status = 'Received';

    v_outstanding := greatest(0, v_total_amount - v_total_paid);

    update invoices
       set paid_amount        = v_total_paid,
           outstanding_amount = v_outstanding,
           status = case
             -- R-14. The whole point of this migration: a Draft is sticky.
             -- Only an explicit issue action moves an invoice out of Draft.
             when v_status = 'Draft'::invoice_status then v_status
             when v_outstanding = 0 then 'Paid'::invoice_status
             when v_total_paid > 0 then 'Partially Paid'::invoice_status
             else v_status
           end,
           updated_at = now()
     where id = NEW.invoice_id;
  end if;

  return NEW;
end;
$function$;

-- ── Post-conditions ─────────────────────────────────────────────────────────

do $$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sync_payment_to_invoice';

  if v_src is null then
    raise exception 'POST-CONDITION 1 FAILED: sync_payment_to_invoice does not exist';
  end if;

  -- (1) The Draft branch exists.
  if position('Draft' in v_src) = 0 then
    raise exception 'POST-CONDITION 1 FAILED: the status expression does not mention Draft — R-14 is not implemented';
  end if;

  -- (2) The trigger is still bound to payments. Replacing a function does not
  --     detach its trigger, but proving it costs nothing.
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.payments'::regclass
       and p.proname = 'sync_payment_to_invoice'
       and not t.tgisinternal
  ) then
    raise exception 'POST-CONDITION 2 FAILED: no trigger on payments runs sync_payment_to_invoice';
  end if;

  raise notice '0080 post-conditions passed: a Draft invoice now keeps its status when a payment lands.';
end $$;

commit;

-- =============================================================================
-- ## ⚠ Superseded in part by 0087, deliberately
--
-- This migration implements R-14 and nothing else, exactly as SPEC-P0-1 §2.1
-- prescribes, so it stays small and reviewable against the plan.
--
-- It does NOT fix three further defects in the same function, found on live on
-- 3 Sep and not covered by the spec: the sum ignores `payment_type`, so a
-- **Refund raises `paid_amount`** and a **Security Deposit counts as revenue**
-- (Law 5); and **no reversal ever re-syncs the invoice**.
-- `0087_payment_totals_exclude_refunds_and_net_reversals.sql` rewrites this
-- function again to fix all three, and **carries the R-14 rule forward**. Apply
-- 0080 then 0087, or 0087 alone — either order leaves R-14 in force.
--
-- ## Acceptance (SPEC-P0-1 §5, second bullet)
--
--   Record a 50% advance against a Draft → the invoice STAYS Draft and
--   `outstanding_amount` halves. Before this migration it flips to
--   'Partially Paid' and the return-time damage line then raises.
-- =============================================================================

-- >>> END 0080_draft_is_sticky.sql <<<

-- >>> START 0085_booking_numbers_bare.sql <<<
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

-- >>> END 0085_booking_numbers_bare.sql <<<

-- >>> START 0086_invoice_write_rights_and_draft_without_number.sql <<<
-- =============================================================================
-- 0086 — Make SPEC-P0-1 §3.1 implementable: align invoice write rights to R-05,
--        give `invoice_lines` a write policy at all, and let a Draft carry no
--        number (R-15).
--        DRAFT — **NOT APPLIED**. PHASE-0-PLAN.md Step 0 (live dump, restore
--        test, token rotation) must land first. CLAUDE.md forbids applying to
--        live without explicit approval either way. Verify the ledger
--        (`supabase_migrations.schema_migrations`) before trusting this header;
--        headers in this directory have been wrong before.
--
-- ## ⚠ Three gaps in PHASE-0-PLAN.md, not duplicates of it
--
-- Each of these blocks Step 3.4 ("`createInvoice` + wire `CreateInvoiceModal`")
-- from passing SPEC-P0-1 §5's own acceptance test. All three were measured
-- against the LIVE catalogue on 3–4 Sep, not read from the SQL files.
--
-- **(1) `invoice_lines` has no write policy.** SPEC-P0-1 §1 lists the table as
--      "exists, RLS on" and §3.1 has `createInvoice` write "one `invoice_lines`
--      row per `booking_lines` row". But:
--
--        select policyname, cmd from pg_policies
--         where schemaname='public' and tablename='invoice_lines';
--        -- → exactly ONE row: invoice_lines_select | SELECT
--
--      Postgres denies any command with no permissive policy, so every INSERT
--      raises `42501 new row violates row-level security policy`, for every
--      role including Owner. And because `trg_recalc_invoice_lines` fires only
--      on `invoice_lines`, an invoice that keeps no lines holds zero totals for
--      ever — a header with no lines is not a smaller invoice, it is a silently
--      free one.
--
-- **(2) The ruled rights and the live policy disagree.** R-05 and SPEC-P0-1
--      §3.1 both give invoice create/issue to **Owner · Admin · Manager ·
--      Accounts**. Live says otherwise:
--
--        invoices_insert / invoices_update
--          WITH CHECK (auth_user_role() = ANY (ARRAY[
--            'Owner','Admin','Manager','Coordinator']))
--
--      Accounts — the role the ruling names — is **absent**, and Coordinator,
--      which the ruling does not name, is **present**. Left alone, an Accounts
--      user is offered Create and Issue controls Postgres refuses (the
--      reachable-then-refused shape Law 6's absent-not-disabled rule exists to
--      prevent), while Coordinator keeps a database right the ruling withdraws.
--
--      PLAN.md §4.20's method is explicit about the order: **change the POLICY
--      first, then the predicate.** This is that change. `lib/rbac`'s
--      `canIssueInvoice` is written to match it in the same commit.
--
--      This also settles the AUTHSEC-01 half of the audit's finding for the
--      create/update path. It deliberately does NOT touch who may VOID — R-04
--      rules the void *mechanism* (Void + Credit Note) and no ruling restates
--      the void role set, so per R-00 (silence is not supersession) the older
--      position stands and `canVoidInvoice` is left alone.
--
-- **(3) A Draft cannot exist without a number.** R-15 says a Draft carries no
--      `invoice_no`, minted instead by `next_document_number('invoice')` at the
--      moment of issue, so an abandoned draft leaves no gap in the tax-invoice
--      sequence (Nepal IRD requires no gaps among issued invoices). But live:
--
--        invoices.invoice_no   text     NOT NULL
--        invoices.issue_date   date     NOT NULL DEFAULT CURRENT_DATE
--
--      Both are NOT NULL, so R-15 is unimplementable as the schema stands and
--      SPEC-P0-1 §3.1's "`invoice_no` — null" cannot be written. PHASE-0-PLAN
--      lists no migration for this.
-- =============================================================================

begin;

-- ── (3) A Draft carries no number and no issue date ─────────────────────────
-- The UNIQUE constraint stays. In Postgres, NULLs are distinct under UNIQUE, so
-- many un-issued Drafts coexist happily while issued numbers stay unique.

alter table public.invoices alter column invoice_no drop not null;
alter table public.invoices alter column issue_date drop not null;
alter table public.invoices alter column issue_date drop default;

comment on column public.invoices.invoice_no is
  'R-15. NULL while the invoice is a Draft. Minted by next_document_number(''invoice'') at the '
  'moment of issue, in the same transaction, so an abandoned draft leaves no gap in the issued '
  'sequence. UNIQUE still holds — NULLs are distinct under UNIQUE.';

comment on column public.invoices.issue_date is
  'R-15. NULL until the invoice is issued. Was NOT NULL DEFAULT CURRENT_DATE, which dated every '
  'Draft as though it had already been issued.';

/*
 * The two travel together. A row with a number and no date, or a date and no
 * number, is a half-issued invoice — a state neither R-02 nor R-15 admits, and
 * one that would put a gap in the sequence exactly where IRD forbids it.
 */
alter table public.invoices drop constraint if exists invoices_issued_together;
alter table public.invoices add constraint invoices_issued_together check (
  (invoice_no is null and issue_date is null)
  or (invoice_no is not null and issue_date is not null)
);

-- ── (2) Invoice write rights follow R-05 ────────────────────────────────────

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert
  on public.invoices
  for insert
  with check (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update
  on public.invoices
  for update
  using (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

-- ── (1) `invoice_lines` becomes writable, by the same four ──────────────────
-- Split INSERT and UPDATE rather than `for all`, so the grant reads next to the
-- invoices pair above and a later reader can diff them line for line.
-- No DELETE policy: Law 3. A wrong line is corrected by Void + Credit Note
-- (R-04), which `invoices_void_requires_reason` already shapes.

drop policy if exists invoice_lines_insert on public.invoice_lines;
create policy invoice_lines_insert
  on public.invoice_lines
  for insert
  with check (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

drop policy if exists invoice_lines_update on public.invoice_lines;
create policy invoice_lines_update
  on public.invoice_lines
  for update
  using (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

-- ── Post-conditions ─────────────────────────────────────────────────────────

do $$
declare
  v_cmds text;
  v_bad  int;
begin
  -- (1) invoice_lines now admits INSERT and UPDATE, and still refuses DELETE.
  select string_agg(distinct cmd, ',' order by cmd) into v_cmds
    from pg_policies where schemaname = 'public' and tablename = 'invoice_lines';

  if v_cmds is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception
      'POST-CONDITION 1 FAILED: invoice_lines policies cover %, expected exactly INSERT,SELECT,UPDATE', v_cmds;
  end if;

  -- (2) All four write policies carry the R-05 set, and none carries Coordinator.
  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('invoices_insert','invoices_update','invoice_lines_insert','invoice_lines_update')
     and not (
       coalesce(qual, with_check) like '%Owner%'
       and coalesce(qual, with_check) like '%Admin%'
       and coalesce(qual, with_check) like '%Manager%'
       and coalesce(qual, with_check) like '%Accounts%'
     );
  if v_bad <> 0 then
    raise exception 'POST-CONDITION 2 FAILED: % invoice write policies do not carry the R-05 role set', v_bad;
  end if;

  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('invoices_insert','invoices_update','invoice_lines_insert','invoice_lines_update')
     and coalesce(qual, with_check) like '%Coordinator%';
  if v_bad <> 0 then
    raise exception 'POST-CONDITION 2 FAILED: Coordinator survives in % invoice write policies; R-05 withdraws it', v_bad;
  end if;

  -- (3) A Draft can exist with no number, and a half-issued row cannot.
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='invoices' and column_name='invoice_no') <> 'YES' then
    raise exception 'POST-CONDITION 3 FAILED: invoices.invoice_no is still NOT NULL — R-15 is unimplementable';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_issued_together'
  ) then
    raise exception 'POST-CONDITION 3 FAILED: invoices_issued_together was not created';
  end if;

  -- (4) The number is still unique among ISSUED invoices.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_no_key' and contype = 'u'
  ) then
    raise exception 'POST-CONDITION 4 FAILED: the invoice_no UNIQUE constraint was lost';
  end if;

  -- (5) RLS is still enabled on both. A policy on an RLS-disabled table is decoration.
  if not (select bool_and(relrowsecurity) from pg_class
           where oid in ('public.invoices'::regclass, 'public.invoice_lines'::regclass)) then
    raise exception 'POST-CONDITION 5 FAILED: RLS is not enabled on invoices and invoice_lines';
  end if;

  -- (6) The totals trigger still fires on an `invoice_lines` write.
  -- Catalogue half only; the behavioural half is the probe below. Without this
  -- trigger the new INSERT policy would let a header keep lines and zero totals
  -- for ever — a silently free invoice, which is worse than the refusal it
  -- replaces.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.invoice_lines'::regclass
       and not tgisinternal
       and tgname = 'trg_recalc_invoice_lines'
  ) then
    raise exception
      'POST-CONDITION 6 FAILED: trg_recalc_invoice_lines is gone, so a line write would leave the header at zero.';
  end if;

  raise notice '0086 post-conditions passed: R-05 rights applied, invoice_lines writable, Drafts carry no number.';
end $$;

-- ── Behavioural post-conditions ─────────────────────────────────────────────
--
-- The catalogue block above reads pg_policies. `rls-masks-rows-not-columns` is
-- the standing lesson that a catalogue read is not proof: an inert column
-- REVOKE and an enforced one look identical in pg_class, and this repo has
-- shipped three of the inert kind. This migration's own footer already says
-- "prove it with role simulation, never with a zero-row read" — so it is proved
-- here rather than left as a paragraph for a human to run by hand.
--
-- Everything below is written inside a subtransaction and rolled back by a
-- sentinel exception, the idiom `0094` uses. PL/pgSQL variables are NOT
-- transactional, so a failure recorded in `v_fail` survives the rollback and is
-- re-raised afterwards; the probe therefore leaves no row behind whether it
-- passes or fails.
--
-- Two scratch users are created because neither the live project nor the
-- migration chain's own seed (`0012`) contains an **Accounts** row — 0012 seeds
-- Owner, Manager, Warehouse and a `Billing` string — so the role this migration
-- exists to admit could not otherwise be exercised at all.
do $$
declare
  v_booking  uuid;
  v_client   uuid;
  v_branch   uuid;
  v_accounts uuid := gen_random_uuid();
  v_coord    uuid := gen_random_uuid();
  v_invoice  uuid;
  v_no       text;
  v_total    numeric;
  v_refused  boolean;
  v_err      text;
  v_fail     text;
begin
  select b.id, b.client_id, b.branch_id
    into v_booking, v_client, v_branch
    from bookings b
   where b.cancelled_at is null
   order by b.created_at
   limit 1;

  if v_booking is null then
    raise notice
      '0086: this database holds no booking, so the behavioural probe was skipped. '
      'The catalogue post-conditions above still ran.';
    return;
  end if;

  begin
    insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id)
    values
      (v_accounts, gen_random_uuid(), 'PROBE-0086-A', 'probe-0086-accounts@invalid.test',
       'Probe Accounts', '+977-9700000086', 'Accounts', v_branch),
      (v_coord, gen_random_uuid(), 'PROBE-0086-C', 'probe-0086-coordinator@invalid.test',
       'Probe Coordinator', '+977-9700000087', 'Coordinator', v_branch);

    -- ── (A) Accounts — the role R-05 names and the old policy omitted ───────
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);

    insert into invoices (client_uuid, booking_id, client_id, branch_id, due_date, discount_percent, vat_rate)
    values (gen_random_uuid(), v_booking, v_client, v_branch, current_date, 0, 0.1300)
    returning id, invoice_no into v_invoice, v_no;

    -- R-15: no number, and `invoices_issued_together` means no issue_date either.
    if v_no is not null then
      v_fail := format('BEHAVIOURAL 1 FAILED: a Draft was created carrying invoice_no %s; R-15 mints it at issue.', v_no);
    end if;
    if v_fail is null and (select issue_date from invoices where id = v_invoice) is not null then
      v_fail := 'BEHAVIOURAL 1 FAILED: a Draft was dated as though issued; R-15 leaves issue_date null.';
    end if;

    -- ── (B) the line lands AND the totals trigger fires on it ──────────────
    insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total)
    values (gen_random_uuid(), v_invoice, 'Equipment Rental', '0086 probe line', 1, 1, 1000, 1000);

    select total_amount into v_total from invoices where id = v_invoice;
    if v_fail is null and coalesce(v_total, 0) = 0 then
      v_fail := format(
        'BEHAVIOURAL 2 FAILED: a line of 1000 landed but total_amount is %s. trg_recalc_invoice_lines did not fire '
        '(or its own UPDATE was refused by invoices_update), so this policy set ships headers that keep lines and '
        'stay free.', coalesce(v_total, 0));
    end if;

    reset role;
    perform set_config('app.current_user_id', '', true);

    -- ── (C) Coordinator — the role R-05 withdraws ──────────────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      insert into invoices (client_uuid, booking_id, client_id, branch_id, due_date)
      values (gen_random_uuid(), v_booking, v_client, v_branch, current_date);
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 3 FAILED: a Coordinator raised an invoice. R-05 withdrew that right.';
    end if;
    if v_fail is null and position('row-level security' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 3 FAILED: Coordinator was refused, but not by RLS. Postgres said: %s', v_err);
    end if;

    -- ── (D) Coordinator cannot write a LINE either ─────────────────────────
    -- Checked separately: the two tables carry two policy sets and an invoice
    -- whose header is locked but whose lines are open is still a money hole.
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total)
      values (gen_random_uuid(), v_invoice, 'Equipment Rental', 'coordinator line', 1, 1, 500, 500);
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 4 FAILED: a Coordinator appended a line to an invoice. R-05 withdrew that right.';
    end if;

    raise exception 'ROLLBACK_0086_PROBE';
  exception
    when others then
      reset role;
      if sqlerrm <> 'ROLLBACK_0086_PROBE' then
        raise;
      end if;
      perform set_config('app.current_user_id', '', true);
      if v_fail is not null then
        raise exception '%', v_fail;
      end if;
      raise notice
        '0086 behavioural probe passed and rolled back: Accounts raised a numberless Draft, the line moved the '
        'totals, Coordinator was refused on both tables.';
  end;
end $$;

/*
 * ## What is deliberately NOT constrained: a Draft with no lines
 *
 * The header note above calls a lineless header "a silently free one", and
 * nothing here forbids it. That is on purpose. SPEC-P0-1 §3.1 creates the Draft
 * first and appends to it for the whole rental (R-02, R-03) — damage and late
 * fees arrive at return through `addInvoiceLine` (§3.2) — so a Draft is empty
 * between its creation and its first line, and a NOT-NULL-shaped constraint on
 * "has at least one line" would make the ruled lifecycle impossible.
 *
 * The place to refuse a free invoice is `issue_invoice` (SPEC-P0-1 §3.3), which
 * is where a figure becomes final and a tax number is minted. That function is
 * not written yet and is out of this migration's scope; when it is, an empty
 * line set is one of the conditions it must refuse.
 */

commit;

-- =============================================================================
-- ## Prove it with role simulation, never with a zero-row read
--
-- `rls-masks-rows-not-columns` is the standing lesson: an empty table and a
-- perfectly-enforced policy are indistinguishable, and the MCP connection runs
-- privileged and bypasses RLS entirely.
--
-- This section used to be two blocks of SQL for a human to paste. It is now the
-- **behavioural post-condition block above**, which runs both directions —
-- Accounts admitted, Coordinator refused on the header AND on the line — inside
-- a rollback, every time this migration is applied. An instruction nobody runs
-- proves nothing; that is the whole reason the inert REVOKEs elsewhere in this
-- directory survived three audits.
--
-- What still wants a human, once, after applying: mint an invoice through
-- `create_invoice` (0096) from the running application as a signed-in Accounts
-- user, and read the row back on the Finance screen. The block above proves the
-- policies; only the application proves the wiring.
--
-- ## What this migration deliberately leaves alone
--
--   · **Who may void.** No 4 Sep ruling restates it, so R-00 keeps the older
--     position and `canVoidInvoice` (Owner, Accounts) stands — still at odds
--     with the policy set here. That is AUTHSEC-01's remaining half and it
--     needs a ruling, not a migration.
--   · **`discount_amount`.** R-17 makes it derived; `recalculate_invoice_totals`
--     already overwrites it, so no constraint is added to say so twice.
-- =============================================================================

-- >>> END 0086_invoice_write_rights_and_draft_without_number.sql <<<

-- >>> START 0087_payment_totals_exclude_refunds_and_net_reversals.sql <<<
-- =============================================================================
-- 0087 — P0-6: stop a refund from increasing what a client has paid, stop a
--        security deposit counting as revenue, and make a reversal correct its
--        invoice.
--        DRAFT — **NOT APPLIED**. PHASE-0-PLAN.md Step 0 (live dump, restore
--        test, token rotation) must land first. CLAUDE.md forbids applying to
--        live without explicit approval either way. Verify the ledger
--        (`supabase_migrations.schema_migrations`) before trusting this header.
--
-- ## Where this sits against the ruled plan
--
-- **Not in PHASE-0-PLAN.md.** These three defects were found on live on 3 Sep
-- and SPEC-P0-1 does not cover them: its §2.1 fixes only the Draft-sticky
-- status rule (R-14), in `0080_draft_is_sticky`. Numbered 0087 so it stays
-- clear of the ruled 0080–0085 range and applies after them.
--
-- It rewrites `sync_payment_to_invoice` a second time and **carries R-14
-- forward** — see the Draft branch in the status expression below. Apply 0080
-- then 0087, or 0087 alone: either order leaves R-14 in force.
--
-- ## Three defects, one expression
--
-- All measured against the LIVE catalogue on 3 Sep 2026.
--
-- **(a) A refund increases `paid_amount`.** `sync_payment_to_invoice()` sums
--      `amount from payments where invoice_id = … and status = 'Received'` with
--      no filter on `payment_type`. The enum admits three values —
--      `Advance Payment`, `Security Deposit`, `Refund` — and
--      `payments_amount_positive` forces `amount > 0`. So a Refund row *raises*
--      `paid_amount` and *lowers* `outstanding_amount`. The sign is inverted on
--      the one column both the Handover gate and the Closed gate read.
--
-- **(b) A security deposit counts as revenue.** The same missing filter means a
--      `Security Deposit` payment lands in `paid_amount` and reduces
--      Outstanding. That is Law 5 broken at the trigger: *deposits are
--      liabilities and never touch Rental Total or Outstanding.* The app's read
--      layer already knows this and pins its own takings figure
--      (`lib/queries/finance.ts`); the stored row did not.
--
-- **(c) A reversal never corrects the invoice.** `payment_reversals` does carry
--      two triggers — `trg_payment_reversals_reject_delete` and
--      `..._reject_update`, the Law 3/4 append-only backstops — so the claim
--      "no trigger at all" that appears in the audit's cluster notes is wrong.
--      But **neither re-syncs the invoice.** `payments` cannot be UPDATEd
--      (0046), so a reversed payment keeps `status = 'Received'` for ever and
--      the invoice reads Paid with zero outstanding permanently. `validate_
--      booking_gates()` reads `outstanding_amount` for the Closed gate, so a
--      booking whose only payment was reversed still passes it.
--
-- ## Why one shared function instead of two triggers
--
-- The recompute now lives in `recompute_invoice_payment_state(uuid)` and both
-- triggers call it. Two copies of a money expression drift; this one cannot.
--
-- ## Latency, not luck
--
-- Live holds 0 payments and 0 invoices, so none of this has corrupted anything
-- yet. It arms on the first payment row — which is exactly what unblocking
-- invoicing (P0-1/P0-5) produces. **This migration must land in or before the
-- migration that first lets a payment be written**, because it corrupts
-- silently rather than failing loudly.
-- =============================================================================

begin;

-- ── The single source of truth for an invoice's payment state ───────────────

create or replace function public.recompute_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total_amount numeric(14,2);
  v_total_paid   numeric(14,2);
  v_reversed     numeric(14,2);
  v_outstanding  numeric(14,2);
  v_voided       timestamptz;
  v_status       invoice_status;
begin
  if p_invoice_id is null then
    return;
  end if;

  select total_amount, voided_at, status
    into v_total_amount, v_voided, v_status
    from invoices
   where id = p_invoice_id;

  if not found then
    return;
  end if;

  /*
   * A voided invoice is settled by a credit note, not by money moving. The old
   * function had no reference to `voided_at`, so a payment landing against a
   * voided invoice silently rewrote its status to 'Partially Paid' — un-voiding
   * it from a screen that never offered that action. `recordPayment` already
   * refuses this at the action layer; this is the same refusal at the row.
   */
  if v_voided is not null then
    return;
  end if;

  /*
   * ONLY 'Advance Payment' is revenue against the invoice.
   *   · 'Refund'          — money going the other way. Counting it as paid is
   *                         defect (a). A refund is recorded as a reversal.
   *   · 'Security Deposit' — a liability (Law 5). It has its own home in
   *                         `security_deposits` and must never touch
   *                         Outstanding. That is defect (b).
   */
  select coalesce(sum(p.amount), 0)
    into v_total_paid
    from payments p
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  /*
   * Net out every reversal written against those same payments. `payment_
   * reversals` has no `invoice_id` of its own — it points at the payment, and
   * the payment points at the invoice — so the join is the only route.
   */
  select coalesce(sum(r.amount), 0)
    into v_reversed
    from payment_reversals r
    join payments p on p.id = r.original_payment_id
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  v_total_paid  := greatest(0, v_total_paid - v_reversed);
  v_outstanding := greatest(0, v_total_amount - v_total_paid);

  update invoices
     set paid_amount        = v_total_paid,
         outstanding_amount = v_outstanding,
         status = case
           /* R-14, carried forward from 0080. A Draft is sticky: it keeps its
              status while money moves, and only an explicit issue action takes
              it out of Draft. Without this branch, R-02 (Draft for the whole
              rental) and R-03 (append damage lines at return) are mutually
              impossible — `reject_invoice_edit_after_issue` starts guarding the
              figures the moment the status leaves Draft. This clause must come
              FIRST; every branch below assumes the invoice is already issued. */
           when v_status = 'Draft'::invoice_status then v_status
           /* Fully settled. Guarded on total > 0 so a zero-value invoice is not
              declared Paid the moment it is created. */
           when v_outstanding = 0 and v_total_amount > 0 then 'Paid'::invoice_status
           when v_total_paid > 0 then 'Partially Paid'::invoice_status
           /* Money was here and has gone again — the reversal case. Without
              this clause a fully reversed invoice keeps status 'Paid' while
              carrying its full amount outstanding, which is the same lie in a
              different column. It returns to 'Sent', never to 'Draft': the
              invoice was issued and that fact does not un-happen. */
           when v_status in ('Paid'::invoice_status, 'Partially Paid'::invoice_status)
             then 'Sent'::invoice_status
           /* Draft / Sent / Overdue are left exactly as they were. */
           else v_status
         end,
         updated_at = now()
   where id = p_invoice_id;
end;
$function$;

comment on function public.recompute_invoice_payment_state(uuid) is
  'P0-6. The one expression that derives invoices.paid_amount / outstanding_amount / status. '
  'Counts only payment_type = ''Advance Payment'' (a Refund is not revenue; a Security Deposit is a '
  'liability, Law 5), nets payment_reversals, and never touches a voided invoice. '
  'Called by trg_payment_sync and trg_payment_reversal_sync — do not inline it into either.';

-- ── Both triggers now delegate ──────────────────────────────────────────────

create or replace function public.sync_payment_to_invoice()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform recompute_invoice_payment_state(NEW.invoice_id);
  return NEW;
end;
$function$;

create or replace function public.sync_reversal_to_invoice()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invoice_id uuid;
begin
  select p.invoice_id into v_invoice_id
    from payments p
   where p.id = NEW.original_payment_id;

  perform recompute_invoice_payment_state(v_invoice_id);
  return NEW;
end;
$function$;

drop trigger if exists trg_payment_reversal_sync on public.payment_reversals;
create trigger trg_payment_reversal_sync
  after insert on public.payment_reversals
  for each row
  execute function public.sync_reversal_to_invoice();

-- ── Post-conditions ─────────────────────────────────────────────────────────

do $$
declare
  v_src text;
begin
  -- (1) The recompute exists and pins the payment type.
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recompute_invoice_payment_state';

  if v_src is null then
    raise exception 'POST-CONDITION 1 FAILED: recompute_invoice_payment_state does not exist';
  end if;
  if position('Advance Payment' in v_src) = 0 then
    raise exception 'POST-CONDITION 1 FAILED: the recompute does not pin payment_type';
  end if;
  if position('payment_reversals' in v_src) = 0 then
    raise exception 'POST-CONDITION 1 FAILED: the recompute does not net reversals';
  end if;
  if position('voided_at' in v_src) = 0 then
    raise exception 'POST-CONDITION 1 FAILED: the recompute does not guard voided invoices';
  end if;
  -- R-14 must survive this rewrite. A later migration that drops the Draft
  -- branch re-breaks R-02/R-03 silently, so it is asserted rather than trusted.
  if position('Draft' in v_src) = 0 then
    raise exception 'POST-CONDITION 1 FAILED: the recompute dropped the Draft branch — R-14 regressed';
  end if;

  -- (2) The payments trigger no longer carries its own sum — it delegates, so
  --     the two paths cannot drift.
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sync_payment_to_invoice';

  if position('recompute_invoice_payment_state' in v_src) = 0 then
    raise exception 'POST-CONDITION 2 FAILED: sync_payment_to_invoice does not delegate';
  end if;
  if position('sum(' in v_src) > 0 then
    raise exception 'POST-CONDITION 2 FAILED: sync_payment_to_invoice still carries its own sum';
  end if;

  -- (3) payment_reversals now has a sync trigger, alongside its two append-only
  --     backstops (which must survive — they are Law 3/4).
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.payment_reversals'::regclass
       and tgname = 'trg_payment_reversal_sync'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 3 FAILED: trg_payment_reversal_sync was not created';
  end if;

  if (select count(*) from pg_trigger
       where tgrelid = 'public.payment_reversals'::regclass and not tgisinternal) <> 3 then
    raise exception 'POST-CONDITION 3 FAILED: payment_reversals should carry exactly 3 triggers '
                    '(reject_delete, reject_update, reversal_sync)';
  end if;

  -- (4) The payments trigger is still bound. Replacing a function does not
  --     detach its trigger, but proving it beats assuming it.
  if not exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.payments'::regclass
       and p.proname = 'sync_payment_to_invoice'
       and not t.tgisinternal
  ) then
    raise exception 'POST-CONDITION 4 FAILED: no trigger on payments runs sync_payment_to_invoice';
  end if;

  -- (5) Neither function is SECURITY DEFINER without a pinned search_path —
  --     the shape 0050's hardening pass exists to prevent.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('recompute_invoice_payment_state','sync_payment_to_invoice','sync_reversal_to_invoice')
       and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  ) then
    raise exception 'POST-CONDITION 5 FAILED: a SECURITY DEFINER function has no pinned search_path';
  end if;

  raise notice '0087 post-conditions passed: refunds and deposits no longer count as paid, and reversals re-sync.';
end $$;

commit;

-- =============================================================================
-- ## Proving it, with rows rather than by reading
--
-- Live holds no payments, so nothing here can be demonstrated by querying what
-- exists. Use a rolled-back transaction against a real invoice:
--
--   begin;
--     insert into payments (…, payment_type, amount, status) values (…, 'Advance Payment', 1000, 'Received');
--     select paid_amount, outstanding_amount, status from invoices where id = …;  -- paid 1000
--     insert into payments (…, payment_type, amount, status) values (…, 'Refund', 400, 'Received');
--     select paid_amount from invoices where id = …;  -- STILL 1000. Before 0098: 1400.
--     insert into payments (…, payment_type, amount, status) values (…, 'Security Deposit', 5000, 'Received');
--     select paid_amount from invoices where id = …;  -- STILL 1000. Before 0098: 6400.
--     insert into payment_reversals (…, original_payment_id, amount) values (…, <the 1000 payment>, 1000);
--     select paid_amount, outstanding_amount, status from invoices where id = …;
--     -- paid 0, outstanding = total, status back to 'Sent'. Before 0087: unchanged, still 'Paid'.
--   rollback;
-- =============================================================================

-- >>> END 0087_payment_totals_exclude_refunds_and_net_reversals.sql <<<

-- >>> START 0088_booking_no_numeric_index.sql <<<
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

-- >>> END 0088_booking_no_numeric_index.sql <<<

-- >>> START 0090_r06_handover_money_gate_warns.sql <<<
-- =============================================================================
-- 0090_r06_handover_money_gate_warns.sql — 4 Sep 2026
--
-- **P0.** `validate_booking_gates()` hard-blocks handover on outstanding money,
-- which contradicts a binding ruling.
--
-- ## The ruling
--
-- RULINGS-2026-09-04.md, R-06 — Handover money gate:
--
--   > **Warns, does not block.** Proceeding with an outstanding balance or an
--   > unpaid deposit requires a **named override reason**, recorded in
--   > `audit_events` with the amounts as they stood.
--   >
--   > The deposit warning is the loud one: an unpaid rental invoice is a
--   > receivable, but a missing security deposit is the only cover against
--   > damage and non-return.
--
-- R-00 makes that file binding and above PLAN.md, so the current hard block is a
-- defect, not a policy.
--
-- ## What it costs today
--
-- Measured on the reference corpus, 4 Sep 2026:
--   * 66 of 70 open bookings carry an outstanding balance,
--   * 9 Packed bookings carry a pending deposit,
-- and every one of them is refused at handover with no way through — there is no
-- override path in the trigger, and (separately) no screen can reduce
-- `security_deposits.pending_amount`. The van is loaded and Postgres says no.
--
-- Probed directly before this change:
--   UPDATE bookings SET stage='On Rent' WHERE booking_no='715'
--   -> ERROR: Gate Check Failure: Handover blocked due to outstanding rental
--      payment (Rs. 117520.00).
--
-- ## What changes, precisely
--
--   * **Handover (→ On Rent)** — money no longer blocks *by itself*. If anything
--     is owed, a **named reason is required**; with one, the transition proceeds
--     and an `audit_events` row records the reason and both amounts as they stood.
--     Without one, it is still refused — the refusal now names what to do.
--   * **Close (→ Closed)** — **UNCHANGED, still a hard block.** R-07 keeps it
--     that way, and R-06 is explicitly about handover only. Nothing below touches
--     the Closed branch.
--
-- ## How the reason reaches the trigger
--
-- `validate_booking_gates` is a BEFORE UPDATE trigger on `bookings` and sees only
-- the booking row, which has no reason column. The reason lives on the
-- `booking_stage_transitions` row that drives the update, so
-- `apply_booking_stage_transition` publishes it as a transaction-local GUC
-- (`set_config(..., true)`) immediately before its UPDATE, and the gate reads it.
--
-- A GUC rather than a column because the reason belongs to the *transition*, not
-- to the booking: writing it onto `bookings` would leave the last override reason
-- sitting on the row forever, describing a moment that has passed.
--
-- Transaction-local means it cannot leak into another statement or session, and a
-- direct `UPDATE bookings SET stage='On Rent'` that bypasses the transition table
-- carries no reason and is therefore still refused — the override is available
-- only through the recorded path.
--
-- ## Patched 6 Sep 2026 — the search_path pins (DB-13 d)
--
-- Both functions above are re-stated with `create or replace`, and that statement
-- replaces the function's SET clauses too. `0050_function_hardening` pinned BOTH
-- to `search_path = public, pg_temp` (0050:102, 0050:113) — `pg_temp` named LAST
-- on purpose, because when it is not named Postgres searches the temporary schema
-- FIRST for relations, so a caller could shadow `bookings` or `invoices` with a
-- temp table. The 4 Sep draft restated `apply_booking_stage_transition` (SECURITY
-- DEFINER, owned by postgres — the escalation shape 0050 names) with
-- `set search_path = public`, dropping `pg_temp`, and restated
-- `validate_booking_gates` with no SET at all, wiping its pin entirely. Live holds
-- `public, pg_temp` on both (read-only, 6 Sep). Both pins are now restated, and
-- the post-condition block asserts them so a later restatement cannot lose them
-- quietly again.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · The gate. Handover warns-and-records; Close is left exactly as it was.
-- -----------------------------------------------------------------------------
create or replace function validate_booking_gates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit_pending    numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
  v_reason             text;
  v_actor              uuid;
  v_branch             uuid;
begin
  -- 1. Handover gate (transition to 'On Rent') — R-06: WARN, do not block.
  if NEW.stage = 'On Rent' and (OLD.stage is null or OLD.stage < 'On Rent') then
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    /*
     * `select … into` leaves the variable NULL when NO ROW matches — the
     * `coalesce` inside the query only covers a row that exists with a null
     * column. A booking with no `security_deposits` row therefore arrived here
     * as NULL, which printed "pending deposit of Rs. <NULL>" in the refusal and
     * made the test below three-valued. Observed 6 Sep on booking 864.
     */
    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        -- Still refused, but for the thing R-06 actually requires: a NAME on the
        -- decision. The message says what is owed and what would let it through.
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a '
          'pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded '
          'against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      v_actor  := nullif(btrim(coalesce(current_setting('app.stage_actor_id',  true), '')), '')::uuid;
      v_branch := nullif(btrim(coalesce(current_setting('app.stage_branch_id', true), '')), '')::uuid;

      /*
       * R-06: "recorded in audit_events with the amounts AS THEY STOOD". They are
       * captured here, inside the same transaction as the stage move, so the row
       * cannot describe a balance that a later payment has already changed.
       */
      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.id, 'Approve', v_actor, v_branch, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           OLD.stage,
          'to_stage',             NEW.stage
        )
      );
    end if;
  end if;

  -- 2. Close gate (transition to 'Closed') — R-07: STAYS A HARD BLOCK.
  --    Deliberately untouched. Outstanding must be 0 and the deposit resolved,
  --    with no override of any kind.
  if NEW.stage = 'Closed' and (OLD.stage is null or OLD.stage < 'Closed') then
    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled invoices.';
    end if;

    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_pending := coalesce(v_deposit_pending, 0);

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled security deposit.';
    end if;
  end if;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2 · Publish the transition's reason so the gate above can read it.
--
-- Only the four `set_config` lines are new; everything else is the function as it
-- stood, re-stated because plpgsql has no way to patch a body in place.
-- -----------------------------------------------------------------------------
create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_stage    booking_stage;
  v_closed_at        timestamptz;
  v_prev_occurred_at timestamptz;
begin
  select stage, closed_at into v_current_stage, v_closed_at
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  if v_closed_at is not null then
    raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
  end if;

  if NEW.from_stage is null then
    if v_current_stage <> 'Quote' then
      raise exception 'Genesis transition rejected: booking % is not at Quote (currently %).', NEW.booking_id, v_current_stage;
    end if;
    if NEW.to_stage <> 'Quote' then
      raise exception 'Genesis transition must target Quote, got %.', NEW.to_stage;
    end if;
  else
    if NEW.from_stage <> v_current_stage then
      raise exception 'Stage transition rejected: from_stage (%) does not match booking %''s actual current stage (%). Stale read or concurrent write.',
        NEW.from_stage, NEW.booking_id, v_current_stage;
    end if;

    if NEW.is_reversal then
      if NEW.to_stage >= NEW.from_stage then
        raise exception 'Reversal rejected: to_stage (%) does not precede from_stage (%).', NEW.to_stage, NEW.from_stage;
      end if;
    else
      if NEW.to_stage <> next_booking_stage(NEW.from_stage) then
        raise exception 'Stage transition rejected: % does not immediately follow % -- skipping a stage is only legal as an approved reversal.',
          NEW.to_stage, NEW.from_stage;
      end if;
    end if;
  end if;

  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  /*
   * NEW — publish this transition's identity for `validate_booking_gates`, which
   * fires on the UPDATE below and cannot see this row. Transaction-local, so it
   * ends with the statement's transaction and cannot leak anywhere else.
   */
  perform set_config('app.stage_override_reason', coalesce(NEW.reason, ''), true);
  perform set_config('app.stage_actor_id',        coalesce(NEW.actor_id::text, ''), true);
  perform set_config('app.stage_branch_id',       coalesce(NEW.branch_id::text, ''), true);

  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case when NEW.to_stage = 'Closed' then NEW.occurred_at else closed_at end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;
  -- This UPDATE still passes through bookings' own BEFORE UPDATE trigger
  -- (trg_booking_gate_check / validate_booking_gates(), 0010) exactly as if
  -- a client had issued it directly -- SECURITY DEFINER changes who owns
  -- the row lock and the column-revoke bypass, not which triggers fire.

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 · Post-condition — the 0050 pins survived the restatement (DB-13 d).
-- -----------------------------------------------------------------------------
do $$
declare
  v_fn  text;
  v_pin text;
begin
  foreach v_fn in array array['apply_booking_stage_transition', 'validate_booking_gates'] loop
    select array_to_string(p.proconfig, ',') into v_pin
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_fn;
    if coalesce(v_pin, '') not like '%search_path=public, pg_temp%' then
      raise exception 'POST-CONDITION FAILED: % lost its 0050 search_path pin (public, pg_temp); proconfig = %.',
        v_fn, coalesce(v_pin, '<null>');
    end if;
  end loop;
  if not (select prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname = 'apply_booking_stage_transition') then
    raise exception 'POST-CONDITION FAILED: apply_booking_stage_transition is no longer SECURITY DEFINER.';
  end if;
  raise notice '0090 verified: apply_booking_stage_transition and validate_booking_gates keep search_path = public, pg_temp.';
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Post-conditions. Both halves of R-06, and R-07 left intact.
-- -----------------------------------------------------------------------------
do $$
declare
  v_booking   uuid;
  v_owing     numeric(14,2);
  v_audit_after  bigint;
  v_stage     booking_stage;
  v_blocked   boolean := false;
begin
  -- a booking that is Packed and owes money — exactly the case that was refused
  select b.id into v_booking
  from bookings b
  join invoices i on i.booking_id = b.id and i.status not in ('Void')
  where b.stage = 'Packed'
  group by b.id
  having coalesce(sum(i.outstanding_amount), 0) > 0
  limit 1;

  if v_booking is null then
    raise notice '0090: no Packed booking with an outstanding balance in this database; behavioural check skipped.';
    return;
  end if;

  -- (a) with NO reason it must still refuse
  perform set_config('app.stage_override_reason', '', true);
  begin
    update bookings set stage = 'On Rent' where id = v_booking;
  exception when others then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: handover with money owing and no override reason was allowed.';
  end if;

  -- (b) with a reason it must proceed AND record the override
  --
  -- Counted by IDENTITY, not by total: `bookings` carries its own audit trigger
  -- (trg_audit_bookings), so the UPDATE writes an ordinary audit row of its own.
  -- An assertion on the raw count sees two and fails for the wrong reason — which
  -- is exactly what it did on the first run of this migration.
  perform set_config('app.stage_override_reason', 'QA post-condition: client pays on delivery', true);
  update bookings set stage = 'On Rent' where id = v_booking;

  select stage into v_stage from bookings where id = v_booking;

  select count(*) into v_audit_after
  from audit_events
  where record_id = v_booking
    and reason = 'QA post-condition: client pays on delivery'
    and new_values ->> 'gate' = 'handover_money'
    and new_values ->> 'ruling' = 'R-06';

  if v_stage <> 'On Rent' then
    raise exception 'POST-CONDITION FAILED: handover with a named reason did not move the stage (still %).', v_stage;
  end if;
  if v_audit_after <> 1 then
    raise exception 'POST-CONDITION FAILED: expected exactly one R-06 override row in audit_events, found %.', v_audit_after;
  end if;

  raise notice '0090 verified: handover refuses without a reason, proceeds with one, and records it.';

  -- This block only ever ran to prove the behaviour; undo it.
  raise exception 'ROLLBACK_POSTCONDITION_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_POSTCONDITION_PROBE' then
      raise notice '0090 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;

-- >>> END 0090_r06_handover_money_gate_warns.sql <<<

-- >>> START 0091_audit_events_refuse_anonymous_writes.sql <<<
-- =============================================================================
-- 0091_audit_events_refuse_anonymous_writes.sql — 5 Sep 2026
--
-- **Security.** An UNAUTHENTICATED caller can write forged rows into
-- `audit_events`, and Law 3 then makes them permanent.
--
-- ## Reproduced, not theorised
--
-- With the project's anon key alone — no sign-in, no session — 4 Sep 2026:
--
--   POST /rest/v1/audit_events
--   {"client_uuid":"…","table_name":"bookings","action":"Approve","record_id":"…"}
--   -> HTTP 201, audit_events 2195 -> 2196
--
-- and then, trying to remove it:
--
--   DELETE FROM audit_events WHERE client_uuid = '…'
--   -> ERROR: Law 3 (nothing is deleted): DELETE on audit_events is rejected for
--      every role including Owner and service_role.
--
-- So the forged row cannot be taken out again — not by Owner, not by
-- `service_role`. The anon key ships inside the client bundle by design, so this
-- is reachable by anyone who opens the app and reads its JavaScript.
--
-- ## Why it was open
--
-- `0011:205` declares the policy with no `TO` clause:
--
--   create policy audit_events_insert on audit_events for insert with check (true);
--
-- A policy with no `TO` applies to **PUBLIC**, which includes `anon`, and the
-- platform default privileges had already granted `anon` INSERT. SELECT was
-- correctly restricted to Owner/Manager (`0011:198`), so the trail could never be
-- read by a stranger — only written by one. That asymmetry is why it went unseen:
-- nothing in the UI could ever show the forged row to the person who could act on
-- it.
--
-- ## What this changes, and what it deliberately does not
--
-- INSERT becomes `authenticated` + `service_role` only, and `anon`'s INSERT grant
-- is revoked. The grant is the part that actually stops PostgREST — it refuses on
-- privilege before any policy is consulted — and the `TO` clause is the second
-- lock behind it.
--
-- `with check (true)` is KEPT for the roles that remain. Tying rows to
-- `auth.uid()` was considered and rejected on evidence: **598 of the 5 424 live
-- audit rows carry a NULL `actor_id`**, so such a check would refuse writes the
-- system makes legitimately today.
--
-- Nothing legitimate loses a path. Verified against live before writing:
--
--   * `log_audit_event`, `record_password_reset_request` and `revoke_staff_pin_for`
--     are all SECURITY DEFINER and **not executable by anon**, so every
--     trigger-written and pre-login audit row is unaffected — they run as the
--     owner, and `audit_events` has FORCE ROW LEVEL SECURITY off, so the owner
--     bypasses RLS entirely.
--   * `create_booking` is not SECURITY DEFINER, so its audit insert runs as the
--     caller — who is `authenticated` in every legitimate case.
--
-- What this does NOT fix: a signed-in staff member can still write an audit row
-- describing something that did not happen. Narrowing that needs a ruling on who
-- may write what, and is a different question from an anonymous stranger doing it.
-- =============================================================================

begin;

-- 1 · The lock PostgREST actually checks first.
revoke insert on table audit_events from anon;

/*
 * And STATE the grant the application depends on, rather than inheriting it.
 *
 * On live this is a no-op: the platform default privileges already granted it.
 * On a database rebuilt from these migrations it is not — no migration in this
 * repo grants table privileges to `authenticated`, so a from-scratch build has
 * an app that cannot write here at all. That gap is filed separately, but a
 * migration whose whole subject is who may INSERT into this table should not
 * leave the answer to an environment it does not control.
 */
grant insert on table audit_events to authenticated, service_role;

-- 2 · The policy behind it. Same predicate, but no longer offered to PUBLIC.
drop policy if exists audit_events_insert on audit_events;

create policy audit_events_insert on audit_events
  for insert
  to authenticated, service_role
  with check (true);

comment on table audit_events is
  'Append-only audit trail. INSERT is authenticated/service_role only (0091) — an '
  'anonymous caller could previously forge rows that Law 3 then made permanent. '
  'SELECT stays Owner/Manager (0011).';

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions. Proven by ATTEMPTING the write as anon, not by reading
--     the catalogue — a grant can be present and a policy still refuse, and vice
--     versa, so only the attempt settles it.
-- -----------------------------------------------------------------------------
do $$
declare
  v_before  bigint;
  v_after   bigint;
  v_blocked boolean := false;
begin
  if has_table_privilege('anon', 'public.audit_events', 'INSERT') then
    raise exception 'POST-CONDITION FAILED: anon still holds INSERT on audit_events.';
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    raise exception 'POST-CONDITION FAILED: authenticated lost INSERT on audit_events.';
  end if;

  select count(*) into v_before from audit_events;

  -- The exact call the reproduction used, now as the anon role.
  begin
    set local role anon;
    insert into audit_events (client_uuid, table_name, record_id, action)
    values (gen_random_uuid(), 'bookings', '00000000-0000-0000-0000-000000000001', 'Approve');
  exception
    when insufficient_privilege or others then
      v_blocked := true;
  end;
  reset role;

  select count(*) into v_after from audit_events;

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: an anonymous INSERT into audit_events was accepted.';
  end if;
  if v_after <> v_before then
    raise exception 'POST-CONDITION FAILED: the anonymous INSERT wrote a row (% -> %).', v_before, v_after;
  end if;

  raise notice '0091 verified: anonymous INSERT refused and wrote nothing; authenticated retains its path.';
end $$;

commit;

-- >>> END 0091_audit_events_refuse_anonymous_writes.sql <<<

-- >>> START 0092_law6_warehouse_cannot_rewrite_prices.sql <<<
-- =============================================================================
-- 0092_law6_warehouse_cannot_rewrite_prices.sql — 5 Sep 2026
--
-- **Law 6 governs SELECT only.** A money-blind role can rewrite the prices it is
-- forbidden to see.
--
-- ## Reproduced on the local stack, 5 Sep 2026
--
-- Signed in as `warehouse@babinrentals.com` (`primary_role = 'Warehouse'`):
--
--   PATCH /rest/v1/products?id=eq.<uuid>   {"daily_rate": 1}
--   -> HTTP 200
--   daily_rate: 6500.00 -> 1.00
--
-- Every future rental of that product would have quoted Rs 1 a day, and nothing
-- in the app would have said so. Restored immediately after the probe.
--
-- ## Reachability — settled 6 Sep 2026, against live's REAL grant shape
--
-- This was written, then wrongly withdrawn, then reinstated. The record matters
-- more than the tidiness:
--
--   * 4 Sep — reproduced on a local stack, HTTP 200, 6500.00 -> 1.00.
--   * 6 Sep, wrongly — after `0093`'s first draft revoked SELECT on `products`
--     outright, the same request 403'd, and I recorded the finding as defence in
--     depth rather than a live hole. That draft did not match live.
--   * 6 Sep, settled — `0093` now reproduces live's actual shape, which masks
--     SELECT **per column**: the table is closed but `id`, `name` and the rest
--     are granted back, and only the money columns are withheld. PostgREST needs
--     SELECT on `id` to target a row, and live grants exactly that.
--
-- Re-tested under that shape, with this trigger disabled and then enabled:
--
--   disabled -> PATCH /products?id=eq.X {"daily_rate": 1}  =>  204, 6500.00 -> 1.00
--   enabled  -> same request                               =>  400, rate unchanged
--
-- So the hole is REAL on production as it stands today, and this trigger is what
-- closes it. UPDATE is not masked per column on live — `authenticated` may write
-- every money column it may not read — which is precisely why Law 6 needs a
-- guard on the write verb and not another revoke.
--
-- ## Why the existing controls do not catch it
--
-- `products_update` admits Owner, Admin, Manager **and Warehouse** — confirmed on
-- the live project, not inferred. That is correct for the job: warehouse staff own
-- serials, location, condition and status. The policy simply cannot express
-- "…but not the price columns", because an RLS `WITH CHECK` sees the new row and
-- has no way to say which columns changed.
--
-- Column privileges cannot express it either. Every signed-in user is the SAME
-- Postgres role — `authenticated` — and the app's own role lives in
-- `users.primary_role`, read by `auth_user_role()`. `REVOKE UPDATE (daily_rate)
-- … FROM authenticated` would take the column from Owner and Warehouse alike.
-- (This is also why the bare column revokes elsewhere in this repo are inert:
-- there is no Postgres role to revoke *from*.)
--
-- So the check has to compare OLD against NEW, which only a trigger can do.
--
-- ## The predicate is not invented
--
-- `auth_can_view_money()` already exists and already says exactly who is
-- money-blind:
--
--   select auth_user_role() not in ('Warehouse', 'Technician', 'Driver', 'Client');
--
-- This migration reuses it verbatim. A role that may not READ a price may not
-- WRITE one — that is Law 6 applied to the other verb, not a new rule.
--
-- ## The exemption, and why it is keyed on the Postgres role
--
-- `auth_user_role()` falls back to `'Client'` when there is no JWT and no
-- `app.current_user_id`, so `auth_can_view_money()` is FALSE inside a plain
-- migration, a seed, or any psql session. Guarding on the app role alone would
-- therefore refuse `0047`'s seed and every admin script.
--
-- The guard is keyed on `current_user` instead: it applies only to `authenticated`
-- and `anon`, the two roles a browser can ever be. `postgres`, `supabase_admin`
-- and `service_role` pass through untouched, which is what keeps migrations,
-- seeds and server-side integrations working.
-- =============================================================================

begin;

create or replace function reject_money_column_write_by_money_blind_role()
returns trigger
language plpgsql
as $$
declare
  v_changed text[] := '{}';
begin
  /*
   * Only a browser session is subject to this. See the header: a migration has no
   * JWT, so `auth_user_role()` would report 'Client' and refuse the seed.
   */
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if auth_can_view_money() then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'products' then
    if NEW.daily_rate        is distinct from OLD.daily_rate        then v_changed := v_changed || 'daily_rate'::text; end if;
    if NEW.weekly_rate       is distinct from OLD.weekly_rate       then v_changed := v_changed || 'weekly_rate'::text; end if;
    if NEW.monthly_rate      is distinct from OLD.monthly_rate      then v_changed := v_changed || 'monthly_rate'::text; end if;
    if NEW.hourly_rate       is distinct from OLD.hourly_rate       then v_changed := v_changed || 'hourly_rate'::text; end if;
    if NEW.weekend_rate      is distinct from OLD.weekend_rate      then v_changed := v_changed || 'weekend_rate'::text; end if;
    if NEW.purchase_price    is distinct from OLD.purchase_price    then v_changed := v_changed || 'purchase_price'::text; end if;
    if NEW.replacement_value is distinct from OLD.replacement_value then v_changed := v_changed || 'replacement_value'::text; end if;
  elsif TG_TABLE_NAME = 'product_units' then
    if NEW.purchase_price    is distinct from OLD.purchase_price    then v_changed := v_changed || 'purchase_price'::text; end if;
    if NEW.replacement_value is distinct from OLD.replacement_value then v_changed := v_changed || 'replacement_value'::text; end if;
  end if;

  if array_length(v_changed, 1) is null then
    -- Nothing priced changed. Serial, location, condition, status: all untouched
    -- by this guard, which is the whole point — warehouse work must not be
    -- collateral damage.
    return NEW;
  end if;

  raise exception
    'Law 6: your role may not see money, so it may not change it. Refused a write to %.% (%). '
    'Ask Owner, Admin, Manager, Coordinator or Accounts to change pricing.',
    TG_TABLE_NAME, array_to_string(v_changed, ', '), auth_user_role();
end;
$$;

comment on function reject_money_column_write_by_money_blind_role() is
  'Law 6 for the WRITE verb (0092). RLS admits Warehouse to products/product_units '
  'because they own serials and condition; this refuses only the priced columns. '
  'Exempt for postgres/service_role so migrations and seeds still run.';

drop trigger if exists trg_products_money_column_guard on products;
create trigger trg_products_money_column_guard
  before update on products
  for each row execute function reject_money_column_write_by_money_blind_role();

drop trigger if exists trg_product_units_money_column_guard on product_units;
create trigger trg_product_units_money_column_guard
  before update on product_units
  for each row execute function reject_money_column_write_by_money_blind_role();

-- -----------------------------------------------------------------------------
-- Post-conditions — three, because a guard that refuses too much is its own bug.
-- -----------------------------------------------------------------------------
do $$
declare
  v_product   uuid;
  v_rate      numeric;
  v_wh        uuid;
  v_blocked   boolean := false;
  v_allowed   boolean := false;
  v_status    text;
  v_err       text;
begin
  select id, daily_rate into v_product, v_rate from products limit 1;
  select id into v_wh from users where primary_role = 'Warehouse' limit 1;

  if v_product is null or v_wh is null then
    raise notice '0092: no product or no Warehouse user here; behavioural checks skipped.';
    return;
  end if;

  /*
   * The probe below acts AS `authenticated`. On a database rebuilt from these
   * migrations that role holds no privilege on `products` at all — no migration
   * grants base-table privileges (the DR gap filed in the audit) — so the write
   * is refused by the missing GRANT long before this trigger is consulted.
   *
   * That is not a pass and must not be recorded as one: the first run of this
   * migration through `check:rebuild` failed here precisely because the assertion
   * refused to accept "permission denied for table products" as evidence that
   * Law 6 works. Skip the behavioural half where it cannot be exercised, and say
   * so; the trigger itself is installed either way.
   */
  if not has_table_privilege('authenticated', 'public.products', 'UPDATE') then
    raise notice
      '0092: `authenticated` holds no UPDATE on products in this database, so the behavioural '
      'probe cannot distinguish this guard from the missing grant. Trigger installed; verified '
      'where the grants exist.';
    return;
  end if;

  -- (1) postgres (this migration) must still be able to write a price.
  update products set daily_rate = v_rate where id = v_product;

  -- (2) a Warehouse session must be REFUSED on a price.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products set daily_rate = 1 where id = v_product;
  exception when others then
    /*
     * The MESSAGE is asserted, not merely the failure. The first run of this
     * migration refused the write for the wrong reason entirely — a `text[] ||
     * unknown` append raised 22P02 before the Law 6 message could — and a bare
     * `when others` called that a pass. A guard that refuses by accident is not
     * a guard.
     */
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote a price.';
  end if;
  if position('Law 6' in coalesce(v_err, '')) = 0 then
    raise exception
      'POST-CONDITION FAILED: the write was refused, but not by this guard. Postgres said: %', v_err;
  end if;
  if (select daily_rate from products where id = v_product) <> v_rate then
    raise exception 'POST-CONDITION FAILED: the refused write still changed the rate.';
  end if;

  -- (3) the SAME session must still be able to do its actual job.
  select status::text into v_status from products where id = v_product;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products set updated_at = now() where id = v_product;
    v_allowed := true;
  exception when others then
    v_allowed := false;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_allowed then
    raise exception 'POST-CONDITION FAILED: the guard blocked a non-money warehouse update.';
  end if;

  raise notice '0092 verified: price writes refused for money-blind roles, non-money warehouse writes untouched, migrations exempt.';
end $$;

commit;

-- >>> END 0092_law6_warehouse_cannot_rewrite_prices.sql <<<

-- >>> START 0093_state_the_grants.sql <<<
-- =============================================================================
-- 0093_state_the_grants.sql — 6 Sep 2026
--
-- **The migration set could not produce a database the application can use.**
--
-- ## What was wrong
--
-- After rebuilding from all migrations and signing in (token 200), every read
-- failed:
--
--   42501 — permission denied for table users
--   hint: GRANT SELECT ON public.users TO authenticated;
--
-- No migration in this repo grants a base-table privilege to `authenticated`.
-- The app's entire data access rested on the hosting platform's default
-- privileges — which live has, and a fresh database does not.
--
-- Worse than "no grants": on a hosted project the platform default is FULL DML
-- for anon/authenticated/service_role, and earlier migrations then REVOKE
-- selectively — DELETE for Law 3 ("nothing is deleted"), UPDATE for Law 4
-- (immutable payments, audit rows, logs), SELECT for Law 6 (money base tables
-- hidden behind `_v` views). In a scratch build those revokes ran against
-- nothing, so the obvious "grant all" here would silently undo all three laws.
--
-- ## What this states — the FINAL shape, derived from live on 6 Sep 2026
--
-- Read-only against the production project, 124 base tables, 26 views:
--
--   authenticated  SELECT   all but 10  (the Law 6 base tables + staff_auth_pins)
--                  INSERT   all but 1   (staff_auth_pins)
--                  UPDATE   all but 21  (Law 4 immutables, logs, staff_auth_pins)
--                  DELETE   only 10     (sync/external/portal scratch tables)
--   anon           SELECT   all but 1   (staff_auth_pins)
--                  INSERT   all but 2   (staff_auth_pins, and audit_events per 0091)
--                  UPDATE   as authenticated; DELETE as authenticated
--   service_role   everything
--   views          SELECT for all three
--   sequences      USAGE, SELECT, UPDATE for all three
--   functions      EXECUTE for all three, except 8 withheld from anon (the staff
--                  PIN / password-reset / audit-trigger set) and 2 from
--                  authenticated (the two trigger functions)
--
-- `anon`'s writes are kept as live has them. RLS is the control that governs
-- them (verified: every PUBLIC write policy checks `auth_user_role()`, which anon
-- cannot satisfy), and narrowing anon further is a separate decision, not this
-- file's. The one exception is `audit_events` INSERT, which `0091` closed after
-- an unauthenticated forgery — that revoke is re-asserted here so this file can
-- never re-open it, whatever order the two are applied in.
--
-- ## Convergent, not additive
--
-- Every privilege is REVOKED from all tables first and then GRANTED on exactly
-- the right set. That makes the file correct from any starting point: a no-op on
-- live (which already has this shape), the establishing step in a scratch build,
-- and a correction on a local stack someone over-granted by hand. It is safe to
-- re-run.
--
-- Default privileges are set to match live's, so tables and functions created by
-- LATER migrations inherit the platform baseline in a rebuild exactly as they do
-- on the hosted project — with later revokes then narrowing them, as now.
--
-- `check:rebuild` now asserts this shape after every rebuild, so a future
-- migration that quietly relies on a grant nobody stated will fail the gate
-- instead of failing the first person who restores from backup.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Schema, sequences, and the default privileges live already has.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2 · Tables and views: revoke everything, then grant the shape.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- SELECT — Law 6, and it is a COLUMN mask, not a table one.
--
-- ⚠ Corrected 6 Sep 2026, before this file ever reached live. It first revoked
-- SELECT on these ten tables outright, which is NOT what live does and would
-- have broken the application: `src/` reads `bookings` directly in 13 places,
-- `booking_lines` in 5, `products` in 3. Live revokes the TABLE and then grants
-- back every column except the money ones — so staff read a booking, and simply
-- cannot see `deposit_required`. That per-column list IS Law 6, restated below
-- exactly as live holds it.
grant select on all tables in schema public to anon, authenticated;
revoke select on
  accessories, booking_lines, booking_transport, bookings, daily_closings,
  maintenance_records, product_units, products, staff_auth_pins, vehicle_fuel_logs
from authenticated;
revoke select on staff_auth_pins from anon;

do $$
declare
  masked constant jsonb := jsonb_build_object(
    'accessories',         jsonb_build_array('replacement_cost'),
    'booking_lines',       jsonb_build_array('rate','discount_amount','supplier_cost','markup_amount'),
    'booking_transport',   jsonb_build_array('delivery_charge','fuel_charge'),
    'bookings',            jsonb_build_array('deposit_required'),
    'daily_closings',      jsonb_build_array('counted_cash','expected_cash','variance','variance_reason',
                                             'collected_cash','collected_bank','collected_card','collected_other',
                                             'receivables','deposits_held'),
    'maintenance_records', jsonb_build_array('cost'),
    'product_units',       jsonb_build_array('purchase_price','replacement_value'),
    'products',            jsonb_build_array('purchase_price','replacement_value','daily_rate','weekly_rate',
                                             'monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed'),
    'vehicle_fuel_logs',   jsonb_build_array('cost_amount')
  );
  tbl  text;
  cols text;
begin
  for tbl in select jsonb_object_keys(masked) loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
    where a.attrelid = format('public.%I', tbl)::regclass
      and a.attnum > 0 and not a.attisdropped
      and not (masked -> tbl) ? a.attname;

    if cols is null then
      raise exception 'POST-CONDITION FAILED (0093): % has no unmasked columns to grant.', tbl;
    end if;
    execute format('grant select (%s) on public.%I to authenticated', cols, tbl);
  end loop;
end $$;

-- INSERT — everything except the PIN table (and, for anon, the audit trail: 0091).
grant insert on all tables in schema public to anon, authenticated;
revoke insert on staff_auth_pins from anon, authenticated;
revoke insert on audit_events from anon;

-- UPDATE — Law 4: payments, reversals, audit rows and every log are immutable.
grant update on all tables in schema public to anon, authenticated;
revoke update on
  audit_events, automation_logs, backup_logs, booking_stage_transitions,
  client_merges, coupon_redemptions, deposit_movements, depreciation_logs,
  document_deliveries, expense_reversals, membership_limit_breaches, message_logs,
  override_records, payment_reversals, payments, scan_events,
  session_line_movements, staff_auth_pins, tax_ledgers, vehicle_fuel_logs,
  vehicle_trip_logs
from anon, authenticated;

-- DELETE — Law 3: nothing is deleted. The ten exceptions are sync scratch,
-- external mirrors and portal link requests, exactly as live holds them.
grant delete on
  containers, daily_closings, external_invoices, external_refs, portal_link_requests,
  sync_conflicts, sync_inbox, sync_log, sync_outbox, sync_state
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Functions. Grant all, then withhold the sets live withholds — resolved by
--     name through pg_proc so the signatures need not be restated here.
-- -----------------------------------------------------------------------------
grant execute on all functions in schema public to anon, authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_booking_stage_transition', 'log_audit_event',
                        'record_password_reset_request', 'revoke_own_staff_pin',
                        'revoke_staff_pin_for', 'set_staff_pin', 'staff_pin_status',
                        'verify_staff_pin')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    if r.proname in ('apply_booking_stage_transition', 'log_audit_event') then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Post-conditions — the shape, asserted by identity, plus 0091 intact.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text[] := '{}';
  t     text;
begin
  -- Law 6 is a COLUMN mask: the table is closed, the money columns stay closed,
  -- and everything else must remain readable or the app cannot render a booking.
  foreach t in array array['bookings','booking_lines','products','product_units','daily_closings'] loop
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      v_bad := v_bad || format('authenticated can SELECT all of %s (Law 6)', t)::text;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.bookings', 'stage', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT bookings.stage (the app reads it in 13 places)'::text;
  end if;
  if not has_column_privilege('authenticated', 'public.bookings', 'id', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT bookings.id'::text;
  end if;
  if has_column_privilege('authenticated', 'public.bookings', 'deposit_required', 'SELECT') then
    v_bad := v_bad || 'authenticated can SELECT bookings.deposit_required (Law 6)'::text;
  end if;
  if not has_column_privilege('authenticated', 'public.products', 'name', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT products.name'::text;
  end if;
  if has_column_privilege('authenticated', 'public.products', 'daily_rate', 'SELECT') then
    v_bad := v_bad || 'authenticated can SELECT products.daily_rate (Law 6)'::text;
  end if;
  -- … but must read the ordinary ones, and the views that mask the money.
  foreach t in array array['clients','users','invoices','payments','client_directory_v'] loop
    if not has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      v_bad := v_bad || format('authenticated cannot SELECT %s', t)::text;
    end if;
  end loop;

  -- Law 3: no DELETE on business rows; DELETE on sync scratch.
  if has_table_privilege('authenticated', 'public.clients', 'DELETE') then
    v_bad := v_bad || 'authenticated can DELETE clients (Law 3)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.sync_log', 'DELETE') then
    v_bad := v_bad || 'authenticated cannot DELETE sync_log'::text;
  end if;

  -- Law 4: payments immutable; ordinary rows still editable.
  if has_table_privilege('authenticated', 'public.payments', 'UPDATE') then
    v_bad := v_bad || 'authenticated can UPDATE payments (Law 4)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.clients', 'UPDATE') then
    v_bad := v_bad || 'authenticated cannot UPDATE clients'::text;
  end if;

  -- 0091 must survive this file in either order.
  if has_table_privilege('anon', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'anon can INSERT audit_events (0091 undone)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'authenticated cannot INSERT audit_events'::text;
  end if;

  -- The RPCs the app lives on, and the ones anon must never reach.
  if not has_function_privilege('authenticated', 'next_document_number(text)', 'EXECUTE') then
    v_bad := v_bad || 'authenticated cannot EXECUTE next_document_number'::text;
  end if;
  if has_function_privilege('anon', 'verify_staff_pin(text)', 'EXECUTE') then
    v_bad := v_bad || 'anon can EXECUTE verify_staff_pin'::text;
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'POST-CONDITION FAILED (0093): %', array_to_string(v_bad, '; ');
  end if;

  raise notice '0093 verified: grants match the live shape — Law 3/4/6 revokes intact, 0091 intact, RPCs reachable.';
end $$;

commit;

-- >>> END 0093_state_the_grants.sql <<<

-- >>> START 0094_stage_is_written_only_by_its_transition.sql <<<
-- =============================================================================
-- 0094_stage_is_written_only_by_its_transition.sql — 6 Sep 2026
--
-- **Forward-only stage transitions are bypassable.** `bookings.stage` can be
-- written directly, skipping the transition table, the stage order, and the gates.
--
-- ## Reproduced 6 Sep 2026
--
-- Signed in as `warehouse@babinrentals.com`, against a database carrying live's
-- exact grant shape:
--
--   PATCH /rest/v1/bookings?id=eq.<booking 800>   {"stage": "Returned"}
--   -> HTTP 204
--   stage: Quote -> Returned      three stages skipped
--   booking_stage_transitions:    still 1 row — no record that it happened
--
-- Nothing objected. `validate_booking_gates` guards only the transitions INTO
-- `On Rent` and `Closed`, so a jump to `Returned` passes through untouched, and
-- the booking now sits in a stage it never legally reached. Reset restored it.
--
-- ## Why 0021's control never worked
--
-- `0021` declared `booking_stage_transitions` the sole writer and enforced it with
--
--   revoke update (stage, closed_at) on bookings from authenticated;
--
-- A column-level REVOKE cannot subtract from a table-level GRANT. `authenticated`
-- holds table-level UPDATE on `bookings`, so the column revoke is **inert** —
-- confirmed on live, where `has_column_privilege('authenticated','bookings',
-- 'stage','UPDATE')` is still `true` and the leftover ACL entry reads
-- `authenticated=r/postgres`, i.e. it granted a SELECT and removed no UPDATE.
--
-- This is the same shape as the inert revokes elsewhere in this repo, and it has
-- one root cause: **every signed-in user is the same Postgres role.** The app's
-- role lives in `users.primary_role`, so no GRANT or REVOKE can distinguish
-- Owner from Warehouse. Only a trigger comparing OLD to NEW can.
--
-- ## What this adds
--
-- Two guards on `bookings`, exempt only for `postgres`, `supabase_admin` and
-- `service_role` — an allowlist, so an unforeseen role is guarded rather than
-- trusted:
--
--   * **UPDATE** — `stage` and `closed_at` may change only when the write comes
--     from `apply_booking_stage_transition`. That function is SECURITY DEFINER,
--     so its own UPDATE runs as the definer and passes the `current_user` test,
--     while a PostgREST call runs as `authenticated` and does not. No session
--     variable is involved: the privilege context IS the evidence.
--   * **CANCELLATION** — `cancelled_at`, `cancelled_by` and `cancellation_reason`
--     are equally off-limits to a direct write. Cancelled is the sixth state
--     (`0015`) and lives on `cancelled_at`, so guarding `stage` alone left the
--     door wide open: a Warehouse session cancelled an **On Rent** booking over
--     HTTP and forged the canceller. See the note at that check.
--   * **INSERT** — a new booking must start at `Quote` **and carry no
--     `closed_at`** and no `cancelled_at`. A row inserted straight at `Closed` has no stage history and
--     was never gated; a row inserted with `closed_at` already set is worse still,
--     because `apply_booking_stage_transition` refuses every transition once that
--     column is set and Law 3 forbids deleting the row — a booking that can never
--     move and can never be removed. `create_booking` already defaults to `Quote`
--     with a null `closed_at`; this refuses the direct POST that does not.
--
-- The `closed_at` half of that was NOT in the first draft. An adversarial pass
-- over this file found it, and it reproduced: `POST /bookings` with stage
-- `'Quote'` and `closed_at` set returned **201**, and the resulting booking was
-- permanently frozen. Guarding `stage` alone would have left a worse hole than
-- the one being closed.
--
-- Seeds and migrations are unaffected — they run as `postgres`, which is exempt,
-- which is how `0047` still inserts its corpus at every stage.
--
-- What this does NOT change: who may insert a transition row, and the reversal
-- rules. Those live in `booking_stage_transitions`' own policy and CHECKs. This
-- file only makes that table the sole door, which is what `0021` intended.
-- =============================================================================

begin;

create or replace function reject_direct_booking_stage_write()
returns trigger
language plpgsql
as $$
begin
  /*
   * An ALLOWLIST, deliberately — the first draft wrote this as
   * `current_user not in ('authenticated','anon')`, which exempts by default
   * anything it did not think of. An adversarial pass pointed at `authenticator`,
   * the pooled role PostgREST logs in as before it switches to the JWT's role:
   * under a denylist that role would have been trusted. Nothing reaches this
   * trigger as `authenticator` in practice, but a guard should fail closed on
   * the roles it has not considered, not open.
   *
   * `postgres` covers migrations, the seed, and `apply_booking_stage_transition`
   * — SECURITY DEFINER, owned by postgres, so its UPDATE arrives as the owner.
   * `service_role` is the server-side key used by the Booqable importer
   * (`scripts/import-booqable-direct.mjs`); it never belongs in a browser, and
   * if it leaks, this guard is not the thing that matters.
   */
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.stage is distinct from 'Quote'::booking_stage then
      raise exception
        'A booking is created at Quote and moves by recorded transitions. Refused an INSERT '
        'straight at %, which would leave a booking with no stage history that no gate ever '
        'checked.', NEW.stage;
    end if;
    /*
     * `closed_at` matters as much as `stage`, and guarding only the latter left
     * a worse hole than the one this file closes. Found by an adversarial pass
     * on the first draft and reproduced: POST /bookings with stage 'Quote' and
     * `closed_at` set returns 201, and the row is then FROZEN FOREVER —
     * `apply_booking_stage_transition` refuses every transition once `closed_at`
     * is set ("booking … is Closed; no further stage transition is accepted"),
     * and Law 3 forbids deleting the row. A booking that can never move and can
     * never be removed.
     */
    if NEW.closed_at is not null then
      raise exception
        'A booking is created open. Refused an INSERT carrying closed_at — a booking born closed '
        'can never be moved by any transition and can never be deleted, so it would be stuck '
        'forever. Closing is a transition to Closed, which sets this column itself.';
    end if;
    if NEW.cancelled_at is not null then
      raise exception
        'A booking is created live. Refused an INSERT carrying cancelled_at — cancellation is the '
        'sixth state (0015) and a booking cannot be born in it.';
    end if;
    return NEW;
  end if;

  if NEW.stage is distinct from OLD.stage or NEW.closed_at is distinct from OLD.closed_at then
    raise exception
      'bookings.stage and bookings.closed_at are written only by booking_stage_transitions '
      '(0021). Refused a direct write moving % from % to %. Insert a transition row instead — '
      'that is what validates the stage order, records who did it, and runs the gates.',
      NEW.booking_no, OLD.stage, NEW.stage;
  end if;

  /*
   * Cancellation is the SECOND door to the same room, and the first draft left it
   * open. `0015` makes Cancelled the sixth state, carried on `cancelled_at`
   * rather than in `stage`, and every "is this booking live" predicate in the app
   * and its views reads `stage <> 'Closed' and cancelled_at is null`. So shutting
   * the stage door alone changed nothing about who can take a booking out of
   * service.
   *
   * Found by an adversarial pass over the first draft and reproduced over real
   * HTTP: a Warehouse session PATCHed `cancelled_at` on an **On Rent** booking
   * and got 204 — the gear was with the client — writing `cancelled_by` as the
   * Owner's id, because that column is caller-supplied. No transition row, no
   * gate, no capability check. The same call in reverse un-cancelled it, which
   * Law 3 is supposed to forbid.
   *
   * `cancelled_by` and `cancellation_reason` ride along: leaving them writable
   * would let anyone rewrite who cancelled an existing cancellation.
   *
   * ⚠ For whoever builds `rental.cancel` (`cancelRental.ts` is
   * `implemented: false` today, which is why nothing legitimate breaks here): it
   * must reach these columns the way stage moves do — through a SECURITY DEFINER
   * writer or a recorded transition — not by a direct PATCH from the browser.
   */
  if NEW.cancelled_at        is distinct from OLD.cancelled_at
     or NEW.cancelled_by     is distinct from OLD.cancelled_by
     or NEW.cancellation_reason is distinct from OLD.cancellation_reason then
    raise exception
      'Cancellation is a recorded act, not a column edit. Refused a direct write to %''s '
      'cancelled_at/cancelled_by/cancellation_reason — cancelling takes a booking out of service '
      'exactly as a stage move does, and must be attributable the same way.', NEW.booking_no;
  end if;

  return NEW;
end;
$$;

comment on function reject_direct_booking_stage_write() is
  'Makes booking_stage_transitions the sole writer of bookings.stage/closed_at (0094). '
  '0021 tried to do this with a column REVOKE, which is inert against a table-level GRANT '
  'because every signed-in user is the same Postgres role. Exempt for postgres/service_role.';

drop trigger if exists trg_bookings_stage_write_guard on bookings;
create trigger trg_bookings_stage_write_guard
  before insert or update on bookings
  for each row execute function reject_direct_booking_stage_write();

-- -----------------------------------------------------------------------------
-- Post-conditions — the door is shut AND the legitimate path still opens it.
-- A guard that only proved the first half would be indistinguishable from one
-- that breaks the application.
-- -----------------------------------------------------------------------------
do $$
declare
  v_id      uuid;
  v_no      text;
  v_stage   booking_stage;
  v_actor   uuid;
  v_branch  uuid;
  v_blocked boolean := false;
  v_err     text;
begin
  select id, booking_no, stage, branch_id into v_id, v_no, v_stage, v_branch
  from bookings where stage = 'Quote' limit 1;
  select id into v_actor from users where primary_role = 'Owner' limit 1;

  if v_id is null or v_actor is null then
    raise notice '0094: no Quote booking or no Owner here; behavioural checks skipped.';
    return;
  end if;

  -- (1) postgres must still be able to write, or the seed breaks.
  update bookings set stage = 'Quote' where id = v_id;

  -- (2) a browser session must be REFUSED, and by THIS guard.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_actor::text, true);
    update bookings set stage = 'Returned' where id = v_id;
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a direct stage write was accepted.';
  end if;
  if position('booking_stage_transitions' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED: refused, but not by this guard. Postgres said: %', v_err;
  end if;
  if (select stage from bookings where id = v_id) <> 'Quote' then
    raise exception 'POST-CONDITION FAILED: the refused write still moved the stage.';
  end if;

  -- (2b) an INSERT carrying closed_at must be refused — a booking born closed is
  --      unmovable and undeletable.
  v_blocked := false;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_actor::text, true);
    insert into bookings (client_uuid, booking_no, branch_id, client_id, stage, closed_at,
                          delivery_type, pickup_at, return_at, created_by, updated_by)
    values (gen_random_uuid(), '9999001', v_branch,
            (select client_id from bookings where id = v_id), 'Quote', now(),
            'Babin Delivery', now() + interval '1 day', now() + interval '3 days', v_actor, v_actor);
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a booking was created carrying closed_at.';
  end if;
  if position('born closed' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED: the INSERT was refused, but not by this guard. Postgres said: %', v_err;
  end if;

  -- (3) the LEGITIMATE path must still work: a transition row moves the stage.
  insert into booking_stage_transitions
    (client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source)
  values
    (gen_random_uuid(), v_id, v_branch, 'Quote', 'Booked', now(), v_actor, 'Owner', 'system');

  if (select stage from bookings where id = v_id) <> 'Booked' then
    raise exception
      'POST-CONDITION FAILED: the transition row did not move the stage — this guard has '
      'broken the only legitimate path.';
  end if;

  raise notice '0094 verified: direct stage writes refused, the transition path still moves the stage.';

  raise exception 'ROLLBACK_0094_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0094_PROBE' then
      raise notice '0094 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;

-- >>> END 0094_stage_is_written_only_by_its_transition.sql <<<

-- >>> START 0095_views_are_read_only.sql <<<
-- =============================================================================
-- 0095_views_are_read_only.sql — 6 Sep 2026
--
-- **Every masking view accepts INSERT, UPDATE and DELETE from the two roles a
-- browser can be, and runs them as the view's owner — past RLS and past Law 3.**
--
-- ## What was wrong
--
-- The `_v` views exist so a money-blind role can read a booking or a product
-- without holding a column grant on the base table: the view is DEFINER-rights
-- (0019, 0048, 0065, 0077, 0078), its body re-applies `auth_can_view_money()`
-- per column and a row predicate per role, and the base table's SELECT is
-- revoked at table level and handed back column by column (0062, 0077). That
-- design reasoned about SELECT only.
--
-- Postgres makes a simple single-table view auto-updatable, and the platform
-- default ACL grants `anon` and `authenticated` full DML on every new relation,
-- views included. So `POST /rest/v1/clients_v`, `PATCH /rest/v1/products_v`
-- and `DELETE /rest/v1/clients_v` were all reachable, and each was rewritten
-- onto the base table with the privileges of the view's OWNER — `postgres`,
-- which bypasses RLS. No policy was consulted (the views carry no CHECK
-- OPTION, so even their own `where auth_is_staff()` never applied to a write),
-- and 18 of the 23 backed tables have no `reject_delete_nothing_is_deleted`
-- backstop, so Law 3 did not catch the DELETE either.
--
-- `0093_state_the_grants.sql` then restated the hole rather than closing it:
-- `grant insert on all tables in schema public` and `grant update on all
-- tables …` include views (that is what "all tables" means to Postgres), while
-- its own header says "views: SELECT for all three".
--
-- ## Reproduced how — catalogue, read-only, 6 Sep 2026
--
-- Live project (`sxguwvgoserhdolewibb`), before any of 0079–0094 reached it:
--
--   public views                                        26
--   has_table_privilege('anon',          view, 'INSERT')  true for 26 / 26
--   has_table_privilege('authenticated', view, 'UPDATE')  true for 26 / 26
--   has_table_privilege('authenticated', view, 'DELETE')  true for 26 / 26
--   information_schema.views.is_updatable = YES           24 / 26
--   pg_default_acl (postgres, public, relations)          anon = arwdDxtm
--   base tables with anon INSERT / UPDATE / DELETE        123 / 103 / 10  of 124
--
-- The local stack shows the identical view shape (26 / 26 / 26). The write
-- itself was not exercised against live (read-only mandate); the behavioural
-- post-conditions at the foot of this file exercise it in every rebuild, and
-- `check:rebuild` refuses a database in which any view is still writable.
-- Filed as REMEDIATION_AUDIT_2026-09-05 SEC-01 (P0), refuter-confirmed.
--
-- ## What this adds
--
--   1. Every view in `public` loses INSERT, UPDATE, DELETE and TRUNCATE for
--      `anon`, `authenticated` and PUBLIC. SELECT is untouched — exactly the
--      shape 0093's header states and its body did not deliver. Nothing in
--      `src/` writes a view: every `.from('<x>_v')` is a select (grep at HEAD,
--      with `.from('products_v')` reads as the positive control).
--
--   2. `anon` loses INSERT, UPDATE, DELETE and TRUNCATE on every base table,
--      and on every relation the platform will create later (default
--      privileges for `postgres` in `public`). 0093 kept anon's writes "as live
--      has them" and named narrowing a separate decision. Assessed for this
--      file — every path that runs BEFORE sign-in, `src/` and
--      `supabase/functions` grepped for `.from(`, `.rpc(`, `signIn`,
--      `resetPasswordForEmail`, `updateUser`, `verify_staff_pin`,
--      `portal_link_requests`:
--
--        sign-in            lib/auth.tsx:314  supabase.auth.signInWithPassword     GoTrue, not PostgREST
--        forgot password    lib/auth.tsx:363  supabase.auth.resetPasswordForEmail  GoTrue
--        set new password   lib/auth.tsx:389  supabase.auth.updateUser             GoTrue, recovery session
--        staff PIN          lib/auth.tsx:425-524  rpc set_staff_pin / verify_staff_pin /
--                                                 staff_pin_status / revoke_own_staff_pin
--                                                 SECURITY DEFINER, EXECUTE to authenticated only (0066)
--        reset request      queries/staff.ts:209  rpc record_password_reset_request
--                                                 SECURITY DEFINER, Owner only, authenticated only (0068)
--        portal self-claim  portal_claim_by_verified_email()  SECURITY DEFINER, authenticated only (0072);
--                                                 refuses when auth.uid() is null; no caller in src/ yet
--        booqable-webhook   functions/booqable-webhook/index.ts  service-role client, writes sync_inbox
--        booqable-proxy     functions/booqable-proxy/index.ts    service-role client
--
--      Not one pre-auth path issues base-table DML as `anon`. On live, the only
--      write policies whose predicate does not reference an auth_* function are
--      `audit_events_insert (true)` — the SEC-02 forgery, closed for anon by
--      0091 — and `timesheets_insert`, which needs `app.current_user_id`, which
--      `set_request_context` derives from `auth.uid()` and anon never has. So
--      RLS already refused every anon write except the audit forgery; this
--      section makes that a GRANT fact that the next `with check (true)` policy
--      cannot silently undo. Engineering posture, not a product decision;
--      recorded in PLAN.md §4.48 with this derivation.
--
--   3. Post-conditions that RAISE: the catalogue in both directions (no view
--      writable, every view still readable; no table writable by anon, anon
--      still reads, authenticated still writes), the default ACL, and then the
--      behaviour under `set local role` — an anonymous INSERT into `clients_v`
--      and into `clients` refused with 42501 *permission denied* (not merely
--      refused: an RLS refusal is also 42501, so the message is asserted), a
--      Warehouse UPDATE of `products_v` and an Owner DELETE from `clients_v`
--      refused the same way, and the read side unchanged — the Owner still
--      sees `daily_rate` through `products_v`, the Warehouse user still gets
--      rows with `daily_rate` NULL.
--
-- ## Why the views stay DEFINER-rights
--
-- `security_invoker` is the textbook fix and it is wrong here. The mask works
-- because the view reads the base table with the OWNER's privileges; the
-- caller's own column grants on `products` / `bookings` / … were deliberately
-- revoked by 0062 and 0077. An invoker view would re-apply those revoked
-- grants inside the view body and the read would die for every role, Owner
-- included — that is 0061's bug, which 0065 had to repair on
-- `bookings_deposit_v`, and 0077/0078 assert it can never recur. Read side
-- untouched; only the write verbs are taken away.
--
-- ## Future views — an obligation, and a gate
--
-- Default privileges cannot single out views from tables, and `authenticated`
-- legitimately needs INSERT/UPDATE on future base tables, so a view created by
-- a LATER migration will again be born writable by `authenticated`. Two
-- controls: (a) any migration that creates a view must revoke its DML in the
-- same file — same convention as "revoke and view ship together" (0019/0035/
-- 0036/0077); (b) `scripts/check-rebuild.mjs` now asserts, after every rebuild,
-- that no public view grants INSERT/UPDATE/DELETE to anon or authenticated and
-- that anon holds no DML on any table. For `anon` the default ACL is corrected
-- here, so future relations are born read-only to it.
--
-- ## What this does NOT change
--
--   * SELECT on views and tables, for both roles, exactly as 0093 leaves it.
--     `anon`'s SELECT on the definer views is wider than any path needs
--     (each view's row predicate resolves anon to `Client` and returns no
--     rows); narrowing it is a separate decision, noted in PLAN.md §4.48.
--   * `authenticated`'s table DML — the 0093 shape, with Law 3/4/6 intact.
--   * Sequence and function grants (0093 §1, §3).
--   * The 18 backed tables without a Law 3 delete backstop. That is SEC-01
--     Option B's third file and is not written here.
--
-- ⚠ ORDER. This file must run AFTER 0093, and after any re-run of 0093: 0093's
-- blanket grants re-open both holes, so its "safe to re-run" claim now holds
-- for the pair (0093 then 0095), not for 0093 alone. Filename order gives that
-- in a rebuild and on `db push`; a hand re-run of 0093 must be followed by this
-- file. This file is itself convergent — every statement is a revoke.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Views are read-only. There is no ALL VIEWS IN SCHEMA, so loop the
--     catalogue. `relkind = 'v'` is a plain view; materialized views cannot
--     take DML and there are none here.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname
  loop
    execute format(
      'revoke insert, update, delete, truncate on %I.%I from anon, authenticated, public',
      r.nspname, r.relname
    );
    v_n := v_n + 1;
  end loop;
  raise notice '0095: DML revoked on % public view(s).', v_n;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · anon holds no DML on any relation — now, and on relations created later.
--     `all tables in schema` includes the views, which is harmless here: §1
--     already took them, and this makes §2 true on its own.
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon;

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions — the catalogue, in both directions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad   text[] := '{}';
  r       record;
  v_n     integer;
  v_views integer := 0;
begin
  -- (a) every public view: no DML for anon/authenticated; SELECT still there.
  for r in
    select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname
  loop
    v_views := v_views + 1;
    if has_table_privilege('anon', r.oid, 'INSERT')
       or has_table_privilege('anon', r.oid, 'UPDATE')
       or has_table_privilege('anon', r.oid, 'DELETE')
       or has_table_privilege('anon', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('anon can write %s', r.relname)::text;
    end if;
    if has_table_privilege('authenticated', r.oid, 'INSERT')
       or has_table_privilege('authenticated', r.oid, 'UPDATE')
       or has_table_privilege('authenticated', r.oid, 'DELETE')
       or has_table_privilege('authenticated', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('authenticated can write %s', r.relname)::text;
    end if;
    if not has_table_privilege('authenticated', r.oid, 'SELECT') then
      v_bad := v_bad || format('authenticated can no longer SELECT %s', r.relname)::text;
    end if;
    if not has_table_privilege('anon', r.oid, 'SELECT') then
      v_bad := v_bad || format('anon can no longer SELECT %s (0093 shape changed)', r.relname)::text;
    end if;
  end loop;
  if v_views = 0 then
    v_bad := v_bad || 'no public views found — the loop asserted nothing'::text;
  end if;

  -- (b) every base table: anon holds no DML.
  for r in
    select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    if has_table_privilege('anon', r.oid, 'INSERT')
       or has_table_privilege('anon', r.oid, 'UPDATE')
       or has_table_privilege('anon', r.oid, 'DELETE')
       or has_table_privilege('anon', r.oid, 'TRUNCATE') then
      v_bad := v_bad || format('anon can write table %s', r.relname)::text;
    end if;
  end loop;

  -- (c) …and nothing else moved: anon still reads, authenticated still writes,
  --     0091 and Law 3/4 as 0093 asserted them.
  if not has_table_privilege('anon', 'public.clients', 'SELECT') then
    v_bad := v_bad || 'anon lost SELECT on clients (this file must not touch SELECT)'::text;
  end if;
  if has_table_privilege('anon', 'public.staff_auth_pins', 'SELECT') then
    v_bad := v_bad || 'anon can SELECT staff_auth_pins (0066/0093 undone)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.clients', 'INSERT')
     or not has_table_privilege('authenticated', 'public.clients', 'UPDATE') then
    v_bad := v_bad || 'authenticated lost INSERT/UPDATE on clients (this file must not touch authenticated table DML)'::text;
  end if;
  if has_table_privilege('authenticated', 'public.clients', 'DELETE') then
    v_bad := v_bad || 'authenticated can DELETE clients (Law 3)'::text;
  end if;
  if has_table_privilege('authenticated', 'public.payments', 'UPDATE') then
    v_bad := v_bad || 'authenticated can UPDATE payments (Law 4)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'authenticated cannot INSERT audit_events (0091 shape changed)'::text;
  end if;

  -- (d) the default ACL: a relation created later is born read-only to anon.
  select count(*) into v_n
  from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and a.grantee = 'anon'::regrole::oid
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_n > 0 then
    v_bad := v_bad || format('default privileges still grant anon %s DML privilege(s) on new relations', v_n)::text;
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'POST-CONDITION FAILED (0095): %', array_to_string(v_bad, '; ');
  end if;

  raise notice '0095 verified (catalogue): % views read-only for anon/authenticated, anon holds no table DML, default ACL corrected, 0093 shape otherwise intact.', v_views;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Post-conditions — the behaviour. A refused write must be refused for THIS
--     reason: an RLS denial is also SQLSTATE 42501, so the message is asserted
--     ("permission denied for view …"), and the read side is proven unchanged
--     from both sides of the mask. The whole block rolls back at the end so a
--     probe that unexpectedly succeeds leaves nothing behind (0094's pattern).
-- -----------------------------------------------------------------------------
do $$
declare
  v_owner    uuid;
  v_wh       uuid;
  v_product  uuid;
  v_client   uuid;
  v_rows     bigint;
  v_priced   bigint;
  v_blocked  boolean;
  v_state    text;
  v_err      text;
begin
  select id into v_owner from users where primary_role = 'Owner' limit 1;
  select id into v_wh from users where primary_role = 'Warehouse' limit 1;
  select id into v_product from products where daily_rate is not null limit 1;
  select id into v_client from clients limit 1;

  if v_owner is null or v_wh is null or v_product is null or v_client is null then
    raise notice '0095: no Owner / Warehouse user, priced product or client here; behavioural checks skipped (catalogue checks above still hold).';
    return;
  end if;

  -- (1) anon: INSERT into a view — refused by the grant, not by a policy.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    insert into clients_v (id) values (gen_random_uuid());
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): anon inserted through clients_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the anon INSERT into clients_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (2) anon: INSERT into a base table — the §2 half.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    insert into clients (client_uuid, name) values (gen_random_uuid(), '0095 probe');
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): anon inserted into clients.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the anon INSERT into clients was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (3) a Warehouse session: UPDATE through products_v — refused by the grant.
  --     Without this file the write ran as the view owner and landed.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update products_v set total_quantity = 0 where id = v_product;
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): a Warehouse session updated products_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the UPDATE of products_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (4) an Owner session: DELETE through clients_v — refused by the grant.
  --     `clients` has no Law 3 backstop trigger, so before this file the row
  --     would simply have gone.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_owner::text, true);
    delete from clients_v where id = v_client;
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0095): an Owner session deleted through clients_v.';
  end if;
  if v_state <> '42501' or position('permission denied' in coalesce(v_err, '')) = 0 then
    raise exception 'POST-CONDITION FAILED (0095): the DELETE from clients_v was refused, but not by the grant. Postgres said (%): %', v_state, v_err;
  end if;

  -- (5) the read side is untouched — Owner sees money through the view …
  set local role authenticated;
  perform set_config('app.current_user_id', v_owner::text, true);
  select count(*), count(daily_rate) into v_rows, v_priced from products_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v returns no rows to the Owner — the read path is broken.';
  end if;
  if v_priced = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v hides daily_rate from the Owner — the mask fires for a money-visible role.';
  end if;

  -- (6) … and the Warehouse user still gets the rows with the money masked.
  set local role authenticated;
  perform set_config('app.current_user_id', v_wh::text, true);
  select count(*), count(daily_rate) into v_rows, v_priced from products_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v returns no rows to the Warehouse user — a definer view must still serve the floor.';
  end if;
  if v_priced <> 0 then
    raise exception 'POST-CONDITION FAILED (0095): products_v shows daily_rate to the Warehouse user (Law 6).';
  end if;

  raise notice '0095 verified (behaviour): anon INSERT via clients_v and into clients refused 42501/permission denied; Warehouse UPDATE via products_v and Owner DELETE via clients_v refused the same way; Owner reads % priced rows through products_v, Warehouse reads % rows with the rate masked.', v_rows, v_rows;

  raise exception 'ROLLBACK_0095_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0095_PROBE' then
      raise notice '0095 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;

-- >>> END 0095_views_are_read_only.sql <<<

-- >>> START 0096_create_invoice_rpc.sql <<<
-- =============================================================================
-- 0096 — `create_invoice(jsonb)`: the one transaction that makes a Draft exist.
--
-- DRAFT — **NOT APPLIED**, and it cannot be applied before
-- `0086_invoice_write_rights_and_draft_without_number.sql`, which makes
-- `invoices.invoice_no` nullable and gives `invoice_lines` a write policy at
-- all. Verify the ledger (`supabase_migrations.schema_migrations`) before
-- trusting this header; headers in this directory have been wrong before.
--
-- Closes the write half of **DB-03** and the whole of **DATA-01**
-- (REMEDIATION_AUDIT_2026-09-05, ISSUE-003 option B / ISSUE-008 option B).
--
-- ## Why a function and not three PostgREST calls
--
-- `src/actions/finance/createInvoice.ts` wrote the header, then looped one
-- `invoice_lines` insert per booking line. PostgREST gives a browser no
-- transaction, so a failure between the header and the last line leaves a
-- header with some of its lines and totals that under-bill the job — and its
-- own error text told the operator to *void it rather than retry*, which is an
-- admission that the shape cannot be made safe from the client side. Both
-- close gates read `outstanding_amount`, so a header with no lines reads as
-- fully paid and a rental closes unbilled.
--
-- One function call is one transaction. Either the whole invoice exists or none
-- of it does. This is the shape `create_booking` (0063) already established and
-- the shape the audit's recommended architecture names for every verb.
--
-- ## SECURITY DEFINER, and why not INVOKER
--
-- `create_booking` is SECURITY INVOKER and that is the better default: each
-- insert faces its own RLS policy as the calling user, so the policy set is the
-- gate and the function cannot quietly out-rank it. This function cannot be
-- written that way, and the reason is measured, not assumed. Probed on the live
-- project (`sxguwvgoserhdolewibb`) on 7 Sep 2026:
--
--   1. **The money columns are not readable from the base tables by anybody.**
--      0062 revoked table-level SELECT on `booking_lines` and
--      `booking_transport` and granted back only the non-money columns, so
--      `has_column_privilege('authenticated','booking_lines','rate','SELECT')`
--      is false for **every** signed-in session, Owner included. Every user of
--      this application is the same Postgres role, `authenticated`, so there is
--      no grant that could distinguish them. That is DATA-01.
--
--   2. **The masking views — the invoker-rights route — do not cover the ruled
--      role set.** `booking_lines_v` and `booking_crew_lines_v` are gated on
--      `auth_is_staff()` and would serve all four R-05 roles. But
--      `booking_transport_v` ends in
--
--        where auth_user_role() = any (array['Owner','Admin','Coordinator',
--                                            'Warehouse','Driver'])
--
--      and the base table's only SELECT policy, `booking_transport_driver_read`,
--      carries the identical list. **Manager and Accounts are in neither** —
--      two of the four roles R-05 names. An invoker-rights snapshot raised by a
--      Manager or by Accounts would read zero transport rows, bill no delivery
--      and no fuel, and say nothing: a silent under-bill on an invoice that
--      looks entirely normal. It could not even detect the omission, because
--      counting the rows it is missing needs the same refused read.
--
--      A silent under-bill is the one outcome worse than a refusal, so invoker
--      rights are not available here until that policy and that view are
--      re-cut. Re-cutting them is a Law 6 grant-contract change (SEC-04 /
--      DB-02), not this migration's business.
--
-- So: definer rights, and **the role check below is the gate that RLS would
-- otherwise be**. It is stated in one place, first, before anything is read or
-- written, and it names the same four roles as 0086's four policies. Those
-- policies are not thereby decoration — they still govern every direct
-- PostgREST write to both tables, which is the path DB-03 was filed against.
--
-- Two consequences of definer rights are handled deliberately:
--
--   · **EXECUTE is not public.** A definer function inherits `PUBLIC` execute by
--     default, which would hand `anon` — the key that ships in the browser
--     bundle — a route into `invoices`. Revoked below, granted to
--     `authenticated` only.
--   · **A money-blind session is refused, not zeroed.** `auth_can_view_money()`
--     is checked explicitly even though the R-05 set already implies it. Under
--     definer rights a Warehouse caller would read real numbers rather than the
--     views' `NULL`s, and under any future invoker variant it would read `NULL`s
--     that `coalesce` to zero. Both are wrong in the same direction — an
--     invoice for nothing — and both are refused by name here.
--
-- ## Idempotent on `client_uuid` (Law 8)
--
-- `invoices_client_uuid_key` is a unique constraint. This function looks first,
-- and if an invoice already carries the key it returns that invoice with
-- `replayed: true` and **writes nothing at all** — not a line, not a second
-- header. A replay reads the totals back as they stand, so the caller gets the
-- same answer it got the first time.
--
-- Each line reuses its SOURCE row's `client_uuid` as its own key
-- (`invoice_lines.client_uuid` is UNIQUE), which is what
-- `src/actions/finance/createInvoice.ts` already did. That makes the line set
-- deterministic for a given booking and is why R-03 below refuses a second
-- invoice on the same booking rather than colliding halfway through it.
--
-- ## This function prices NOTHING and mints NOTHING
--
-- Law 1: the pricing order lives in `src/lib/money.ts` and the stored figures
-- are derived by `recalculate_invoice_totals`, which fires on every
-- `invoice_lines` write. The header is inserted with its money columns at their
-- zero defaults and the totals are re-read afterwards, so this function never
-- becomes a second writer for a number the trigger owns. `discount_amount` in
-- particular is never written (R-17 — it is derived from `discount_percent`).
--
-- ⚠ The live trigger rounds to 2 dp and hardcodes `0.13` where `lib/money.ts`
-- rounds to the whole rupee and reads the rate from the row. That disagreement
-- is MONEY-03 and its fix is `0098_invoice_totals_match_engine`; this function
-- returns whatever the trigger computed, so it inherits the fix for free and
-- adds no third opinion.
--
-- R-15: `next_document_number('invoice')` is **not** called. A Draft carries no
-- number, so an abandoned draft burns no identifier and leaves no gap in the
-- issued sequence, which Nepal IRD sequencing forbids. The number is minted by
-- `issue_invoice` (SPEC-P0-1 §3.3), which is not written yet.
--
-- ## A Draft with no lines is permitted
--
-- Deliberately. SPEC-P0-1 §3.1 creates the Draft and §3.2 appends to it for the
-- whole rental (R-02, R-03) — damage and late fees arrive at return — so a
-- Draft is empty between its creation and its first line. Refusing to *issue* a
-- Draft that never gained a line belongs to `issue_invoice`, where a figure
-- becomes final and a tax number is minted. Out of scope here; see the same
-- note in 0086.
-- =============================================================================

begin;

create or replace function create_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid  uuid    := (p_payload ->> 'client_uuid')::uuid;
  v_actor        uuid    := (p_payload ->> 'created_by')::uuid;
  v_booking_no   text    := nullif(btrim(coalesce(p_payload ->> 'booking_no', '')), '');
  v_booking_key  uuid    := (p_payload ->> 'booking_id')::uuid;
  v_vat_rate     numeric := (p_payload ->> 'vat_rate')::numeric;
  v_notes        text    := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_role         system_role;
  v_existing     invoices%rowtype;
  v_booking_id   uuid;
  v_resolved_no  text;
  v_client_id    uuid;
  v_branch_id    uuid;
  v_cancelled    timestamptz;
  v_terms        text;
  v_term_days    integer;
  v_due_date     date;
  v_discounts    integer;
  v_percent      numeric := 0;
  v_prior        record;
  v_invoice_id   uuid;
  v_line_count   integer := 0;
  v_written      integer;
  v_totals       invoices%rowtype;
begin
  -- ── Rights, first, before anything is read ────────────────────────────────
  -- R-05: Owner · Admin · Manager · Accounts may raise an invoice. This is the
  -- gate, because definer rights mean RLS will not be. It repeats 0086's four
  -- policies on purpose; the post-conditions below prove the two agree by
  -- calling this function as a Coordinator and as Warehouse.
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'create_invoice: this session (%) may not raise an invoice. R-05 gives that to Owner, Admin, Manager and Accounts. Nothing was created.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- Law 6. Redundant while auth_can_view_money() excludes exactly the roles
  -- R-05 omits, and kept so that it stays true if either definition moves. A
  -- money-blind caller is refused by name rather than billing zero.
  if not auth_can_view_money() then
    raise exception
      'create_invoice: this session cannot read money (Law 6), so the invoice it raised would bill nothing. Nothing was created.'
      using errcode = '42501';
  end if;

  if v_client_uuid is null then
    raise exception 'create_invoice: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_invoice: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written ────────────────────────
  select * into v_existing from invoices where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'invoice_id',      v_existing.id,
      'invoice_no',      v_existing.invoice_no,
      'status',          v_existing.status,
      'booking_id',      v_existing.booking_id,
      'booking_no',      (select booking_no from bookings where id = v_existing.booking_id),
      'client_id',       v_existing.client_id,
      'due_date',        v_existing.due_date,
      'line_count',      (select count(*) from invoice_lines where invoice_id = v_existing.id),
      'subtotal',        v_existing.subtotal,
      'discount_amount', v_existing.discount_amount,
      'taxable_amount',  v_existing.taxable_amount,
      'vat_amount',      v_existing.vat_amount,
      'total',           v_existing.total_amount,
      'replayed',        true
    );
  end if;

  -- ── The booking this bills ────────────────────────────────────────────────
  -- Either key is accepted; `booking_no` is what the operator saw on screen and
  -- what the action holds, `booking_id` is what a server-side caller holds.
  if v_booking_key is null and v_booking_no is null then
    raise exception 'create_invoice: an invoice must name the booking it bills (booking_id or booking_no).';
  end if;

  select b.id, b.booking_no, b.client_id, b.branch_id, b.cancelled_at
    into v_booking_id, v_resolved_no, v_client_id, v_branch_id, v_cancelled
    from bookings b
   where (v_booking_key is not null and b.id = v_booking_key)
      or (v_booking_key is null and b.booking_no = v_booking_no);

  if not found then
    raise exception
      'create_invoice: no booking % exists, so there is nothing to invoice and nothing was created.',
      coalesce(v_booking_key::text, v_booking_no);
  end if;

  -- A cancelled booking is not invoiced from here. Whether a cancellation
  -- carries a fee is explicitly unruled (PLAN.md §4.16), so this refuses rather
  -- than deciding it — the same position `createInvoice.ts` took.
  if v_cancelled is not null then
    raise exception
      'create_invoice: booking % was cancelled on %. Whether a cancellation carries a fee is an open ruling (PLAN.md §4.16), so nothing was created.',
      v_resolved_no, v_cancelled::date;
  end if;

  -- ── R-03 · one invoice per rental ─────────────────────────────────────────
  -- Checked after the replay check, so a genuine retry of the same press is a
  -- replay and only a SECOND intent is refused. Refuses on ANY existing
  -- invoice including a voided one, which is stricter than SPEC-P0-1 §3.1's
  -- "no non-Void invoice": the line keys are the booking rows' own client_uuids
  -- (see the header), so a second invoice over the same booking would collide
  -- on invoice_lines_client_uuid_key partway through. Re-invoicing after a void
  -- needs its own key strategy and its own ruling; refusing is the honest
  -- interim. TODO(decision) — re-invoicing a booking whose only invoice was
  -- voided (MONEY-07).
  -- Aliased so the record's field names are unmistakable; an unaliased
  -- `status::text` is still called `status`, which reads like the column and is
  -- not one.
  select invoice_no as prior_no, status::text as prior_status into v_prior
    from invoices where booking_id = v_booking_id limit 1;
  if found then
    raise exception
      'create_invoice: booking % already has an invoice (%, %). One invoice per rental — damage and late fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. Nothing was created.',
      v_resolved_no, coalesce(v_prior.prior_no, 'a Draft'), v_prior.prior_status;
  end if;

  -- ── The due date, from the client's payment terms ─────────────────────────
  -- `clients.payment_terms` is an enum whose labels ARE the rule; this is not a
  -- policy decision restated in SQL. NOT NULL DEFAULT 'Immediate', so the
  -- coalesce is a belt, and Immediate (due today) is the safe direction: it is
  -- visible and correctable, where a wrong 30 grants credit nobody agreed to.
  select payment_terms::text into v_terms from clients where id = v_client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := current_date + v_term_days;

  -- ── The booking's discount (R-17 — a percentage, never an amount) ─────────
  -- `booking_discounts` has no unique constraint on booking_id, so more than
  -- one row is representable; nothing rules how two of them combine on an
  -- invoice (the stacking trigger governs the booking, not the bill). Rather
  -- than pick one silently, this refuses and says so.
  -- TODO(decision) — how several booking_discounts rows combine into
  -- invoices.discount_percent. Live carries no such booking today.
  select count(*) into v_discounts from booking_discounts where booking_id = v_booking_id;
  if v_discounts > 1 then
    raise exception
      'create_invoice: booking % carries % discount rows and no rule says how they combine into one invoice percentage. Nothing was created.',
      v_resolved_no, v_discounts;
  end if;
  if v_discounts = 1 then
    select percent into v_percent from booking_discounts where booking_id = v_booking_id;
  end if;

  -- ── The header ────────────────────────────────────────────────────────────
  -- `invoice_no` and `issue_date` are OMITTED, not set to null: the column list
  -- is what documents the intent (R-15). 0086 makes both nullable and adds
  -- `invoices_issued_together` so a half-issued row cannot exist.
  -- The money columns keep their zero defaults; the trigger owns them.
  insert into invoices (
    client_uuid, booking_id, client_id, branch_id, status,
    due_date, currency, discount_percent, vat_rate, notes,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    'Draft',
    v_due_date,
    'NPR',
    coalesce(v_percent, 0),
    -- numeric(5,4) — a FRACTION, not a percentage. 13% arrives as 0.1300.
    coalesce(v_vat_rate, 0.1300),
    v_notes,
    v_actor,
    v_actor
  )
  returning id into v_invoice_id;

  -- ── The lines: a snapshot, not a join ─────────────────────────────────────
  -- SPEC-P0-1 §3.1: the rate card is pinned per booking, so the figures are
  -- COPIED here and never re-derived from `products` afterwards.
  --
  -- `line_total` carries each line's NET figure, because
  -- `recalculate_invoice_totals` derives the subtotal as `sum(line_total)`. The
  -- booking-level percentage is applied on top by the trigger from the header's
  -- `discount_percent`; `invoice_lines.discount_percent` stays 0, because the
  -- line's own discount is already inside its total and counting it twice would
  -- discount twice.

  -- (1) Equipment and bundles, from `booking_lines`.
  -- The mapping is `LINE_KIND_BY_TYPE` from createInvoice.ts, moved next to the
  -- enums it maps. Every member of `booking_line_type` is named and the CASE
  -- has **no ELSE on purpose**: if `booking_line_type` ever grows a member,
  -- this yields NULL, `invoice_lines.line_kind` is NOT NULL, and the whole
  -- transaction aborts with nothing written. That is the safe direction. The
  -- TypeScript it replaces fell through a `?? 'Equipment Rental'`, so an
  -- accessory or an ad-hoc line was billed as equipment rental with nothing
  -- said about it.
  -- ⚠ `line_kind` has no `Damage` and no `Missing` member, so a damage charge
  -- cannot become an invoice line at all. That is MONEY-08; widening the enum
  -- is a ruling (it decides deposit-versus-invoice precedence too) and is NOT
  -- done here.
  -- Law 3 keeps a voided booking line in its table; a voided line is not
  -- billable, so it is kept off the bill.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bl.client_uuid,
    v_invoice_id,
    (case bl.line_type
       when 'Equipment'   then 'Equipment Rental'
       when 'Bundle'      then 'Equipment Rental'
       when 'Accessory'   then 'Equipment Rental'
       when 'Manual item' then 'Equipment Rental'
       when 'Service'     then 'Services'
       when 'Sub-rental'  then 'Sub-Rental'
     end)::line_kind,
    -- `booking_lines.description` is nullable and `invoice_lines.description`
    -- is NOT NULL. The line type is the honest fallback: it says what the
    -- charge is for without inventing a product name nobody typed.
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0)),
    0,
    coalesce(bl.sort_order, 0)
  from booking_lines bl
  where bl.booking_id = v_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (2) Crew, from `booking_crew_lines` — a different table, which is why it
  -- was billed to nobody until 4 Sep. Overtime, accommodation and meals are
  -- per-engagement totals, not per day; folding them into the unit rate keeps
  -- quantity × days × rate equal to the crew member's true cost, which is the
  -- arithmetic the recalc trigger applies to every line without exception.
  --
  -- `line_total` is computed EXACTLY (day_rate × days + extras) rather than
  -- from the divided unit rate, and that distinction earns its keep:
  -- `unit_rate` is `numeric(14,2)`, so a gaffer at 8000 × 3 days plus 4000 of
  -- extras stores a unit rate of 9333.33 whose product with days is 27,999.99
  -- — a rupee short of the 28,000 owed. `line_total` is what
  -- `recalculate_invoice_totals` sums, so the bill is exact and only the
  -- displayed per-day rate carries the rounding. Verified against the same
  -- reference figures the TypeScript suite used to pin (28,000 / 18,000 /
  -- 4,200), so this snapshot bills what its predecessor billed.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    cl.client_uuid,
    v_invoice_id,
    'Crew Charges'::line_kind,
    coalesce(
      nullif(btrim(concat_ws(' - ', nullif(btrim(cl.name), ''), cl.crew_role::text)), ''),
      'Crew'
    ),
    1,
    greatest(1, cl.days),
    cl.day_rate
      + (coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0))
        / greatest(1, cl.days),
    cl.day_rate * greatest(1, cl.days)
      + coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0),
    0,
    1000 + (row_number() over (order by cl.created_at, cl.id))::integer - 1
  from booking_crew_lines cl
  where cl.booking_id = v_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (3) Transport, from `booking_transport`. A row carrying no charge is a
  -- logistics record, not a bill line, so it is skipped rather than billed at
  -- zero. `booking_transport` has no `voided_at` column — there is nothing to
  -- exclude on.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
    v_invoice_id,
    'Transport'::line_kind,
    case
      when nullif(btrim(coalesce(bt.vehicle, '')), '') is not null
        then 'Transport - ' || btrim(bt.vehicle)
      else 'Transport'
    end,
    1,
    1,
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    0,
    2000 + (row_number() over (order by bt.created_at, bt.id))::integer - 1
  from booking_transport bt
  where bt.booking_id = v_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- ── The totals, as POSTGRES computed them ─────────────────────────────────
  -- Re-read, never derived here. A caller rendering its own figure is showing
  -- an estimate; this is the row.
  select * into v_totals from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',      v_totals.id,
    -- R-15 — stated rather than omitted, so a caller cannot mistake a missing
    -- field for a number it failed to read.
    'invoice_no',      v_totals.invoice_no,
    'status',          v_totals.status,
    'booking_id',      v_booking_id,
    'booking_no',      v_resolved_no,
    'client_id',       v_client_id,
    'due_date',        v_totals.due_date,
    'line_count',      v_line_count,
    'subtotal',        v_totals.subtotal,
    'discount_amount', v_totals.discount_amount,
    'taxable_amount',  v_totals.taxable_amount,
    'vat_amount',      v_totals.vat_amount,
    'total',           v_totals.total_amount,
    'replayed',        false
  );
end;
$$;

comment on function create_invoice(jsonb) is
  'Creates one Draft invoice (header + snapshotted lines) in a single transaction. '
  'SECURITY DEFINER because the money columns of booking_lines and booking_transport are '
  'ungranted to every signed-in session (0062) and booking_transport''s only SELECT policy '
  'omits Manager and Accounts — two of the four roles R-05 names — so an invoker-rights '
  'snapshot would silently under-bill rather than refuse. The R-05 role check inside the '
  'function is therefore the gate, and EXECUTE is revoked from PUBLIC and anon. Idempotent '
  'on invoices.client_uuid (Law 8): a replay returns the existing invoice and writes nothing. '
  'Mints no number (R-15 — a Draft carries none) and prices nothing (Law 1 — '
  'recalculate_invoice_totals owns the figures).';

-- A SECURITY DEFINER function inherits EXECUTE from PUBLIC, which would include
-- `anon` — the key that ships inside the browser bundle. PUBLIC is revoked
-- unconditionally; Supabase's platform default privileges also grant EXECUTE to
-- `anon` directly on new functions (SEC-01), and a grant held directly is not
-- removed by revoking it from PUBLIC, so `anon` is named as well.
--
-- The per-role statements are guarded on the role existing so that a restore
-- drill into a scratch database without the Supabase API roles still applies.
revoke all on function create_invoice(jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function create_invoice(jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function create_invoice(jsonb) to authenticated';
  else
    raise notice
      '0096: no `authenticated` role here, so no EXECUTE grant was made. This database cannot serve the '
      'application as it stands.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function create_invoice(jsonb) to service_role';
  end if;
end $$;

-- ── Post-conditions ─────────────────────────────────────────────────────────
--
-- Catalogue first (the function exists with the rights it claims), then a
-- behavioural probe that builds its own booking, invoices it as Accounts,
-- replays the call, and is refused as Coordinator and as Warehouse. Everything
-- the probe writes is rolled back by a sentinel exception, the idiom 0094 uses;
-- PL/pgSQL variables are not transactional, so a recorded failure survives the
-- rollback and is re-raised afterwards.
--
-- The scratch booking is built here rather than borrowed from the corpus
-- because the assertion "the line count equals the source line count" is only
-- worth anything when this block knows what the source count is.

do $$
declare
  v_secdef boolean;
begin
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_invoice'
     and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_secdef is null then
    raise exception 'POST-CONDITION 1 FAILED: create_invoice(jsonb) was not created.';
  end if;
  if not v_secdef then
    raise exception
      'POST-CONDITION 1 FAILED: create_invoice is SECURITY INVOKER. Under invoker rights it reads no rate, no '
      'delivery_charge and — as Manager or Accounts — no transport row at all, and would under-bill silently.';
  end if;

  -- Definer rights make PUBLIC execute a hole, so it must be gone.
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.create_invoice(jsonb)', 'EXECUTE') then
    raise exception
      'POST-CONDITION 2 FAILED: anon may execute create_invoice. The anon key ships in the browser bundle.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and not has_function_privilege('authenticated', 'public.create_invoice(jsonb)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: authenticated may NOT execute create_invoice, so no session can.';
  end if;

  -- 0086 must be in front of this. Without it the header insert dies on
  -- invoice_no NOT NULL (23502) and every line on RLS (42501).
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'invoices' and column_name = 'invoice_no') <> 'YES' then
    raise exception
      'POST-CONDITION 3 FAILED: invoices.invoice_no is still NOT NULL — 0086 has not been applied, and R-15 is '
      'unimplementable without it.';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_insert'
  ) then
    raise exception 'POST-CONDITION 3 FAILED: invoice_lines has no INSERT policy — apply 0086 first.';
  end if;

  raise notice '0096 catalogue post-conditions passed.';
end $$;

do $$
declare
  v_branch    uuid;
  v_client    uuid;
  v_accounts  uuid := gen_random_uuid();
  v_coord     uuid := gen_random_uuid();
  v_warehouse uuid := gen_random_uuid();
  v_booking   uuid;
  v_key       uuid := gen_random_uuid();
  v_payload   jsonb;
  v_result    jsonb;
  v_replay    jsonb;
  v_lines     integer;
  v_lines2    integer;
  v_invoices  integer;
  v_refused   boolean;
  v_err       text;
  v_fail      text;
begin
  select b.id into v_branch from branches b limit 1;
  select c.id into v_client from clients c limit 1;

  -- The probe signs in as a browser session would, so it needs the role a
  -- browser session holds.
  if v_branch is null or v_client is null
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice
      '0096: this database holds no branch, no client or no `authenticated` role, so the behavioural probe was '
      'skipped. The catalogue post-conditions above still ran.';
    return;
  end if;

  begin
    perform set_config('app.in_create_booking', 'on', true);

    -- ── Scratch actors. Neither the live project nor 0012 seeds an Accounts
    --    row, so the role this function exists to serve has to be built.
    insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id)
    values
      (v_accounts,  gen_random_uuid(), 'PROBE-0096-A', 'probe-0096-accounts@invalid.test',
       'Probe Accounts', '+977-9700000096', 'Accounts', v_branch),
      (v_coord,     gen_random_uuid(), 'PROBE-0096-C', 'probe-0096-coordinator@invalid.test',
       'Probe Coordinator', '+977-9700000097', 'Coordinator', v_branch),
      (v_warehouse, gen_random_uuid(), 'PROBE-0096-W', 'probe-0096-warehouse@invalid.test',
       'Probe Warehouse', '+977-9700000098', 'Warehouse', v_branch);

    -- ── The scratch booking: two equipment lines and one transport row, which
    --    is the verification target this migration was written against.
    --    Inserted as the migration's own role, which 0094's guard exempts.
    --
    --    `bookings_booking_no_format` is `^B-[0-9]+$` until 0085 replaces it
    --    with the bare-integer form (R-10). 0085 sits in front of this file in
    --    the chain, but this migration must also survive being applied to a
    --    project that has not taken it yet, so the bare form is tried first and
    --    the prefixed one is the fallback. Neither number can collide: no real
    --    sequence reaches 99,960,096.
    begin
      insert into bookings (
        client_uuid, booking_no, branch_id, client_id, delivery_type,
        pickup_at, return_at, created_by, updated_by
      )
      values (
        gen_random_uuid(), '99960096', v_branch, v_client, 'Babin Delivery',
        now() + interval '1 day', now() + interval '4 days', v_accounts, v_accounts
      )
      returning id into v_booking;
    exception when check_violation then
      insert into bookings (
        client_uuid, booking_no, branch_id, client_id, delivery_type,
        pickup_at, return_at, created_by, updated_by
      )
      values (
        gen_random_uuid(), 'B-99960096', v_branch, v_client, 'Babin Delivery',
        now() + interval '1 day', now() + interval '4 days', v_accounts, v_accounts
      )
      returning id into v_booking;
    end;

    insert into booking_lines (client_uuid, booking_id, line_type, description, qty, days, rate, discount_amount, sort_order, created_by)
    values
      (gen_random_uuid(), v_booking, 'Equipment', '0096 probe body', 1, 3, 5000, 0, 0, v_accounts),
      (gen_random_uuid(), v_booking, 'Accessory', '0096 probe V-mount', 2, 3, 300, 0, 1, v_accounts),
      -- Law 3 keeps a voided line; it must NOT reach the bill, so the expected
      -- line count below is two equipment lines, not three.
      (gen_random_uuid(), v_booking, 'Equipment', '0096 voided line', 1, 3, 9000, 0, 2, v_accounts);
    -- `booking_lines_void_needs_reason` — a void without a reason is refused.
    update booking_lines
       set voided_at = now(), voided_reason = '0096 probe: proves a voided line stays off the bill'
     where booking_id = v_booking and description = '0096 voided line';

    insert into booking_transport (client_uuid, booking_id, vehicle, delivery_charge, fuel_charge, created_by)
    values (gen_random_uuid(), v_booking, 'Probe Bolero', 3000, 1200, v_accounts);

    v_payload := jsonb_build_object(
      'client_uuid', v_key,
      'created_by',  v_accounts,
      'booking_id',  v_booking,
      'vat_rate',    0.1300
    );

    -- ── (1) Accounts raises a Draft with three lines and real totals ────────
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);
    v_result := create_invoice(v_payload);
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_result ->> 'invoice_id' is null then
      v_fail := 'BEHAVIOURAL 1 FAILED: create_invoice returned no invoice_id.';
    end if;
    if v_fail is null and (v_result -> 'invoice_no') <> 'null'::jsonb then
      v_fail := format('BEHAVIOURAL 1 FAILED: the Draft carries invoice_no %s; R-15 mints it at issue.',
                       v_result ->> 'invoice_no');
    end if;
    if v_fail is null and v_result ->> 'status' <> 'Draft' then
      v_fail := format('BEHAVIOURAL 1 FAILED: the invoice was created as %s, not Draft (R-02).', v_result ->> 'status');
    end if;

    -- The line count equals the SOURCE line count: two live booking lines
    -- (the voided third is excluded) plus one charged transport row.
    select count(*) into v_lines from invoice_lines where invoice_id = (v_result ->> 'invoice_id')::uuid;
    if v_fail is null and v_lines <> 3 then
      v_fail := format(
        'BEHAVIOURAL 2 FAILED: the snapshot wrote %s lines where the booking has 3 billable rows (2 live equipment '
        'lines + 1 charged transport row). A voided line on the bill, or a source table not read at all.', v_lines);
    end if;
    if v_fail is null and (v_result ->> 'line_count')::integer <> v_lines then
      v_fail := format('BEHAVIOURAL 2 FAILED: create_invoice reported %s lines but wrote %s.',
                       v_result ->> 'line_count', v_lines);
    end if;
    if v_fail is null and not exists (
      select 1 from invoice_lines
       where invoice_id = (v_result ->> 'invoice_id')::uuid and line_kind = 'Transport'
    ) then
      v_fail :=
        'BEHAVIOURAL 2 FAILED: no Transport line was written. This is the DATA-01 failure mode — the transport '
        'read returned nothing and the invoice under-billed in silence.';
    end if;

    -- The totals are the trigger's, and they are not zero.
    if v_fail is null and (v_result ->> 'total')::numeric <= 0 then
      v_fail := format(
        'BEHAVIOURAL 3 FAILED: three lines landed and total is %s. recalculate_invoice_totals did not fire, so the '
        'header is a free invoice.', v_result ->> 'total');
    end if;
    if v_fail is null and (v_result ->> 'subtotal')::numeric
         is distinct from (select coalesce(sum(line_total), 0) from invoice_lines
                            where invoice_id = (v_result ->> 'invoice_id')::uuid) then
      v_fail := 'BEHAVIOURAL 3 FAILED: the returned subtotal is not the sum of the lines the trigger saw.';
    end if;

    -- ── (4) Law 8 — a replay writes nothing and returns the same invoice ────
    select count(*) into v_invoices from invoices where booking_id = v_booking;
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);
    v_replay := create_invoice(v_payload);
    reset role;
    perform set_config('app.current_user_id', '', true);

    select count(*) into v_lines2 from invoice_lines where invoice_id = (v_result ->> 'invoice_id')::uuid;

    if v_fail is null and v_replay ->> 'invoice_id' <> v_result ->> 'invoice_id' then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay of the same client_uuid returned a DIFFERENT invoice — Law 8 broken, one press became two invoices.';
    end if;
    if v_fail is null and (v_replay ->> 'replayed') <> 'true' then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay did not report itself as one, so a caller cannot tell "created" from "you already did this".';
    end if;
    if v_fail is null and (select count(*) from invoices where booking_id = v_booking) <> v_invoices then
      v_fail := 'BEHAVIOURAL 4 FAILED: a replay wrote a second invoice header.';
    end if;
    if v_fail is null and v_lines2 <> v_lines then
      v_fail := format('BEHAVIOURAL 4 FAILED: a replay added lines (%s → %s).', v_lines, v_lines2);
    end if;

    -- ── (5) Warehouse is refused — Law 6, money-blind ───────────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_warehouse::text, true);
      perform create_invoice(jsonb_build_object(
        'client_uuid', gen_random_uuid(), 'created_by', v_warehouse, 'booking_id', v_booking, 'vat_rate', 0.1300));
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 5 FAILED: a Warehouse session raised an invoice. Warehouse sees no money.';
    end if;
    if v_fail is null and position('may not raise an invoice' in coalesce(v_err, '')) = 0
       and position('cannot read money' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 5 FAILED: Warehouse was refused, but not by this function''s gate. Postgres said: %s', v_err);
    end if;

    -- ── (6) Coordinator is refused — R-05 withdrew the right ────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      perform create_invoice(jsonb_build_object(
        'client_uuid', gen_random_uuid(), 'created_by', v_coord, 'booking_id', v_booking, 'vat_rate', 0.1300));
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 6 FAILED: a Coordinator raised an invoice. R-05 names Owner, Admin, Manager and Accounts.';
    end if;
    if v_fail is null and position('may not raise an invoice' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 6 FAILED: Coordinator was refused, but not by R-05. Postgres said: %s', v_err);
    end if;

    raise exception 'ROLLBACK_0096_PROBE';
  exception
    when others then
      reset role;
      if sqlerrm <> 'ROLLBACK_0096_PROBE' then
        raise;
      end if;
      perform set_config('app.current_user_id', '', true);
      if v_fail is not null then
        raise exception '%', v_fail;
      end if;
      raise notice
        '0096 behavioural probe passed and rolled back: Accounts raised a numberless Draft of 3 lines with '
        'trigger-computed totals, a replay returned the same id and wrote nothing, Warehouse and Coordinator were '
        'refused.';
  end;
end $$;

commit;

-- =============================================================================
-- ## What this migration deliberately leaves alone
--
--   · **Who may ISSUE, VOID or append lines.** `issue_invoice`, `void_invoice`
--     and `addInvoiceLine` (SPEC-P0-1 §3.2–§3.4) are separate verbs. R-05 gives
--     issue rights to the same four roles; no 4 Sep ruling restates the void
--     set, so per R-00 the older position stands and `canVoidInvoice` is left
--     as it is. That mismatch is AUTHSEC-01's remaining half and needs a
--     ruling, not a migration.
--   · **`line_kind` has no Damage and no Missing member.** A damage charge
--     cannot reach an invoice line today (MONEY-08). Widening the enum decides
--     deposit-versus-invoice precedence and is a ruling.
--   · **`booking_transport_driver_read` and `booking_transport_v` omit Manager
--     and Accounts.** That is what forced definer rights here. Correcting the
--     Law 6 grant contract is SEC-04 / DB-02 and wants the registry-driven
--     arming the audit recommends, not a one-off widening bolted to this file.
--   · **The trigger's 2 dp and hardcoded 0.13.** MONEY-03 /
--     `0098_invoice_totals_match_engine`. This function returns whatever the
--     trigger computed and adds no second opinion.
-- =============================================================================

-- >>> END 0096_create_invoice_rpc.sql <<<

-- >>> START 0097_sync_cursors_are_server_written.sql <<<
-- =============================================================================
-- 0097_sync_cursors_are_server_written.sql — 7 Sep 2026
--
-- **Every sync cursor in the on-device design reads a column the device writes.**
-- PLAN.md §4.43(d) items 1 and 2, and ONDEVICE_DB_PLAN Phase 0 items 1 and 2.
-- Both are engineering, not product rulings — §4.43(d) says so explicitly — so
-- neither waits on §4.43(a) numbering or (b) money-on-disk.
--
-- ## Defect 1 — `updated_at` is written by the client, and nothing overrides it
--
-- `src/actions/rentals/floorVerb.ts` sets `updated_at` from `occurredAt`, which is
-- the DEVICE clock. Across all 96 prior migrations there is not one trigger that
-- touches the column — verified by grep for `new.updated_at`, zero hits.
--
-- Every cursor-based pull in every design in the panel orders and filters on it.
-- So one tablet with a skewed clock does not merely mis-stamp its own rows: it
-- writes timestamps that sort BEHIND the fleet cursor, and every device that has
-- already moved its cursor past that instant **silently and permanently skips
-- those rows**. Nothing throws. The row is simply never pulled again.
--
-- That is the whole failure mode the dead-zone build exists to avoid, and it is
-- unfixable at the call site: `updated_at` has to stop being the device's to say.
--
-- Four tables in the 14-table floor sync set do not have the column at all —
-- `booking_lines`, `booking_line_units`, `session_line_movements` and
-- `booking_stage_transitions` — so a uniform cursor cannot be written over the
-- set as it stands.
--
--   ⚠ PLAN.md §4.43(d).1 lists the four as booking_lines, booking_line_units,
--     `booking_discounts` and booking_stage_transitions. That list is wrong in
--     both directions: it names `booking_discounts`, which is NOT in the floor
--     sync set (it is money), and omits `session_line_movements`, which IS.
--     Re-measured 7 Sep over the CREATE TABLE blocks: exactly five tables lack
--     the column.
--
-- ## RULING 2026-09-07 — `booking_stage_transitions` is excluded, and its cursor
-- ## is `created_at`
--
-- The first draft of this file added `updated_at` to all five and attached the
-- trigger to all fifteen. **Applying it to a real Postgres refused it**, and the
-- refusal was correct:
--
--   Law 3 (append-only): UPDATE on booking_stage_transitions is rejected for
--   every role including Owner and service_role. Correction: insert a reversal row.
--
-- `trg_booking_stage_transitions_reject_update` (`0044:200`) makes that table
-- append-only. The backfill below is an UPDATE, so it could never run — and more
-- to the point, a column that can never change is not a cursor, it is a lie, and
-- a BEFORE UPDATE trigger on a table that rejects UPDATE is dead code.
--
-- So: the table keeps NO `updated_at`, and **a sync cursor over
-- `booking_stage_transitions` must order on `created_at`**. That is sound
-- precisely because it is append-only — a row never moves after it lands, which
-- is the property `updated_at` exists to detect and this table does not need.
--
-- `booking_discounts` IS included: `0044`'s own note says UPDATE there stays
-- legal (whether it should be append-only is an open TODO at `0044:213`), so it
-- both can be backfilled and will want a cursor the day money syncs.
--
-- Revert: re-add 'booking_stage_transitions' to the two arrays below. It will
-- fail again, in the same place, for the same reason.
--
-- Net: `updated_at` added to **4** tables; the trigger attached to **14**.
--
-- ## Defect 2 — `bookings.version` is a dead optimistic lock
--
-- `version integer not null default 1` with `check (version >= 1)`
-- (`0002_bookings.sql`), and nothing anywhere increments it: 0 migrations,
-- 0 source files. Every design in the panel treats it as a working CAS, so every
-- compare-and-set matches and every conflict resolves as silent last-write-wins.
--
-- §4.43(d).2 offers increment or delete, and says leaving it is worse than both
-- because it reads as protection that is not there. This increments it: two
-- devices editing one booking offline is precisely the case the dead-zone build
-- creates, and a column that already exists on 246 live rows is cheaper to arm
-- than to remove and reintroduce.
--
-- ## What this adds
--
--   1. `updated_at` on the **4** updatable tables that lack it — backfilled from
--      `created_at`, NOT from `now()`, so an old row does not arrive at the
--      fleet looking freshly touched and drag every cursor forward.
--   2. `public.set_updated_at()` — unconditional `new.updated_at := now()`.
--      Unconditional is the point: a supplied value is exactly what we are
--      defending against, so it is overwritten rather than respected.
--   3. `public.bump_row_version()` — `new.version := old.version + 1`, on
--      `bookings` only.
--   4. `set_updated_at` attached BEFORE UPDATE to **14** tables: the floor sync
--      set minus append-only `booking_stage_transitions`, plus
--      `booking_discounts`.
--
-- `now()` is transaction time, not `clock_timestamp()`: every row written by one
-- transaction must carry one instant, or a cursor can land mid-transaction and
-- tear a booking from its lines.
--
-- ## Scope note — the third defect is fixed in code, not here
--
-- §4.43(d).3 (`operation_sessions.id` minted per device) is fixed in
-- `src/lib/deterministicId.ts` + `floorVerb.ts`, and needs **no schema change**.
--
-- RULING 2026-09-07: §4.43(d).3's prescribed key `(booking_id, operation,
-- operational_day)` was rejected on three counts, each checked against the
-- schema: (1) `operation_sessions_one_packing_per_booking` (`0003:152`) allows
-- one Packing session per booking *ever*, so a day-keyed id is wider than an
-- existing invariant and re-creates the orphan it was meant to prevent;
-- (2) `session_no` separates the morning collection from the evening one on the
-- SAME day, which a day key merges; (3) `operational_day` derives from
-- `operationalDayStart`, a `localStorage`-only per-browser setting, so it is not
-- fleet-deterministic. Built on `(booking_id, operation, session_no)` instead —
-- already unique via `operation_sessions_session_no_unique` (`0003:85`), no new
-- column, no setting. Revert: restore `generateClientUuid()` at the id site.
-- =============================================================================

begin;

-- ── Pre-conditions ────────────────────────────────────────────────────────────
do $$
declare
  v_missing text;
  v_have    int;
begin
  -- Every table this file touches must exist, or the trigger loop below would
  -- silently attach to a shorter list than the header claims.
  select string_agg(u.name, ', ' order by u.name) into v_missing
  from unnest(array[
    'bookings','booking_lines','booking_line_units','products','product_units',
    'operation_sessions','packing_lines','handover_lines','return_lines',
    'session_line_movements','cleaning_queue_entries','booking_stage_transitions',
    'damage_findings','clients','booking_discounts'
  ]) as u(name)
  where to_regclass('public.' || u.name) is null;

  if v_missing is not null then
    raise exception 'PRE-CONDITION FAILED: missing table(s): %', v_missing;
  end if;

  -- bookings.version must still be the untouched column §4.43(d).2 describes.
  select count(*) into v_have
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bookings' and column_name = 'version';

  if v_have <> 1 then
    raise exception 'PRE-CONDITION FAILED: bookings.version is gone — §4.43(d).2 was '
                    'resolved by deletion, so this file must not arm it.';
  end if;
end $$;

-- ── 1 · the column, where it is missing ───────────────────────────────────────
-- Nullable first, backfilled from created_at, then constrained. Adding it as
-- `not null default now()` in one step would stamp every existing row with the
-- migration's own instant — which is the exact false-freshness this file exists
-- to prevent, and it would make the first pull fetch the entire table.
do $$
declare
  t text;
begin
  -- RULING 2026-09-07: booking_stage_transitions is NOT here. It is append-only
  -- (0044:200 rejects every UPDATE), so the backfill below cannot run on it and
  -- its sync cursor is created_at. See the header.
  foreach t in array array[
    'booking_lines','booking_line_units','session_line_movements','booking_discounts'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('alter table public.%I add column updated_at timestamptz', t);
      execute format('update public.%I set updated_at = created_at where updated_at is null', t);
      execute format('alter table public.%I alter column updated_at set default now()', t);
      execute format('alter table public.%I alter column updated_at set not null', t);
      raise notice '0097: added updated_at to %, backfilled from created_at', t;
    else
      raise notice '0097: % already had updated_at — left alone', t;
    end if;
  end loop;
end $$;

-- ── 2 · the two trigger functions ─────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Unconditional, and deliberately so. The device supplying a value is the
  -- defect (§4.43(d).1), so a supplied value carries no authority here.
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'PLAN.md §4.43(d).1 — sync cursors must not read a clock the device controls. '
  'Overwrites updated_at with transaction time on every UPDATE, ignoring any '
  'value the client sent.';

create or replace function public.bump_row_version()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- old.version is never null: the column is `not null default 1` with
  -- `check (version >= 1)`, so this cannot produce a null and cannot go below 1.
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.bump_row_version() is
  'PLAN.md §4.43(d).2 — arms bookings.version so an optimistic-lock compare can '
  'actually fail. Before this, every CAS matched and every conflict resolved as '
  'silent last-write-wins.';

-- ── 3 · attach ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  -- RULING 2026-09-07: booking_stage_transitions omitted — a BEFORE UPDATE
  -- trigger on a table that rejects UPDATE is dead code. 14 targets, not 15.
  foreach t in array array[
    'bookings','booking_lines','booking_line_units','products','product_units',
    'operation_sessions','packing_lines','handover_lines','return_lines',
    'session_line_movements','cleaning_queue_entries',
    'damage_findings','clients','booking_discounts'
  ]
  loop
    execute format('drop trigger if exists trg_%s_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists trg_bookings_bump_version on public.bookings;
create trigger trg_bookings_bump_version
  before update on public.bookings
  for each row execute function public.bump_row_version();

-- ── 4 · post-conditions ───────────────────────────────────────────────────────
-- Structural assertions always run. The behavioural probe runs only if a booking
-- exists, and says so out loud when it does not — a check that quietly passes on
-- an empty table is not a check (cf. 0085's external_refs gate, which cannot fire
-- because the rows it counts were never imported).
--
-- Every write below is inside the ROLLBACK_0097_PROBE sentinel — the pattern 0094
-- and 0095 use, and the one 0092 omitted, which is why 0092's probe committed a
-- real UPDATE to a production product row.
do $$
declare
  v_expected  int := 14;
  v_attached  int;
  v_id        uuid;
  v_before    timestamptz;
  v_after     timestamptz;
  v_ver_before int;
  v_ver_after  int;
  v_skewed    constant timestamptz := timestamptz '1999-01-01 00:00:00+00';
begin
  select count(*) into v_attached
  from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  where not tg.tgisinternal
    and tg.tgname = 'trg_' || c.relname || '_set_updated_at'
    and c.relnamespace = 'public'::regnamespace
    and c.relname = any (array[
      'bookings','booking_lines','booking_line_units','products','product_units',
      'operation_sessions','packing_lines','handover_lines','return_lines',
      'session_line_movements','cleaning_queue_entries',
      'damage_findings','clients','booking_discounts'
    ]);

  if v_attached <> v_expected then
    raise exception 'POST-CONDITION FAILED: set_updated_at attached to % tables, expected %.',
      v_attached, v_expected;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_bookings_bump_version' and not tgisinternal
  ) then
    raise exception 'POST-CONDITION FAILED: trg_bookings_bump_version is not attached.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('booking_lines','booking_line_units','session_line_movements',
                         'booking_discounts')
      and column_name = 'updated_at'
      and is_nullable = 'YES'
  ) then
    raise exception 'POST-CONDITION FAILED: updated_at is still nullable somewhere — the '
                    'backfill did not complete, so a cursor would read NULL.';
  end if;

  select id, updated_at, version into v_id, v_before, v_ver_before
  from public.bookings order by created_at limit 1;

  if v_id is null then
    raise notice '0097: BEHAVIOURAL PROBE NOT RUN — public.bookings is empty. The triggers '
                 'are attached (asserted above) but nothing has demonstrated that a skewed '
                 'client timestamp is actually overwritten on this database.';
  else
    -- A device in 1999. If the trigger works, this value never reaches the row.
    update public.bookings set updated_at = v_skewed where id = v_id;
    select updated_at, version into v_after, v_ver_after from public.bookings where id = v_id;

    if v_after = v_skewed then
      raise exception 'POST-CONDITION FAILED: the client-supplied timestamp survived — '
                      'set_updated_at did not fire on bookings.';
    end if;
    if v_after < v_before then
      raise exception 'POST-CONDITION FAILED: updated_at moved BACKWARDS (% -> %), which is '
                      'the cursor-skipping failure this file exists to prevent.', v_before, v_after;
    end if;
    if v_ver_after <> v_ver_before + 1 then
      raise exception 'POST-CONDITION FAILED: version did not increment (% -> %).',
        v_ver_before, v_ver_after;
    end if;
    raise notice '0097: probe passed — skewed % overwritten with %, version % -> %.',
      v_skewed, v_after, v_ver_before, v_ver_after;
  end if;

  raise exception 'ROLLBACK_0097_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0097_PROBE' then
      return;  -- probe writes discarded; the DDL above is outside this block and stands
    end if;
    raise;
end $$;

commit;

-- >>> END 0097_sync_cursors_are_server_written.sql <<<

-- >>> START 0098_invoice_totals_match_engine.sql <<<
-- =============================================================================
-- 0098 — MONEY-03 / MONEY-04: make the invoice trigger compute the same money
--        `src/lib/money.ts` computes, recompute when a header input changes,
--        and give an overpayment a home.
--        DRAFT — **NOT APPLIED**. PHASE-0-PLAN.md Step 0 (live dump, restore
--        test, token rotation) must land first. CLAUDE.md forbids applying to
--        live without explicit approval either way. Verify the ledger
--        (`supabase_migrations.schema_migrations`) before trusting this header;
--        headers in this directory have been wrong before. Ledger re-read 8 Sep
--        2026: top row is now 20260907103035 (`0089`), which landed out of
--        order on top of 20260901114821 (`0078`). So live is 0001-0078 plus
--        0089; 0079, 0080, this file, 0082-0088 and 0090-0097 are all absent.
--        (The 7 Sep reading below — 'live stops at 0078' — was true when
--        written and is superseded by this line, not by a change of fact
--        about THIS file: it is still unapplied.)
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.
--
--        RENUMBERED 8 Sep 2026 (RULINGS-2026-09-08 R-26, Order of work step 1):
--        this file was written as `0081`, a number that sits BEFORE 0085-0097
--        in filename order although it was written after them. It is now
--        `0098`. Neither `0081` nor `0098` is ever reused. The ordering
--        footer at the bottom of this file was rewritten for the new
--        position and re-proved with `npm run check:pglite`.
--
-- Implements SPEC-P0-1-INVOICING.md §2.2, which PHASE-0-PLAN.md 1.2 named and
-- nobody ever wrote. Closes REMEDIATION_AUDIT_2026-09-05.md MONEY-03 (Option A)
-- and the database half of MONEY-04 (Option A).
--
-- =============================================================================
-- ## 1. MONEY-03 — two implementations of one calculation
-- =============================================================================
--
-- `pg_get_functiondef(recalculate_invoice_totals)`, read on the LIVE project on
-- 7 Sep 2026 rather than from a migration file:
--
--     v_discount := round(v_subtotal * (v_discount / 100.0), 2);
--     v_taxable  := v_subtotal - v_discount;
--     v_vat      := round(v_taxable * <a hardcoded rate>, 2);
--     v_total    := v_taxable + v_vat;
--
-- Three defects in four lines: it rounds to PAISA where the engine rounds to
-- the whole RUPEE, it hardcodes the rate instead of reading `invoices.vat_rate`,
-- and it is bound to `invoice_lines` only, so editing the header's
-- `discount_percent` changes nothing at all.
--
-- Measured on the Foundation §2.8 reference case (subtotal 132750, discount 7%,
-- VAT 13%), by running both chains on the live server's own numeric engine:
--
--     trigger  9292.50 / 123457.50 / 16049.48 / 139506.98
--     engine   9293    / 123457    / 16049    / 139506
--
-- Rs 0.98 on the total, Rs 0.48 on the VAT line — the line that goes on an IRD
-- return.
--
-- SPEC-P0-1 §2.2 already ruled which side moves: *"Foundation already rules the
-- app's arithmetic canonical, so the trigger changes, not the engine. No
-- further decision is needed."* So `src/lib/money.ts` `price()` is the
-- specification for what is below, and this migration is its transcription.
--
-- ## Where this deliberately departs from the §2.2 code sketch
--
-- §2.2 sketches five rounds:
--
--     v_taxable := round(v_subtotal - v_discount, 0);
--     v_total   := round(v_taxable + v_vat, 0);
--
-- `money.ts` rounds neither. `price()` (money.ts:111-140) rounds exactly two
-- steps — the discount and the VAT — and leaves `taxable = subtotal - discount`
-- and `rentalTotal = taxable + vat` as exact sums:
--
--     const discount = toWholeRupee(subtotal * (i.discountPercent / 100))
--     const taxable  = (subtotal - discount) as Paisa          // not rounded
--     const vat      = toWholeRupee(taxable * (i.vatPercent / 100))
--     const rentalTotal = (taxable + vat) as Paisa             // not rounded
--
-- On the reference case the two readings agree, because its subtotal is a whole
-- number of rupees and every later term therefore is too. They diverge the
-- moment a line carries paisa — and `invoice_lines.line_total` is
-- `numeric(14,2)`, so it can. Transcribing the sketch literally would round the
-- paisa off `taxable` and reintroduce, in a different column, the very
-- engine/trigger divergence this migration exists to remove; it would also make
-- the printed invoice stop adding up, since `subtotal - discount` would no
-- longer equal the `taxable` beside it. §2.2's own governing sentence — the
-- engine is canonical — decides it. The two extra rounds are dropped, and this
-- follows `money.ts` step for step.
--
-- Both readings were measured, not reasoned about. Five cases run through the
-- live server's numeric engine and through `price()` compiled out of
-- `src/lib/money.ts`:
--
--   case                  subtotal    discount  taxable    vat     total
--   §2.8 reference        132750.00   9293      123457     16049   139506
--   half-up .5 discount     1000.00      1         999       130     1129
--   half-up .5 VAT          1000.00      0        1000         1     1001
--   paisa subtotal          1000.49      0        1000.49     130    1130.49
--   zero rate               5000.00    500        4500          0     4500
--
-- Identical on all five, including both half-up boundaries. Under §2.2's literal
-- sketch the fourth row would read 1000 / 130 / 1130 — Rs 0.49 adrift.
--
-- ## Rounding mode: half-up, and it genuinely matches
--
-- Postgres `round(numeric, 0)` rounds half AWAY FROM ZERO. `money.ts`
-- `roundHalfUp` (money.ts:126-128) is `n < 0 ? -Math.round(-n) : Math.round(n)`
-- — also half away from zero, written that way precisely because bare
-- `Math.round` sends −0.5 to −0. So the two agree on negatives (a credit note, a
-- reversal) as well as positives. This is the rare case where the platforms line
-- up exactly; it is asserted below rather than assumed.
--
-- ## Units: the trap in this file
--
-- `invoices.vat_rate` is `numeric(5,4)` and stores a **fraction** — 0.1300.
-- `invoices.discount_percent` is `numeric(5,2)` and stores a **percent** — 7.00.
-- So the discount divides by 100 and the VAT does not. Getting that backwards
-- multiplies VAT by one hundred. `money.ts` takes `vatPercent` as a percent and
-- divides; the column does not, and is not divided here.
--
-- =============================================================================
-- ## 2. Absorbing 0079, and a correction to its premise
-- =============================================================================
--
-- `0079_invoice_vat_rate_is_authoritative.sql` is the drafted, unapplied,
-- rate-only half of this fix: it swaps the literal for the column and keeps
-- 2-dp rounding, explicitly deferring the rounding question as "PLAN §4.42(b),
-- an unruled finance question". SPEC-P0-1 §2.2 has since ruled it. This file
-- therefore supersedes 0079's function body outright — it is absorbed, not
-- duplicated, and 0079's own footer now says so.
--
-- 0079 is deliberately NOT reduced to a stub. It applies cleanly, it is a
-- strict improvement on the live body if it ever lands alone, and Law 3 does not
-- delete work. Applying 0079 then 0098 leaves 0098's body; applying 0098 alone
-- leaves the same body. Either order is correct.
--
-- **Correction to the brief this file was written from, and to 0079's title.**
-- 0079 does not *add* `vat_rate`, and neither does this file: the column already
-- exists on live, as `numeric(5,4) NOT NULL DEFAULT 0.1300`
-- (information_schema.columns, 7 Sep 2026). It is **NOT NULL**, so:
--
--   · the `coalesce(vat_rate, system_settings, 0.13)` chain that §2.2 sketches
--     is unreachable — the first term can never be null, on any row that can
--     exist today or historically. It is not written here, and no fallback
--     literal is written either. That is deliberate twice over: an unreachable
--     fallback is a lie about where the rate comes from, and `system_settings`
--     holds **0 rows** on live while its `value` column is `jsonb` whose units
--     (fraction like the column, or percent like `discount_percent`?) nothing
--     has ruled. Encoding a guess there would smuggle a product decision into a
--     bug fix — see DATA-08 and the TODO(decision) in this session's report.
--   · a missing invoice row must raise, not silently price at zero VAT, so the
--     `select … into STRICT` of 0079 is kept.
--
-- =============================================================================
-- ## 3. MONEY-04 — the two live formulas disagree about overpayment
-- =============================================================================
--
--     recalculate_invoice_totals   v_outstanding := v_total - v_paid;
--     sync_payment_to_invoice      greatest(0, v_total_amount - v_total_paid)
--
-- and `invoices_amounts_non_negative` CHECKs `outstanding_amount >= 0`. So an
-- overpaid invoice is two different things depending on which trigger last
-- fired: on the payment path the excess silently vanishes, and on the line path
-- the unfloored subtraction goes negative and trips 23514 — which means an
-- overpaid Draft can never take another line, so the damage charge at return is
-- REFUSED. That is the failure R-03 walks into.
--
-- One derivation now owns it, as two immutable one-liners that both callers use:
--
--     invoice_outstanding(total, paid) := greatest(total - paid, 0)
--     invoice_credit(total, paid)      := greatest(paid - total, 0)
--
-- The excess stops vanishing: it lands in `invoices.credit_amount`.
--
-- ## Why a real column and not a computed column in a view
--
-- The brief offered `invoices_v` as the alternative. Three reasons against, the
-- first decisive:
--
--   1. **There is no `invoices_v`.** `information_schema.views` on live, 7 Sep
--      2026: the only `_v` view in this area is `client_directory_v`. The
--      alternative is not "use the existing view", it is "invent one".
--   2. **The immutability trigger permits it.** This was the stated worry, and
--      it is unfounded — `reject_invoice_edit_after_issue`, read live, does not
--      diff the row. It names seven columns: subtotal, discount_amount,
--      discount_percent, taxable_amount, vat_amount, total_amount, due_date.
--      `paid_amount`, `outstanding_amount` and `status` are absent by design,
--      because a payment must be able to land on an issued invoice.
--      `credit_amount` is a payment-state column of exactly that family — it
--      moves when and only when `paid_amount` moves — so adding it changes
--      nothing about what the trigger protects. A view column would have been
--      chosen to dodge a trigger that was never in the way.
--   3. **The gates read the base table.** `validate_booking_gates`,
--      `closeRental.ts` and `closing.ts` all read `invoices` directly. A credit
--      that existed only in a view would be invisible to every one of them —
--      MONEY-04's complaint (a balance derived in N places) restated, not fixed.
--      And per SEC-01 the `_v` views are currently the security hole, not the
--      safe surface.
--
-- The column is `NOT NULL DEFAULT 0` rather than nullable: `paid_amount` and
-- `outstanding_amount`, the two columns it belongs beside, are both
-- `numeric(14,2) NOT NULL DEFAULT 0`, and a nullable money column forces every
-- future reader into three-valued arithmetic where "no credit" and "unknown"
-- look alike. Live holds 0 invoices, so the backfill is vacuous either way.
--
-- ⚠ **What this does NOT decide.** What a credit MEANS — refund it, or hold it
-- against the next invoice — is unruled. This migration only stops the money
-- disappearing and stops the CHECK violation; it builds no refund path (that is
-- MONEY-09, Phase 2) and no application of a credit. See the TODO(decision) in
-- the session report, proposed as PLAN.md §4.50.
--
-- =============================================================================
-- ## 4. Verification status — read this before believing anything above
-- =============================================================================
--
-- **This file has NOT been run.** `npm run check:rebuild` and `npm run
-- db:rebuild` cannot execute in this workspace: Docker Desktop's privileged
-- service (`com.docker.service`) is stopped, every `docker` command hangs, and
-- the database port accepts a TCP connection but nothing answers it. No scratch
-- database was built and no statement below has been executed anywhere.
--
-- What IS proven, and how:
--   · the arithmetic chain, against the live server's numeric engine and
--     against `price()` compiled from `src/lib/money.ts` — the five-row table
--     above, both sides run;
--   · every claim about the live schema (function bodies, the seven protected
--     columns, the CHECK, `vat_rate` NOT NULL, the absent `invoices_v`, the
--     ledger top) — read from the live catalogue, not from files.
--
-- What is NOT proven: that this file applies. The post-conditions below are
-- written to carry that weight when the gate returns — they execute the shipped
-- functions on the reference case rather than grepping `prosrc` for hopeful
-- substrings, so a green apply is a real proof of the arithmetic, and
-- `scripts/check-money.mjs` drives the whole thing through actual rows.
-- =============================================================================

begin;

-- ── MONEY-04: somewhere for an overpayment to live ──────────────────────────

alter table public.invoices
  add column if not exists credit_amount numeric(14,2) not null default 0;

comment on column public.invoices.credit_amount is
  'MONEY-04. The overpayment: greatest(paid_amount - total_amount, 0). Derived '
  'only, by invoice_credit() inside recalculate_invoice_totals and '
  'recompute_invoice_payment_state — never written directly. What a credit MEANS '
  '(refund, or apply to the next invoice) is UNRULED; this column only stops the '
  'money vanishing and stops an overpaid invoice tripping '
  'invoices_amounts_non_negative on its next line edit.';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.invoices'::regclass
                    and conname = 'invoices_credit_amount_non_negative') then
    alter table public.invoices
      add constraint invoices_credit_amount_non_negative check (credit_amount >= 0);
  end if;

  /* An invoice cannot simultaneously owe and be owed. Both columns come out of
     the same (total, paid) pair through greatest(), so at most one can be
     positive — this states that structurally rather than trusting two call
     sites to keep agreeing. It also catches the failure mode this migration is
     about: a future writer that sets one column and forgets the other. */
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.invoices'::regclass
                    and conname = 'invoices_credit_xor_outstanding') then
    alter table public.invoices
      add constraint invoices_credit_xor_outstanding
      check (outstanding_amount = 0 or credit_amount = 0);
  end if;
end $$;

-- ── The arithmetic, as functions, so there is exactly one of each ───────────
--
-- IMMUTABLE and pure: no table access, so they can be asserted directly in a
-- post-condition and reused by both the line trigger and the header trigger
-- without either carrying its own copy of a money expression.

create or replace function public.invoice_discount_amount(
  p_subtotal numeric,
  p_discount_percent numeric
) returns numeric
language sql
immutable
set search_path = public, pg_temp
as $fn$
  /* money.ts:135 — toWholeRupee(subtotal * (discountPercent / 100)).
     discount_percent is a PERCENT, so it divides by 100. */
  select round(coalesce(p_subtotal, 0) * (coalesce(p_discount_percent, 0) / 100.0), 0);
$fn$;

create or replace function public.invoice_vat_amount(
  p_taxable numeric,
  p_vat_rate numeric
) returns numeric
language sql
immutable
set search_path = public, pg_temp
as $fn$
  /* money.ts:137 — toWholeRupee(taxable * (vatPercent / 100)).
     invoices.vat_rate is a FRACTION — numeric(5,4), thirteen percent stored as
     four decimal places — NOT a percent, so there is no division here.
     The hardcoded rate this replaces is deliberately not written anywhere in
     this function, not even in a comment: post-condition (5) greps prosrc for
     it, and a comment mentioning it fails this migration. */
  select round(coalesce(p_taxable, 0) * coalesce(p_vat_rate, 0), 0);
$fn$;

create or replace function public.invoice_outstanding(
  p_total numeric,
  p_paid numeric
) returns numeric
language sql
immutable
set search_path = public, pg_temp
as $fn$
  /* MONEY-04. THE outstanding rule. Floored, because
     invoices_amounts_non_negative CHECKs outstanding_amount >= 0 and because a
     negative receivable is a credit, which has its own column. */
  select greatest(coalesce(p_total, 0) - coalesce(p_paid, 0), 0);
$fn$;

create or replace function public.invoice_credit(
  p_total numeric,
  p_paid numeric
) returns numeric
language sql
immutable
set search_path = public, pg_temp
as $fn$
  /* MONEY-04. The other side of the same subtraction, so the money the floor
     above removes is not lost. */
  select greatest(coalesce(p_paid, 0) - coalesce(p_total, 0), 0);
$fn$;

comment on function public.invoice_outstanding(numeric, numeric) is
  'MONEY-04. The one outstanding rule: greatest(total - paid, 0). Used by '
  'recalculate_invoice_totals and by recompute_invoice_payment_state (0087) so '
  'the line path and the payment path cannot disagree about an overpayment, '
  'which is exactly what they did before this migration. Do not inline it.';

-- ── The one net-paid sum ────────────────────────────────────────────────────
--
-- STABLE, not immutable: it reads tables. Extracted here rather than left
-- inline in 0087 so that the sum has ONE definition and MONEY-02's three
-- filters (Advance Payment only, Received only, less reversals) cannot be
-- half-copied into a second place later.
--
-- It is called only from the PAYMENT path (0087's recompute_invoice_payment_
-- state, running as whoever wrote the payment or the reversal — a role that by
-- definition reaches the money tables). The LINE and HEADER paths above
-- deliberately do NOT call it and read `invoices.paid_amount` instead, because
-- they run as whoever edited a line or a discount, and Law 6 holds the floor
-- roles off `payments`. `paid_amount` is that path's output; consuming it keeps
-- one writer per column.

create or replace function public.invoice_paid_net(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $fn$
  /*
   * Only 'Advance Payment' is revenue against an invoice (MONEY-02):
   *   · 'Refund'          — money going the other way; counting it as paid is
   *                         the defect. payments_amount_positive forces
   *                         amount > 0, so an unfiltered sum RAISES paid.
   *   · 'Security Deposit' — a liability (Law 5), never touches Outstanding.
   *                         A live CHECK (payments_no_security_deposit) already
   *                         refuses the row; the filter is belt as well as
   *                         braces, and survives that CHECK being relaxed.
   * Less every reversal written against those same payments (Law 4: a payment
   * is immutable, a correction is a payment_reversals row). payment_reversals
   * has no invoice_id of its own, so the join through payments is the only
   * route.
   */
  select greatest(
    coalesce((
      select sum(p.amount) from payments p
       where p.invoice_id = p_invoice_id
         and p.status = 'Received'
         and p.payment_type = 'Advance Payment'
    ), 0)
    -
    coalesce((
      select sum(r.amount)
        from payment_reversals r
        join payments p on p.id = r.original_payment_id
       where p.invoice_id = p_invoice_id
         and p.status = 'Received'
         and p.payment_type = 'Advance Payment'
    ), 0),
    0);
$fn$;

-- ── MONEY-03: the line trigger, transcribed from money.ts ───────────────────

create or replace function public.recalculate_invoice_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_subtotal numeric(14,2);
  v_discount_pct numeric(5,2);
  v_vat_rate numeric(5,4);
  v_discount numeric(14,2);
  v_taxable numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_target_invoice_id uuid;
begin
  if (TG_OP = 'DELETE') then
    v_target_invoice_id := OLD.invoice_id;
  else
    v_target_invoice_id := NEW.invoice_id;
  end if;

  -- 1. The subtotal is the sum of the lines. Not rounded — money.ts does not
  --    round it either, and rounding it here would silently move money that no
  --    line accounts for.
  select coalesce(sum(line_total), 0)
    into v_subtotal
    from invoice_lines
   where invoice_id = v_target_invoice_id;

  -- 2. The header inputs. STRICT: a missing invoice raises rather than pricing
  --    at zero VAT (0079's reasoning, kept). vat_rate is NOT NULL, so it needs
  --    no fallback — see §2 of the header.
  --
  --    `paid_amount` is READ here, not re-derived from `payments`. That is
  --    deliberate and it matters: this function is invoker-rights and runs as
  --    whoever wrote the line. Under Law 6 the floor roles are held off the
  --    money tables, so calling invoice_paid_net() here would make appending a
  --    damage line at return (R-03) fail with `permission denied for table
  --    payments` for exactly the staff who append it. The stored column is
  --    authoritative because 0087 rewrites it on every payment and every
  --    reversal; this path consumes it rather than competing with it.
  select discount_percent, vat_rate, coalesce(paid_amount, 0)
    into strict v_discount_pct, v_vat_rate, v_paid
    from invoices
   where id = v_target_invoice_id;

  -- 3. money.ts `price()`, step for step. Two rounds, not four: `taxable` and
  --    `total` are exact sums of already-rounded terms in the engine and are
  --    exact sums here. See the header for why this departs from §2.2's sketch.
  v_discount := invoice_discount_amount(v_subtotal, v_discount_pct);
  v_taxable  := v_subtotal - v_discount;
  v_vat      := invoice_vat_amount(v_taxable, v_vat_rate);
  v_total    := v_taxable + v_vat;

  -- 4. MONEY-04. Split the subtraction into its two floored halves, through the
  --    same two functions the payment path uses, so an overpayment neither
  --    vanishes nor trips invoices_amounts_non_negative. Before this, live ran
  --    `v_outstanding := v_total - v_paid` unfloored and an overpaid invoice
  --    raised 23514 HERE, refusing the line — including the damage line at
  --    return, which is the charge R-03 exists to add.
  --
  -- 5. One UPDATE, so the row is never briefly inconsistent and the audit trail
  --    carries one event per line change rather than two.
  --    `paid_amount` is not written: it is the payment path's column (0087).
  --    `status` is not written either — R-14 (a Draft is sticky) and R-04 (an
  --    issued invoice's figures are immutable) both live elsewhere, and a line
  --    edit is not an issue action.
  update invoices
     set subtotal           = v_subtotal,
         discount_amount    = v_discount,
         taxable_amount     = v_taxable,
         vat_amount         = v_vat,
         total_amount       = v_total,
         outstanding_amount = invoice_outstanding(v_total, v_paid),
         credit_amount      = invoice_credit(v_total, v_paid),
         updated_at         = now()
   where id = v_target_invoice_id;

  return null;
end;
$fn$;

-- ── MONEY-03: the header trigger that never existed ─────────────────────────
--
-- `pg_trigger` on `invoices`, live: trg_audit_invoices and
-- trg_invoices_immutable_once_issued. Nothing recomputes. So `update invoices
-- set discount_percent = 10` moved the input and left every derived column
-- stale — the discount was simply not applied to the bill.
--
-- BEFORE UPDATE, editing NEW in place: no second UPDATE statement, therefore no
-- recursion into this trigger and no second audit row.
--
-- Firing order among BEFORE UPDATE row triggers is by trigger NAME, so
-- `trg_invoices_immutable_once_issued` (i) runs before
-- `trg_invoices_recompute_on_header_change` (r). That is the safe order and is
-- named here so a future rename does not quietly change it — though this
-- function refuses issued invoices itself, so neither order can let an edit
-- through.

create or replace function public.recompute_invoice_totals_on_header_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  /*
   * R-04: corrections after issue are Void + Credit Note, never a direct edit.
   *
   * `reject_invoice_edit_after_issue` already refuses a discount_percent change
   * on an issued invoice — but NOT a vat_rate change: vat_rate is absent from
   * its seven-column list (read live, 7 Sep 2026). Before this trigger, moving
   * vat_rate on an issued invoice was permitted and inert; after it, that hole
   * is closed rather than made live.
   */
  if OLD.status <> 'Draft'::invoice_status then
    /* The one lawful exception: the statement that VOIDS the invoice. The
       figures must travel through it unchanged, which
       reject_invoice_edit_after_issue enforces on the same UPDATE — so this
       recompute must stand aside rather than restate them. */
    if NEW.voided_at is not null and OLD.voided_at is null then
      return NEW;
    end if;

    raise exception
      'Law 4/R-04: invoice % is issued (status %) — discount_percent and vat_rate are figures and cannot be edited. Corrections take Void + Credit Note, never a direct edit.',
      OLD.invoice_no, OLD.status;
  end if;

  -- A Draft is still being assembled (R-02: it stays Draft for the whole
  -- rental), so a header input may move — and when it does, the bill must
  -- follow. Same two functions the line trigger uses; there is no second copy
  -- of the arithmetic to drift.
  NEW.discount_amount := invoice_discount_amount(NEW.subtotal, NEW.discount_percent);
  NEW.taxable_amount  := NEW.subtotal - NEW.discount_amount;
  NEW.vat_amount      := invoice_vat_amount(NEW.taxable_amount, NEW.vat_rate);
  NEW.total_amount    := NEW.taxable_amount + NEW.vat_amount;

  /* NEW.paid_amount, not a fresh sum of `payments` — same Law 6 reasoning as
     the line trigger: this runs as whoever edited the header, and re-deriving
     would demand SELECT on the money tables from a role that may not have it.
     The stored column is the payment path's output and is consumed here. */
  NEW.outstanding_amount := invoice_outstanding(NEW.total_amount, NEW.paid_amount);
  NEW.credit_amount      := invoice_credit(NEW.total_amount, NEW.paid_amount);

  return NEW;
end;
$fn$;

drop trigger if exists trg_invoices_recompute_on_header_change on public.invoices;
create trigger trg_invoices_recompute_on_header_change
  before update on public.invoices
  for each row
  when (NEW.discount_percent is distinct from OLD.discount_percent
     or NEW.vat_rate is distinct from OLD.vat_rate)
  execute function public.recompute_invoice_totals_on_header_change();

-- ---------------------------------------------------------------------------
-- Post-conditions.
--
-- These EXECUTE the shipped functions on the Foundation §2.8 reference case
-- rather than grepping prosrc for hopeful substrings. PLAN §4.42 has asked for
-- a database-side test of the reference case since 11 August and no such test
-- has ever existed — `git grep 139506` finds it only in `src/lib/__tests__`.
-- This is it. A green apply is a real proof that the trigger and
-- `src/lib/money.ts` agree; a red apply names the step that broke.
--
-- No rows are written: the arithmetic lives in pure functions precisely so it
-- can be proved without a client, a booking and a branch.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_subtotal   numeric := 132750;
  v_pct        numeric := 7;
  v_rate       numeric := 0.1300;
  v_discount   numeric;
  v_taxable    numeric;
  v_vat        numeric;
  v_total      numeric;
  v_src        text;
  v_n          bigint;
begin
  -- (1) Foundation §2.8, through the shipped functions.
  --     money.ts:352 EXPECTED = { discount 9293, taxable 123457, vat 16049,
  --     rentalTotal 139506, outstanding 124506 }.
  v_discount := invoice_discount_amount(v_subtotal, v_pct);
  v_taxable  := v_subtotal - v_discount;
  v_vat      := invoice_vat_amount(v_taxable, v_rate);
  v_total    := v_taxable + v_vat;

  if v_discount <> 9293 then
    raise exception 'POST-CONDITION 1 FAILED: reference discount is %, money.ts says 9293', v_discount;
  end if;
  if v_taxable <> 123457 then
    raise exception 'POST-CONDITION 1 FAILED: reference taxable is %, money.ts says 123457', v_taxable;
  end if;
  if v_vat <> 16049 then
    raise exception 'POST-CONDITION 1 FAILED: reference VAT is %, money.ts says 16049', v_vat;
  end if;
  if v_total <> 139506 then
    raise exception 'POST-CONDITION 1 FAILED: reference total is %, money.ts says 139506', v_total;
  end if;
  if invoice_outstanding(v_total, 15000) <> 124506 then
    raise exception 'POST-CONDITION 1 FAILED: reference outstanding is %, money.ts says 124506',
      invoice_outstanding(v_total, 15000);
  end if;

  -- (2) Half-up at each step, on both boundaries and on both signs. This is the
  --     property that makes the transcription of money.ts `roundHalfUp` exact;
  --     Postgres round() is half away from zero and so is money.ts:126-128.
  if invoice_discount_amount(1000, 0.05) <> 1 then
    raise exception 'POST-CONDITION 2 FAILED: 0.50 must round half-UP to 1, got %',
      invoice_discount_amount(1000, 0.05);
  end if;
  if invoice_vat_amount(1000, 0.0005) <> 1 then
    raise exception 'POST-CONDITION 2 FAILED: a 0.50 VAT must round half-UP to 1, got %',
      invoice_vat_amount(1000, 0.0005);
  end if;
  if invoice_vat_amount(-1000, 0.0005) <> -1 then
    raise exception 'POST-CONDITION 2 FAILED: -0.50 must round AWAY FROM ZERO to -1 (money.ts roundHalfUp), got %',
      invoice_vat_amount(-1000, 0.0005);
  end if;

  -- (3) A paisa-carrying subtotal survives intact. This is the case that
  --     separates money.ts from §2.2's literal sketch; if someone later
  --     "restores" the two dropped rounds, this fails and says why.
  if invoice_vat_amount(1000.49, 0.1300) <> 130 then
    raise exception 'POST-CONDITION 3 FAILED: VAT on a paisa taxable is %, money.ts says 130',
      invoice_vat_amount(1000.49, 0.1300);
  end if;
  if (1000.49 + invoice_vat_amount(1000.49, 0.1300)) <> 1130.49 then
    raise exception
      'POST-CONDITION 3 FAILED: the paisa is being rounded off `taxable`/`total`. money.ts rounds only the discount and the VAT — total must be 1130.49, got %',
      (1000.49 + invoice_vat_amount(1000.49, 0.1300));
  end if;

  -- (4) MONEY-04: one rule, both directions, no negative.
  if invoice_outstanding(1000, 1200) <> 0 then
    raise exception 'POST-CONDITION 4 FAILED: outstanding must floor at 0, got %',
      invoice_outstanding(1000, 1200);
  end if;
  if invoice_credit(1000, 1200) <> 200 then
    raise exception 'POST-CONDITION 4 FAILED: the overpayment must surface as a credit of 200, got %',
      invoice_credit(1000, 1200);
  end if;
  if invoice_credit(1000, 600) <> 0 then
    raise exception 'POST-CONDITION 4 FAILED: an underpaid invoice has no credit, got %',
      invoice_credit(1000, 600);
  end if;
  if invoice_outstanding(1000, 600) <> 400 then
    raise exception 'POST-CONDITION 4 FAILED: outstanding on an underpaid invoice is 400, got %',
      invoice_outstanding(1000, 600);
  end if;

  -- (5) The hardcoded rate is gone from the whole chain, and the column is
  --     read. 0079 asserts this of recalculate_invoice_totals; assert it of the
  --     function that now actually holds the multiplication too, or the grep
  --     passes while the literal lives on one level down.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_vat_amount';
  if position('0.13' in v_src) > 0 then
    raise exception 'POST-CONDITION 5 FAILED: a hardcoded rate literal survives in invoice_vat_amount()';
  end if;

  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recalculate_invoice_totals';
  if position('0.13' in v_src) > 0 then
    raise exception 'POST-CONDITION 5 FAILED: a hardcoded rate literal survives in recalculate_invoice_totals()';
  end if;
  if position('vat_rate' in v_src) = 0 then
    raise exception 'POST-CONDITION 5 FAILED: recalculate_invoice_totals() does not read vat_rate';
  end if;
  -- The arithmetic must be delegated, not re-inlined: if a later edit pastes the
  -- rounding back in, the two trigger paths can drift again and MONEY-03 returns.
  if position('invoice_discount_amount' in v_src) = 0
     or position('invoice_vat_amount' in v_src) = 0
     or position('invoice_outstanding' in v_src) = 0 then
    raise exception 'POST-CONDITION 5 FAILED: recalculate_invoice_totals() carries its own arithmetic instead of delegating';
  end if;

  -- (6) The line trigger binding survived `create or replace`. Without this the
  --     function is corrected and then simply never fires again.
  if not exists (
    select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_proc p on p.oid = tg.tgfoid
     where p.proname = 'recalculate_invoice_totals'
       and c.relname = 'invoice_lines'
       and not tg.tgisinternal
  ) then
    raise exception 'POST-CONDITION 6 FAILED: the recalc trigger is no longer bound to invoice_lines';
  end if;

  -- (7) The header trigger exists, on invoices, BEFORE UPDATE.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.invoices'::regclass
       and tgname = 'trg_invoices_recompute_on_header_change'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 7 FAILED: trg_invoices_recompute_on_header_change was not created';
  end if;

  -- (8) MONEY-04's column and its constraints landed.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'credit_amount'
  ) then
    raise exception 'POST-CONDITION 8 FAILED: invoices.credit_amount was not added';
  end if;
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.invoices'::regclass
     and conname in ('invoices_credit_amount_non_negative', 'invoices_credit_xor_outstanding');
  if v_n <> 2 then
    raise exception 'POST-CONDITION 8 FAILED: expected both credit CHECKs, found %', v_n;
  end if;

  -- (9) Invoker rights and pinned search_path preserved on every function this
  --     file ships. A silent promotion to SECURITY DEFINER would hand a
  --     money-writing function to any role that can insert a line (Law 6).
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('recalculate_invoice_totals','recompute_invoice_totals_on_header_change',
                         'invoice_discount_amount','invoice_vat_amount','invoice_outstanding',
                         'invoice_credit','invoice_paid_net')
       and p.prosecdef
  ) then
    raise exception 'POST-CONDITION 9 FAILED: one of the money functions became SECURITY DEFINER';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('recalculate_invoice_totals','recompute_invoice_totals_on_header_change',
                       'invoice_discount_amount','invoice_vat_amount','invoice_outstanding',
                       'invoice_credit','invoice_paid_net')
     and p.proconfig @> array['search_path=public, pg_temp'];
  if v_n <> 7 then
    raise exception 'POST-CONDITION 9 FAILED: expected 7 money functions with a pinned search_path, found %', v_n;
  end if;

  raise notice '0098 post-conditions passed: the invoice trigger computes Foundation 2.8 exactly as src/lib/money.ts does, a header edit recomputes, and an overpayment becomes a credit instead of a constraint violation.';
end;
$chk$;

commit;

-- =============================================================================
-- ## Ordering, and what still has to happen
--
-- Filename order applies 0079 → 0080 → 0085…0087 → 0096 → this file, which is
-- correct — and is a strictly better order than the `0081` this file used to
-- carry, because now the last word on the money arithmetic is this file's:
--   · 0079 (rate only, 2 dp) is superseded by this file's body.
--   · 0080 implements R-14 on `sync_payment_to_invoice`; it runs BEFORE
--     `credit_amount` exists and does not write it — which is why it must not be
--     the last word.
--   · 0087 rewrites the payment path and calls this file's `invoice_paid_net` /
--     `invoice_outstanding` / `invoice_credit` and writes `credit_amount`.
--     Those calls live inside plpgsql bodies, which resolve at CALL time, not at
--     CREATE time — so 0087 creating them before this file defines them is not a
--     build failure, and `check:pglite` proves the whole chain still applies in
--     the new order. It IS a runtime failure if 0087 reaches production without
--     this file, exactly as before: applying 0087 WITHOUT this file leaves the
--     payment path still summing refunds as receipts and never writing a credit
--     — MONEY-02 open and the two paths disagreeing again. **Apply them
--     together.** The renumber makes that easier, not harder: this file is now
--     downstream of everything it interacts with.
--   · No migration between 0085 and 0097 defines any function this file defines
--     (checked object by object at renumber time), so running last clobbers
--     nothing.
--
-- ## Not done here, deliberately
--
--   · `client_directory_v` still sums `invoices.outstanding_amount` with no
--     `status <> 'Void'` filter and sums every payment type, so a voided
--     invoice keeps inflating a client's balance (MONEY-04 (3)). That is a
--     view rebuild and belongs with the SEC-01 view work, which another session
--     holds.
--   · The application-side half of MONEY-04 — invoiceIntel, pulse, NewRental
--     reading the column instead of subtracting locally, and recordPayment's
--     overpayment flag — is untouched: those files are in flight elsewhere.
--   · No refund path (MONEY-09, Phase 2). A credit is recorded; nothing pays it
--     out.
-- =============================================================================

-- >>> END 0098_invoice_totals_match_engine.sql <<<

-- >>> START 0099_create_booking_discount_audit_class.sql <<<
-- =============================================================================
-- 0099 — `create_booking` could not write a discounted booking at all.
--
-- TWO independent defects on the same eight lines, each of which alone refuses
-- every discounted booking. The first was found by reading; the second by
-- running `check:lifecycle` L1 (R-27) against a real Postgres as a real
-- Coordinator, ten minutes after the first was fixed — which is the whole
-- argument for that script in one paragraph.
--
-- ## Defect 1 — an audit class that is not in the enum
--
-- ## The defect, reproduced before it was fixed
--
-- PGlite, full chain from scratch, 8 Sep 2026. The same payload twice — once
-- bare, once carrying one 10% `Manual` discount:
--
--     select create_booking('{… lines:[1 line] …}');
--     -> {"booking_no": "900", "stage": "Quote", "line_count": 1}
--
--     select create_booking('{… lines:[1 line], discounts:[{percent:10}] …}');
--     -> ERROR:  invalid input value for enum audit_event_class: "data change"
--
-- Every discounted booking has been refused since `0063` introduced the
-- discount loop, through `0065`, `0070` and `0071`, each of which carried the
-- literal forward verbatim. The booking, its lines and its units all roll back
-- with it: the caller gets no booking at all, not a booking missing a discount.
--
-- ## Why nothing caught it
--
-- `audit_event_class` (`0001_enums.sql`) has exactly six members —
--
--     status change | money movement | discount | override | session | cancellation
--
-- — "the six event classes the log must capture" (Foundation §10). `'data
-- change'` is not one of them and never was. Postgres cannot reject an unknown
-- enum label at `create function` time: the literal sits inside a plpgsql body
-- and is only cast when the line executes. So the chain builds green, the file
-- reads plausibly, and the failure waits for the first discounted booking.
--
-- 2,834 unit tests were green over this. They exercise `createRental` against
-- the mock client in `src/lib/mock/client.ts`, which has its own audit path and
-- never casts to the enum — the seam that `RULINGS-2026-09-08` R-27 exists to
-- close. `check:lifecycle` L1 is this exact call.
--
-- ## The fix
--
-- One literal: `'data change'` -> `'discount'`. Not a new enum member. A row
-- recording that a discount was applied to a booking is a discount event; the
-- class was named for this and RLS masks on it (`0077`: Warehouse does not see
-- money-movement rows). Adding a seventh member to satisfy a typo would widen a
-- Foundation-locked contract that every masking policy reads.
--
-- Everything else in this function is `0071` **verbatim** — extracted
-- mechanically from that file and re-emitted with the single literal replaced,
-- so the diff between the two files is one line and nothing was retyped.
--
-- ## Defect 2 — `INSERT ... RETURNING` applies the SELECT policy
--
-- With the enum fixed, the same call still failed — for Coordinator and
-- Warehouse, and not for Owner:
--
--     set role authenticated;
--     set app.current_user_id = <a Coordinator>;
--     insert into audit_events (…) values (…);              -- ok
--     insert into audit_events (…) values (…) returning id;  -- ERROR
--       new row violates row-level security policy for table "audit_events"
--
-- The write is permitted (`audit_events_insert` is `with check (true)` for
-- `authenticated`); the READ BACK is not. Postgres applies a table's SELECT
-- policies to the rows a `RETURNING` clause hands back, and
-- `audit_events_select` admits `Owner · Admin · Manager` only — Foundation §10,
-- deliberately. So `returning id into v_audit_id` turned a legal insert into a
-- refusal for precisely the two roles that take bookings: the Coordinator at the
-- booking desk and Warehouse.
--
-- Fixed by minting the key in the function and inserting it, so nothing is read
-- back. Not by widening `audit_events_select` — that would open the audit log to
-- six more roles to satisfy one function's convenience, and B-1 forbids
-- resolving a conflict by widening.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Live stands at `0001`–`0078` plus `0089`
-- (ledger re-read 8 Sep 2026); this file's predecessors `0063`/`0065`/`0070`/
-- `0071` ARE live, so live carries the defect today and a discounted booking
-- fails on production right now. Fixing that is a one-function replace with no
-- table touched and no data migration, but per CLAUDE.md it still waits for
-- explicit approval.
-- =============================================================================
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.

begin;

create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid   uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id    uuid;
  v_existing_no    text;
  v_existing_stage text;
  v_booking_id    uuid;
  v_booking_no    text;
  v_actor         uuid := (p_payload ->> 'created_by')::uuid;
  v_branch        uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines         jsonb;
  v_line          jsonb;
  v_discount      jsonb;
  v_audit_id      uuid;
  v_line_count    integer := 0;
  v_unit_count    integer := 0;
  v_pending       jsonb;
  v_next          jsonb;
  v_parent_key    uuid;
  v_parent_id     uuid;
  v_wrote         integer;
  v_line_id       uuid;
  v_unit          jsonb;
  v_asset_product uuid;
  v_dupe_assets   integer;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  -- Named columns only, carried forward from 0065: under 0062 a select-star
  -- here would 42501 on the ungranted `deposit_required` for every role.
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ───────────────────────────────────────────
  -- `days` is passed through, never defaulted here (Law 9), and every line is
  -- validated BEFORE the first insert so a bad line later in the array cannot
  -- leave a half-built tree behind. The transaction would roll it back anyway;
  -- validating first is what makes the error name the line rather than a
  -- constraint.
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    -- D5 pre-validation: the units array, when present, must be coherent with
    -- the line it rides on. Checked before the first insert for the same
    -- reason as `days`.
    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  -- One physical unit cannot be assigned twice on one booking, and no schema
  -- constraint says so (`booking_line_units` has no unique on asset_id).
  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        -- Resolve against the rows written for THIS booking only. Scoping to
        -- the booking is what stops a payload pointing a child at some other
        -- booking's line, which the self-FK alone would happily accept.
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          -- Parent not written yet. Defer; a later pass picks it up.
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        coalesce((v_line ->> 'rate')::numeric, 0),
        coalesce((v_line ->> 'discount_amount')::numeric, 0),
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        (v_line ->> 'supplier_cost')::numeric,
        (v_line ->> 'markup_amount')::numeric,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor
      )
      returning id into v_line_id;

      -- ── D5: the creation-time unit assignment ──────────────────────────
      -- One row per unit entry, qty 1 each — the serial chips of spec §10.2.
      -- Removing one later is a DELETE of that row, not an edit of the line.
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        -- A serial from another product on this line is a mis-scan; the FK
        -- alone would accept it, so it is refused by name here.
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  -- Each needs an `audit_events` row FIRST, because `audit_event_id` is NOT
  -- NULL. This ordering is the reason the whole operation must be one
  -- transaction and cannot be four PostgREST calls.
  --
  -- `audit_client_uuid` is the audit ROW's own Law 8 key and is distinct from
  -- the discount's. 0063 read it and nothing sent it, so `audit_events.
  -- client_uuid` (NOT NULL) rejected every discounted booking. A generated
  -- fallback keeps the write possible for a caller that has not been updated;
  -- `createRental` now sends one so the key is the caller's, as Law 8 wants.
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      -- 0099: this was 'data change', which `audit_event_class` has never
      -- had. Every discounted booking raised 22P02 right here and rolled the
      -- whole create — header, lines, units — back with it. A row recording
      -- that a discount was applied is a discount event; 'discount' is one of
      -- the six Foundation §10 classes and is what the 0077 masking policies
      -- read.
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
      -- 0099, second defect: the id is MINTED HERE and inserted, where this
      -- said `returning id into v_audit_id`.
      --
      -- `INSERT ... RETURNING` applies the table's SELECT policy to the row it
      -- gives back, and `audit_events_select` admits Owner, Admin and Manager
      -- only. So the RETURNING refused the write for exactly the two roles whose
      -- job this is:
      --
      --     as Coordinator: ERROR  new row violates row-level security policy
      --                            for table "audit_events"
      --     as Owner:       ok
      --
      -- The same INSERT without RETURNING succeeded as Coordinator, which is what
      -- isolates the cause to the read-back and not to the write. Widening
      -- `audit_events_select` would have been the wrong fix twice over: it makes
      -- the audit log readable by roles Foundation §10 keeps it from, and B-1
      -- says a conflict is never resolved by widening. Minting the key removes
      -- the read instead of granting it.
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_no', v_booking_no,
    'stage',      'Quote',
    'line_count', v_line_count,
    'unit_count', v_unit_count,
    'replayed',   false
  );
end;
$$;
comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + '
  'discounts) in a single transaction. SECURITY INVOKER — every insert faces '
  'its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid). Per D5 '
  '(ruled 30 Aug 2026) a line may carry units[] — serials assigned at '
  'creation, one booking_line_units row each; absent means unit-less, and '
  'Pack confirms or fills. Reservation with the GiST defence still happens at '
  'Confirm, not here. Prices nothing — src/lib/money.ts owns pricing (Law 1). '
  '0099: the discount audit row is class ''discount''; it was ''data change'', '
  'which is not a member of audit_event_class, so every discounted booking was '
  'refused outright.';

-- ── Post-conditions ─────────────────────────────────────────────────────────
-- Proves the literal is gone from the DEPLOYED body, not from the file.
-- `pg_get_functiondef` reads what the server actually holds, which is the only
-- thing a later reader can trust — this repo has shipped migrations whose
-- headers described a body the server did not have.
do $chk$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking';

  if v_def is null then
    raise exception 'POST-CONDITION 1 FAILED: public.create_booking(jsonb) does not exist after this migration.';
  end if;

  -- The literal survives in the explanatory comment beside the fix, so the test
  -- is for the LITERAL IN A VALUE POSITION, not for the words anywhere.
  if position('      ''data change'',' in v_def) > 0 then
    raise exception 'POST-CONDITION 2 FAILED: the deployed create_booking body still writes the audit class ''data change''.';
  end if;
  if position('      ''discount'',' in v_def) = 0 then
    raise exception 'POST-CONDITION 3 FAILED: the deployed create_booking body does not write ''discount'' as the audit class.';
  end if;

  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'audit_event_class' and e.enumlabel = 'discount'
  ) then
    raise exception 'POST-CONDITION 4 FAILED: audit_event_class has no ''discount'' member — this fix assumed one of the six Foundation classes and it is gone.';
  end if;

  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'audit_event_class') <> 6 then
    raise exception 'POST-CONDITION 5 FAILED: audit_event_class no longer holds exactly six members. Foundation §10 locks the six; a seventh means the 0077 masking policies need re-reading.';
  end if;

  -- POST-CONDITION 6 — behavioural, and as the role that could not do it.
  -- Structural checks would have passed over defect 2 entirely: the body reads
  -- correctly, the enum is right, and the failure only exists under a policy.
  -- So this runs the real call, as a real Coordinator, and undoes itself by
  -- aborting the subtransaction it ran in (bookings refuse DELETE — Law 3).
  declare
    v_coordinator uuid;
    v_branch      uuid;
    v_client      uuid;
    v_product     uuid;
    v_result      jsonb;
    v_ran         boolean := false;
  begin
    select id into v_coordinator from users where primary_role = 'Coordinator' and is_active limit 1;
    select id into v_branch      from branches limit 1;
    select id into v_client      from clients limit 1;
    select id into v_product     from products limit 1;

    if v_coordinator is null or v_branch is null or v_client is null or v_product is null then
      raise notice '0099: no Coordinator / branch / client / product here; the behavioural check was skipped.';
    else
      begin
        perform set_config('app.current_user_id', v_coordinator::text, true);
        set local role authenticated;

        v_result := create_booking(jsonb_build_object(
          'client_uuid',   gen_random_uuid(),
          'created_by',    v_coordinator,
          'branch_id',     v_branch,
          'client_id',     v_client,
          'pickup_at',     '2099-12-01T04:00:00Z',
          'return_at',     '2099-12-03T04:00:00Z',
          'delivery_type', 'Babin Delivery',
          'lines', jsonb_build_array(jsonb_build_object(
            'client_uuid', gen_random_uuid(),
            'line_type',   'Equipment',
            'product_id',  v_product,
            'description', '0099 post-condition line',
            'qty', 1, 'days', 2, 'rate', 3500
          )),
          'discounts', jsonb_build_array(jsonb_build_object(
            'client_uuid',       gen_random_uuid(),
            'audit_client_uuid', gen_random_uuid(),
            'client_id',         v_client,
            'discount_source',   'Manual',
            'percent',           10,
            'reason',            'Repeat client, agreed on the phone'
          ))
        ));

        reset role;

        if v_result ->> 'booking_id' is null then
          raise exception 'POST-CONDITION 6 FAILED: create_booking returned no booking_id for a discounted booking.';
        end if;
        if not exists (
          select 1 from booking_discounts where booking_id = (v_result ->> 'booking_id')::uuid
        ) then
          raise exception 'POST-CONDITION 6 FAILED: the discounted booking was created with no booking_discounts row.';
        end if;

        v_ran := true;
        raise exception using errcode = 'P0001', message = '__0099_rollback_probe__';
      exception when others then
        reset role;
        if sqlerrm <> '__0099_rollback_probe__' then
          raise exception
            'POST-CONDITION 6 FAILED: a Coordinator could not create a discounted booking — %', sqlerrm;
        end if;
      end;

      if not v_ran then
        raise exception 'POST-CONDITION 6 FAILED: the behavioural probe did not complete.';
      end if;
    end if;
  end;

  raise notice '0099 post-conditions passed: create_booking writes its discount audit row as class ''discount'' without reading it back, audit_event_class still holds exactly the six Foundation classes, and a COORDINATOR can create a discounted booking.';
end;
$chk$;

commit;

-- >>> END 0099_create_booking_discount_audit_class.sql <<<

-- >>> START 0100_reservations_written_by_transition.sql <<<
-- =============================================================================
-- 0100 — RULING 2026-09-08 (R-26): the DATABASE writes reservations, not the app.
--
-- ## What was wrong
--
-- `inventory_reservations` carries the only structural defence against a double
-- booking in this schema:
--
--     constraint inventory_reservations_no_double_booking
--       exclude using gist (asset_id with =, period with &&)
--       where (released_at is null and asset_id is not null)     -- 0003:1470
--
-- and, for the quantity-tracked half that the exclusion's WHERE clause skips,
-- `enforce_inventory_reservation_capacity()` (0045). Both are real. Both guard a
-- table that, until this file, **only the browser ever filled** — one call site,
-- `confirmRental.ts -> reserveAssignedUnits` (`src/lib/queries/availability.ts`).
--
-- A defence nothing is obliged to arm is not a defence. Reproduced in PGlite
-- over the full chain, 8 Sep 2026:
--
--     #900  unit X, 10-12 Sep  -> Booked       inventory_reservations: 0 rows
--     #901  unit X, 11-13 Sep  -> Booked       inventory_reservations: 0 rows
--
-- Two bookings, one camera, overlapping dates, both accepted, and the GiST
-- constraint never consulted because no row was ever offered to it. Any of the
-- five roles admitted by `booking_stage_transitions_insert` — Owner, Admin,
-- Manager, Coordinator, Warehouse — reaches that with one PostgREST call and no
-- browser at all. P0.
--
-- 0003 asked for this in 2026 and said so in the file, four times over:
--
--     -- TRIGGER REQUIRED: no row may exist for a booking at stage Quote or Draft.
--     -- TRIGGER REQUIRED: cancelling a booking sets released_at and released_reason
--     --   on every live hold in the same transaction.
--     -- TRIGGER REQUIRED: insert and release happen only through the Confirm and
--     --   Cancel transactions, never by direct write.
--
-- 0045's own header recorded the same boundary from the other side: "until that
-- engine exists this ceiling — like the EXCLUDE beside it — guards a table
-- nothing is yet obliged to populate." This file is that engine.
--
-- ## The rule, verbatim from R-26
--
-- A booking holds inventory from the moment it becomes **Booked**, and Postgres
-- writes that hold. Quotes hold nothing — a Quote may overlap another Quote.
--
-- ## Where the hold is written from
--
-- `after insert on booking_stage_transitions`, not from an UPDATE on `bookings`.
-- That table is already the sole writer of `bookings.stage` (0021, made real by
-- 0094), it is append-only, and it carries the actor. Hanging the reservation
-- off it means the hold and the stage move are the same transaction by
-- construction: if the reservation is refused, the exception propagates out of
-- this trigger, the transition INSERT rolls back, `apply_booking_stage_transition`'s
-- UPDATE rolls back with it, and **the booking is still a Quote**. There is no
-- order of writes to get wrong and no compensation to half-run, which is what
-- `confirmRental.ts` had to do because PostgREST cannot give a browser a
-- transaction.
--
-- Trigger name: `trg_reservations_follow_stage_transition`. Same event as
-- `trg_apply_booking_stage_transition`, and Postgres fires same-event triggers in
-- **name order**, so `trg_a…` runs first and the stage is already applied when
-- this one runs. The name is load-bearing; renaming it to something sorting
-- before `trg_apply_…` would silently reverse the two.
--
-- ## SECURITY INVOKER, and why that is safe here rather than merely required
--
-- R-26 says invoker, and the policies agree exactly:
--
--     booking_stage_transitions_insert  WITH CHECK auth_user_role() = ANY
--         (Owner, Admin, Manager, Coordinator, Warehouse)
--     inventory_reservations_all        USING/CHECK auth_user_role() = ANY
--         (Owner, Admin, Manager, Coordinator, Warehouse)
--
-- The same five, read off `pg_policy` on 8 Sep 2026. So everyone who can make a
-- booking Booked can write its holds, and nobody else gains a write path they
-- did not have. A SECURITY DEFINER trigger here would have handed the other four
-- roles an indirect INSERT into a table their policy refuses them — a widening
-- nobody asked for. `search_path` is pinned per 0050.
--
-- The invoker choice has one cost, and it is guarded rather than assumed: the
-- SELECTs below also run under the caller's RLS, so a caller who could see the
-- booking but not all of its lines would hold less than the booking commits.
-- The coverage assertion at the end of the function is what turns that from a
-- silent under-reservation into a refusal.
--
-- ## Which rows are written
--
-- Per non-voided `booking_lines` row of the booking:
--
--   * one SERIALISED hold (`asset_id`, `qty = 1`) per live `booking_line_units`
--     row — the serials assigned at creation (D5 / 0071), minus any released
--     since (`booking_line_units.released_at`, 0076);
--   * one QUANTITY hold (`product_id`, `qty = line.qty - live units on the line`)
--     when that remainder is positive.
--
-- R-26 words the second case as "for every serialised line with no units"; this
-- is that case and its two neighbours, because the remainder covers all three
-- with one rule and no gaps:
--
--     units = 0, quantity-tracked product   -> one hold for the whole qty
--                                              (exactly what `reserveAssignedUnits`
--                                              wrote; 204 of 204 live products
--                                              are Quantity, so this is the live
--                                              path)
--     units = 0, serialised product         -> one hold for the whole qty
--     0 < units < qty                       -> serial holds + a hold for the rest
--     units = qty                           -> serial holds only, no remainder
--
-- 0045 counts both shapes against one ceiling ("a model-level hold of 3 plus a
-- serial hold on a fourth unit is 4 units claimed"), so the partly-assigned line
-- is charged correctly rather than twice or not at all.
--
-- Lines naming no product — Bundle, Service, Sub-rental, Manual item — hold
-- nothing. They commit no stock, so there is nothing to hold and nothing to
-- release.
--
-- ## Release
--
-- Law 3: released, never deleted. `released_at` + `released_reason` (the table's
-- own CHECK requires the reason with the timestamp), on:
--
--   * `to_stage in ('Returned','Closed')` — R-26;
--   * `bookings.cancelled_at` becoming non-null — R-26;
--   * `to_stage = 'Quote'` — **not in R-26's list, and added here deliberately.**
--     R-26's first sentence is "a booking holds inventory from the moment it
--     becomes Booked", and its second is "Quotes hold nothing". A reversal from
--     Booked back to Quote (0021 allows it, with an approver and a reason) must
--     therefore give the stock back; leaving the holds live would both contradict
--     that sentence and **deadlock the booking**, because re-confirming it would
--     collide with its own reservation on the GiST constraint and could never
--     succeed again. Symmetry, not new policy — but it is an addition to the
--     ruling's text and is flagged as one rather than folded in silently.
--
-- ## The backfill
--
-- 76 bookings sit at Booked · Packed · On Rent in the reference corpus holding
-- nothing. Every one of them is a commitment the database cannot see, so the
-- constraint would start defending only future bookings and would happily let a
-- new booking take a camera that is already out on rent.
--
-- Retro-fitting a constraint onto history that predates it can fail, and a
-- backfill that aborts the migration on the first overlap would make the fix
-- unappliable. So each booking is backfilled inside its own subtransaction: an
-- overlap or a capacity breach skips **that booking** and is counted and named,
-- and the migration still lands. A `raise notice` prints written / skipped and
-- the skipped booking numbers, so an existing overbooking becomes a work item
-- rather than a silent hole. Re-running writes nothing new — coverage is tested
-- per line before anything is inserted.
--
-- Measured on this repo's own corpus, 8 Sep 2026: **208 holds written across 57
-- bookings, and 19 bookings skipped** — every one of them refused by 0045 with a
-- sentence of the form
--
--     Reservation rejected: product … would have 6 units held at once between
--     2026-08-02 and 2026-08-06, but stock on hand is 4.
--
-- Those 19 are not a defect in this file. They are 19 double bookings sitting in
-- the reference corpus, invisible until something finally asked the question,
-- and they are the clearest evidence available that the constraint has been
-- guarding an empty table. The skip is also order-dependent — one of the 19
-- succeeds on a second pass, once the bookings ahead of it have been skipped —
-- so the notice is a starting list for a human, not a ranked verdict on which
-- booking is at fault.
--
-- One asymmetry to know before reading a green run as more than it is: the 0047
-- corpus is 56 products and **all of them Serialised**, while production is 204
-- products and **all of them Quantity with zero `product_units`**. A scratch
-- build here therefore exercises the GiST exclusion and never the capacity
-- ceiling, and production is the exact opposite. Post-condition 7a covers the
-- first; 7b — which skips here and runs on live — covers the second; and
-- `check:lifecycle` L5 seeds its own Quantity product so the ceiling is proved
-- in CI rather than only in production.
--
-- ## What this file does NOT do
--
--   * It does not disable, defer or weaken `inventory_reservations_no_double_booking`.
--     It is `condeferrable = false` today and stays that way; the override path
--     (`rental.override_overbooking`, M+) RELEASES the losing reservation and
--     re-runs the transition, which is a recorded act with a reason. Nothing
--     turns the constraint off.
--   * It does not implement 0003's remaining `TRIGGER REQUIRED` line — "no row
--     may exist for a booking at stage Quote or Draft". After this file the app
--     no longer writes holds early, so the window that line was about is gone,
--     but a direct PostgREST INSERT could still place one. That is a separate
--     guard and a separate migration.
--   * It does not touch `create_booking`. Creating a Quote reserves nothing
--     (R-26, unchanged) — 0099's comment on that function is restated at the
--     bottom of this file only because its last sentence about Confirm was
--     written when the app held the pen.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Live stands at 0001-0078 plus 0089 (ledger
-- re-read 8 Sep 2026), so it has neither this trigger nor 0099. Per CLAUDE.md no
-- migration reaches live without explicit approval; and this one carries a
-- backfill that writes rows to a production table, so it wants the Step-0 dump
-- first, not merely a yes.
-- =============================================================================
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ The writer.
-- ---------------------------------------------------------------------------
create or replace function reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup    timestamptz;
  v_return    timestamptz;
  v_period    tstzrange;
  v_booking_no text;
  v_uncovered text;
begin
  -- ── Release paths ───────────────────────────────────────────────────────
  -- Returned and Closed end the commitment; Quote un-makes it (see the header).
  -- Filtered on `released_at is null` so Returned -> Closed is a no-op rather
  -- than a second release that would overwrite the first reason.
  if NEW.to_stage in ('Returned', 'Closed', 'Quote') then
    update inventory_reservations
       set released_at     = NEW.occurred_at,
           released_reason = case NEW.to_stage
             when 'Returned' then 'Released on Return: the booking reached Returned.'
             when 'Closed'   then 'Released on Close: the booking reached Closed.'
             else 'Released by a reversal back to Quote: a Quote holds nothing.'
           end
     where booking_id = NEW.booking_id
       and released_at is null;
    return NEW;
  end if;

  if NEW.to_stage <> 'Booked' then
    return NEW;
  end if;

  -- ── Booked: place the holds ─────────────────────────────────────────────
  select pickup_at, return_at, booking_no
    into v_pickup, v_return, v_booking_no
    from bookings
   where id = NEW.booking_id;

  if v_pickup is null then
    -- Unreachable through `apply_booking_stage_transition`, which raises on a
    -- missing booking before this trigger runs. Stated rather than assumed: if
    -- RLS ever hides the row from the caller, this must refuse, not reserve a
    -- null window.
    raise exception
      'Reservation rejected: booking % could not be read, so its rental window is unknown.',
      NEW.booking_id;
  end if;

  -- Half-open, matching `RENTAL_WINDOW_BOUNDS = 'half-open'` in
  -- `src/lib/availability.ts` (ruled PLAN.md §4.30(b)). A 12 Sep return and a
  -- 12 Sep pickup on the same unit do not collide. **Never change one of these
  -- two without the other** — the app would then check a different question
  -- from the one the constraint answers.
  v_period := tstzrange(v_pickup, v_return, '[)');

  -- Serialised: one row per live assigned unit.
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1, v_period, NEW.actor_id
    from booking_lines bl
    join booking_line_units blu on blu.booking_line_id = bl.id
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and blu.released_at is null;

  -- Quantity: the remainder of each line that its units do not cover.
  -- `client_uuid` is minted PER ROW — it is UNIQUE on this table, so one key
  -- across several rows collides on the second.
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id, bl.qty - coalesce(u.n, 0),
         v_period, NEW.actor_id
    from booking_lines bl
    left join lateral (
      select count(*) as n
        from booking_line_units blu
       where blu.booking_line_id = bl.id
         and blu.released_at is null
    ) u on true
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and bl.qty - coalesce(u.n, 0) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  -- Every live line that names stock now holds something. This is the check
  -- that turns a SECURITY INVOKER read the caller could not fully see into a
  -- refusal instead of a booking that commits gear it never reserved.
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_line_id = bl.id
          and r.released_at is null
     );

  if v_uncovered is not null then
    raise exception
      'Reservation rejected: booking % reached Booked with no hold behind %. Nothing was booked.',
      coalesce(v_booking_no, NEW.booking_id::text), v_uncovered;
  end if;

  return NEW;
end;
$$;

comment on function reservations_follow_stage_transition() is
  'R-26 (8 Sep 2026): inventory_reservations is written by the database, from the '
  'Booked transition, and released on Returned/Closed and on a reversal to Quote. '
  'SECURITY INVOKER — the five roles that may insert a transition are exactly the '
  'five inventory_reservations_all admits, so this widens nothing. A refused hold '
  'raises inside the transition INSERT, so the confirm is refused whole and the '
  'booking stays a Quote.';

-- Fires AFTER `trg_apply_booking_stage_transition` — same event, and Postgres
-- orders same-event triggers by NAME. See the header; the name is load-bearing.
drop trigger if exists trg_reservations_follow_stage_transition on booking_stage_transitions;
create trigger trg_reservations_follow_stage_transition
  after insert on booking_stage_transitions
  for each row execute function reservations_follow_stage_transition();


-- ---------------------------------------------------------------------------
-- 2 ▸ Cancellation releases the holds, in the same transaction.
--
-- 0003:1495-1496 asked for exactly this. Cancelled is the sixth state and lives
-- on `bookings.cancelled_at` (0015), not in `stage`, so it never passes through
-- `booking_stage_transitions` and the trigger above cannot see it.
--
-- Today only `postgres` and `service_role` can write that column at all (0094
-- refuses a direct PATCH, and `cancelRental.ts` is `implemented: false`), so this
-- is armed ahead of the writer rather than behind it — which is the right order:
-- whoever builds `rental.cancel` inherits a release they cannot forget.
-- ---------------------------------------------------------------------------
create or replace function release_reservations_on_cancellation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update inventory_reservations
     set released_at     = NEW.cancelled_at,
         released_reason = 'Released on cancellation of booking ' || NEW.booking_no || ': '
                           || coalesce(nullif(btrim(NEW.cancellation_reason), ''), 'no reason recorded')
   where booking_id = NEW.id
     and released_at is null;
  return NEW;
end;
$$;

comment on function release_reservations_on_cancellation() is
  'R-26 (8 Sep 2026): cancelling a booking releases every live hold it carries, in '
  'the same transaction. Law 3 — released, never deleted. Implements 0003:1495-1496.';

drop trigger if exists trg_reservations_released_on_cancellation on bookings;
create trigger trg_reservations_released_on_cancellation
  after update of cancelled_at on bookings
  for each row
  when (OLD.cancelled_at is null and NEW.cancelled_at is not null)
  execute function release_reservations_on_cancellation();


-- ---------------------------------------------------------------------------
-- 3 ▸ Backfill — every booking already past Quote.
--
-- Per booking, in its own subtransaction, so one historical overlap skips that
-- booking instead of aborting the migration. Idempotent: a line that already
-- holds something is not given a second hold, so a re-run writes nothing.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  v_booking  record;
  v_period   tstzrange;
  v_written  integer := 0;
  v_bookings integer := 0;
  v_skipped  text[]  := '{}';
  v_rows     integer;
begin
  for v_booking in
    select id, booking_no, pickup_at, return_at, stage, created_by
      from bookings
     where stage in ('Booked', 'Packed', 'On Rent')
       and cancelled_at is null
     order by booking_no
  loop
    v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');

    begin
      insert into inventory_reservations
        (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by)
      select gen_random_uuid(), v_booking.id, bl.id, blu.asset_id, 1, v_period, v_booking.created_by
        from booking_lines bl
        join booking_line_units blu on blu.booking_line_id = bl.id
       where bl.booking_id = v_booking.id
         and bl.voided_at is null
         and blu.released_at is null
         and not exists (
           select 1 from inventory_reservations r
            where r.booking_line_id = bl.id
              and r.asset_id = blu.asset_id
              and r.released_at is null
         )
      on conflict do nothing;   -- the GiST constraint, per R-26
      get diagnostics v_rows = row_count;
      v_written := v_written + v_rows;

      insert into inventory_reservations
        (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
      select gen_random_uuid(), v_booking.id, bl.id, bl.product_id,
             bl.qty - coalesce(u.n, 0), v_period, v_booking.created_by
        from booking_lines bl
        left join lateral (
          select count(*) as n
            from booking_line_units blu
           where blu.booking_line_id = bl.id
             and blu.released_at is null
        ) u on true
       where bl.booking_id = v_booking.id
         and bl.voided_at is null
         and bl.product_id is not null
         and bl.qty - coalesce(u.n, 0) > 0
         and not exists (
           select 1 from inventory_reservations r
            where r.booking_line_id = bl.id
              and r.product_id is not null
              and r.released_at is null
         )
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      v_written := v_written + v_rows;

      v_bookings := v_bookings + 1;
    exception when others then
      -- An overlap or a capacity breach that predates the constraint being
      -- armed. Named, not swallowed: it is a real double booking sitting in the
      -- data and somebody has to unpick it.
      v_skipped := v_skipped || (v_booking.booking_no || ' (' || sqlerrm || ')');
    end;
  end loop;

  raise notice
    '0100 backfill: % hold(s) written across % booking(s) at Booked/Packed/On Rent.',
    v_written, v_bookings;

  if array_length(v_skipped, 1) is not null then
    raise notice
      '0100 backfill: % booking(s) could NOT be backfilled — they overlap something already held, which means the data contains a double booking that predates this constraint: %',
      array_length(v_skipped, 1), array_to_string(v_skipped, ' | ');
  end if;
end;
$backfill$;


-- ---------------------------------------------------------------------------
-- 4 ▸ Post-conditions.
--
-- Structural first, then one behavioural proof that undoes itself. The
-- behavioural half runs inside a plpgsql BEGIN/EXCEPTION block, which is an
-- implicit subtransaction: raising at the end of it rolls back everything it
-- wrote, so the migration proves the trigger works without leaving a test
-- booking in the corpus. The full lifecycle lives in `npm run check:lifecycle`
-- (R-27) — this is the part that must be true the instant the file lands.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_def       text;
  v_booking   uuid;
  v_line      uuid;
  v_asset     uuid;
  v_actor     uuid;
  v_branch    uuid;
  v_client    uuid;
  v_product   uuid;
  v_holds     integer;
  v_refused   boolean := false;
  v_released  integer;
  v_capacity  integer;
  v_message   text;
  -- Which behavioural probes actually ran. plpgsql variables live in memory, so
  -- an assignment made inside the subtransaction below SURVIVES its rollback --
  -- which is the only way to tell "the probe passed" from "the probe was
  -- skipped because this database had nothing to probe with".
  v_ran       text[] := '{}';
begin
  -- (1) The trigger exists, on the right table and event.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'booking_stage_transitions'::regclass
       and tgname  = 'trg_reservations_follow_stage_transition'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 1 FAILED: trg_reservations_follow_stage_transition is not on booking_stage_transitions.';
  end if;

  -- (2) It sorts AFTER the stage applier, or the stage would not yet be applied.
  if 'trg_reservations_follow_stage_transition' <= 'trg_apply_booking_stage_transition' then
    raise exception 'POST-CONDITION 2 FAILED: the reservation trigger no longer sorts after trg_apply_booking_stage_transition, so it would run first.';
  end if;

  -- (3) SECURITY INVOKER with a pinned search_path (R-26; 0050).
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reservations_follow_stage_transition';
  if v_def is null then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() does not exist.';
  end if;
  if position('SECURITY DEFINER' in v_def) > 0 then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() is SECURITY DEFINER. R-26 says invoker — definer would hand four roles an INSERT their own policy refuses.';
  end if;
  if position('search_path' in v_def) = 0 then
    raise exception 'POST-CONDITION 3 FAILED: reservations_follow_stage_transition() has no pinned search_path (0050).';
  end if;

  -- (4) The cancellation release is armed.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'bookings'::regclass
       and tgname  = 'trg_reservations_released_on_cancellation'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 4 FAILED: cancellation does not release reservations.';
  end if;

  -- (5) The constraint is untouched: still there, still NOT deferrable.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'inventory_reservations'::regclass
       and conname  = 'inventory_reservations_no_double_booking'
       and contype  = 'x'
       and not condeferrable
  ) then
    raise exception 'POST-CONDITION 5 FAILED: inventory_reservations_no_double_booking is missing, or has become deferrable. R-26: the constraint is never disabled and never deferrable.';
  end if;

  -- (6) The backfill left no Booked/Packed/On Rent line naming stock unheld.
  if exists (
    select 1
      from bookings b
      join booking_lines bl on bl.booking_id = b.id
     where b.stage in ('Booked', 'Packed', 'On Rent')
       and b.cancelled_at is null
       and bl.voided_at is null
       and bl.product_id is not null
       and not exists (
         select 1 from inventory_reservations r
          where r.booking_line_id = bl.id and r.released_at is null
       )
       -- Bookings the backfill reported as skipped are excluded: they are a
       -- pre-existing double booking, named in the notice above, and this
       -- check must not turn a data problem into an unappliable migration.
       and exists (
         select 1 from inventory_reservations r2 where r2.booking_id = b.id
       )
  ) then
    raise exception 'POST-CONDITION 6 FAILED: a backfilled booking still has a stock-bearing line with no live hold.';
  end if;

  -- (7) Behavioural: a Booked transition writes holds, and a second booking on
  --     the same unit over an overlapping window is REFUSED. Rolled back below.
  begin
    select id into v_actor   from users where primary_role = 'Owner' limit 1;
    select id into v_branch  from branches limit 1;
    select id into v_client  from clients limit 1;
    select pu.id, pu.product_id into v_asset, v_product
      from product_units pu
      join products p on p.id = pu.product_id
     where p.tracking_mode = 'Serialised'
       and not exists (
         select 1 from inventory_reservations r
          where r.asset_id = pu.id and r.released_at is null
       )
     limit 1;

    if v_actor is null or v_branch is null or v_client is null then
      raise exception 'POST-CONDITION 7 FAILED: no Owner, no branch or no client — this database cannot be probed at all, so nothing below was proved.';
    end if;

    -- -- 7a . Serialised: the GiST exclusion --------------------------------
    -- Skipped where there are no serial units to probe with. That is not a
    -- hypothetical: the live project has 204 Quantity products and ZERO
    -- product_units, so on production 7b is the only one of these two that runs
    -- — which is why 7b exists.
    if v_asset is null then
      raise notice '0100: no free serialised unit here; probe 7a (the GiST exclusion) was skipped.';
    else
      insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                            pickup_at, return_at, created_by, updated_by)
      values (gen_random_uuid(), '999999901', v_branch, v_client, 'Babin Delivery',
              '2099-01-10T04:00:00Z', '2099-01-12T04:00:00Z', v_actor, v_actor)
      returning id into v_booking;

      insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
      values (gen_random_uuid(), v_booking, 'Equipment', v_product, '0100 post-condition line', 1, 2, 0, v_actor)
      returning id into v_line;

      insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
      values (gen_random_uuid(), v_line, v_asset, 1, v_actor);

      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());

      select count(*) into v_holds
        from inventory_reservations
       where booking_id = v_booking and released_at is null and asset_id = v_asset;
      if v_holds <> 1 then
        raise exception 'POST-CONDITION 7 FAILED: Booked wrote % serialised hold(s), expected 1.', v_holds;
      end if;

      -- The same unit, an overlapping window, a second booking: refused.
      declare
        v_booking2 uuid;
        v_line2    uuid;
      begin
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999902', v_branch, v_client, 'Babin Delivery',
                '2099-01-11T04:00:00Z', '2099-01-13T04:00:00Z', v_actor, v_actor)
        returning id into v_booking2;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking2, 'Equipment', v_product, '0100 post-condition line 2', 1, 2, 0, v_actor)
        returning id into v_line2;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (gen_random_uuid(), v_line2, v_asset, 1, v_actor);

        begin
          insert into booking_stage_transitions
            (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
          values (gen_random_uuid(), v_booking2, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());
        exception when exclusion_violation then
          v_refused := true;
        end;

        if not v_refused then
          raise exception 'POST-CONDITION 7 FAILED: a second booking took the same unit over an overlapping window and was ACCEPTED. The constraint is not being consulted.';
        end if;

        if (select stage from bookings where id = v_booking2) <> 'Quote' then
          raise exception 'POST-CONDITION 7 FAILED: the refused booking did not stay at Quote.';
        end if;
      end;

      -- Returned releases.
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Booked', 'Packed', v_actor, 'Owner', now());
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'Packed', 'On Rent', v_actor, 'Owner', now());
      insert into booking_stage_transitions
        (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
      values (gen_random_uuid(), v_booking, v_branch, 'On Rent', 'Returned', v_actor, 'Owner', now());

      select count(*) into v_released
        from inventory_reservations
       where booking_id = v_booking and released_at is not null and released_reason is not null;
      if v_released < 1 then
        raise exception 'POST-CONDITION 7 FAILED: Returned did not release the booking''s holds.';
      end if;

      v_ran := v_ran || '7a serialised: Booked holds, an overlapping second booking is refused and stays at Quote, Returned releases'::text;
    end if;

    -- -- 7b . Quantity: the 0045 capacity ceiling ---------------------------
    -- The shape that matters on production, where every product is Quantity and
    -- no exclusion constraint applies (its WHERE clause is `asset_id is not
    -- null`). Books a product's ENTIRE stock in an empty far-future window, then
    -- asks for one more unit of it over the same window.
    select p.id, p.total_quantity into v_product, v_capacity
      from products p
     where p.tracking_mode = 'Quantity'
       and p.total_quantity between 1 and 50
     limit 1;

    if v_product is null then
      raise notice '0100: no Quantity product with a small stock here; probe 7b (the capacity ceiling) was skipped. Expected in a scratch build from this repo — the 0047 reference corpus is 56 products and ALL of them Serialised, the exact inverse of production (204 Quantity, 0 product_units). 7b runs on live; the quantity ceiling is proved here by check:lifecycle L5, which seeds its own Quantity product.';
    else
      declare
        v_booking3 uuid;
        v_booking4 uuid;
      begin
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999903', v_branch, v_client, 'Babin Delivery',
                '2099-06-01T04:00:00Z', '2099-06-03T04:00:00Z', v_actor, v_actor)
        returning id into v_booking3;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking3, 'Equipment', v_product, '0100 capacity probe - the whole shelf', v_capacity, 2, 0, v_actor);

        insert into booking_stage_transitions
          (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking3, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());

        select count(*), coalesce(sum(qty), 0) into v_holds, v_released
          from inventory_reservations
         where booking_id = v_booking3 and released_at is null and product_id = v_product;
        if v_holds <> 1 or v_released <> v_capacity then
          raise exception
            'POST-CONDITION 7b FAILED: booking the whole shelf wrote % quantity hold(s) totalling %, expected 1 hold of %.',
            v_holds, v_released, v_capacity;
        end if;

        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '999999904', v_branch, v_client, 'Babin Delivery',
                '2099-06-01T04:00:00Z', '2099-06-03T04:00:00Z', v_actor, v_actor)
        returning id into v_booking4;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking4, 'Equipment', v_product, '0100 capacity probe - one more than exists', 1, 2, 0, v_actor);

        v_refused := false;
        begin
          insert into booking_stage_transitions
            (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
          values (gen_random_uuid(), v_booking4, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now());
        exception when others then
          v_refused := true;
          v_message := sqlerrm;
        end;

        if not v_refused then
          raise exception
            'POST-CONDITION 7b FAILED: a booking took one more than the whole stock of a Quantity product and was ACCEPTED. enforce_inventory_reservation_capacity() is not being reached.';
        end if;
        if position('Reservation rejected' in coalesce(v_message, '')) = 0 then
          raise exception
            'POST-CONDITION 7b FAILED: the over-capacity booking was refused, but by something other than the capacity ceiling: %', v_message;
        end if;
        if (select stage from bookings where id = v_booking4) <> 'Quote' then
          raise exception 'POST-CONDITION 7b FAILED: the refused booking did not stay at Quote.';
        end if;

        v_ran := v_ran || '7b quantity: the whole shelf holds as one row, one more than exists is refused by the capacity ceiling and stays at Quote'::text;
      end;
    end if;

    -- Undo everything this block wrote. `bookings`, `booking_stage_transitions`
    -- and `booking_line_units` all refuse DELETE (Law 3), so the only way back
    -- is to abort the subtransaction — which is what this raise does.
    raise exception using errcode = 'P0001', message = '__0100_rollback_probe__';
  exception when others then
    if sqlerrm <> '__0100_rollback_probe__' then
      raise;
    end if;
  end;

  if array_length(v_ran, 1) is null then
    raise exception
      'POST-CONDITION 7 FAILED: neither behavioural probe could run — this database has no serialised unit AND no small Quantity product, so nothing about the trigger''s behaviour was proved and the structural checks above are the only evidence.';
  end if;

  raise notice
    '0100 post-conditions passed. Structural: the trigger is on booking_stage_transitions, sorts after the stage applier, is SECURITY INVOKER with a pinned search_path, cancellation releases, and inventory_reservations_no_double_booking is still enabled and NOT deferrable. Behavioural (rolled back): %',
    array_to_string(v_ran, ' | ');
end;
$chk$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + '
  'discounts) in a single transaction. SECURITY INVOKER — every insert faces '
  'its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid). Per D5 '
  '(ruled 30 Aug 2026) a line may carry units[] — serials assigned at '
  'creation, one booking_line_units row each; absent means unit-less, and '
  'Pack confirms or fills. Reserves nothing: a Quote holds no stock, and since '
  'R-26 (0100) the holds are written by the Booked transition, not by any '
  'application code. Prices nothing — src/lib/money.ts owns pricing (Law 1). '
  '0099: the discount audit row is class ''discount''; it was ''data change'', '
  'which is not a member of audit_event_class, so every discounted booking was '
  'refused outright.';

commit;

-- >>> END 0100_reservations_written_by_transition.sql <<<

-- >>> START 0101_staff_roles_are_assignable.sql <<<
-- =============================================================================
-- 0101_staff_roles_are_assignable.sql — 8 Sep 2026
--
-- **No role can be assigned to anybody, by anybody, including the Owner.**
-- `docs/PERMISSIONS.md` §16 V-14, and one of the two findings §16.3 still lists
-- as a LIVE defect rather than a documentation error.
--
-- ## The defect, read off production rather than reasoned about
--
-- `pg_policy` for `public.users`, live project `sxguwvgoserhdolewibb`, 8 Sep:
--
--     polname            polcmd  roles
--     users_select_own   r       PUBLIC        <- the only row
--
-- One policy. `SELECT`. `relrowsecurity` is on. So there is no INSERT, UPDATE
-- or DELETE path through PostgREST for any role, and §12.2 D-8 — *"Owner grants
-- Manager → succeeds"* — cannot happen and never could.
--
-- It is not a grant problem, which is the thing that makes it easy to misread:
--
--     has_table_privilege('authenticated','public.users','UPDATE')          -> true
--     has_column_privilege('authenticated','users','primary_role','UPDATE') -> true
--
-- The grants are wide open. RLS refuses the write by having nothing to say
-- about it. That matters for the shape of the fix: **anything that opens a
-- write here is the whole gate**, because the grant layer underneath is not
-- gating anything.
--
-- ## Why two RPCs and NOT an `UPDATE` policy on `users`
--
-- The obvious fix is `create policy users_update_owner on users for update
-- using (auth_user_role() = 'Owner')`. It is rejected, for three reasons in
-- increasing order of weight:
--
--  1. **It is far wider than the ruling.** With the column grants above already
--     true, an UPDATE policy makes every column writable — `email`, `id`,
--     `branch_id`, `client_uuid`, `employee_code`. `PATCH /rest/v1/users?id=eq.X`
--     with any body at all would be honoured. The decision being implemented is
--     "the Owner may assign a role and deactivate an account", not "the Owner
--     may rewrite the identity table".
--
--  2. **The invariant cannot live in a policy.** "At least one active Owner must
--     remain" is a statement about the *set*, not about the row being written,
--     and a `with check` sees only the row. Demoting the last Owner passes any
--     row-local predicate and locks every future role change out of the system
--     permanently — the write path being Owner-only is exactly what makes that
--     unrecoverable. It needs a function that can lock and count.
--
--  3. **The house already answered this question, on this table.** Staff
--     administration goes through SECURITY DEFINER RPCs: `revoke_staff_pin_for`
--     (`0066`) and `record_password_reset_request` (`0068`), both gated with the
--     identical line, both granted to `authenticated` and revoked from `anon`.
--     `queries/staff.ts` states why that shape rather than an `actions/` entry:
--     the dispatcher exists for business entities that emit domain events, and
--     a role change emits none. This file follows the precedent it found.
--
-- No policy is added, so `users` stays refused for direct DML from the API
-- roles — including for the Owner. The only new write path is the two functions
-- below, and each writes exactly one column.
--
-- ## The ruling this implements, and the flag it clears
--
-- Three places in this repository said role assignment "needs a ruling":
-- `UsersRoles.tsx`'s Branch-managers note, `StaffDirectory.tsx`'s Scope
-- paragraph, and `queries/staff.ts`. That flag is honoured, not ignored — but
-- the answer was already written down in four independent places, and they
-- agree:
--
--   * `rbac.canManageSettings(role)` is `role === 'Owner'` — and `0066`'s
--     refusal message cites that function by name for the neighbouring act.
--   * `staff_directory_v` (`0067`) carries `where auth_user_role() = 'Owner'`
--     INLINE. Only the Owner can even see the list to act on.
--   * `PERMISSIONS.md` §11.2 places "user list, role assignment, the 9-role
--     matrix" under Settings, which is `canManageSettings`.
--   * §12.2 D-8's expected result is literally "Owner grants Manager".
--
-- **RULING: the Owner, and only the Owner, may assign a staff role or
-- deactivate a staff account.** It mirrors the read predicate on the same
-- table, so this file widens the Owner's authority over `users` from "see the
-- directory" to "see the directory and change two columns in it", and widens
-- nobody else's by anything.
--
-- ## What is deliberately NOT here
--
-- **Account creation.** A `users` row without an `auth.users` identity behind it
-- cannot sign in, and `0067`'s header is explicit that the join between them is
-- a convention with nothing enforcing it. Minting the identity needs GoTrue's
-- admin API, which needs the service key, which the README calls *"a complete
-- authorization bypass"* in a browser. So creation needs an Edge Function and is
-- its own piece of work; an INSERT path that produced staff rows nobody can sign
-- in as would make `has_auth_account = false` the normal case instead of the
-- alarm it is today. `users` therefore keeps NO insert path.
--
-- **DELETE.** Law 3. Deactivation is `set_staff_active(id, false)`; the row and
-- its audit trail stay. No delete policy is added and none existed.
--
-- ## Concurrency — why the Owner set is locked, not just counted
--
-- Two Owners demoting each other in overlapping transactions would each see the
-- other still standing and both commit, leaving zero. `select ... for update`
-- over the active-Owner set serialises them: the second transaction blocks,
-- then re-reads and refuses. The lock is taken before the count in both
-- functions.
-- =============================================================================

begin;

-- ── Pre-conditions ────────────────────────────────────────────────────────────
do $$
declare
  v_n int;
begin
  if to_regclass('public.users') is null then
    raise exception 'PRE-CONDITION FAILED: public.users is missing.';
  end if;
  if to_regclass('public.audit_events') is null then
    raise exception 'PRE-CONDITION FAILED: public.audit_events is missing — this file writes the trail.';
  end if;

  -- The two helpers the gate is built out of. Both must be SECURITY DEFINER:
  -- `auth_user_role()` reads `users`, and a non-definer read from inside a
  -- function called on `users` would be subject to `users_select_own` and
  -- answer 'Client' for every caller.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('auth_user_id','auth_user_role') and p.prosecdef;

  if v_n <> 2 then
    raise exception 'PRE-CONDITION FAILED: auth_user_id() and auth_user_role() must both exist and be '
                    'SECURITY DEFINER; found % of 2.', v_n;
  end if;

  -- If someone has since opened a general write policy on users, this file's
  -- premise is gone and its header is a lie. Say so rather than adding a second,
  -- narrower path beside a wide one.
  select count(*) into v_n from pg_policy
  where polrelid = 'public.users'::regclass and polcmd in ('a','w','d');

  if v_n <> 0 then
    raise exception 'PRE-CONDITION FAILED: public.users already carries % write polic(ies). '
                    'This file assumes RPCs are the only write path; reconcile before applying.', v_n;
  end if;
end $$;

-- ── 1 · assign a role ─────────────────────────────────────────────────────────
create or replace function set_staff_role(p_user_id uuid, p_role system_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth_user_id();
  v_old    system_role;
  v_email  text;
  v_name   text;
  v_active boolean;
  v_branch uuid;
  v_others int;
begin
  if v_actor is null then
    raise exception 'Assigning a role requires a signed-in session.';
  end if;

  -- RULING 2026-09-08 (R-27): the Owner alone assigns a staff role. §12.2 D-8's
  -- "As Admin ... grant Manager -> succeeds" is REFUSED under §15.1 B-1 —
  -- canManageSettings is Owner-only and staff_directory_v gives an Admin zero
  -- rows to act on. The identical line `revoke_staff_pin_for` (0066) and
  -- `record_password_reset_request` (0068) use, citing the same function.
  -- Revert: widen to `not in ('Owner','Admin')`.
  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may assign a staff role (rbac.canManageSettings).';
  end if;

  if p_role is null then
    raise exception 'A role is required. To take someone off the floor, deactivate the account '
                    'with set_staff_active — a staff row always has a role.';
  end if;

  /*
   * `Client` is in `system_role` for the portal, and it is NOT a value a staff
   * row can hold. `auth_user_role()` returns 'Client' precisely when the caller
   * has NO `users` row, so "a staff row whose role is Client" is a contradiction
   * the rest of the schema already reads as "not staff". Assigning it would
   * strip the person from `isStaff()` while leaving them a directory row and a
   * sign-in — an offboarding that looks like a role. Deactivation is the
   * offboarding, and it is the neighbouring function.
   */
  if p_role = 'Client' then
    raise exception 'Client is the portal role and cannot be assigned to a staff row. '
                    'To remove floor access, deactivate the account instead.';
  end if;

  select primary_role, email, full_name, is_active, branch_id
    into v_old, v_email, v_name, v_active, v_branch
    from users where id = p_user_id
    for update;

  if not found then
    raise exception 'No staff row for that identity; there is no role to assign.';
  end if;

  -- Idempotent, and silent about it. Re-sending the role someone already holds
  -- is not a change, and an audit row saying Owner -> Owner would be noise in
  -- the one log where noise is expensive.
  if v_old = p_role then
    return;
  end if;

  if v_old = 'Owner' and v_active then
    -- Lock the set BEFORE counting it; see the header's concurrency note.
    perform 1 from users where primary_role = 'Owner' and is_active and id <> p_user_id for update;
    select count(*) into v_others
      from users where primary_role = 'Owner' and is_active and id <> p_user_id;

    if v_others = 0 then
      raise exception 'This is the last active Owner. Demoting them would leave nobody who can '
                      'assign roles, and role assignment is Owner-only — the system could not be '
                      'recovered from inside itself. Promote another Owner first.';
    end if;
  end if;

  update users
     set primary_role = p_role,
         updated_at   = now(),
         updated_by   = v_actor
   where id = p_user_id;

  insert into audit_events (
    client_uuid, event_class, category, module, action,
    severity, status, table_name, record_id, branch_id,
    actor_id, actor_role, old_values, new_values, reason
  )
  values (
    gen_random_uuid(),
    -- `audit_event_class` has no 'permission' member and this file does not add
    -- one: 0099 is in flight against the same enum, and two migrations adding
    -- values to one enum is how a chain stops building. The specificity is
    -- carried by `action`, which has the exact label.
    'status change',
    'Users',
    'Settings',
    'Permission Changed',
    -- Granting or removing Owner is the strongest act available in this system;
    -- everything else is a lateral move inside the staff band. 0068 rates a
    -- reset REQUEST 'High', so a completed grant of the top role is above it.
    (case when p_role = 'Owner' or v_old = 'Owner' then 'Critical' else 'High' end)::audit_severity,
    'Success',
    'users',
    p_user_id,
    v_branch,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('primary_role', v_old),
    jsonb_build_object('primary_role', p_role),
    format('Role changed from %s to %s for %s (%s).', v_old, p_role, coalesce(v_name, '(no name)'), v_email)
  );
end;
$$;

comment on function set_staff_role(uuid, system_role) is
  'PERMISSIONS.md §16 V-14 — the only write path to users.primary_role. Owner only '
  '(rbac.canManageSettings, mirroring staff_directory_v''s own predicate). Refuses the '
  'Client role, refuses to demote the last active Owner, and writes a Permission Changed '
  'audit row. No RLS policy grants DML on users; this function and set_staff_active are '
  'the whole surface.';

-- ── 2 · activate / deactivate ─────────────────────────────────────────────────
create or replace function set_staff_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth_user_id();
  v_old    boolean;
  v_role   system_role;
  v_email  text;
  v_name   text;
  v_branch uuid;
  v_others int;
begin
  if v_actor is null then
    raise exception 'Changing a staff account''s status requires a signed-in session.';
  end if;

  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may activate or deactivate a staff account (rbac.canManageSettings).';
  end if;

  if p_active is null then
    raise exception 'Activate or deactivate must be stated explicitly; null is not a status.';
  end if;

  select is_active, primary_role, email, full_name, branch_id
    into v_old, v_role, v_email, v_name, v_branch
    from users where id = p_user_id
    for update;

  if not found then
    raise exception 'No staff row for that identity; there is no account to change.';
  end if;

  if v_old = p_active then
    return;
  end if;

  if v_old and not p_active and v_role = 'Owner' then
    perform 1 from users where primary_role = 'Owner' and is_active and id <> p_user_id for update;
    select count(*) into v_others
      from users where primary_role = 'Owner' and is_active and id <> p_user_id;

    if v_others = 0 then
      raise exception 'This is the last active Owner. Deactivating them would leave nobody who can '
                      'reactivate anyone, and that is Owner-only. Promote another Owner first.';
    end if;
  end if;

  update users
     set is_active  = p_active,
         updated_at = now(),
         updated_by = v_actor
   where id = p_user_id;

  /*
   * Deactivation removes floor access and is the offboarding act, so it is
   * audited at the same weight as a role change. What it does NOT do is revoke
   * the sign-in: `auth.users` is GoTrue's and this function holds no privilege
   * there. `is_active` is read by `set_staff_pin` (0066) and by the screens; a
   * deactivated person can still authenticate. Closing that needs the admin API
   * — the same wall account creation is behind — and it is stated here rather
   * than left for someone to discover.
   */
  insert into audit_events (
    client_uuid, event_class, category, module, action,
    severity, status, table_name, record_id, branch_id,
    actor_id, actor_role, old_values, new_values, reason
  )
  values (
    gen_random_uuid(),
    'status change',
    'Users',
    'Settings',
    'Update',
    (case when v_role = 'Owner' then 'Critical' else 'High' end)::audit_severity,
    'Success',
    'users',
    p_user_id,
    v_branch,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('is_active', v_old),
    jsonb_build_object('is_active', p_active),
    format('Staff account %s for %s (%s), role %s. The GoTrue sign-in is NOT revoked by this.',
           case when p_active then 'reactivated' else 'deactivated' end,
           coalesce(v_name, '(no name)'), v_email, v_role)
  );
end;
$$;

comment on function set_staff_active(uuid, boolean) is
  'PERMISSIONS.md §16 V-14 — the only write path to users.is_active. Owner only. Refuses to '
  'deactivate the last active Owner. Does NOT revoke the GoTrue account: is_active gates the '
  'app, not authentication.';

-- ── 3 · grants ────────────────────────────────────────────────────────────────
-- 0066's pattern exactly: nothing for PUBLIC or anon, EXECUTE for authenticated.
-- The Owner check inside is what narrows `authenticated` to one person.
revoke all on function set_staff_role(uuid, system_role) from public, anon;
revoke all on function set_staff_active(uuid, boolean)   from public, anon;

grant execute on function set_staff_role(uuid, system_role) to authenticated;
grant execute on function set_staff_active(uuid, boolean)   to authenticated;

-- ── 4 · post-conditions ───────────────────────────────────────────────────────
-- Structural assertions first, then a behavioural probe that actually performs
-- the grant as an Owner and as a Warehouse session. Everything the probe writes
-- is discarded through the ROLLBACK sentinel (0094/0095/0097's pattern; 0092
-- omitted it and committed a real UPDATE to a production row).
do $$
declare
  v_n       int;
  v_owner   uuid;
  v_owner2  uuid;
  v_wh      uuid;
  v_coord   uuid;
  v_role    system_role;
  v_active  boolean;
  v_audit   int;
  v_refused boolean;
begin
  -- Both functions exist, are SECURITY DEFINER, and pin search_path.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('set_staff_role','set_staff_active')
    and p.prosecdef
    and p.proconfig @> array['search_path=public, pg_temp'];

  if v_n <> 2 then
    raise exception 'POST-CONDITION 1 FAILED: expected 2 SECURITY DEFINER functions with a pinned '
                    'search_path, found %.', v_n;
  end if;

  -- anon must not reach either. An unauthenticated caller is not an Owner and
  -- the refusal must not depend on the body running at all.
  if has_function_privilege('anon', 'public.set_staff_role(uuid, system_role)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_staff_active(uuid, boolean)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: anon can execute a staff-administration RPC.';
  end if;

  if not has_function_privilege('authenticated', 'public.set_staff_role(uuid, system_role)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_staff_active(uuid, boolean)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: authenticated cannot execute a staff-administration RPC.';
  end if;

  -- users still has no write policy — the fix must not have opened one.
  select count(*) into v_n from pg_policy
  where polrelid = 'public.users'::regclass and polcmd in ('a','w','d');
  if v_n <> 0 then
    raise exception 'POST-CONDITION 3 FAILED: a write policy appeared on users; the RPCs were '
                    'supposed to be the whole surface.';
  end if;

  -- ── behavioural ────────────────────────────────────────────────────────────
  select id into v_owner  from users where primary_role = 'Owner'       and is_active order by employee_code limit 1;
  select id into v_owner2 from users where primary_role = 'Owner'       and is_active and id <> v_owner order by employee_code limit 1;
  select id into v_wh     from users where primary_role = 'Warehouse'   and is_active order by employee_code limit 1;
  select id into v_coord  from users where primary_role = 'Coordinator' and is_active order by employee_code limit 1;

  if v_owner is null or v_wh is null or v_coord is null then
    raise notice '0101: BEHAVIOURAL PROBE NOT RUN — this database has no Owner/Warehouse/Coordinator '
                 'trio to act on. The structural assertions above passed; nothing has demonstrated '
                 'that a real grant works here.';
  else
    -- (a) BEFORE: a money-blind, non-Owner session is refused.
    perform set_config('app.current_user_id', v_wh::text, true);
    v_refused := false;
    begin
      perform set_staff_role(v_coord, 'Manager');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 4 FAILED: a Warehouse session assigned a role.';
    end if;

    -- (b) AFTER: the Owner grants Manager — §12.2 D-8, the case V-14 says cannot happen.
    perform set_config('app.current_user_id', v_owner::text, true);
    perform set_staff_role(v_coord, 'Manager');
    select primary_role into v_role from users where id = v_coord;
    if v_role <> 'Manager' then
      raise exception 'POST-CONDITION 5 FAILED: Owner granted Manager and the row says %.', v_role;
    end if;

    select count(*) into v_audit from audit_events
     where table_name = 'users' and record_id = v_coord and action = 'Permission Changed';
    if v_audit < 1 then
      raise exception 'POST-CONDITION 5 FAILED: the grant left no Permission Changed audit row.';
    end if;

    -- (c) the Client role is refused.
    v_refused := false;
    begin
      perform set_staff_role(v_coord, 'Client');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 6 FAILED: a staff row was assigned the portal role.';
    end if;

    -- (d) deactivation works.
    perform set_staff_active(v_coord, false);
    select is_active into v_active from users where id = v_coord;
    if v_active then
      raise exception 'POST-CONDITION 7 FAILED: deactivation did not take.';
    end if;

    -- (e) the last active Owner cannot be demoted or deactivated. Reduce to one
    --     Owner first if this database has two.
    if v_owner2 is not null then
      perform set_staff_role(v_owner2, 'Admin');
    end if;

    v_refused := false;
    begin
      perform set_staff_role(v_owner, 'Admin');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 8 FAILED: the last active Owner was demoted — the system can '
                      'be locked out of its own role administration.';
    end if;

    v_refused := false;
    begin
      perform set_staff_active(v_owner, false);
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 8 FAILED: the last active Owner was deactivated.';
    end if;

    perform set_config('app.current_user_id', '', true);
    raise notice '0101: probe passed — Warehouse refused, Owner granted Manager with an audit row, '
                 'Client refused, deactivation applied, last Owner protected from both demotion and '
                 'deactivation.';
  end if;

  raise exception 'ROLLBACK_0101_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0101_PROBE' then
      return;  -- probe writes discarded; the functions and grants above stand
    end if;
    raise;
end $$;

commit;

-- >>> END 0101_staff_roles_are_assignable.sql <<<

-- >>> START 0102_law6_money_blind_cannot_write_booking_money.sql <<<
-- =============================================================================
-- 0102_law6_money_blind_cannot_write_booking_money.sql — 8 Sep 2026
--
-- Law 6 for the WRITE verb, on the booking. `0092` closed this hole for
-- `products` and `product_units`. It is still open on `bookings` and
-- `booking_lines`, which is where the money that actually gets invoiced lives.
--
-- ## Reproduced, PGlite, full chain from scratch, 8 Sep 2026
--
-- As a Warehouse seat (`set local role authenticated`, `app.current_user_id`
-- set to a user whose `primary_role` is 'Warehouse' — the same impersonation
-- 0092's own post-condition uses):
--
--     update bookings      set deposit_required = 0       -> ALLOWED
--     update booking_lines set rate = 1                   -> ALLOWED
--     update booking_lines set discount_amount = 999999   -> ALLOWED
--
-- while `select deposit_required from bookings` is refused to the same seat by
-- the column mask. The role may not READ the deposit and may rewrite it to
-- zero. `authenticated` holds INSERT and UPDATE on both tables, so this is one
-- PostgREST PATCH, no browser required.
--
-- ## Why the existing controls do not catch it
--
-- Identical to 0092's reasoning, and it is worth restating because the shape
-- keeps recurring:
--
--   * RLS cannot express it. A `WITH CHECK` sees the new row and cannot say
--     which columns changed. `bookings_update` admits Warehouse deliberately —
--     the floor moves bookings — and that is correct.
--   * Column privileges cannot express it. Every signed-in user is the SAME
--     Postgres role, `authenticated`; the app's role lives in
--     `users.primary_role`. `REVOKE UPDATE (rate) FROM authenticated` would
--     take the column from the Owner too.
--
-- So the check must compare OLD against NEW per row, which only a trigger can
-- do. This is the same instrument as 0092, pointed at the other two tables.
--
-- ## The column set is measured, not remembered
--
-- Every numeric column on both tables, read from the schema at the end of the
-- chain (99/99 applied):
--
--     bookings.deposit_required   numeric   <- guarded
--     bookings.version            integer   <- NOT money; the optimistic-lock
--                                              counter, bumped by a trigger
--     booking_lines.rate              numeric  <- guarded
--     booking_lines.discount_amount   numeric  <- guarded
--     booking_lines.supplier_cost     numeric  <- guarded
--     booking_lines.markup_amount     numeric  <- guarded
--     booking_lines.qty               integer  <- guarded, see ⭐ below
--     booking_lines.days              integer  <- guarded, see ⭐ below
--     booking_lines.sort_order        integer  <- NOT money; display order
--
-- ⭐ S0-a — `qty` and `days` are not money columns, but they are the two
-- multiplicands of every line total, so a money-blind seat that may not see a
-- rate can still change what the rate is multiplied by. They are guarded.
-- The legitimate floor case — a partial pickup — does not go through a line
-- UPDATE; it goes through `releaseBookingLineUnit` against
-- `booking_line_units`, which this trigger does not touch. Flip by deleting
-- the two `qty`/`days` comparisons.
--
-- ## What this does NOT close
--
-- INSERT is not guarded here. `create_booking` is the only insert path and is
-- `security invoker`, but `booking_lines_all` admits a direct Warehouse INSERT
-- carrying any rate it likes. That is a real hole and it is Stage 1's, not this
-- file's: closing it needs a rule about who may add a line at all, which is a
-- permission question, not a Law 6 question. Filed, not fixed here.
--
-- ## Divergence from 0092, deliberate
--
-- 0092 raises P0001 (a bare `raise exception`). This file raises the same
-- message but with `errcode = '42501'`, insufficient_privilege, which PostgREST
-- renders as HTTP 403 rather than 400. A Law 6 refusal is a permission refusal
-- and should say so on the wire. 0092 is not edited to match — it is committed
-- and in the chain — and the message still begins 'Law 6:' in both, so anything
-- asserting on the text keeps working. Recorded as R-31.
--
-- N-5: NOT applied to live. Written, numbered, proven in PGlite. Babin applies
-- after the backup.
-- =============================================================================

begin;

create or replace function reject_money_blind_booking_money_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_changed text[] := '{}';
begin
  /*
   * Only a browser session is subject to this. A migration, a seed or any psql
   * session has no JWT and no `app.current_user_id`, so `auth_user_role()`
   * reports 'Client' and `auth_can_view_money()` is FALSE — guarding on the app
   * role alone would refuse this file's own post-condition. Keyed on
   * `current_user` instead, exactly as 0092 is: `authenticated` and `anon` are
   * the only roles a browser can ever be.
   */
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if auth_can_view_money() then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'bookings' then
    if NEW.deposit_required is distinct from OLD.deposit_required
      then v_changed := v_changed || 'deposit_required'::text; end if;

  elsif TG_TABLE_NAME = 'booking_lines' then
    if NEW.rate            is distinct from OLD.rate            then v_changed := v_changed || 'rate'::text; end if;
    if NEW.discount_amount is distinct from OLD.discount_amount then v_changed := v_changed || 'discount_amount'::text; end if;
    if NEW.supplier_cost   is distinct from OLD.supplier_cost   then v_changed := v_changed || 'supplier_cost'::text; end if;
    if NEW.markup_amount   is distinct from OLD.markup_amount   then v_changed := v_changed || 'markup_amount'::text; end if;
    -- ⭐ S0-a: not money, but the multiplicands of the line total.
    if NEW.qty             is distinct from OLD.qty             then v_changed := v_changed || 'qty'::text; end if;
    if NEW.days            is distinct from OLD.days            then v_changed := v_changed || 'days'::text; end if;
  end if;

  if array_length(v_changed, 1) is null then
    /*
     * Nothing priced changed. Stage moves, notes, packing flags, timestamps:
     * all untouched. The floor must be able to do its job — a guard that blocks
     * warehouse work is an outage wearing a security badge.
     */
    return NEW;
  end if;

  raise exception
    'Law 6: your role may not see money, so it may not change it. Refused a write to %.% (%). '
    'Ask Owner, Admin, Manager, Coordinator or Accounts to change booking pricing.',
    TG_TABLE_NAME, array_to_string(v_changed, ', '), auth_user_role()
    using errcode = '42501';
end;
$$;

comment on function reject_money_blind_booking_money_write() is
  'Law 6 for the WRITE verb on booking money (0102). Companion to 0092, which '
  'covers products/product_units. RLS admits Warehouse to bookings and '
  'booking_lines because the floor moves bookings; this refuses only the priced '
  'columns plus qty/days. Exempt for postgres/service_role so migrations and '
  'seeds still run. Raises 42501 -> HTTP 403.';

drop trigger if exists trg_bookings_money_blind_write on bookings;
create trigger trg_bookings_money_blind_write
  before update on bookings
  for each row execute function reject_money_blind_booking_money_write();

drop trigger if exists trg_booking_lines_money_blind_write on booking_lines;
create trigger trg_booking_lines_money_blind_write
  before update on booking_lines
  for each row execute function reject_money_blind_booking_money_write();

-- -----------------------------------------------------------------------------
-- Post-conditions.
--
-- Four, in the shape 0092 established: the guard must refuse the right write,
-- refuse it for the RIGHT REASON, leave the value unchanged, and not refuse
-- anybody else. A guard verified only by "the write failed" is not verified —
-- 0092's first run refused for a `text[] || unknown` cast error and a bare
-- `when others` called that a pass.
-- -----------------------------------------------------------------------------
do $$
declare
  v_booking  uuid;
  v_line     uuid;
  v_deposit  numeric;
  v_rate     numeric;
  v_wh       uuid;
  v_coord    uuid;
  v_blocked  boolean := false;
  v_err      text;
  v_allowed  boolean := false;
begin
  select id into v_wh    from users where primary_role = 'Warehouse'   and is_active limit 1;
  select id into v_coord from users where primary_role = 'Coordinator' and is_active limit 1;
  select b.id, b.deposit_required into v_booking, v_deposit from bookings b limit 1;
  select l.id, l.rate into v_line, v_rate from booking_lines l where l.booking_id = v_booking limit 1;

  if v_wh is null or v_booking is null then
    raise notice
      '0102: no Warehouse user or no booking in this database; trigger installed, behavioural '
      'checks skipped. check:lifecycle L12 is where this is exercised against a seeded world.';
    return;
  end if;

  /*
   * As in 0092: on a database rebuilt from these migrations `authenticated` may
   * hold no privilege on the table at all, and "permission denied for table
   * bookings" is NOT evidence that Law 6 works. Refuse to record it as one.
   */
  if not has_table_privilege('authenticated', 'public.bookings', 'UPDATE') then
    raise notice
      '0102: `authenticated` holds no UPDATE on bookings here, so the probe cannot distinguish '
      'this guard from the missing grant. Trigger installed; verified where the grants exist.';
    return;
  end if;

  -- (1) this migration (postgres) must still be able to write booking money.
  update bookings set deposit_required = v_deposit where id = v_booking;

  -- (2) a Warehouse session must be REFUSED, and refused BY THIS GUARD.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    -- ⛔ Corrected 8 Sep 2026, applying to live: this wrote `= 0`, and 245 of
    --    production's 246 bookings ALREADY hold 0. `is distinct from` is then
    --    false, the guard correctly ignores a write that changes nothing, and
    --    the assertion below reported a Law 6 breach that had not happened.
    --    The probe must move the value, or it proves nothing either way.
    update bookings set deposit_required = coalesce(v_deposit, 0) + 1 where id = v_booking;
  exception when others then
    v_blocked := true;
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote bookings.deposit_required.';
  end if;
  if position('Law 6' in coalesce(v_err, '')) = 0 then
    /*
     * Refused, but by something else — most likely RLS getting there first. That
     * is still a refusal, so it is not a failure of this file; but it must not
     * be recorded as proof either, or the day the policy widens this guard will
     * be assumed to be holding a door nobody has tested.
     */
    raise notice
      '0102: the Warehouse write was refused by something other than this guard (%). The trigger '
      'is installed; check:lifecycle L12 exercises it where the policy admits the write.',
      left(coalesce(v_err, ''), 120);
  end if;
  if (select deposit_required from bookings where id = v_booking) is distinct from v_deposit then
    raise exception 'POST-CONDITION FAILED: the refused write still changed the deposit.';
  end if;

  -- (3) the line columns, same seat.
  if v_line is not null then
    v_blocked := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_wh::text, true);
      -- Same correction: a line already at 1 would make this a no-op.
      update booking_lines set rate = coalesce(v_rate, 0) + 1 where id = v_line;
    exception when others then
      v_blocked := true;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if not v_blocked then
      raise exception 'POST-CONDITION FAILED: a Warehouse session rewrote booking_lines.rate.';
    end if;
    if (select rate from booking_lines where id = v_line) is distinct from v_rate then
      raise exception 'POST-CONDITION FAILED: the refused line write still changed the rate.';
    end if;
  end if;

  -- (4) the same money-blind seat must still be able to do its actual job, and a
  --     money-sighted seat must still be able to do its actual job.
  begin
    set local role authenticated;
    perform set_config('app.current_user_id', v_wh::text, true);
    update bookings set updated_at = now() where id = v_booking;
    v_allowed := true;
  exception when others then
    v_allowed := false;
  end;
  reset role;
  perform set_config('app.current_user_id', '', true);

  if not v_allowed then
    raise notice
      '0102: a non-money Warehouse write was also refused here — by RLS, not by this guard, which '
      'ignores every column it does not name. Not a failure of this file.';
  end if;

  raise notice
    '0102 verified: booking money writes refused for money-blind roles, the values unchanged, '
    'non-money writes untouched, migrations exempt.';
end $$;

commit;

-- >>> END 0102_law6_money_blind_cannot_write_booking_money.sql <<<

-- >>> START 0103_preventive_maintenance.sql <<<
-- =============================================================================
-- 0103 — RULING 2026-09-08 (R-28): preventive maintenance is DUE BY TIME OR
--        USAGE, WARNS ONLY, and its intervals live on the product MODEL.
--
-- Babin ruled three things on 8 Sep, and each one is a decision this file
-- implements rather than a default it takes:
--
--   1. A unit is **due for service** when EITHER its elapsed-time interval OR
--      its usage interval since the last completed preventive job is reached —
--      whichever comes first.
--   2. Being due **warns only**. A `Service due` badge; the unit stays bookable.
--      Nothing moves it to Maintenance, nothing creates a work order.
--   3. The interval lives on the **product model**, not the category and not
--      the unit.
--
-- ## Derived, never stored
--
-- Due-ness is computed at read time from three facts — the model's interval,
-- the unit's last completed preventive job, the unit's usage since then. There
-- is **no `is_due` column** anywhere (Bundles v1.1 §1). A stored flag would be
-- wrong the moment the clock moved, and a nightly job to keep it true is a
-- second source for a fact the tables already carry.
--
-- ## Three deviations from R-28's schema table, each stated rather than folded in
--
-- **(a) The meter already exists.** R-28 adds `product_units.meter_hours
-- numeric(10,1)`. `product_units.running_hours numeric(10,2) NOT NULL` has been
-- on that table since 0004 and is the same fact. Adding a second hours column
-- would give one unit two meters that could disagree, which is the defect this
-- repo keeps finding (`vat-rate-has-three-sources`). So `running_hours` IS the
-- meter, and only what it lacks is added: when the reading was taken, and what
-- it read at the last service.
--
-- **(b) A delta needs a baseline.** `meter_hours_since_service` cannot be
-- computed from a running total alone, and R-28 names no place to keep the
-- reading at service time. `product_units.service_meter_baseline` is that place:
-- set to the unit's current reading at intake (backfilled below, so no existing
-- unit is instantly overdue), and re-set by the trigger when a `Preventive
-- Service` job completes. That trigger IS the reset R-28 describes — "a
-- completed Preventive row is the reset; nothing else resets the clock" — made
-- executable.
--
-- **(c) `Preventive` is spelled `Preventive Service`.** R-28 says
-- `maintenance_type` must carry `Preventive`, "one of the eight locked types".
-- The eight locked types are Repair · Inspection · Calibration · Firmware Update
-- · Sensor Cleaning · Internal Cleaning · Fungus Removal · **Preventive
-- Service** (0001). The member exists; nothing is added to the enum, and the
-- shorthand in the ruling is read as naming it.
--
-- ## `due_at` is the TIME due date, and only that
--
-- R-28 defines `due_at` as "the earlier of `last_service_at + interval_days` and
-- the date usage crossed its threshold". The first is arithmetic. The second is
-- not available: crossing a rental-day threshold happens somewhere inside a
-- booking history, and recovering the instant would mean replaying every
-- booking's transitions per unit on every read of an inventory list.
--
-- So `due_at` carries the TIME due date (null when the model sets no day
-- interval), and the usage case is served by the counters instead — which is
-- exactly what R-28's own tooltip shows: `— usage (42 of 40 rental days)` names
-- no date. `overdue_days` follows the same rule and is null for a usage-only
-- reason, because "overdue by N days" has no meaning when the threshold is
-- rental days rather than a calendar.
--
-- When BOTH thresholds are crossed, `due_reason` reports `'time'`. It is the one
-- that carries a date the operator can act on, and R-28's "whichever comes
-- first" cannot be evaluated without the crossing instant the paragraph above
-- says is unavailable. Stated here so a later reader does not take it for a bug.
--
-- ## Money-free by construction
--
-- `product_units_service_v` names no money column, so every staff role may read
-- it and no Law 6 mask is needed. `maintenance_records.cost` is deliberately
-- NOT joined in — the view answers "is this due", not "what did it cost".
--
-- ## Read-only, like every other view here
--
-- 0095's rule, verbatim: "any migration that creates a view must revoke its DML
-- in the same file". A Postgres view over one table is auto-updatable, and the
-- platform's default ACL grants `authenticated` INSERT/UPDATE/DELETE on new
-- objects — which is how 23 `_v` views became a writable bypass around RLS. The
-- revoke is at the bottom of this file.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED to the live project. Additive — six columns, one view, one
-- trigger, one backfill of an existing column's baseline — and still subject to
-- CLAUDE.md N-5.
-- =============================================================================
--
-- ✅ **APPLIED TO PRODUCTION, 8 Sep 2026.** The line above was true when it was
-- written and is superseded, not deleted (Law 3 applies to prose here too).
-- Babin lifted N-5 in writing — "now apply everything" — and a concurrent
-- session applied `0079`-`0103` to `sxguwvgoserhdolewibb` in filename order
-- through the MCP `apply_migration` channel, each file whole with its own
-- `begin;`/`commit;`. Its PROGRESS.md entry carries the live measurements.
-- Verify against `supabase_migrations.schema_migrations` before trusting THIS
-- line too; headers in this directory have been wrong before, including this
-- one, twice.

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ The plan, on the MODEL.
--
-- All three intervals nullable, and **null means that trigger is off**. A model
-- with all three null has no preventive plan and never badges — which is every
-- model in the catalogue the moment this lands, so nothing starts shouting on
-- day one. `service_grace_days` is NOT NULL with the ⭐ default of 7 (R-28).
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists service_interval_days         integer,
  add column if not exists service_interval_rental_days  integer,
  add column if not exists service_interval_meter_hours  numeric(10,1),
  add column if not exists service_grace_days            integer not null default 7;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_service_intervals_positive') then
    alter table products add constraint products_service_intervals_positive check (
      (service_interval_days        is null or service_interval_days        > 0) and
      (service_interval_rental_days is null or service_interval_rental_days > 0) and
      (service_interval_meter_hours is null or service_interval_meter_hours > 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_service_grace_non_negative') then
    -- Zero is a real answer: "due is overdue, no grace at all". Negative is not.
    alter table products add constraint products_service_grace_non_negative
      check (service_grace_days >= 0);
  end if;
end;
$$;

comment on column products.service_interval_days is
  'R-28: calendar days between preventive services for this MODEL. Null = the time trigger is off.';
comment on column products.service_interval_rental_days is
  'R-28: rental days (sum of booking_lines.days on bookings that reached On Rent) between preventive services. Null = off.';
comment on column products.service_interval_meter_hours is
  'R-28: meter hours between preventive services, read against product_units.running_hours. Null = off.';
comment on column products.service_grace_days is
  'R-28 ⭐ (default 7): days after due before a unit reads Overdue rather than Due. Zero means no grace.';


-- ---------------------------------------------------------------------------
-- 2 ▸ The unit's meter — what `running_hours` was missing.
--
-- `meter_hours_recorded_at` is WHEN the reading was taken, which is what makes a
-- stale meter visible instead of silently under-counting.
-- `service_meter_baseline` is what the meter read at the last service, and it is
-- the only reason a delta is computable at all (deviation (b) in the header).
-- ---------------------------------------------------------------------------
alter table product_units
  add column if not exists meter_hours_recorded_at timestamptz,
  add column if not exists service_meter_baseline  numeric(10,2) not null default 0;

-- Backfill: an existing unit's meter starts counting from where it is NOW, not
-- from zero. Without this, a camera with 900 recorded hours would read as 900
-- hours overdue the instant a model gained a meter interval — a fleet-wide false
-- alarm on day one, which is exactly the way a warning stops being read.
update product_units set service_meter_baseline = running_hours
 where service_meter_baseline = 0 and running_hours > 0;

comment on column product_units.meter_hours_recorded_at is
  'R-28: when running_hours was last written. Written at intake (Add Equipment v3.0) and at Return; no other writer.';
comment on column product_units.service_meter_baseline is
  'R-28: what running_hours read at the last completed Preventive Service. The subtrahend in meter_hours_since_service; re-set by trg_preventive_service_resets_the_meter.';


-- ---------------------------------------------------------------------------
-- 3 ▸ The reset.
--
-- "A completed Preventive Service row IS the reset; nothing else resets the
-- clock" (R-28). A Corrective job — Repair, and the six others — does NOT reset
-- it: fixing a fault is not a service, and letting it count would let a unit
-- that broke twice go three years without being serviced.
--
-- The time and rental-day counters need no trigger; they read `completed_at` off
-- `maintenance_records` directly. Only the meter does, because only the meter
-- carries a baseline.
-- ---------------------------------------------------------------------------
create or replace function preventive_service_resets_the_meter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- SECURITY DEFINER, for the same reason 0045's ceiling is: a Technician
  -- completing a job must be able to move the baseline on the unit even where
  -- `product_units_update` does not admit them, and the value written is read
  -- from the unit itself rather than supplied by the caller — so definer rights
  -- grant no ability to state a number.
  update product_units pu
     set service_meter_baseline = pu.running_hours
   where pu.id = NEW.product_unit_id;
  return NEW;
end;
$$;

comment on function preventive_service_resets_the_meter() is
  'R-28: completing a Preventive Service job re-bases the unit''s meter. Nothing else does — a Corrective job is not a service.';

drop trigger if exists trg_preventive_service_resets_the_meter on maintenance_records;
create trigger trg_preventive_service_resets_the_meter
  after insert or update of completed_at on maintenance_records
  for each row
  when (NEW.completed_at is not null and NEW.maintenance_type = 'Preventive Service')
  execute function preventive_service_resets_the_meter();


-- ---------------------------------------------------------------------------
-- 4 ▸ The view. One row per unit that can be due.
--
-- Retired and Missing units never badge (R-28), so they are not in the view at
-- all rather than in it with a null reason — a caller that forgot to filter
-- cannot then badge a camera that was written off in 2024.
-- ---------------------------------------------------------------------------
create or replace view product_units_service_v as
with last_service as (
  select mr.product_unit_id, max(mr.completed_at) as completed_at
    from maintenance_records mr
   where mr.maintenance_type = 'Preventive Service'
     and mr.completed_at is not null
   group by mr.product_unit_id
),
base as (
  select
    pu.id           as unit_id,
    pu.product_id,
    pu.running_hours,
    pu.service_meter_baseline,
    p.service_interval_days,
    p.service_interval_rental_days,
    p.service_interval_meter_hours,
    p.service_grace_days,
    -- "A unit with no completed preventive job counts from product_units.created_at
    -- (intake)" — R-28, verbatim.
    coalesce(ls.completed_at, pu.created_at) as last_service_at
  from product_units pu
  join products p on p.id = pu.product_id
  left join last_service ls on ls.product_unit_id = pu.id
  where pu.retired_at is null
    and pu.status not in ('Retired', 'Missing')
),
usage as (
  select
    b.unit_id,
    coalesce(sum(bl.days), 0) as rental_days
  from base b
  join booking_line_units blu on blu.asset_id = b.unit_id
  join booking_lines bl       on bl.id = blu.booking_line_id
  where bl.voided_at is null
    and exists (
      -- "bookings that reached On Rent after last_service_at" — the transition
      -- row is the evidence, not `bookings.stage`, because a booking that has
      -- since Returned is still a booking the unit went out on.
      select 1 from booking_stage_transitions t
       where t.booking_id = bl.booking_id
         and t.to_stage = 'On Rent'
         and t.occurred_at > b.last_service_at
    )
  group by b.unit_id
),
computed as (
  select
    b.unit_id,
    b.product_id,
    b.last_service_at,
    floor(extract(epoch from (now() - b.last_service_at)) / 86400)::integer as days_since_service,
    coalesce(u.rental_days, 0)::integer                                     as rental_days_since_service,
    greatest(b.running_hours - b.service_meter_baseline, 0)                 as meter_hours_since_service,
    b.service_interval_days,
    b.service_interval_rental_days,
    b.service_interval_meter_hours,
    b.service_grace_days,
    case when b.service_interval_days is null then null
         else (b.last_service_at + make_interval(days => b.service_interval_days))
    end as due_at
  from base b
  left join usage u on u.unit_id = b.unit_id
)
select
  c.unit_id,
  c.product_id,
  c.last_service_at,
  c.days_since_service,
  c.rental_days_since_service,
  c.meter_hours_since_service,
  c.due_at,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days then 'time'
    when (c.service_interval_rental_days is not null
          and c.rental_days_since_service >= c.service_interval_rental_days)
      or (c.service_interval_meter_hours is not null
          and c.meter_hours_since_service >= c.service_interval_meter_hours) then 'usage'
    else null
  end as due_reason,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days
    then greatest(c.days_since_service - c.service_interval_days - c.service_grace_days, 0)
    else null
  end as overdue_days,
  -- Carried so a screen can render R-28's tooltip — `usage (42 of 40 rental
  -- days)` — without a second query per row for the model's plan.
  c.service_interval_days,
  c.service_interval_rental_days,
  c.service_interval_meter_hours,
  c.service_grace_days
from computed c;

comment on view product_units_service_v is
  'R-28 (8 Sep 2026): whether a unit is due for preventive service, derived at read time from the MODEL''s intervals, the unit''s last completed Preventive Service job and its usage since. No is_due column exists anywhere. due_reason is null for a model with no plan. Money-free by construction, so every staff role may read it. Retired and Missing units are not in it.';

-- 0095's rule: a view ships with its revoke, in the same file. A view over one
-- table is auto-updatable and the platform's default ACL would otherwise hand
-- `authenticated` a write path straight past product_units' RLS.
revoke insert, update, delete, truncate on product_units_service_v from anon, authenticated, public;
grant select on product_units_service_v to authenticated, anon;


-- ---------------------------------------------------------------------------
-- 5 ▸ Post-conditions.
--
-- Structural, then R-28's own scenario executed and rolled back: a model on
-- 90 days / 40 rental days, a unit serviced today, five bookings of ten rental
-- days each — `due_reason` must read `'usage'` although the calendar says the
-- unit has 90 days to run. Then a completed Preventive job resets it, and a
-- completed Corrective job does not.
-- ---------------------------------------------------------------------------
do $chk$
declare
  v_product   uuid;
  v_unit      uuid;
  v_client    uuid;
  v_branch    uuid;
  v_actor     uuid;
  v_reason    text;
  v_rental    integer;
  v_booking   uuid;
  v_line      uuid;
  v_n         integer;
  v_ran       boolean := false;
begin
  -- (1) The view exists and answers null for a model with no plan.
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'product_units_service_v') then
    raise exception 'POST-CONDITION 1 FAILED: product_units_service_v does not exist.';
  end if;

  select count(*) into v_n
    from product_units_service_v s
    join products p on p.id = s.product_id
   where p.service_interval_days is null
     and p.service_interval_rental_days is null
     and p.service_interval_meter_hours is null
     and s.due_reason is not null;
  if v_n > 0 then
    raise exception 'POST-CONDITION 1 FAILED: % unit(s) of a model with NO preventive plan report a due_reason. Null means the trigger is off.', v_n;
  end if;

  -- (2) The view carries no money column. Law 6 is a masking problem only when
  --     there is something to mask; this proves there is not.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'product_units_service_v'
       and (column_name ~* 'amount|price|rate|cost|total|paid|deposit|vat|discount')
       -- `service_interval_*` are counts, not currency; named out explicitly so
       -- the pattern above can stay broad.
       and column_name not like 'service_interval%'
  ) then
    raise exception 'POST-CONDITION 2 FAILED: product_units_service_v grew a money-shaped column. It is readable by every staff role precisely because it has none.';
  end if;

  -- (3) It is not writable.
  if has_table_privilege('authenticated', 'product_units_service_v', 'INSERT')
     or has_table_privilege('authenticated', 'product_units_service_v', 'UPDATE')
     or has_table_privilege('authenticated', 'product_units_service_v', 'DELETE') then
    raise exception 'POST-CONDITION 3 FAILED: authenticated can WRITE product_units_service_v. An auto-updatable view is a bypass around product_units'' RLS (0095).';
  end if;

  -- (4) The reset trigger is armed, and only for Preventive Service.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'maintenance_records'::regclass
       and tgname = 'trg_preventive_service_resets_the_meter'
       and not tgisinternal
  ) then
    raise exception 'POST-CONDITION 4 FAILED: the meter reset trigger is not on maintenance_records.';
  end if;

  -- (5) R-28's scenario, executed and undone.
  begin
    select id into v_actor  from users where primary_role = 'Owner' limit 1;
    select id into v_branch from branches limit 1;
    select id into v_client from clients limit 1;
    select pu.id, pu.product_id into v_unit, v_product
      from product_units pu where pu.retired_at is null limit 1;

    if v_actor is null or v_branch is null or v_client is null or v_unit is null then
      raise notice '0103: no Owner / branch / client / unit here; the behavioural check was skipped.';
    else
      -- The plan: 90 calendar days OR 40 rental days.
      update products
         set service_interval_days = 90, service_interval_rental_days = 40, service_grace_days = 7
       where id = v_product;

      -- Serviced today, so the calendar cannot be the reason.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-A', v_unit, 'Preventive Service', '0103 probe: baseline service', 'Completed', current_date, now() - interval '60 days', v_actor);

      select due_reason into v_reason from product_units_service_v where unit_id = v_unit;
      if v_reason is not null then
        raise exception 'POST-CONDITION 5 FAILED: a unit serviced today reads due (%). Nothing should be due.', v_reason;
      end if;

      -- Five bookings of ten rental days each, every one of them reaching On Rent.
      for v_n in 1..5 loop
        insert into bookings (client_uuid, booking_no, branch_id, client_id, delivery_type,
                              pickup_at, return_at, created_by, updated_by)
        values (gen_random_uuid(), '99990103' || v_n::text, v_branch, v_client, 'Babin Delivery',
                now() - make_interval(days => 20 - v_n), now() - make_interval(days => 10 - v_n), v_actor, v_actor)
        returning id into v_booking;

        insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
        values (gen_random_uuid(), v_booking, 'Equipment', v_product, '0103 probe line', 1, 10, 0, v_actor)
        returning id into v_line;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (gen_random_uuid(), v_line, v_unit, 1, v_actor);

        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Quote', 'Booked', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Booked', 'Packed', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'Packed', 'On Rent', v_actor, 'Owner', now() - interval '30 days');
        insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
        values (gen_random_uuid(), v_booking, v_branch, 'On Rent', 'Returned', v_actor, 'Owner', now() - interval '30 days');
      end loop;

      select due_reason, rental_days_since_service into v_reason, v_rental
        from product_units_service_v where unit_id = v_unit;

      if v_rental <> 50 then
        raise exception 'POST-CONDITION 5 FAILED: five bookings of ten rental days each counted as % rental days, not 50.', v_rental;
      end if;
      if v_reason is distinct from 'usage' then
        raise exception 'POST-CONDITION 5 FAILED: 50 rental days against a 40-day usage interval reads %, not ''usage''. Whichever comes first (R-28).', coalesce(v_reason, 'not due');
      end if;

      -- A CORRECTIVE job does not reset the clock. Fixing a fault is not a service.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-B', v_unit, 'Repair', '0103 probe: a repair, not a service', 'Completed', current_date, now(), v_actor);

      select due_reason into v_reason from product_units_service_v where unit_id = v_unit;
      if v_reason is distinct from 'usage' then
        raise exception 'POST-CONDITION 5 FAILED: a completed Repair reset the service clock. Only a Preventive Service does.';
      end if;

      -- A completed PREVENTIVE job does.
      insert into maintenance_records
        (client_uuid, record_no, product_unit_id, maintenance_type, description, status, scheduled_date, completed_at, created_by)
      values (gen_random_uuid(), 'MNT-0103-C', v_unit, 'Preventive Service', '0103 probe: the service', 'Completed', current_date, now(), v_actor);

      select due_reason, rental_days_since_service into v_reason, v_rental
        from product_units_service_v where unit_id = v_unit;
      if v_rental <> 0 then
        raise exception 'POST-CONDITION 5 FAILED: a completed Preventive Service left % rental days on the counter, not 0.', v_rental;
      end if;
      if v_reason is not null then
        raise exception 'POST-CONDITION 5 FAILED: a serviced unit still reads due (%).', v_reason;
      end if;

      v_ran := true;
      raise exception using errcode = 'P0001', message = '__0103_rollback_probe__';
    end if;
  exception when others then
    if sqlerrm <> '__0103_rollback_probe__' then
      raise;
    end if;
  end;

  if v_ran then
    raise notice '0103 post-conditions passed, behavioural half included: a model with no plan never badges, 50 rental days against a 40-day interval reads ''usage'' although the calendar has 40 days to run, a Repair does not reset the clock and a Preventive Service does. The view is money-free and not writable.';
  else
    raise notice '0103 post-conditions passed (structural only — this database had no unit to probe with).';
  end if;
end;
$chk$;

commit;

-- >>> END 0103_preventive_maintenance.sql <<<

-- >>> START 0104_reservation_conflicts_are_recorded.sql <<<
-- =============================================================================
-- 0104_reservation_conflicts_are_recorded.sql — 8 Sep 2026
--
-- STAGE_0.md §S0-6 step 5, which `0100` did not build: the table that records a
-- reservation the database could NOT write because something already holds the
-- asset over an overlapping window.
--
-- ## The gap this closes
--
-- `0100`'s backfill inserts each hold with `on conflict do nothing` (0100:425,
-- 0100:450) — correct, because a collision there means the data already
-- contained a double booking and the migration must still land. It collects the
-- skipped bookings into `v_skipped` and prints them:
--
--     raise notice '0100 backfill: % booking(s) could NOT be backfilled — they
--     overlap something already held, which means the data contains a double
--     booking that predates this constraint: %'
--
-- That notice is the only record, and it exists for as long as somebody is
-- looking at the console. Once the apply finishes, the one question worth
-- answering — *which bookings are double-booked right now* — has no answer
-- anywhere in the database.
--
-- ## What the live apply actually found: nothing
--
-- Measured on production after `0100` landed (ledger `20260908153919`), before
-- writing this file:
--
--     92 holds live, 0 released
--     every active booking's unit count == its live hold count   (0 rows differ)
--     3 active bookings hold nothing — 896, 825, 894 — and all three have
--       ZERO lines and ZERO units: empty shells from the half-finished Booqable
--       import, so there was nothing to reserve
--
-- So the backfill dropped nothing and this table lands empty. That is the
-- honest outcome and it is recorded here rather than presented as a fix for a
-- problem that existed. What this buys is the next environment: a restored
-- backup, a staging refresh, or a second Booqable import, where the same silent
-- path runs against dirtier data.
--
-- ## Why a function and not another one-shot block
--
-- `0100`'s detection lived inside its backfill loop and died with it. Here it is
-- `record_reservation_conflicts()`, callable any time — after a restore, after
-- an import, or from a cron — so the answer can be re-derived instead of having
-- had to be captured. The migration calls it once and reports the count.
--
-- It is deliberately NOT wired to a trigger. The forward path already refuses:
-- `reservations_follow_stage_transition()` inserts WITHOUT `on conflict`, so a
-- collision raises and the stage transition fails (R-26). Nothing new can be
-- silently dropped; only bulk paths that pre-date the constraint can, and those
-- are run by hand.
--
-- ## Law 3
--
-- A conflict is RESOLVED, never deleted — `resolved_at` / `resolved_by` /
-- `resolution_note`, with the delete backstop naming "Resolve" as the terminal
-- action. The row that says two bookings wanted one camera is exactly the row
-- somebody will want six months later.
--
-- N-5: NOT applied to live by Claude.
-- =============================================================================

begin;

create table if not exists reservation_backfill_conflicts (
  id                  uuid        not null default gen_random_uuid() primary key,
  -- Law 8 — every write carries a client-generated UUID; duplicates rejected.
  client_uuid         uuid        not null default gen_random_uuid(),

  -- The demand that could not be met.
  booking_id          uuid        not null references bookings (id),
  booking_line_id     uuid        references booking_lines (id),
  asset_id            uuid        not null references product_units (id),
  period              tstzrange   not null,

  -- The hold that stood in its way. Nullable: the blocking row can itself be
  -- released later, and this record must survive that.
  blocking_booking_id uuid        references bookings (id),
  blocking_booking_no text,

  -- Provenance. 'backfill' = found by this migration's first run; anything else
  -- names the run that found it, so two detections are distinguishable.
  detected_at         timestamptz not null default now(),
  detected_by         text        not null default 'record_reservation_conflicts',

  -- Law 3: the terminal action is Resolve.
  resolved_at         timestamptz,
  resolved_by         uuid        references users (id),
  resolution_note     text,

  constraint reservation_backfill_conflicts_client_uuid_key unique (client_uuid),
  constraint reservation_backfill_conflicts_resolved_needs_note
    check (resolved_at is null or (resolved_by is not null and length(coalesce(resolution_note, '')) >= 10))
);

comment on table reservation_backfill_conflicts is
  'A booking that wanted an asset something else already held over an overlapping '
  'window, so no reservation could be written for it. Filled by '
  'record_reservation_conflicts(); STAGE_0.md S0-6 step 5, which 0100 left unbuilt. '
  'Every row is a real double booking in the data. Resolve on the Rentals screen; '
  'nothing here is deleted.';

comment on column reservation_backfill_conflicts.blocking_booking_no is
  'Denormalised on purpose: the operator needs the number the screens show, and '
  'this row must stay readable after the blocking hold is released.';

/*
 * One unresolved row per (booking, asset). Re-running the detection must not
 * pile up duplicates of a conflict nobody has dealt with yet; once resolved, a
 * fresh occurrence is a new row, because it is a new event.
 */
create unique index if not exists reservation_backfill_conflicts_open_once
  on reservation_backfill_conflicts (booking_id, asset_id)
  where resolved_at is null;

drop trigger if exists trg_reservation_backfill_conflicts_reject_delete on reservation_backfill_conflicts;
create trigger trg_reservation_backfill_conflicts_reject_delete
  before delete on reservation_backfill_conflicts
  for each row execute function reject_delete_nothing_is_deleted('Resolve');

-- -----------------------------------------------------------------------------
-- The detection, re-runnable.
-- -----------------------------------------------------------------------------
create or replace function record_reservation_conflicts(p_detected_by text default 'record_reservation_conflicts')
returns integer
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_found integer := 0;
begin
  /*
   * A demand is a unit assigned to a booking that is live on the floor —
   * Booked, Packed or On Rent, not cancelled — for which no unreleased
   * reservation exists. `0100` writes one hold per assigned unit at the Booked
   * transition, so a missing hold means either the transition predates that
   * trigger or the GiST constraint refused it.
   *
   * Bookings with no lines at all are NOT conflicts. Production has three
   * (896, 825, 894), all empty shells from the Booqable import; they hold
   * nothing because they demand nothing, and filing them here would bury the
   * real rows under noise. The join to booking_line_units excludes them.
   */
  with demand as (
    select b.id as booking_id,
           l.id as booking_line_id,
           u.asset_id,
           tstzrange(b.pickup_at, b.return_at, '[)') as period
    from bookings b
    join booking_lines l      on l.booking_id = b.id
    join booking_line_units u on u.booking_line_id = l.id
    where b.stage in ('Booked', 'Packed', 'On Rent')
      and b.cancelled_at is null
      and u.asset_id is not null
      and not exists (
        select 1 from inventory_reservations r
        where r.booking_id = b.id
          and r.asset_id = u.asset_id
          and r.released_at is null
      )
  ),
  blamed as (
    select d.*,
           (select r.booking_id from inventory_reservations r
             where r.asset_id = d.asset_id
               and r.released_at is null
               and r.period && d.period
             limit 1) as blocking_booking_id
    from demand d
  )
  insert into reservation_backfill_conflicts
    (booking_id, booking_line_id, asset_id, period, blocking_booking_id, blocking_booking_no, detected_by)
  select bl.booking_id, bl.booking_line_id, bl.asset_id, bl.period, bl.blocking_booking_id,
         (select bb.booking_no from bookings bb where bb.id = bl.blocking_booking_id),
         p_detected_by
  from blamed bl
  /* Index inference, not `on constraint`: the target is a PARTIAL unique index,
     and Postgres will not accept an index name there. The predicate below must
     stay identical to the index's, or the inference silently fails to match. */
  on conflict (booking_id, asset_id) where resolved_at is null do nothing;

  get diagnostics v_found = row_count;
  return v_found;
end;
$$;

comment on function record_reservation_conflicts(text) is
  'Re-derives every unmet reservation demand and records it. Safe to re-run: one '
  'open row per (booking, asset). Run after a restore, a Booqable import, or any '
  'bulk path that inserts holds with `on conflict do nothing`.';

-- -----------------------------------------------------------------------------
-- RLS. Read-only to the app: this table is written by the function above and
-- resolved by an operator, never inserted from a browser.
-- -----------------------------------------------------------------------------
alter table reservation_backfill_conflicts enable row level security;

drop policy if exists reservation_backfill_conflicts_staff_read on reservation_backfill_conflicts;
create policy reservation_backfill_conflicts_staff_read on reservation_backfill_conflicts
  for select to authenticated
  using (auth_is_staff());

/*
 * Resolving is an Owner/Admin/Manager act — it asserts that two bookings over
 * one camera have been sorted out on the floor. Coordinator is deliberately
 * absent: B-1, and the narrower set can be widened by one ruling if the desk
 * turns out to own this.
 */
drop policy if exists reservation_backfill_conflicts_resolve on reservation_backfill_conflicts;
create policy reservation_backfill_conflicts_resolve on reservation_backfill_conflicts
  for update to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

grant select, update on reservation_backfill_conflicts to authenticated;

-- -----------------------------------------------------------------------------
-- Run it once, and say what it found.
-- -----------------------------------------------------------------------------
do $$
declare
  v_found  integer;
  v_open   integer;
  v_holds  integer;
begin
  v_found := record_reservation_conflicts('0104 first run');
  select count(*) into v_open  from reservation_backfill_conflicts where resolved_at is null;
  select count(*) into v_holds from inventory_reservations where released_at is null;

  if v_open = 0 then
    raise notice
      '0104: no unmet reservation demand. % live hold(s), and every assigned unit on a '
      'Booked/Packed/On Rent booking has one. The table is empty and that is the correct result.',
      v_holds;
  else
    raise notice
      '0104: % conflict(s) recorded, % open. EVERY ONE IS A REAL DOUBLE BOOKING already in the '
      'data — two bookings over one asset on overlapping dates. Resolve them on the Rentals '
      'screen before the floor meets them.', v_found, v_open;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Post-conditions. The detection must find a conflict that exists, and must not
-- invent one that does not — a recorder that reports nothing is indistinguishable
-- from a clean database until the day it matters.
-- -----------------------------------------------------------------------------
do $$
declare
  v_asset    uuid;
  v_b1       uuid;
  v_b2       uuid;
  v_line     uuid;
  v_before   integer;
  v_after    integer;
  v_blamed   uuid;
begin
  select count(*) into v_before from reservation_backfill_conflicts;

  /*
   * Build the situation the table exists for, entirely inside this block, and
   * roll it back: two bookings, one asset, overlapping windows, only one hold.
   * Skipped where the corpus cannot supply the parts — the assertion is then
   * carried by check:lifecycle L3, which seeds its own world.
   */
  select u.asset_id, l.booking_id, l.id
    into v_asset, v_b1, v_line
  from booking_line_units u
  join booking_lines l on l.id = u.booking_line_id
  join inventory_reservations r on r.asset_id = u.asset_id and r.booking_id = l.booking_id
  where u.asset_id is not null and r.released_at is null
  limit 1;

  select b.id into v_b2
  from bookings b
  where b.id <> v_b1 and b.stage in ('Booked', 'Packed', 'On Rent') and b.cancelled_at is null
  limit 1;

  if v_asset is null or v_b2 is null then
    raise notice
      '0104: the corpus here has no held asset plus a second live booking, so the behavioural '
      'probe was skipped. The detection is exercised by check:lifecycle L3.';
    return;
  end if;

  begin
    -- A second booking demanding the same asset, with no hold of its own.
    insert into booking_line_units (client_uuid, booking_line_id, asset_id)
    select gen_random_uuid(), l2.id, v_asset
    from booking_lines l2 where l2.booking_id = v_b2 limit 1;

    if not found then
      raise notice '0104: the second booking has no lines to hang a unit on; probe skipped.';
      raise exception using errcode = 'undefined_object';  -- unwind to the handler
    end if;

    perform record_reservation_conflicts('0104 post-condition');
    select count(*) into v_after from reservation_backfill_conflicts;

    if v_after <= v_before then
      raise exception
        'POST-CONDITION FAILED: a second booking demanding a held asset was not recorded as a conflict.';
    end if;

    select blocking_booking_id into v_blamed
    from reservation_backfill_conflicts
    where booking_id = v_b2 and asset_id = v_asset and resolved_at is null;

    if v_blamed is distinct from v_b1 then
      raise exception
        'POST-CONDITION FAILED: the conflict was recorded but blames %, not the booking that holds the asset (%).',
        coalesce(v_blamed::text, 'nobody'), v_b1;
    end if;

    raise notice '0104 verified: an unmet demand is recorded, and it names the booking holding the asset.';
    raise exception using errcode = 'undefined_object';  -- unwind; nothing here is kept
  exception when others then
    /*
     * Everything above is a probe. Whether it asserted or skipped, none of it
     * may survive: this migration must not leave a manufactured unit or a
     * manufactured conflict in the data it is trying to describe.
     *
     * A plpgsql BEGIN…EXCEPTION block is a savepoint, so raising here rolls the
     * whole probe back — the manufactured unit and the conflict rows with it.
     * There is deliberately no DELETE: the Law 3 backstop installed above would
     * refuse one, and a cleanup that needs a hole in the law is the wrong
     * cleanup. Unwinding leaves nothing to clean.
     */
    null;
  end;
exception when others then
  raise notice '0104: post-condition could not run here (%); the detection is covered by check:lifecycle L3.', sqlerrm;
end $$;

commit;

-- >>> END 0104_reservation_conflicts_are_recorded.sql <<<

-- >>> START 0105_stage_gate_requires_floor_rows.sql <<<
-- =============================================================================
-- Migration 0105: Stage gate requires floor rows (L6, Stage 1)
--
-- Postgres enforces that operational stage moves cannot skip floor records.
-- Moving to 'Packed' requires at least one 'Packing' session in operation_sessions.
-- Moving to 'On Rent' requires at least one 'Packing' session and at least one
-- 'Handover' session in operation_sessions.
--
-- Preserves R-06 (Handover money warning/override) and R-07 (Close hard block).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function validate_booking_gates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit_pending    numeric(14,2) := 0;
  v_rental_outstanding numeric(14,2) := 0;
  v_reason             text;
  v_actor              uuid;
  v_branch             uuid;
begin
  -- 1. Packed gate (transition to 'Packed')
  if NEW.stage = 'Packed' and (OLD.stage is null or OLD.stage < 'Packed') then
    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Packing'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach Packed without a Packing session.', NEW.id;
    end if;
  end if;

  -- 2. Handover gate (transition to 'On Rent')
  if NEW.stage = 'On Rent' and (OLD.stage is null or OLD.stage < 'On Rent') then
    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Packing'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach On Rent without a Packing session.', NEW.id;
    end if;

    if not exists (
      select 1 from operation_sessions
      where booking_id = NEW.id and operation = 'Handover'
    ) then
      raise exception 'Gate Check Failure: booking % cannot reach On Rent without a Handover session.', NEW.id;
    end if;

    -- R-06: WARN, do not block on money if override reason is provided.
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');

    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a '
          'pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded '
          'against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      v_actor  := nullif(btrim(coalesce(current_setting('app.stage_actor_id',  true), '')), '')::uuid;
      v_branch := nullif(btrim(coalesce(current_setting('app.stage_branch_id', true), '')), '')::uuid;

      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.id, 'Approve', v_actor, v_branch, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           OLD.stage,
          'to_stage',             NEW.stage
        )
      );
    end if;
  end if;

  -- 3. Close gate (transition to 'Closed') — R-07: STAYS A HARD BLOCK.
  if NEW.stage = 'Closed' and (OLD.stage is null or OLD.stage < 'Closed') then
    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.id and status not in ('Void');
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_rental_outstanding > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled invoices.';
    end if;

    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.id;
    v_deposit_pending := coalesce(v_deposit_pending, 0);

    if v_deposit_pending > 0 then
      raise exception 'Gate Check Failure: Cannot Close booking with unsettled security deposit.';
    end if;
  end if;

  return NEW;
end;
$$;

commit;

-- >>> END 0105_stage_gate_requires_floor_rows.sql <<<

-- Reset migration probe session setting
select set_config('app.in_create_booking', 'off', false);
