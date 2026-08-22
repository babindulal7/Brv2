-- =============================================================================
-- 0064 — Purchase-request approval is the finance/admin tier, not every staff.
--
-- ⚠⚠ NOT APPLIED. Written 22 Aug 2026 (Phase 2 item 2.4b); this file is the
-- policy change `lib/rbac.ts:canWriteSharedTriage`'s own ⚠ note asks for
-- ("change the RLS policy first and let this follow" — PLAN.md §4.29).
-- Apply requires the user's explicit approval per CLAUDE.md. Until it is
-- applied, the rbac predicate deliberately KEEPS mirroring the live (broad)
-- policy — do not tighten the TypeScript ahead of this file landing.
--
-- THE PROBLEM. `purchase_requests_all` (0036:171) grants ALL commands to
-- `auth_is_staff()`. Approving a purchase request is a spend-authorising verb
-- — it is the act that turns an estimate into an order — and under the live
-- policy a Driver or a Technician can perform it. Both roles are money-blind
-- (Law 6, `auth_can_view_money()` = false): they cannot even READ
-- `estimated_unit_cost` / `total_estimated_cost` (masked since 0036), yet
-- they may currently authorise the spend those columns describe. Approving
-- money one is forbidden from seeing is the exact incoherence the audit
-- flagged.
--
-- THE SHAPE. Follows 0057 (`damage_findings_approval_rank`), the house
-- pattern for narrowing one verb on a table whose broad PERMISSIVE policy
-- must survive:
--
--   · A RESTRICTIVE policy, because permissive policies OR together — a
--     second permissive policy here would widen, not narrow.
--   · Scoped to UPDATE, because that is where a decision lands: `status`
--     defaults to 'Draft' on insert (0004:589), and the enum's own comment
--     (0001:633) rules the path forward-only Draft→Submitted→Approved→
--     Ordered→Received, so a row cannot arrive Approved without an update.
--   · Gated on the RESULTING row ('Approved' or 'Rejected'), not on every
--     update — see "what this deliberately leaves open" below.
--
-- THE TIER. `auth_is_finance_or_admin()` — Owner, Admin, Manager,
-- Coordinator, Accounts (0018:20). It is the ladder this schema already uses
-- for money-deciding writes (`payments_insert`, invoice policies), it is
-- exactly `auth_is_staff()` minus the three money-blind staff roles, and it
-- already exists — no new helper, no new tier to keep in sync.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The restrictive approval-rank policy
--
-- WITH CHECK reads the NEW row: any update whose RESULT is Approved or
-- Rejected must be performed by the finance/admin tier. Rejected is gated
-- alongside Approved because it is the same authority exercised in the other
-- direction — refusing spend is deciding spend, and the enum allows Rejected
-- from *Approved* too, which would otherwise let a money-blind role revoke a
-- finance decision.
--
-- What this deliberately leaves open (all still `auth_is_staff()` via
-- `purchase_requests_all`, which is untouched beside this):
--
--   · INSERT — Warehouse initiates PRs operationally (0036:166's own header);
--     raising a request is not authorising it.
--   · UPDATE whose result is Draft / Submitted / Cancelled — the requester
--     editing, submitting or withdrawing their own request.
--   · UPDATE whose result is Ordered / Received — procurement legwork after
--     the approval, which is floor work. Forward-only stage order means a row
--     can only be Ordered if a finance-tier session already made it Approved.
--   · SELECT — row visibility unchanged; the two cost columns stay masked for
--     money-blind roles by 0036's column REVOKE + `purchase_requests_v`.
-- -----------------------------------------------------------------------------
drop policy if exists purchase_requests_approval_rank on purchase_requests;

create policy purchase_requests_approval_rank on purchase_requests
  as restrictive
  for update
  using (true)
  with check (
    status not in ('Approved'::purchase_request_status,
                   'Rejected'::purchase_request_status)
    or auth_is_finance_or_admin()
  );

comment on policy purchase_requests_approval_rank on purchase_requests is
  'RESTRICTIVE so it ANDs with purchase_requests_all rather than widening it. Only an '
  'update whose resulting row is Approved or Rejected is gated - raising, editing, '
  'submitting, cancelling and post-approval Ordered/Received legwork stay open to all '
  'staff. Written 22 Aug 2026 per lib/rbac.ts canWriteSharedTriage''s note (PLAN.md '
  'section 4.29); the app-side purchase.approve predicate follows only once this is live.';


-- -----------------------------------------------------------------------------
-- 2. What this does NOT do, stated so nobody assumes it
--
-- · It does not require `approved_by` to BE the approving session — same open
--   TODO(decision) as 0057 §3 records for damage findings. If ruled yes, that
--   is a trigger comparing `approved_by` to `auth_user_id()`, not a policy.
--
-- · It does not enforce the forward-only Draft→Submitted→Approved→Ordered→
--   Received order itself — the enum comment (0001:633) states it, and stage
--   sequencing is trigger work in this schema (see 0021 for bookings), not
--   policy work. This file gates WHO decides, not WHENCE.
--
-- · It does not back-fill. Rows already 'Approved' are untouched; this
--   governs updates from the moment it is applied.
--
-- · It does not change `purchase_requests_all`, the column masking, or
--   `purchase_requests_v` (0036/0048) in any way.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 3. Post-condition — the policy exists and is RESTRICTIVE
--
-- Same guard as 0057: a permissive policy of this name would be worse than
-- none, reading as a gate in every audit while silently widening access.
-- Fail the apply rather than leave that behind.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'purchase_requests'
      and p.polname = 'purchase_requests_approval_rank'
      and p.polpermissive = false
  ) then
    raise exception
      'purchase_requests_approval_rank is missing or is PERMISSIVE. A permissive policy '
      'here grants what it appears to restrict; refusing to leave it in that state.';
  end if;
end $$;
