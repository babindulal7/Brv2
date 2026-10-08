-- =============================================================================
-- 0068_credential_audit.sql — credential actions leave a trace, 24 Aug 2026
--
-- Design authority: `specs/09-staff-credentials.md` §6.2 and §26.
-- FILE ONLY on the live project (0064/0065 convention). Applied to the local stack.
--
-- WHAT WAS MISSING
-- -----------------
-- 0066/0067 shipped an Owner-only action that causes a password-reset link to be
-- emailed to a staff member, and 0066 shipped an Owner-only PIN revocation. The
-- spec required both to write an audit row naming actor and subject. Neither did.
--
-- The PIN side was defensible on its own: `staff_auth_pins.revoked_at` and
-- `revoked_by` record it, Law 3 keeps the row forever, and that IS a trace. The
-- reset side was not defensible at all — `resetPasswordForEmail` is a call from
-- the browser to GoTrue that touches no table in this schema, so an Owner could
-- trigger reset links for every staff member and this database would hold no
-- record that anything happened.
--
-- WHY A FUNCTION AND NOT A TRIGGER
-- ---------------------------------
-- `log_audit_event()` (0010) is a trigger function; it fires on writes to
-- tables. There is no write here to fire on. A reset request is an outbound
-- call, so the only place it can be recorded is deliberately, by the caller.
--
-- ⚠ THE HONEST LIMITATION, STATED RATHER THAN GLOSSED
-- ----------------------------------------------------
-- `record_password_reset_request` is called by the CLIENT after
-- `resetPasswordForEmail` resolves. It therefore records **that an Owner asked
-- this app to send a link**, which is the only fact anyone here actually knows:
--
--   * It does not prove GoTrue accepted the request — though the client only
--     calls this after a non-error response.
--   * It does not prove an email was delivered. Nothing can. GoTrue answers
--     identically for an address with an account and one without, deliberately,
--     so that the endpoint is not an account-enumeration oracle.
--   * A determined Owner could call this RPC without sending anything, writing
--     a truthful-shaped row about an action they did not take.
--
-- The last one is worth being clear-eyed about: it is not a privilege
-- escalation (only the Owner can call it, and only about the Owner's own
-- authority), and closing it needs the send to move server-side into an Edge
-- Function holding the service key — deferred in the spec's D2 for good
-- reasons. So the row's `reason` says "requested", never "sent", and the action
-- is `Update` rather than `Password Changed`, because no password changed.
--
-- Recording a weaker fact accurately beats recording a stronger one that might
-- be false.
-- =============================================================================

begin;

-- =============================================================================
-- record_password_reset_request(p_user_id) — Owner only.
--
-- `client_uuid` is minted here rather than taken from a client row, matching
-- `log_audit_event()` (0010), which does `gen_random_uuid()` for the same
-- column. It is an event identifier in this table, not a tenancy foreign key.
--
-- `table_name` / `record_id` are the audit table's subject columns, so the
-- staff row being acted on is named there and a later reader can join it.
-- =============================================================================
create or replace function record_password_reset_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth_user_id();
  v_email text;
begin
  if v_actor is null then
    raise exception 'Recording a reset request requires a signed-in session.';
  end if;

  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may request a password reset for another staff member (rbac.canManageSettings).';
  end if;

  select email into v_email from users where id = p_user_id;

  if not found then
    raise exception 'No staff row for that identity; nothing to record.';
  end if;

  insert into audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values,
    reason
  )
  values (
    gen_random_uuid(),
    'session',
    'Authentication',
    'Authentication',
    -- NOT 'Password Changed'. No password changed; a link was requested. The
    -- enum has the stronger label and using it would be the easy lie.
    'Update',
    -- A credential recovery path is not routine traffic. It is the action an
    -- attacker with an Owner session would reach for first.
    'High',
    'Success',
    'users',
    p_user_id,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('reset_link_requested_for', v_email),
    format('Password reset link requested for %s. Requested, not confirmed delivered — GoTrue cannot report delivery.', v_email)
  );
end;
$$;

comment on function record_password_reset_request(uuid) is
  'Owner-only. Records that a password-reset link was REQUESTED for a staff member - never that one was sent or delivered, which nothing can know. See 0068''s header for the limitations of a client-called audit write.';

-- =============================================================================
-- revoke_staff_pin_for — replaced to add the audit row.
--
-- Body is 0066's unchanged except for the insert. The `revoked_at`/`revoked_by`
-- pair on the row is still the primary record; this makes the action visible in
-- the one place an operator actually looks, `/admin/audit`, alongside the reset
-- requests it sits next to in a story.
-- =============================================================================
create or replace function revoke_staff_pin_for(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid := auth_user_id();
  v_email   text;
  v_revoked int;
begin
  if v_actor is null then
    raise exception 'Revoking another staff member''s PIN requires a signed-in session.';
  end if;

  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may revoke another staff member''s PIN (rbac.canManageSettings).';
  end if;

  select email into v_email from users where id = p_user_id;

  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_actor
   where user_id = p_user_id
     and revoked_at is null;

  get diagnostics v_revoked = row_count;

  -- No row means there was no live PIN. Idempotent, and deliberately NOT
  -- audited: an audit trail that records non-events is one an operator learns
  -- to skim.
  if v_revoked = 0 then
    return;
  end if;

  insert into audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, new_values, reason
  )
  values (
    gen_random_uuid(),
    'session',
    'Authentication',
    'Authentication',
    'Update',
    'High',
    'Success',
    'staff_auth_pins',
    p_user_id,
    v_actor,
    auth_user_role()::system_role,
    jsonb_build_object('pin_revoked_for', v_email),
    format('Device PIN revoked for %s by the Owner. The password is unaffected.', coalesce(v_email, p_user_id::text))
  );
end;
$$;

comment on function revoke_staff_pin_for(uuid) is
  'Owner-only revocation of another staff member''s PIN, with an audit row. Matches rbac.canManageSettings (Owner alone). Revokes a PIN only - it does not touch passwords, which are GoTrue''s and are reset by emailed link. Idempotent, and a no-op writes no audit row.';

revoke all on function record_password_reset_request(uuid) from public, anon;
grant execute on function record_password_reset_request(uuid) to authenticated;

commit;
