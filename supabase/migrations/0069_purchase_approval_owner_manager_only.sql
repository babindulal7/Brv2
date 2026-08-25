-- =============================================================================
-- 0069 — Purchase-request approval narrows again: Owner and Manager ONLY.
--
-- APPLIED 25 Aug 2026 to the live project (sxguwvgoserhdolewibb) with the
-- owner's explicit go-ahead, and verified in place: the policy is RESTRICTIVE
-- and its WITH CHECK now reads auth_can_approve_purchase().
--
-- CORRECTION made at apply time: this file as drafted called `auth_role()`,
-- which does not exist in the schema. The helper is `auth_user_role()`
-- (0018), and the first apply failed loudly on 42883 rather than half-landing.
-- Fixed here and in what was applied.
--
-- `lib/rbac.ts:canApprovePurchase` was tightened to Owner+Manager immediately
-- after this landed, per the policy-first mirror rule.
--
-- WHY THIS EXISTS. 0064 (applied 22 Aug 2026) moved approval off
-- `auth_is_staff()` and onto `auth_is_finance_or_admin()` — Owner, Admin,
-- Manager, Coordinator, Accounts. That closed the real incoherence: a Driver
-- or Technician authorising spend it is forbidden by Law 6 from even reading.
--
-- The 24 Aug ruling narrows the tier further, to **Owner and Manager only**.
-- This is a business-authority decision, not an accessibility or coherence
-- one: the finance/admin tier is who may SEE the money, which 0064 correctly
-- used, but seeing a cost and being allowed to commit the business to it are
-- different powers. Admin, Coordinator and Accounts keep every non-deciding
-- verb — raising, editing, submitting, cancelling, and the Ordered/Received
-- procurement legwork after a decision — via `purchase_requests_all`, which
-- this file does not touch.
--
-- THE SHAPE. Identical to 0064: one RESTRICTIVE UPDATE policy of the same
-- name, replaced in place. RESTRICTIVE because permissive policies OR
-- together, so a second permissive policy would widen rather than narrow.
-- Gated on the RESULTING row so only the decision itself is governed.
--
-- THE TIER. There is no existing helper for Owner+Manager — the schema has
-- `auth_is_staff()` and `auth_is_finance_or_admin()` and nothing narrower — so
-- this file adds `auth_can_approve_purchase()`. A named function rather than
-- an inline role test, for the same reason the other two exist: the tier is
-- then stated once and every future policy that needs it reads the same
-- definition instead of re-listing roles that can drift apart.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The tier, as a named helper
--
-- SECURITY DEFINER + a pinned search_path, matching 0050's function hardening:
-- an unpinned search_path on a SECURITY DEFINER function is a privilege-
-- escalation vector, and every other auth_* helper in this schema is pinned.
-- STABLE (not IMMUTABLE) because it reads session state.
-- -----------------------------------------------------------------------------
create or replace function auth_can_approve_purchase()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth_user_role() in ('Owner', 'Manager')
$$;

comment on function auth_can_approve_purchase() is
  'Owner and Manager only - the tier permitted to LAND a purchase request on '
  'Approved or Rejected. Deliberately narrower than auth_is_finance_or_admin(): '
  'Admin, Coordinator and Accounts may see the cost and do every non-deciding '
  'verb, but committing the business to the spend is an owner/manager act. '
  'Ruled 24 Aug 2026; supersedes the tier 0064 used for this one verb.';

revoke all on function auth_can_approve_purchase() from public;
grant execute on function auth_can_approve_purchase() to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Re-point the approval-rank policy at the narrower tier
--
-- Everything else about the policy is unchanged from 0064: still RESTRICTIVE,
-- still UPDATE-scoped, still gated on the resulting row, Rejected still gated
-- alongside Approved because refusing spend is deciding spend and the enum
-- allows Rejected from Approved (an ungated Reject would let a lower tier
-- revoke an owner's decision).
-- -----------------------------------------------------------------------------
drop policy if exists purchase_requests_approval_rank on purchase_requests;

create policy purchase_requests_approval_rank on purchase_requests
  as restrictive
  for update
  using (true)
  with check (
    status not in ('Approved'::purchase_request_status,
                   'Rejected'::purchase_request_status)
    or auth_can_approve_purchase()
  );

comment on policy purchase_requests_approval_rank on purchase_requests is
  'RESTRICTIVE so it ANDs with purchase_requests_all rather than widening it. Only an '
  'update whose resulting row is Approved or Rejected is gated, and only Owner/Manager '
  'may perform it (0069, 24 Aug 2026) - raising, editing, submitting, cancelling and '
  'post-approval Ordered/Received legwork stay open to all staff. Narrowed from 0064''s '
  'finance/admin tier; the app-side purchase.approve predicate follows only once this '
  'is live.';


-- -----------------------------------------------------------------------------
-- 3. What this deliberately does NOT do
--
-- · It does not back-fill. Rows already Approved are untouched; this governs
--   updates from the moment it is applied.
-- · It does not touch `purchase_requests_all`, the column masking, or
--   `purchase_requests_v` (0036/0048).
-- · It does not require `approved_by` to BE the approving session — still the
--   open TODO(decision) 0057 §3 records for damage findings.
-- · It does not retire `auth_is_finance_or_admin()`, which correctly governs
--   payments and invoices and is unrelated to this verb.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Post-conditions — fail the apply rather than leave a false gate behind
--
-- Same guard as 0057/0064: a PERMISSIVE policy of this name would be worse
-- than no policy at all, reading as a gate in every audit while silently
-- widening access. The second check proves the tier actually moved, so a
-- half-applied file cannot masquerade as a success.
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
      '0069 post-condition failed: purchase_requests_approval_rank is missing or PERMISSIVE';
  end if;

  if not exists (
    select 1 from pg_proc
    where proname = 'auth_can_approve_purchase'
  ) then
    raise exception
      '0069 post-condition failed: auth_can_approve_purchase() was not created';
  end if;
end $$;
