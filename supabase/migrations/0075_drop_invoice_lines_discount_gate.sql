-- =============================================================================
-- 0075 — The discount gate leaves `invoice_lines` too. Babin, 31 Aug 2026.
--
-- ## Why this file exists at all: 0074 was incomplete
--
-- 0074 dropped the gate from `booking_discounts` and `invoices` and was applied
-- to the live project on 31 Aug. It did not name `invoice_lines`, which carried
-- its own independent copy of BOTH halves of Law 10:
--
--   · invoice_lines_discount_cap                            (<= 25)
--   · invoice_lines_discount_over_ten_needs_reason_and_approver
--
-- The result was live for the length of one session and is the exact failure
-- the 31 Aug Layer D spot-check predicted: **a >10% discount was accepted on
-- the booking and refused at invoicing.** Discounting appeared to work right up
-- until billing — the worst possible place to discover a policy disagreement,
-- because by then the booking is out and the client has been quoted.
--
-- This file closes that gap. It is 0074 finished, not a new ruling.
--
-- ## The ruling chain (unchanged, recorded so nobody re-litigates it)
--
--   · Original Law 10: >10% needs reason >=10 chars + named approver; 25% hard
--     cap; no role bypass including Owner. Enforced at the database (0002,
--     0006, 0044) precisely so no app path could differ.
--   · 30 Aug (D3, spec A0): "no discount gate — copy Booqable".
--   · 31 Aug, first confirm: the policies alternative, briefly drafted as 0073,
--     deleted the same session, never applied.
--   · 31 Aug, final word: "don't put any gate on discount."  → 0074.
--   · 31 Aug, on being shown that invoice_lines still gated: "drop invoice
--     lines too."  → this file.
--
-- ## What is removed, what is kept
--
-- REMOVED (the gate):
--   · invoice_lines_discount_cap                            (<= 25)
--   · invoice_lines_discount_over_ten_needs_reason_and_approver
--
-- KEPT (not the gate):
--   · discount_percent >= 0 — a negative discount is a price increase. The
--     R3-1 hole stays closed at the database, on this table as on the others.
--   · discount_percent <= 100 — arithmetic validity, not a cap anyone chose.
--     Above 100% is a negative price.
--   · discount_reason / discount_approved_by columns — optional forever,
--     required never. An operator may still WANT to record why, and the
--     invoice register still shows it when they do.
--   · trg_recalc_invoice_lines — the totals recalculation trigger. Untouched;
--     it has nothing to do with the gate.
--
-- ## Still gated elsewhere, deliberately NOT touched here
--
-- Three <= 25 caps survive because none of them is the per-discount ceremony
-- Babin ruled away, and each would be its own decision:
--
--   · coupons.discount_percent            (> 0 and <= 25)
--   · membership_plans.*_discount_pct     (<= 25)
--   · user_approval_authorities.max_discount_pct (<= 25)
--
-- The first two are the ceiling on a PRODUCT someone configures once, not on
-- what an operator may do at the counter. The third is the definition of a
-- role's authority, which is now vestigial (rbac.ts:canApproveDiscount ignores
-- role) but is not a discount write. Raise them in their own file if wanted.
--
-- ## Applying this
--
-- Approved explicitly by Babin, 31 Aug 2026, in the same session that approved
-- 0074. `invoice_lines` holds 0 rows live, so the drops rewrite nothing and no
-- existing row can violate the looser replacement.
-- =============================================================================

begin;

alter table invoice_lines
  drop constraint if exists invoice_lines_discount_over_ten_needs_reason_and_approver;

alter table invoice_lines
  drop constraint if exists invoice_lines_discount_cap;

alter table invoice_lines
  add constraint invoice_lines_discount_percent_sane
  check (discount_percent >= 0 and discount_percent <= 100);

comment on constraint invoice_lines_discount_percent_sane on invoice_lines is
  'Arithmetic validity, not a gate: negative is a price rise, >100% a negative price. '
  'The 25% cap and the >10% reason+approver ceremony were dropped by 0075, finishing '
  'what 0074 started on booking_discounts and invoices (D3 — no gate on discounts). '
  'Matches booking_discounts_percent_sane and invoices_discount_percent_sane exactly, '
  'which is the point: one rule, three tables, no path that disagrees with another.';

-- ── Post-conditions ──────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  if exists (select 1 from pg_constraint where conname in (
    'invoice_lines_discount_cap',
    'invoice_lines_discount_over_ten_needs_reason_and_approver'
  )) then
    raise exception '0075 post-condition failed: an invoice_lines gate constraint survived the drop';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_lines_discount_percent_sane') then
    raise exception '0075 post-condition failed: the sanity CHECK is missing';
  end if;

  -- The whole point of this file: all three discount-writing tables must now
  -- agree. If they ever disagree again, a discount works on one path and fails
  -- on another, which is what 0074-without-0075 actually did in production.
  select count(*) into n
    from pg_constraint
   where conname in (
     'booking_discounts_percent_sane',
     'invoices_discount_percent_sane',
     'invoice_lines_discount_percent_sane'
   );
  if n <> 3 then
    raise exception
      '0075 post-condition failed: expected all three discount tables to carry the same 0-100 rule, found %', n;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_recalc_invoice_lines' and not tgisinternal
  ) then
    raise exception '0075 post-condition failed: the invoice-line recalculation trigger is gone — it was meant to survive';
  end if;

  raise notice '0075 OK — the gate is off all three discount paths; negative/>100 still refused';
end $$;

commit;
