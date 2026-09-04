-- =============================================================================
-- 0091_audit_events_refuse_anonymous_writes.sql — 5 Sep 2026
--
-- **Security.** An UNAUTHENTICATED caller can write forged rows into
-- `audit_events`, and Law 3 then makes them permanent.
--
-- ## Reproduced, not theorised
--
-- With the project's anon key alone — no sign-in, no session — 4 Sep 2026:
--
--   POST /rest/v1/audit_events
--   {"client_uuid":"…","table_name":"bookings","action":"Approve","record_id":"…"}
--   -> HTTP 201, audit_events 2195 -> 2196
--
-- and then, trying to remove it:
--
--   DELETE FROM audit_events WHERE client_uuid = '…'
--   -> ERROR: Law 3 (nothing is deleted): DELETE on audit_events is rejected for
--      every role including Owner and service_role.
--
-- So the forged row cannot be taken out again — not by Owner, not by
-- `service_role`. The anon key ships inside the client bundle by design, so this
-- is reachable by anyone who opens the app and reads its JavaScript.
--
-- ## Why it was open
--
-- `0011:205` declares the policy with no `TO` clause:
--
--   create policy audit_events_insert on audit_events for insert with check (true);
--
-- A policy with no `TO` applies to **PUBLIC**, which includes `anon`, and the
-- platform default privileges had already granted `anon` INSERT. SELECT was
-- correctly restricted to Owner/Manager (`0011:198`), so the trail could never be
-- read by a stranger — only written by one. That asymmetry is why it went unseen:
-- nothing in the UI could ever show the forged row to the person who could act on
-- it.
--
-- ## What this changes, and what it deliberately does not
--
-- INSERT becomes `authenticated` + `service_role` only, and `anon`'s INSERT grant
-- is revoked. The grant is the part that actually stops PostgREST — it refuses on
-- privilege before any policy is consulted — and the `TO` clause is the second
-- lock behind it.
--
-- `with check (true)` is KEPT for the roles that remain. Tying rows to
-- `auth.uid()` was considered and rejected on evidence: **598 of the 5 424 live
-- audit rows carry a NULL `actor_id`**, so such a check would refuse writes the
-- system makes legitimately today.
--
-- Nothing legitimate loses a path. Verified against live before writing:
--
--   * `log_audit_event`, `record_password_reset_request` and `revoke_staff_pin_for`
--     are all SECURITY DEFINER and **not executable by anon**, so every
--     trigger-written and pre-login audit row is unaffected — they run as the
--     owner, and `audit_events` has FORCE ROW LEVEL SECURITY off, so the owner
--     bypasses RLS entirely.
--   * `create_booking` is not SECURITY DEFINER, so its audit insert runs as the
--     caller — who is `authenticated` in every legitimate case.
--
-- What this does NOT fix: a signed-in staff member can still write an audit row
-- describing something that did not happen. Narrowing that needs a ruling on who
-- may write what, and is a different question from an anonymous stranger doing it.
-- =============================================================================

begin;

-- 1 · The lock PostgREST actually checks first.
revoke insert on table audit_events from anon;

/*
 * And STATE the grant the application depends on, rather than inheriting it.
 *
 * On live this is a no-op: the platform default privileges already granted it.
 * On a database rebuilt from these migrations it is not — no migration in this
 * repo grants table privileges to `authenticated`, so a from-scratch build has
 * an app that cannot write here at all. That gap is filed separately, but a
 * migration whose whole subject is who may INSERT into this table should not
 * leave the answer to an environment it does not control.
 */
grant insert on table audit_events to authenticated, service_role;

-- 2 · The policy behind it. Same predicate, but no longer offered to PUBLIC.
drop policy if exists audit_events_insert on audit_events;

create policy audit_events_insert on audit_events
  for insert
  to authenticated, service_role
  with check (true);

comment on table audit_events is
  'Append-only audit trail. INSERT is authenticated/service_role only (0091) — an '
  'anonymous caller could previously forge rows that Law 3 then made permanent. '
  'SELECT stays Owner/Manager (0011).';

-- -----------------------------------------------------------------------------
-- 3 · Post-conditions. Proven by ATTEMPTING the write as anon, not by reading
--     the catalogue — a grant can be present and a policy still refuse, and vice
--     versa, so only the attempt settles it.
-- -----------------------------------------------------------------------------
do $$
declare
  v_before  bigint;
  v_after   bigint;
  v_blocked boolean := false;
begin
  if has_table_privilege('anon', 'public.audit_events', 'INSERT') then
    raise exception 'POST-CONDITION FAILED: anon still holds INSERT on audit_events.';
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    raise exception 'POST-CONDITION FAILED: authenticated lost INSERT on audit_events.';
  end if;

  select count(*) into v_before from audit_events;

  -- The exact call the reproduction used, now as the anon role.
  begin
    set local role anon;
    insert into audit_events (client_uuid, table_name, record_id, action)
    values (gen_random_uuid(), 'bookings', '00000000-0000-0000-0000-000000000001', 'Approve');
  exception
    when insufficient_privilege or others then
      v_blocked := true;
  end;
  reset role;

  select count(*) into v_after from audit_events;

  if not v_blocked then
    raise exception 'POST-CONDITION FAILED: an anonymous INSERT into audit_events was accepted.';
  end if;
  if v_after <> v_before then
    raise exception 'POST-CONDITION FAILED: the anonymous INSERT wrote a row (% -> %).', v_before, v_after;
  end if;

  raise notice '0091 verified: anonymous INSERT refused and wrote nothing; authenticated retains its path.';
end $$;

commit;
