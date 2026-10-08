-- =============================================================================
-- 0074 — THE DISCOUNT GATE IS DROPPED. D3, Babin's final word 31 Aug 2026:
--        "don't put any gate on discount."  DRAFT — ⚠ NOT APPLIED.
--
-- ## The ruling chain, so nobody re-litigates it from a stale file
--
--   · Original Law 10: >10% needs reason ≥10 chars + named approver; 25% hard
--     cap; no role bypass including Owner. Enforced at the database (0002,
--     0006, 0044) precisely so no app path could differ.
--   · 30 Aug (D3, spec A0): Babin ruled "no discount gate — copy Booqable".
--   · 31 Aug, first confirm: the policies alternative was accepted and
--     briefly drafted (0073 — deleted the same session, never applied).
--   · 31 Aug, final word: "don't put any gate on discount." This file.
--
-- The app half landed in the same change set (lib/discount.ts, lib/money.ts
-- discountGate, lib/rbac.ts canApproveDiscount, the two Tools calculators) —
-- the RUN_PROMPT's rule was that a half-removed gate (UI open, DB closed) is
-- the worst state. ⚠ Note the ORDER OF OPERATIONS that creates: until this
-- migration is applied, the app no longer refuses what the database still
-- does, so a >10%-no-reason discount write fails LOUDLY with a constraint
-- error rather than being caught in the form. Accepted knowingly: today no
-- screen writes booking_discounts against the live project (the creation
-- path is Phase 2-blocked), so the window is theoretical — but apply this
-- promptly once approved.
--
-- ## What is removed, what is kept
--
-- REMOVED (the gate):
--   · booking_discounts_hard_cap                       (percent <= 25)
--   · booking_discounts_over_ten_needs_reason_and_approver
--   · invoices_discount_cap                            (<= 25)
--   · invoices_discount_over_ten_needs_reason_and_approver
--   · the stacked-25%-cap and cumulative-ceremony branches of
--     enforce_booking_discount_stacking()
--
-- KEPT (not the gate):
--   · percent >= 0 everywhere — a negative discount is a price increase
--     (the R3-1 hole stays closed at the database too).
--   · percent <= 100, single and stacked — a discount above 100% is a
--     negative price. Arithmetic validity, not a cap anyone chose.
--   · The exclusive-source stacking matrix (Student / College / Named-client
--     rates stack with nothing) — that is 0002's stacking-matrix rule, a
--     separate ruling this one does not touch.
--   · reason / approver_id columns — optional forever, required never. An
--     operator may still WANT to record why.
--
-- ## Applying this
--
-- ⚠ Needs explicit approval per CLAUDE.md. Constraint drops rewrite nothing;
-- existing rows all satisfy the looser checks by construction.
-- =============================================================================

begin;

-- ── booking_discounts ────────────────────────────────────────────────────────

alter table booking_discounts
  drop constraint if exists booking_discounts_over_ten_needs_reason_and_approver;

alter table booking_discounts
  drop constraint if exists booking_discounts_hard_cap;

alter table booking_discounts
  add constraint booking_discounts_percent_sane check (percent >= 0 and percent <= 100);

comment on constraint booking_discounts_percent_sane on booking_discounts is
  'Arithmetic validity, not a gate: negative is a price rise, >100% a negative price. '
  'The old 25% cap and >10% reason+approver ceremony were dropped by 0074 (D3, ruled '
  '30 Aug 2026, Babin''s final word 31 Aug: no gate on discounts).';

-- ── invoices — the 0006 mirror ───────────────────────────────────────────────

alter table invoices
  drop constraint if exists invoices_discount_over_ten_needs_reason_and_approver;

alter table invoices
  drop constraint if exists invoices_discount_cap;

alter table invoices
  add constraint invoices_discount_percent_sane check (discount_percent >= 0 and discount_percent <= 100);

-- ── the stacking trigger, rewritten ──────────────────────────────────────────
-- The 25% stacked cap and the cumulative >10% ceremony go with the gate. The
-- exclusive-source matrix stays (0002:625's stacking matrix — a different
-- ruling), and the stacked total gains the same 100% arithmetic ceiling as the
-- single row, for the same reason.

create or replace function enforce_booking_discount_stacking()
returns trigger
language plpgsql
as $$
declare
  v_existing_sum numeric(5,2);
  v_total numeric(5,2);
  v_exclusive_sources discount_source[] := array['Student', 'College', 'Named-client rates']::discount_source[];
begin
  select coalesce(sum(percent), 0) into v_existing_sum
  from booking_discounts
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  v_total := v_existing_sum + NEW.percent;

  -- Arithmetic validity only (0074 — the gate is gone). A stacked total past
  -- 100% prices the booking negative, which is not a discount of any size.
  if v_total > 100 then
    raise exception 'This booking''s discounts would total % percent stacked, which prices it below zero. A discount above 100 percent is a negative price, not a discount.',
      v_total;
  end if;

  if NEW.discount_source = any(v_exclusive_sources) then
    if v_existing_sum > 0 then
      raise exception '% does not stack with any other discount on the same booking, but this booking already has another discount row applied.', NEW.discount_source;
    end if;
  elsif exists (
    select 1 from booking_discounts
    where booking_id = NEW.booking_id and id <> NEW.id and discount_source = any(v_exclusive_sources)
  ) then
    raise exception 'This booking already has a % discount, which does not stack with any other discount.',
      (select discount_source from booking_discounts where booking_id = NEW.booking_id and id <> NEW.id and discount_source = any(v_exclusive_sources) limit 1);
  end if;

  return NEW;
end;
$$;

-- The trigger itself (before insert or update, from 0044) is unchanged and
-- picks up the replaced function body.

-- ── Post-conditions ──────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_constraint where conname in (
    'booking_discounts_hard_cap',
    'booking_discounts_over_ten_needs_reason_and_approver',
    'invoices_discount_cap',
    'invoices_discount_over_ten_needs_reason_and_approver'
  )) then
    raise exception '0074 post-condition failed: a gate constraint survived the drop';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'booking_discounts_percent_sane')
     or not exists (select 1 from pg_constraint where conname = 'invoices_discount_percent_sane') then
    raise exception '0074 post-condition failed: a sanity CHECK is missing';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_booking_discounts_stacking' and not tgisinternal
  ) then
    raise exception '0074 post-condition failed: the stacking trigger (exclusivity matrix) is gone — it was meant to survive';
  end if;

  raise notice '0074 OK — discount gate dropped; negative/>100 refusals and the exclusivity matrix remain';
end $$;

commit;
