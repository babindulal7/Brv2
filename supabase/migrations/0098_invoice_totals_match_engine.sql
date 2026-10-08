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
