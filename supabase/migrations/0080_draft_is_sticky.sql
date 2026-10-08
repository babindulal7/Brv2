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
