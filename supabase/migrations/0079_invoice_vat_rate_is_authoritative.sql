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
  v_vat := round(v_taxable * v_vat_rate, 2);   -- was: round(v_taxable * 0.13, 2)
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
