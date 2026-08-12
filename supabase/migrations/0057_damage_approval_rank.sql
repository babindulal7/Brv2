-- =============================================================================
-- 0057 — Damage sign-off is Owner and Manager only, enforced in the database.
--
-- RULED 12 Aug 2026. `lib/rbac.canApproveDamage(role, requiredApprover)` states
-- the rule in the app; this file is the half that makes it true. Law 6's own
-- wording is the reason both halves exist: "enforced by RLS, not the UI". Until
-- this lands, a session that bypasses the screen can still approve.
--
-- APPLIED 12 Aug 2026, with the user's explicit approval (CLAUDE.md's requirement,
-- asked for and given). Verified after apply, against the live catalogue:
--   · damage_findings_approval_rank exists with polpermissive = FALSE (restrictive)
--     and polcmd = 'w' (UPDATE only)
--   · its WITH CHECK is the intended
--     (approval_state <> 'Approved' OR auth_can_approve_damage(estimated_cost))
--   · damage_findings_all is untouched beside it
--   · auth_can_approve_damage is STABLE + SECURITY DEFINER, keeps the INCLUSIVE
--     `>= 25000.00` boundary, escalates a NULL charge to Owner, and bands
--     ('Owner','Manager') below the threshold
-- Blast radius at apply time was zero: damage_findings held 0 rows, none approved.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The rank test, mirroring `lib/damage.approverFor()`
--
-- The banding is `lib/damage`'s: below Rs 25,000 a Manager may sign off, at or
-- above it the Owner must. The boundary is INCLUSIVE at the top — exactly
-- Rs 25,000 goes to the Owner — matching `approverFor`'s `>=` so the two cannot
-- disagree at the one value where a `>` would open a gap.
--
-- `estimated_cost` is `numeric(14,2)` in RUPEES (0003:458), which is why the
-- literal here is 25000.00 and not the app's paisa `rupees(25000)`. The two
-- express the same figure in the two units this system uses; the conversion
-- happens at the query boundary, never here.
--
-- A NULL `estimated_cost` is treated as Owner-only rather than Manager-approvable.
-- `coalesce(charge, 0)` would send an un-costed finding down the Manager path,
-- which is the fail-OPEN direction: the charge is unknown, so it may be any
-- figure at all. Unknown money escalates.
-- -----------------------------------------------------------------------------
create or replace function auth_can_approve_damage(charge numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when charge is null or charge >= 25000.00 then auth_user_role() = 'Owner'
    else auth_user_role() in ('Owner', 'Manager')
  end;
$$;

comment on function auth_can_approve_damage is
  'Damage sign-off rank, ruled 12 Aug 2026: Owner and Manager only, with the Owner '
  'alone at or above Rs 25,000. Mirrors lib/rbac.canApproveDamage and lib/damage.approverFor. '
  'A NULL charge escalates to Owner - an un-costed finding is not a small one.';


-- -----------------------------------------------------------------------------
-- 2. A RESTRICTIVE policy, so it cannot be OR-ed away
--
-- `damage_findings_all` (0034:44) is PERMISSIVE and grants `auth_is_staff()` for
-- ALL commands. Permissive policies OR together, so adding a second permissive
-- policy here would WIDEN access, not narrow it — the existing one would still
-- admit every staff role on its own.
--
-- `as restrictive` ANDs instead. Both must pass, so this can only subtract.
--
-- Scoped to UPDATE because that is where an approval happens: `approval_state`
-- defaults to 'Pending Approval' on insert (0003:460), so a row cannot arrive
-- already approved without an update. INSERT is deliberately left alone — adding
-- a restrictive INSERT policy would block ordinary damage reporting by the floor
-- roles who are supposed to raise findings.
--
-- The WITH CHECK reads the NEW row: any update whose RESULT is 'Approved' must
-- satisfy the rank. An update that leaves the row Pending, Rejected or anything
-- else is untouched, so editing a description or attaching a photo still works
-- for any staff member.
-- -----------------------------------------------------------------------------
drop policy if exists damage_findings_approval_rank on damage_findings;

create policy damage_findings_approval_rank on damage_findings
  as restrictive
  for update
  using (true)
  with check (
    approval_state <> 'Approved'::damage_approval_state
    or auth_can_approve_damage(estimated_cost)
  );

comment on policy damage_findings_approval_rank on damage_findings is
  'RESTRICTIVE so it ANDs with damage_findings_all rather than widening it. Only an '
  'update whose resulting row is Approved is gated, and only on rank - the named-approver '
  'requirement is already a table CHECK (damage_findings_approved_needs_approver).';


-- -----------------------------------------------------------------------------
-- 3. What this does NOT do, stated so nobody assumes it
--
-- · It does not require that `approved_by` be the session doing the approving.
--   The CHECK `damage_findings_approved_needs_approver` (0003) requires the
--   column be non-null; nothing requires it to equal `auth.uid()`. A session
--   with the rank could still record someone else's name.
--   TODO(decision): whether the approver must BE the actor. If yes, this is a
--   trigger comparing `approved_by` to the resolved session user, not a policy.
--
-- · It does not cover `late_fee_findings`, which reuses `damage_approval_state`
--   (0016:121) and has its own approval flow and its own unruled rank.
--
-- · It does not back-fill. Rows already 'Approved' are untouched; this governs
--   updates from the moment it is applied.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Post-condition — the policy exists and is restrictive
--
-- A permissive policy of this name would be WORSE than none: it would read as a
-- guard in every audit while silently granting the very access it appears to
-- restrict. Fail the apply rather than leave that behind.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'damage_findings'
      and p.polname = 'damage_findings_approval_rank'
      and p.polpermissive = false
  ) then
    raise exception
      'damage_findings_approval_rank is missing or is PERMISSIVE. A permissive policy here '
      'grants what it appears to restrict; refusing to leave it in that state.';
  end if;
end $$;
