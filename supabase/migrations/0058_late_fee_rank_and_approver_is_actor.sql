-- =============================================================================
-- 0058 — The two follow-ups 0057 named, closed.
--
--   1. Late-fee waiver approval carries a rank in the database.
--   2. `approved_by` must BE the session that approved, on both finding tables.
--
-- Neither is a new ruling. (1) is `lib/lateFee.ts:26` — "Any staff member may
-- raise a waiver; a Manager or Owner must approve it" — made enforceable. (2)
-- closes the hole 0057 stated in its own §3: the CHECK requires `approved_by`
-- be non-null, and nothing required it be the person acting.
--
-- NOT APPLIED. `CLAUDE.md`: never apply a migration to a live Supabase project
-- without explicit approval. Review, then apply against 0057.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Late-fee waiver rank — Owner or Manager, with NO threshold
--
-- Deliberately unlike `auth_can_approve_damage`, which takes a charge and bands
-- at Rs 25,000. `WAIVER_NEEDS_APPROVER = true` in `lib/lateFee.ts` is
-- unconditional: every waiver needs an approver whatever its size, because
-- waiving is giving money away and the DIRECTION is what makes it an approval,
-- not the amount. Taking a `numeric` here to look symmetrical with 0057 would
-- imply a threshold that the rule does not have.
-- -----------------------------------------------------------------------------
create or replace function auth_can_approve_late_fee_waiver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_user_role() in ('Owner', 'Manager');
$$;

comment on function auth_can_approve_late_fee_waiver is
  'Late-fee waiver rank: Owner or Manager, no threshold. Mirrors lib/rbac.canApproveLateFeeWaiver '
  'and the rule already stated at lib/lateFee.ts:26. Unconditional by design - WAIVER_NEEDS_APPROVER '
  'is true for every waiver regardless of amount.';

drop policy if exists late_fee_findings_approval_rank on late_fee_findings;

create policy late_fee_findings_approval_rank on late_fee_findings
  as restrictive
  for update
  using (true)
  with check (
    approval_state <> 'Approved'::damage_approval_state
    or auth_can_approve_late_fee_waiver()
  );

comment on policy late_fee_findings_approval_rank on late_fee_findings is
  'RESTRICTIVE so it ANDs with late_fee_findings_all (permissive, ALL) rather than widening it. '
  'Gates only an update whose resulting row is Approved.';


-- -----------------------------------------------------------------------------
-- 2. `approved_by` must BE the approver
--
-- 0057 §3 stated this gap and did not close it: a session holding the rank could
-- still record somebody else's name in `approved_by`, and every downstream
-- reader — the audit trail, any "approved by" line on a screen — would believe
-- it. An approval that names the wrong person is worse than one that names
-- nobody, because it is not obviously missing.
--
-- A TRIGGER, not a policy. RLS `WITH CHECK` sees only the NEW row, so it can
-- test `approved_by = auth_user_id()` — but it cannot tell an approval being
-- MADE from a row that merely still carries an older approval. Every unrelated
-- update to an already-approved row would then have to re-satisfy it, and a
-- different Manager editing a description on a finding the Owner approved would
-- be refused. The trigger compares OLD to NEW and fires only on the transition.
--
-- `auth_user_id()` did NOT exist before this file — checked against `pg_proc`,
-- which held only `auth_user_role()` and `auth_is_staff()`. It is created below
-- with the identity expression lifted VERBATIM out of `auth_user_role`'s own
-- body, rather than a re-derived one:
--
--   coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
--
-- Two sources for "who is this session" that drift apart is the failure this
-- avoids — the role check and the identity check would then disagree about the
-- same request, and the row would record one while the policy judged the other.
-- -----------------------------------------------------------------------------

create or replace function auth_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  );
$$;

comment on function auth_user_id is
  'The acting user id. Body is lifted verbatim from auth_user_role() so the identity this '
  'returns and the role that function resolves are the same fact about the same request. '
  '0041 sets app.current_user_id via the PostgREST db_pre_request hook; auth.uid() is the fallback.';

create or replace function enforce_approver_is_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth_user_id();
begin
  -- Only the moment of approval is governed.
  if new.approval_state = 'Approved'::damage_approval_state
     and old.approval_state is distinct from 'Approved'::damage_approval_state then

    if v_actor is null then
      raise exception
        'An approval must be attributable, and this session resolves to no user. Nothing was approved.'
        using errcode = 'check_violation';
    end if;

    if new.approved_by is distinct from v_actor then
      raise exception
        'approved_by must be the session performing the approval. Recording somebody else as the approver is not an approval, it is an assertion about them.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

comment on function enforce_approver_is_actor is
  'Fires only on the Pending/Rejected -> Approved transition, so unrelated edits to an '
  'already-approved row are untouched. Closes the gap 0057 section 3 named: the CHECK '
  'requires approved_by be non-null, not that it be the actor.';

drop trigger if exists trg_damage_approver_is_actor on damage_findings;
create trigger trg_damage_approver_is_actor
  before update on damage_findings
  for each row execute function enforce_approver_is_actor();

drop trigger if exists trg_late_fee_approver_is_actor on late_fee_findings;
create trigger trg_late_fee_approver_is_actor
  before update on late_fee_findings
  for each row execute function enforce_approver_is_actor();


-- -----------------------------------------------------------------------------
-- 3. What this still does NOT do
--
-- · `LateFeePanel.tsx` collects `approverName` as free-typed TEXT and
--   `validateWaiver` checks only that it is non-empty. This migration governs
--   the SESSION's rank and the `approved_by` column; it cannot govern a typed
--   string that never reaches the database as an identity.
--   TODO(decision): whether that field is replaced by the session's identity, or
--   kept as a second countersignature beside it. Recorded in `lib/rbac`'s
--   `canApproveLateFeeWaiver` too, so the question sits next to the rule.
--
-- · No back-fill. Rows already 'Approved' keep whatever `approved_by` they hold.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Post-conditions — both policies restrictive, both triggers present
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'late_fee_findings'
      and p.polname = 'late_fee_findings_approval_rank'
      and p.polpermissive = false
  ) then
    raise exception 'late_fee_findings_approval_rank is missing or PERMISSIVE - it would grant what it appears to restrict.';
  end if;

  if (select count(*) from pg_trigger
        where tgname in ('trg_damage_approver_is_actor', 'trg_late_fee_approver_is_actor')
          and not tgisinternal) <> 2 then
    raise exception 'Both approver-is-actor triggers must exist; one alone leaves the other table attributable to anyone.';
  end if;

  -- The trigger is worthless if the identity function it calls is missing, and a
  -- missing function fails at approval time rather than here. Prove it resolves.
  if not exists (select 1 from pg_proc where proname = 'auth_user_id') then
    raise exception 'auth_user_id() is missing - enforce_approver_is_actor would fail on the first approval, not now.';
  end if;
end $$;
