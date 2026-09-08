-- =============================================================================
-- 0101_staff_roles_are_assignable.sql — 8 Sep 2026
--
-- **No role can be assigned to anybody, by anybody, including the Owner.**
-- `docs/PERMISSIONS.md` §16 V-14, and one of the two findings §16.3 still lists
-- as a LIVE defect rather than a documentation error.
--
-- ## The defect, read off production rather than reasoned about
--
-- `pg_policy` for `public.users`, live project `sxguwvgoserhdolewibb`, 8 Sep:
--
--     polname            polcmd  roles
--     users_select_own   r       PUBLIC        <- the only row
--
-- One policy. `SELECT`. `relrowsecurity` is on. So there is no INSERT, UPDATE
-- or DELETE path through PostgREST for any role, and §12.2 D-8 — *"Owner grants
-- Manager → succeeds"* — cannot happen and never could.
--
-- It is not a grant problem, which is the thing that makes it easy to misread:
--
--     has_table_privilege('authenticated','public.users','UPDATE')          -> true
--     has_column_privilege('authenticated','users','primary_role','UPDATE') -> true
--
-- The grants are wide open. RLS refuses the write by having nothing to say
-- about it. That matters for the shape of the fix: **anything that opens a
-- write here is the whole gate**, because the grant layer underneath is not
-- gating anything.
--
-- ## Why two RPCs and NOT an `UPDATE` policy on `users`
--
-- The obvious fix is `create policy users_update_owner on users for update
-- using (auth_user_role() = 'Owner')`. It is rejected, for three reasons in
-- increasing order of weight:
--
--  1. **It is far wider than the ruling.** With the column grants above already
--     true, an UPDATE policy makes every column writable — `email`, `id`,
--     `branch_id`, `client_uuid`, `employee_code`. `PATCH /rest/v1/users?id=eq.X`
--     with any body at all would be honoured. The decision being implemented is
--     "the Owner may assign a role and deactivate an account", not "the Owner
--     may rewrite the identity table".
--
--  2. **The invariant cannot live in a policy.** "At least one active Owner must
--     remain" is a statement about the *set*, not about the row being written,
--     and a `with check` sees only the row. Demoting the last Owner passes any
--     row-local predicate and locks every future role change out of the system
--     permanently — the write path being Owner-only is exactly what makes that
--     unrecoverable. It needs a function that can lock and count.
--
--  3. **The house already answered this question, on this table.** Staff
--     administration goes through SECURITY DEFINER RPCs: `revoke_staff_pin_for`
--     (`0066`) and `record_password_reset_request` (`0068`), both gated with the
--     identical line, both granted to `authenticated` and revoked from `anon`.
--     `queries/staff.ts` states why that shape rather than an `actions/` entry:
--     the dispatcher exists for business entities that emit domain events, and
--     a role change emits none. This file follows the precedent it found.
--
-- No policy is added, so `users` stays refused for direct DML from the API
-- roles — including for the Owner. The only new write path is the two functions
-- below, and each writes exactly one column.
--
-- ## The ruling this implements, and the flag it clears
--
-- Three places in this repository said role assignment "needs a ruling":
-- `UsersRoles.tsx`'s Branch-managers note, `StaffDirectory.tsx`'s Scope
-- paragraph, and `queries/staff.ts`. That flag is honoured, not ignored — but
-- the answer was already written down in four independent places, and they
-- agree:
--
--   * `rbac.canManageSettings(role)` is `role === 'Owner'` — and `0066`'s
--     refusal message cites that function by name for the neighbouring act.
--   * `staff_directory_v` (`0067`) carries `where auth_user_role() = 'Owner'`
--     INLINE. Only the Owner can even see the list to act on.
--   * `PERMISSIONS.md` §11.2 places "user list, role assignment, the 9-role
--     matrix" under Settings, which is `canManageSettings`.
--   * §12.2 D-8's expected result is literally "Owner grants Manager".
--
-- **RULING: the Owner, and only the Owner, may assign a staff role or
-- deactivate a staff account.** It mirrors the read predicate on the same
-- table, so this file widens the Owner's authority over `users` from "see the
-- directory" to "see the directory and change two columns in it", and widens
-- nobody else's by anything.
--
-- ## What is deliberately NOT here
--
-- **Account creation.** A `users` row without an `auth.users` identity behind it
-- cannot sign in, and `0067`'s header is explicit that the join between them is
-- a convention with nothing enforcing it. Minting the identity needs GoTrue's
-- admin API, which needs the service key, which the README calls *"a complete
-- authorization bypass"* in a browser. So creation needs an Edge Function and is
-- its own piece of work; an INSERT path that produced staff rows nobody can sign
-- in as would make `has_auth_account = false` the normal case instead of the
-- alarm it is today. `users` therefore keeps NO insert path.
--
-- **DELETE.** Law 3. Deactivation is `set_staff_active(id, false)`; the row and
-- its audit trail stay. No delete policy is added and none existed.
--
-- ## Concurrency — why the Owner set is locked, not just counted
--
-- Two Owners demoting each other in overlapping transactions would each see the
-- other still standing and both commit, leaving zero. `select ... for update`
-- over the active-Owner set serialises them: the second transaction blocks,
-- then re-reads and refuses. The lock is taken before the count in both
-- functions.
-- =============================================================================

begin;

-- ── Pre-conditions ────────────────────────────────────────────────────────────
do $$
declare
  v_n int;
begin
  if to_regclass('public.users') is null then
    raise exception 'PRE-CONDITION FAILED: public.users is missing.';
  end if;
  if to_regclass('public.audit_events') is null then
    raise exception 'PRE-CONDITION FAILED: public.audit_events is missing — this file writes the trail.';
  end if;

  -- The two helpers the gate is built out of. Both must be SECURITY DEFINER:
  -- `auth_user_role()` reads `users`, and a non-definer read from inside a
  -- function called on `users` would be subject to `users_select_own` and
  -- answer 'Client' for every caller.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('auth_user_id','auth_user_role') and p.prosecdef;

  if v_n <> 2 then
    raise exception 'PRE-CONDITION FAILED: auth_user_id() and auth_user_role() must both exist and be '
                    'SECURITY DEFINER; found % of 2.', v_n;
  end if;

  -- If someone has since opened a general write policy on users, this file's
  -- premise is gone and its header is a lie. Say so rather than adding a second,
  -- narrower path beside a wide one.
  select count(*) into v_n from pg_policy
  where polrelid = 'public.users'::regclass and polcmd in ('a','w','d');

  if v_n <> 0 then
    raise exception 'PRE-CONDITION FAILED: public.users already carries % write polic(ies). '
                    'This file assumes RPCs are the only write path; reconcile before applying.', v_n;
  end if;
end $$;

-- ── 1 · assign a role ─────────────────────────────────────────────────────────
create or replace function set_staff_role(p_user_id uuid, p_role system_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth_user_id();
  v_old    system_role;
  v_email  text;
  v_name   text;
  v_active boolean;
  v_branch uuid;
  v_others int;
begin
  if v_actor is null then
    raise exception 'Assigning a role requires a signed-in session.';
  end if;

  -- RULING 2026-09-08 (R-27): the Owner alone assigns a staff role. §12.2 D-8's
  -- "As Admin ... grant Manager -> succeeds" is REFUSED under §15.1 B-1 —
  -- canManageSettings is Owner-only and staff_directory_v gives an Admin zero
  -- rows to act on. The identical line `revoke_staff_pin_for` (0066) and
  -- `record_password_reset_request` (0068) use, citing the same function.
  -- Revert: widen to `not in ('Owner','Admin')`.
  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may assign a staff role (rbac.canManageSettings).';
  end if;

  if p_role is null then
    raise exception 'A role is required. To take someone off the floor, deactivate the account '
                    'with set_staff_active — a staff row always has a role.';
  end if;

  /*
   * `Client` is in `system_role` for the portal, and it is NOT a value a staff
   * row can hold. `auth_user_role()` returns 'Client' precisely when the caller
   * has NO `users` row, so "a staff row whose role is Client" is a contradiction
   * the rest of the schema already reads as "not staff". Assigning it would
   * strip the person from `isStaff()` while leaving them a directory row and a
   * sign-in — an offboarding that looks like a role. Deactivation is the
   * offboarding, and it is the neighbouring function.
   */
  if p_role = 'Client' then
    raise exception 'Client is the portal role and cannot be assigned to a staff row. '
                    'To remove floor access, deactivate the account instead.';
  end if;

  select primary_role, email, full_name, is_active, branch_id
    into v_old, v_email, v_name, v_active, v_branch
    from users where id = p_user_id
    for update;

  if not found then
    raise exception 'No staff row for that identity; there is no role to assign.';
  end if;

  -- Idempotent, and silent about it. Re-sending the role someone already holds
  -- is not a change, and an audit row saying Owner -> Owner would be noise in
  -- the one log where noise is expensive.
  if v_old = p_role then
    return;
  end if;

  if v_old = 'Owner' and v_active then
    -- Lock the set BEFORE counting it; see the header's concurrency note.
    perform 1 from users where primary_role = 'Owner' and is_active and id <> p_user_id for update;
    select count(*) into v_others
      from users where primary_role = 'Owner' and is_active and id <> p_user_id;

    if v_others = 0 then
      raise exception 'This is the last active Owner. Demoting them would leave nobody who can '
                      'assign roles, and role assignment is Owner-only — the system could not be '
                      'recovered from inside itself. Promote another Owner first.';
    end if;
  end if;

  update users
     set primary_role = p_role,
         updated_at   = now(),
         updated_by   = v_actor
   where id = p_user_id;

  insert into audit_events (
    client_uuid, event_class, category, module, action,
    severity, status, table_name, record_id, branch_id,
    actor_id, actor_role, old_values, new_values, reason
  )
  values (
    gen_random_uuid(),
    -- `audit_event_class` has no 'permission' member and this file does not add
    -- one: 0099 is in flight against the same enum, and two migrations adding
    -- values to one enum is how a chain stops building. The specificity is
    -- carried by `action`, which has the exact label.
    'status change',
    'Users',
    'Settings',
    'Permission Changed',
    -- Granting or removing Owner is the strongest act available in this system;
    -- everything else is a lateral move inside the staff band. 0068 rates a
    -- reset REQUEST 'High', so a completed grant of the top role is above it.
    (case when p_role = 'Owner' or v_old = 'Owner' then 'Critical' else 'High' end)::audit_severity,
    'Success',
    'users',
    p_user_id,
    v_branch,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('primary_role', v_old),
    jsonb_build_object('primary_role', p_role),
    format('Role changed from %s to %s for %s (%s).', v_old, p_role, coalesce(v_name, '(no name)'), v_email)
  );
end;
$$;

comment on function set_staff_role(uuid, system_role) is
  'PERMISSIONS.md §16 V-14 — the only write path to users.primary_role. Owner only '
  '(rbac.canManageSettings, mirroring staff_directory_v''s own predicate). Refuses the '
  'Client role, refuses to demote the last active Owner, and writes a Permission Changed '
  'audit row. No RLS policy grants DML on users; this function and set_staff_active are '
  'the whole surface.';

-- ── 2 · activate / deactivate ─────────────────────────────────────────────────
create or replace function set_staff_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := auth_user_id();
  v_old    boolean;
  v_role   system_role;
  v_email  text;
  v_name   text;
  v_branch uuid;
  v_others int;
begin
  if v_actor is null then
    raise exception 'Changing a staff account''s status requires a signed-in session.';
  end if;

  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may activate or deactivate a staff account (rbac.canManageSettings).';
  end if;

  if p_active is null then
    raise exception 'Activate or deactivate must be stated explicitly; null is not a status.';
  end if;

  select is_active, primary_role, email, full_name, branch_id
    into v_old, v_role, v_email, v_name, v_branch
    from users where id = p_user_id
    for update;

  if not found then
    raise exception 'No staff row for that identity; there is no account to change.';
  end if;

  if v_old = p_active then
    return;
  end if;

  if v_old and not p_active and v_role = 'Owner' then
    perform 1 from users where primary_role = 'Owner' and is_active and id <> p_user_id for update;
    select count(*) into v_others
      from users where primary_role = 'Owner' and is_active and id <> p_user_id;

    if v_others = 0 then
      raise exception 'This is the last active Owner. Deactivating them would leave nobody who can '
                      'reactivate anyone, and that is Owner-only. Promote another Owner first.';
    end if;
  end if;

  update users
     set is_active  = p_active,
         updated_at = now(),
         updated_by = v_actor
   where id = p_user_id;

  /*
   * Deactivation removes floor access and is the offboarding act, so it is
   * audited at the same weight as a role change. What it does NOT do is revoke
   * the sign-in: `auth.users` is GoTrue's and this function holds no privilege
   * there. `is_active` is read by `set_staff_pin` (0066) and by the screens; a
   * deactivated person can still authenticate. Closing that needs the admin API
   * — the same wall account creation is behind — and it is stated here rather
   * than left for someone to discover.
   */
  insert into audit_events (
    client_uuid, event_class, category, module, action,
    severity, status, table_name, record_id, branch_id,
    actor_id, actor_role, old_values, new_values, reason
  )
  values (
    gen_random_uuid(),
    'status change',
    'Users',
    'Settings',
    'Update',
    (case when v_role = 'Owner' then 'Critical' else 'High' end)::audit_severity,
    'Success',
    'users',
    p_user_id,
    v_branch,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('is_active', v_old),
    jsonb_build_object('is_active', p_active),
    format('Staff account %s for %s (%s), role %s. The GoTrue sign-in is NOT revoked by this.',
           case when p_active then 'reactivated' else 'deactivated' end,
           coalesce(v_name, '(no name)'), v_email, v_role)
  );
end;
$$;

comment on function set_staff_active(uuid, boolean) is
  'PERMISSIONS.md §16 V-14 — the only write path to users.is_active. Owner only. Refuses to '
  'deactivate the last active Owner. Does NOT revoke the GoTrue account: is_active gates the '
  'app, not authentication.';

-- ── 3 · grants ────────────────────────────────────────────────────────────────
-- 0066's pattern exactly: nothing for PUBLIC or anon, EXECUTE for authenticated.
-- The Owner check inside is what narrows `authenticated` to one person.
revoke all on function set_staff_role(uuid, system_role) from public, anon;
revoke all on function set_staff_active(uuid, boolean)   from public, anon;

grant execute on function set_staff_role(uuid, system_role) to authenticated;
grant execute on function set_staff_active(uuid, boolean)   to authenticated;

-- ── 4 · post-conditions ───────────────────────────────────────────────────────
-- Structural assertions first, then a behavioural probe that actually performs
-- the grant as an Owner and as a Warehouse session. Everything the probe writes
-- is discarded through the ROLLBACK sentinel (0094/0095/0097's pattern; 0092
-- omitted it and committed a real UPDATE to a production row).
do $$
declare
  v_n       int;
  v_owner   uuid;
  v_owner2  uuid;
  v_wh      uuid;
  v_coord   uuid;
  v_role    system_role;
  v_active  boolean;
  v_audit   int;
  v_refused boolean;
begin
  -- Both functions exist, are SECURITY DEFINER, and pin search_path.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('set_staff_role','set_staff_active')
    and p.prosecdef
    and p.proconfig @> array['search_path=public, pg_temp'];

  if v_n <> 2 then
    raise exception 'POST-CONDITION 1 FAILED: expected 2 SECURITY DEFINER functions with a pinned '
                    'search_path, found %.', v_n;
  end if;

  -- anon must not reach either. An unauthenticated caller is not an Owner and
  -- the refusal must not depend on the body running at all.
  if has_function_privilege('anon', 'public.set_staff_role(uuid, system_role)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_staff_active(uuid, boolean)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: anon can execute a staff-administration RPC.';
  end if;

  if not has_function_privilege('authenticated', 'public.set_staff_role(uuid, system_role)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_staff_active(uuid, boolean)', 'EXECUTE') then
    raise exception 'POST-CONDITION 2 FAILED: authenticated cannot execute a staff-administration RPC.';
  end if;

  -- users still has no write policy — the fix must not have opened one.
  select count(*) into v_n from pg_policy
  where polrelid = 'public.users'::regclass and polcmd in ('a','w','d');
  if v_n <> 0 then
    raise exception 'POST-CONDITION 3 FAILED: a write policy appeared on users; the RPCs were '
                    'supposed to be the whole surface.';
  end if;

  -- ── behavioural ────────────────────────────────────────────────────────────
  select id into v_owner  from users where primary_role = 'Owner'       and is_active order by employee_code limit 1;
  select id into v_owner2 from users where primary_role = 'Owner'       and is_active and id <> v_owner order by employee_code limit 1;
  select id into v_wh     from users where primary_role = 'Warehouse'   and is_active order by employee_code limit 1;
  select id into v_coord  from users where primary_role = 'Coordinator' and is_active order by employee_code limit 1;

  if v_owner is null or v_wh is null or v_coord is null then
    raise notice '0101: BEHAVIOURAL PROBE NOT RUN — this database has no Owner/Warehouse/Coordinator '
                 'trio to act on. The structural assertions above passed; nothing has demonstrated '
                 'that a real grant works here.';
  else
    -- (a) BEFORE: a money-blind, non-Owner session is refused.
    perform set_config('app.current_user_id', v_wh::text, true);
    v_refused := false;
    begin
      perform set_staff_role(v_coord, 'Manager');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 4 FAILED: a Warehouse session assigned a role.';
    end if;

    -- (b) AFTER: the Owner grants Manager — §12.2 D-8, the case V-14 says cannot happen.
    perform set_config('app.current_user_id', v_owner::text, true);
    perform set_staff_role(v_coord, 'Manager');
    select primary_role into v_role from users where id = v_coord;
    if v_role <> 'Manager' then
      raise exception 'POST-CONDITION 5 FAILED: Owner granted Manager and the row says %.', v_role;
    end if;

    select count(*) into v_audit from audit_events
     where table_name = 'users' and record_id = v_coord and action = 'Permission Changed';
    if v_audit < 1 then
      raise exception 'POST-CONDITION 5 FAILED: the grant left no Permission Changed audit row.';
    end if;

    -- (c) the Client role is refused.
    v_refused := false;
    begin
      perform set_staff_role(v_coord, 'Client');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 6 FAILED: a staff row was assigned the portal role.';
    end if;

    -- (d) deactivation works.
    perform set_staff_active(v_coord, false);
    select is_active into v_active from users where id = v_coord;
    if v_active then
      raise exception 'POST-CONDITION 7 FAILED: deactivation did not take.';
    end if;

    -- (e) the last active Owner cannot be demoted or deactivated. Reduce to one
    --     Owner first if this database has two.
    if v_owner2 is not null then
      perform set_staff_role(v_owner2, 'Admin');
    end if;

    v_refused := false;
    begin
      perform set_staff_role(v_owner, 'Admin');
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 8 FAILED: the last active Owner was demoted — the system can '
                      'be locked out of its own role administration.';
    end if;

    v_refused := false;
    begin
      perform set_staff_active(v_owner, false);
    exception when others then
      v_refused := true;
    end;
    if not v_refused then
      raise exception 'POST-CONDITION 8 FAILED: the last active Owner was deactivated.';
    end if;

    perform set_config('app.current_user_id', '', true);
    raise notice '0101: probe passed — Warehouse refused, Owner granted Manager with an audit row, '
                 'Client refused, deactivation applied, last Owner protected from both demotion and '
                 'deactivation.';
  end if;

  raise exception 'ROLLBACK_0101_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0101_PROBE' then
      return;  -- probe writes discarded; the functions and grants above stand
    end if;
    raise;
end $$;

commit;
