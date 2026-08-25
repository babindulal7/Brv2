-- =============================================================================
-- 0066_staff_auth_pins.sql — the staff PIN, 24 Aug 2026
--
-- Design authority: `specs/09-staff-credentials.md` in the design workspace.
-- FILE ONLY on the live project — not applied to production by this change,
-- following the 0064/0065 convention. It IS applied to the local stack.
--
-- WHAT THIS IS, AND MORE IMPORTANTLY WHAT IT IS NOT
-- --------------------------------------------------
-- This is a **session re-entry** credential, not a sign-in credential. The
-- distinction is the whole reason the table looks the way it does, so it is
-- stated here rather than left to the screens:
--
--   * A PIN verified by this migration NEVER produces a session. It cannot —
--     nothing in Postgres can mint a GoTrue JWT, and `verify_staff_pin` returns
--     a verdict, not a token.
--   * The caller must ALREADY hold a JWT for `verify_staff_pin` to identify
--     them at all: the subject comes from `auth_user_id()`, which is 0041's
--     `app.current_user_id` GUC, which PostgREST fills from `auth.uid()`. With
--     no session there is no subject and the function refuses.
--
-- That is deliberate, and it is the second time this project has had to learn
-- it. `VITE_DEV_AUTH_BYPASS` set the React user to Owner without signing in to
-- Supabase; there was no JWT, every query went out as `anon`, RLS denied all of
-- it, and the app rendered a header reading "Owner" over empty lists with no
-- error anywhere. A database holding 120 seeded bookings was twice diagnosed as
-- an empty database. A PIN checked in the browser against a table reproduces
-- that outage exactly, with a credential prompt in front of it to make it look
-- sound. So the PIN unlocks a session that already exists, and the login screen
-- offers "Unlock this device", never "Sign in with PIN".
--
-- PIN-as-primary is a real feature and it is NOT built here. It needs a
-- server-side verifier holding the service key that can exchange a verified PIN
-- for a session, plus the phone pairing `authentication_method` in 0001 already
-- names ("the locked v1 login is phone + PIN with OTP fallback"). Its own spec.
--
-- WHY THIS SHAPE — `portal_auth_challenges` is the precedent
-- ----------------------------------------------------------
-- 0005 already answered "how does this schema hold a hashed 6-digit credential
-- with attempt limits and lockout" for the client portal: `code_hash` never
-- stores the value, ten-minute validity as a CHECK, `attempt_count` capped at
-- 5 with the sixth rejected, `locked_until` at now() + 15 minutes, `consumed_at`
-- for single use, `voided_at` as the terminal state, `ip` captured, and a
-- structural rule forbidding a password column anywhere in the chain.
--
-- Every one of those decisions transfers, so every one of them is reused rather
-- than re-litigated. Two do not transfer and the differences are named:
--
--   1. A PIN is long-lived, so there is no `expires_at` CHECK and there is a
--      `rotated_at`. It is a standing credential, not a one-shot challenge.
--   2. A PIN is single-use per ATTEMPT, not per credential, so there is no
--      `consumed_at`. `revoked_at` is the terminal state (Law 3).
--
-- ⚠ THE STRUCTURAL RULE IN 0005 IS NOT VIOLATED BY THIS TABLE
-- ------------------------------------------------------------
-- 0005 carries "no password, password_hash or staff_user_id column may exist on
-- this table" against `portal_users`, and "no password column may exist anywhere
-- in the portal auth chain" against `portal_auth_challenges`. Both are scoped to
-- the PORTAL chain — passwordless customer auth, phone to OTP, by design.
--
-- This table is in the STAFF chain, which is GoTrue-backed and has always had a
-- password. It is a different chain with a different ruling, and saying so
-- explicitly is the point: a future reader finding a `pin_hash` column must be
-- able to tell a considered exception from an eroded rule.
-- =============================================================================

begin;

-- =============================================================================
-- staff_auth_pins
-- One standing PIN per staff identity. The value is never stored.
-- =============================================================================
create table staff_auth_pins (
  id            uuid        not null default gen_random_uuid() primary key,
  user_id       uuid        not null references users (id),
  pin_hash      text        not null,
  set_at        timestamptz not null default now(),
  rotated_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid        references users (id),
  attempt_count int         not null default 0,
  locked_until  timestamptz,
  last_used_at  timestamptz,
  ip            inet,

  -- Mirrors portal_auth_challenges_attempt_ceiling. The sixth attempt is
  -- rejected and sets locked_until; it never increments past 5.
  constraint staff_auth_pins_attempt_ceiling check (
    attempt_count >= 0 and attempt_count <= 5
  ),

  -- A revocation is attributed or it is not a revocation (Law 3).
  constraint staff_auth_pins_revocation_is_attributed check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

comment on table staff_auth_pins is
  'One standing 6-digit PIN per staff identity, used to re-enter a session that already holds a JWT — never to create one. Modelled on portal_auth_challenges (0005). See 0066''s header before changing anything here.';

comment on column staff_auth_pins.pin_hash is
  'The 6-digit PIN is stored only as a bcrypt hash. PIN values are never stored, displayed, logged, exported or included in an audit payload - masked for every role including Owner. No role holds SELECT on this table; only the SECURITY DEFINER functions below read it.';
comment on column staff_auth_pins.rotated_at is
  'Last change. Null until the first change - set_at carries the original.';
comment on column staff_auth_pins.revoked_at is
  'Terminal. Law 3 - a PIN is revoked, never deleted, so a later audit can still see that one existed and when it stopped.';
comment on column staff_auth_pins.revoked_by is
  'The actor. Self-revocation records the owner of the PIN; an Owner revoking someone else records the Owner.';
comment on column staff_auth_pins.attempt_count is
  'Consecutive failures. Reset to 0 by a successful verify. Lives in the database because a client-side counter is reset by a page refresh, which is exactly what an attacker does.';
comment on column staff_auth_pins.locked_until is
  'now() + 15 minutes when attempt_count reaches 5, matching portal_auth_challenges. While set, verify refuses without consulting the hash.';
comment on column staff_auth_pins.ip is
  'Attribution requires IP on writes; capturing it at authentication is the corollary (same reasoning as portal_auth_challenges.ip).';

-- One live PIN per person. Partial, so revoked rows accumulate freely — which
-- is what makes Law 3 retention compatible with "exactly one active".
create unique index staff_auth_pins_one_live_per_user
  on staff_auth_pins (user_id)
  where revoked_at is null;

-- Law 3 backstop. Reaches the table owner and service_role, which no revoke
-- does. TG_ARGV[0] is this table's named terminal action.
create trigger trg_staff_auth_pins_reject_delete
  before delete on staff_auth_pins
  for each row execute function reject_delete_nothing_is_deleted('Revoke');

alter table staff_auth_pins enable row level security;

-- =============================================================================
-- No role reads this table. At all.
--
-- RLS is row-level and cannot hide a column, so a policy that let a staff
-- member "see their own PIN row" would hand them their own `pin_hash` — a
-- bcrypt hash of a six-digit secret, which is an offline dictionary attack with
-- a search space of one million. The 0062-style column grant could carve
-- `pin_hash` out, but the simpler and stronger answer is that nothing needs
-- direct SELECT: `staff_pin_status()` returns the three facts a screen needs,
-- and the verify/set functions run as owner.
--
-- So: RLS on, and deliberately NO permissive policy. Default-deny is the policy.
-- =============================================================================
revoke all on staff_auth_pins from authenticated, anon;

-- =============================================================================
-- set_staff_pin(p_pin) — enrol or rotate the CALLER'S OWN PIN.
--
-- Takes no user_id. That is a security property, not an omission: a function
-- that accepted one would need an authorization check, and the safest
-- authorization check is the one that cannot be reached because the parameter
-- does not exist.
--
-- `search_path = public, extensions, pg_temp` — 0050's rule, with `extensions`
-- added because `crypt`/`gen_salt` are pgcrypto and pgcrypto lives in
-- `extensions` on this project (verified: pg_extension.extnamespace =
-- 'extensions'). 0050 notes `gen_random_uuid()` needs no such entry as it is a
-- pg_catalog builtin on PG17; crypt and gen_salt are not, so it is needed here.
-- `pg_temp` stays LAST for the reason 0050 gives.
-- =============================================================================
create or replace function set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id  uuid := auth_user_id();
  v_mobile   text;
  v_rotating boolean;
  v_pw_at    bigint;
begin
  if v_user_id is null then
    raise exception 'A PIN can only be set by a signed-in staff session.';
  end if;

  /*
   * ── the freshness gate ────────────────────────────────────────────────────
   *
   * Minting a credential requires having proved identity RECENTLY, not merely
   * holding a session that proved it at some point.
   *
   * The attack this stops is mundane and is the likeliest one on this floor: an
   * unattended tablet with an hours-old session. Without this gate, anyone
   * walking past can silently add their OWN PIN to somebody else's account and
   * from then on re-open that session at will — a permanent credential minted
   * from a temporary opportunity, with the owner's name on every row it writes.
   *
   * ⚠ What this is NOT, and the spec for this feature got it wrong:
   *
   * The design asked that a PIN-unlocked session be forbidden from setting a
   * PIN. That is **not expressible here**, and the reason is structural: a PIN
   * unlock does not touch the JWT. `verify_staff_pin` returns a verdict, the
   * existing token is reused unchanged, and so a PIN-unlocked session presents
   * a token identical to the password sign-in that created it. The database
   * cannot tell them apart because there is nothing different to see.
   *
   * The freshness window is the honest approximation: it does not identify how
   * the curtain was opened, it bounds how long ago the password was typed. That
   * closes the unattended-tablet case, which is what the spec was reaching for.
   *
   * `amr` ("authentication methods references") is a GoTrue claim carrying one
   * entry per method used on this session with a unix timestamp — verified on
   * this project: {"aal":"aal1","amr":[{"method":"password","timestamp":...}]}.
   * Absent amr means this did not arrive as a GoTrue user request, so it is
   * refused rather than waved through: a service-role or psql caller is not a
   * staff member choosing their own PIN, and this function has no other purpose.
   */
  select max((entry ->> 'timestamp')::bigint)
    into v_pw_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
   where entry ->> 'method' = 'password';

  if v_pw_at is null or to_timestamp(v_pw_at) < now() - interval '15 minutes' then
    raise exception
      'For security, a PIN can only be set within 15 minutes of signing in with your password. Sign out and sign in again, then set the PIN.';
  end if;

  -- The staff row must exist and be active. An inactive identity does not get a
  -- fresh credential, and 0060's note is the reason this is checked here rather
  -- than assumed: an auth account can exist with no matching staff row at all.
  select mobile into v_mobile
    from users
   where id = v_user_id and is_active;

  if not found then
    raise exception 'No active staff row for this identity; a PIN cannot be set.';
  end if;

  -- Shape. Enforced here as well as in the UI because the RPC is reachable
  -- without the numpad.
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'A PIN must be exactly 6 digits.';
  end if;

  -- Weak-PIN rejection. Six identical digits, six sequential in either
  -- direction, and the last four of the mobile on the staff row — the three
  -- guesses someone standing at a shared tablet actually makes.
  if p_pin ~ '^(.)\1{5}$' then
    raise exception 'That PIN is six identical digits. Choose another.';
  end if;

  if strpos('01234567890', p_pin) > 0 or strpos('09876543210', p_pin) > 0 then
    raise exception 'That PIN is six sequential digits. Choose another.';
  end if;

  if v_mobile is not null
     and length(regexp_replace(v_mobile, '\D', '', 'g')) >= 4
     and right(regexp_replace(v_mobile, '\D', '', 'g'), 4) = right(p_pin, 4) then
    raise exception 'That PIN ends with the last four digits of your mobile number. Choose another.';
  end if;

  -- Rotation is a revoke plus an insert, never an UPDATE of pin_hash. Law 3:
  -- the fact that a different PIN was in force until now survives.
  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_user_id
   where user_id = v_user_id
     and revoked_at is null;

  -- Captured explicitly rather than reading FOUND at the insert. FOUND would
  -- still be the UPDATE's result there and would work, but it is one statement
  -- away from silently meaning something else.
  v_rotating := found;

  insert into staff_auth_pins (user_id, pin_hash, rotated_at)
  values (
    v_user_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    case when v_rotating then now() else null end
  );
end;
$$;

comment on function set_staff_pin(text) is
  'Enrol or rotate the calling session''s own PIN. Takes no user_id by design - the subject is auth_user_id() and cannot be named by the caller. Rotation revokes the prior row rather than updating it (Law 3).';

-- =============================================================================
-- verify_staff_pin(p_pin) — is this the caller's PIN?
--
-- Returns jsonb rather than boolean so the screen can say "3 attempts left" in
-- words and name the unlock time. A bare boolean would force the client to
-- track attempts, and a client-side attempt counter is reset by a refresh.
--
-- FAILS CLOSED. Every path that is not an affirmative match returns ok=false.
-- There is no path that returns ok=true without a hash comparison succeeding.
-- =============================================================================
create or replace function verify_staff_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth_user_id();
  v_row     staff_auth_pins;
  v_ok      boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select * into v_row
    from staff_auth_pins
   where user_id = v_user_id
     and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  -- Locked. Refuse WITHOUT consulting the hash: a lockout that still compares
  -- is a lockout an attacker can time.
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', v_row.locked_until
    );
  end if;

  -- The staff row can be deactivated while a device sits locked. Fail on the
  -- identity, before the credential.
  if not exists (select 1 from users where id = v_user_id and is_active) then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'malformed');
  end if;

  v_ok := extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;

  if v_ok then
    update staff_auth_pins
       set attempt_count = 0,
           locked_until  = null,
           last_used_at  = now()
     where id = v_row.id;

    return jsonb_build_object('ok', true);
  end if;

  -- Failure. The fifth consecutive one locks for 15 minutes, matching
  -- portal_auth_challenges. The count never exceeds 5 (CHECK).
  update staff_auth_pins
     set attempt_count = least(v_row.attempt_count + 1, 5),
         locked_until  = case
                           when v_row.attempt_count + 1 >= 5 then now() + interval '15 minutes'
                           else locked_until
                         end
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok', false,
    'reason', case when v_row.locked_until > now() then 'locked' else 'incorrect' end,
    'attempts_remaining', greatest(5 - v_row.attempt_count, 0),
    'locked_until', v_row.locked_until
  );
end;
$$;

comment on function verify_staff_pin(text) is
  'Verify the calling session''s own PIN and return a verdict. Returns jsonb {ok, reason, attempts_remaining, locked_until} so the screen can state attempts in words. Fails closed: no path returns ok=true without a successful hash comparison. Does NOT create a session and cannot - it is session re-entry only.';

-- =============================================================================
-- staff_pin_status() — the three facts a settings screen needs, and no hash.
-- =============================================================================
create or replace function staff_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth_user_id();
  v_row     staff_auth_pins;
begin
  if v_user_id is null then
    return jsonb_build_object('has_pin', false);
  end if;

  select * into v_row
    from staff_auth_pins
   where user_id = v_user_id
     and revoked_at is null;

  if not found then
    return jsonb_build_object('has_pin', false);
  end if;

  return jsonb_build_object(
    'has_pin', true,
    'set_at', coalesce(v_row.rotated_at, v_row.set_at),
    'locked_until', case when v_row.locked_until > now() then v_row.locked_until else null end,
    'last_used_at', v_row.last_used_at
  );
end;
$$;

comment on function staff_pin_status() is
  'Whether the calling session has a live PIN, when it was set, and whether it is locked. Deliberately returns no hash and no attempt count.';

-- =============================================================================
-- revoke_own_staff_pin() — "Remove" on the settings row.
-- =============================================================================
create or replace function revoke_own_staff_pin()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth_user_id();
begin
  if v_user_id is null then
    raise exception 'A PIN can only be revoked by a signed-in staff session.';
  end if;

  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_user_id
   where user_id = v_user_id
     and revoked_at is null;
end;
$$;

comment on function revoke_own_staff_pin() is
  'Self-service PIN removal. Idempotent - revoking when none is live is a no-op, not an error.';

-- =============================================================================
-- revoke_staff_pin_for(p_user_id) — Owner only.
--
-- This one DOES take a user_id, so it carries the authorization check that
-- `set_staff_pin` avoids by construction. `canManageSettings` in `lib/rbac.ts`
-- is `role === 'Owner'` — Owner alone, not Owner+Admin — so this matches it
-- exactly rather than inventing a wider rank. Widening it is a business
-- decision and belongs in a ruling, not in this migration.
--
-- Note this revokes a PIN; it does NOT reset a password. Password reset goes
-- through GoTrue's own email flow from the client, which needs no service key
-- and lets no operator choose a credential.
-- =============================================================================
create or replace function revoke_staff_pin_for(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth_user_id();
begin
  if v_actor is null then
    raise exception 'Revoking another staff member''s PIN requires a signed-in session.';
  end if;

  if auth_user_role() <> 'Owner' then
    raise exception 'Only the Owner may revoke another staff member''s PIN (rbac.canManageSettings).';
  end if;

  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_actor
   where user_id = p_user_id
     and revoked_at is null;
end;
$$;

comment on function revoke_staff_pin_for(uuid) is
  'Owner-only revocation of another staff member''s PIN. Matches rbac.canManageSettings (Owner alone). Revokes a PIN only - it does not touch passwords, which are GoTrue''s and are reset by emailed link.';

-- Execution is granted narrowly and explicitly. `authenticated` covers the
-- staff session; the role checks inside each function do the rest.
revoke all on function set_staff_pin(text)          from public, anon;
revoke all on function verify_staff_pin(text)       from public, anon;
revoke all on function staff_pin_status()           from public, anon;
revoke all on function revoke_own_staff_pin()       from public, anon;
revoke all on function revoke_staff_pin_for(uuid)   from public, anon;

grant execute on function set_staff_pin(text)        to authenticated;
grant execute on function verify_staff_pin(text)     to authenticated;
grant execute on function staff_pin_status()         to authenticated;
grant execute on function revoke_own_staff_pin()     to authenticated;
grant execute on function revoke_staff_pin_for(uuid) to authenticated;

commit;
