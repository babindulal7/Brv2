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
