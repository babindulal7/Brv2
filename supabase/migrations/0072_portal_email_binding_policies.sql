-- =============================================================================
-- 0072 — Portal: self-registration bound ONLY by verified control of the
--        client's stored email (D2, ruled 30 Aug 2026). DRAFT — ⚠ NOT APPLIED.
--
-- ## The ruling this implements
--
-- `docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0, D2 — Babin ruled
-- self-registration + matching, against the 11 Aug caution, and the spec
-- therefore REQUIRES the one safe form of it:
--
--   · A self-registering user is bound to a client record ONLY after verifying
--     control of the EXACT email address already stored on that client
--     (verification link to that address).
--   · No fuzzy matching. No name matching. No domain matching. Ever.
--   · An email matching no client creates an UNBOUND account with access to
--     nothing, surfaced to staff as a pending link request.
--   · RLS stays deny-all for unbound accounts — the failure mode of a bad
--     match is "sees nothing", never "sees someone else's bookings".
--
-- This closes the TODO(decision) in 0054 §1b ("how a portal session binds to a
-- client_id") for the SELF-REGISTRATION path: the binding vocabulary is
-- Supabase Auth — `auth.uid()` — not a GUC and not a service-role edge
-- function. A portal account is an `auth.users` row; `portal_users` gains
-- `auth_user_id`, and every policy below reads it. The staff-invite path
-- (0005's phone/OTP model — `portal_auth_challenges`) is NOT redesigned here;
-- its tables get explicit lock-down policies so the deny is documented rather
-- than implied by absence.
--
-- ## Why binding is a SECURITY DEFINER function and not a policy
--
-- The match must read `auth.users.email_confirmed_at` (authenticated cannot),
-- and must be race-safe against two accounts claiming one client. A policy
-- cannot express "insert exactly one bound row iff exactly one client matches
-- my verified email"; a definer function can, and everything else stays
-- INVOKER + RLS.
--
-- ## Failure directions, stated
--
--   · Two clients share one email       → NO bind (ambiguous), request stays
--                                         pending for staff. Fail closed.
--   · Email verified, no client matches → NO bind, request pending.
--   · Client already claimed            → NO second bind (unique), pending.
--   · Anything else                     → the account reads nothing: every
--                                         SELECT below requires a bound row.
--
-- ## Prerequisites and sequencing
--
--   · 0054's apply-time post-condition asserted the portal trio had ZERO
--     policies. That check ran when 0054 was applied and does not re-run;
--     this migration is the "real policies replace the denial" step its
--     comment promised. The `comment on table` lines below supersede 0054's.
--   · `portal_users` has zero rows live (verified 30 Aug — "Zero portal
--     accounts exist"), so the column adds and the constraint swap below
--     rewrite nothing.
--
-- ## Applying this
--
-- ⚠ DO NOT APPLY without explicit approval (CLAUDE.md). Beyond the standing
-- rule, two pieces are ordered AFTER this file and before the feature works:
--   1. Supabase Auth email signup enabled for the portal origin (dashboard).
--   2. The staff "pending link requests" card on Clients — specced in
--      `docs/PORTAL_LINK_REQUESTS_CARD_SPEC.md`, deliberately not built yet.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `portal_users` — the binding columns
-- ─────────────────────────────────────────────────────────────────────────────

alter table portal_users
  add column if not exists auth_user_id       uuid references auth.users (id),
  add column if not exists email              text,
  add column if not exists email_verified_at  timestamptz,
  add column if not exists self_registered_at timestamptz;

-- One auth account is one portal identity; one client is claimable once by
-- self-registration. Partial unique so the staff-invite path (no auth account
-- yet) is not constrained by a column it does not use.
create unique index if not exists portal_users_auth_user_id_key
  on portal_users (auth_user_id) where auth_user_id is not null;

-- 0005's `portal_users_exactly_one_inviter` requires a staff or portal
-- inviter, which by construction a SELF-registered account has not got. The
-- constraint is widened, not dropped: either exactly one inviter (the invite
-- path, unchanged), or no inviter and a self-registration stamp.
alter table portal_users drop constraint if exists portal_users_exactly_one_inviter;
alter table portal_users add constraint portal_users_exactly_one_origin check (
  (invited_by_staff_id is not null and invited_by_portal_user_id is null and self_registered_at is null)
  or (invited_by_staff_id is null and invited_by_portal_user_id is not null and self_registered_at is null)
  or (invited_by_staff_id is null and invited_by_portal_user_id is null and self_registered_at is not null)
);

-- The invite path identifies by phone; the self-registration path by email.
-- Zero rows live, so the relax rewrites nothing. A row must carry at least one.
alter table portal_users alter column phone drop not null;
alter table portal_users add constraint portal_users_phone_or_email check (
  phone is not null or email is not null
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `portal_link_requests` — the unbound accounts staff can see
--
-- D2: "an unmatched or unverified account is bound to nothing, sees nothing
-- under RLS, and appears to staff as a pending link request." An unbound
-- account cannot be a `portal_users` row (`client_id` is NOT NULL there, and
-- weakening THAT column would weaken tenant isolation everywhere it is read),
-- so the pending state is its own table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists portal_link_requests (
  id            uuid        not null default gen_random_uuid() primary key,
  client_uuid   uuid        not null,
  auth_user_id  uuid        not null references auth.users (id),
  -- The email AS SUBMITTED, kept verbatim for the staff card. Matching always
  -- recomputes from auth.users at bind time; this column is display, not input.
  email         text        not null,
  created_at    timestamptz not null default now(),
  -- Set when portal_claim_by_verified_email() bound the account (and names the
  -- resulting portal_users row), or when staff resolve it by hand.
  resolved_at   timestamptz,
  portal_user_id uuid       references portal_users (id),
  -- Law 3 — a rejected request is voided, never deleted.
  voided_at     timestamptz,
  void_reason   text,

  constraint portal_link_requests_client_uuid_key unique (client_uuid),
  constraint portal_link_requests_one_open_per_account unique (auth_user_id),
  constraint portal_link_requests_void_needs_reason check (
    voided_at is null or (void_reason is not null and char_length(btrim(void_reason)) > 0)
  )
);

comment on table portal_link_requests is
  'Self-registered portal accounts awaiting a client binding (D2, ruled 30 Aug 2026). '
  'A row here grants NOTHING — it exists so staff can see who is knocking. Binding '
  'happens only in portal_claim_by_verified_email(), only on verified control of the '
  'exact email stored on a client record.';

alter table portal_link_requests enable row level security;

-- The account itself may see its own request (so the portal can say "pending").
create policy portal_link_requests_self_read on portal_link_requests
  for select to authenticated
  using (auth_user_id = auth.uid());

-- Staff see all — this is the feed for the Clients card.
create policy portal_link_requests_staff_read on portal_link_requests
  for select to authenticated
  using (auth_is_staff());

-- The account files its own request, for itself, once (unique above).
create policy portal_link_requests_self_insert on portal_link_requests
  for insert to authenticated
  with check (auth_user_id = auth.uid());

-- Staff may resolve or void — an UPDATE, never a DELETE (Law 3). No DELETE
-- policy exists and none may be added.
create policy portal_link_requests_staff_update on portal_link_requests
  for update to authenticated
  using (auth_is_staff())
  with check (auth_is_staff());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The binding function — the ONLY writer of a self-registered binding
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function portal_claim_by_verified_email()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_confirmed  timestamptz;
  v_client_id  uuid;
  v_match_count integer;
  v_portal_id  uuid;
begin
  if v_uid is null then
    raise exception 'portal_claim_by_verified_email: no authenticated user';
  end if;

  -- Already bound? Idempotent success — return the existing binding.
  select id into v_portal_id from portal_users where auth_user_id = v_uid;
  if found then
    return jsonb_build_object('bound', true, 'portal_user_id', v_portal_id, 'replayed', true);
  end if;

  -- The verified email, read from Auth — NEVER from caller input. The
  -- verification link is Supabase's; control of the inbox is what
  -- email_confirmed_at attests.
  select lower(btrim(email)), email_confirmed_at
    into v_email, v_confirmed
    from auth.users
   where id = v_uid;

  if v_email is null or v_confirmed is null then
    -- Unverified: bound to nothing, sees nothing. Not an error — the portal
    -- shows "check your inbox".
    return jsonb_build_object('bound', false, 'reason', 'email not verified');
  end if;

  -- EXACT match on the client's stored email. lower+trim is normalisation of
  -- the same address, not fuzziness; no name, domain or similarity matching,
  -- ever (D2's letter). Two matching clients = ambiguous = NO bind.
  select count(*), min(id::text)::uuid
    into v_match_count, v_client_id
    from clients
   where email is not null
     and lower(btrim(email)) = v_email
     and deactivated_at is null;

  if v_match_count <> 1 or v_client_id is null
     or exists (select 1 from portal_users where client_id = v_client_id and deactivated_at is null and self_registered_at is not null) then
    -- No match, ambiguous, or already claimed: stays a pending request. The
    -- upsert keeps the row current without ever granting anything.
    insert into portal_link_requests (client_uuid, auth_user_id, email)
    values (gen_random_uuid(), v_uid, v_email)
    on conflict (auth_user_id) do nothing;
    return jsonb_build_object('bound', false, 'reason', 'no unambiguous client match; staff will review');
  end if;

  insert into portal_users (
    client_uuid, client_id, auth_user_id, email, email_verified_at,
    self_registered_at, status, activated_at, phone
  )
  values (
    gen_random_uuid(),  -- server-side act; no browser press exists to mint the key
    v_client_id,
    v_uid,
    v_email,
    v_confirmed,
    now(),
    'Active',
    now(),
    null
  )
  returning id into v_portal_id;

  update portal_link_requests
     set resolved_at = now(), portal_user_id = v_portal_id
   where auth_user_id = v_uid and resolved_at is null and voided_at is null;

  return jsonb_build_object('bound', true, 'portal_user_id', v_portal_id, 'replayed', false);
end;
$$;

comment on function portal_claim_by_verified_email() is
  'D2 (30 Aug 2026): binds the calling auth user to a client IFF their VERIFIED email '
  'exactly matches exactly one active client''s stored email and that client is not '
  'already claimed. Anything else records/keeps a pending link request and binds '
  'nothing. SECURITY DEFINER because it must read auth.users and be the single, '
  'race-safe writer of self-registered bindings.';

revoke all on function portal_claim_by_verified_email() from public;
grant execute on function portal_claim_by_verified_email() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The trio's real policies
-- ─────────────────────────────────────────────────────────────────────────────

-- portal_users: an account reads its own row; staff read all (the Clients
-- screen's portal panel). Writes stay function/staff-side: no INSERT policy
-- for self (the definer function writes), staff manage rows for the invite
-- path and deactivation.
create policy portal_users_self_read on portal_users
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy portal_users_staff_read on portal_users
  for select to authenticated
  using (auth_is_staff());

create policy portal_users_staff_write on portal_users
  for insert to authenticated
  with check (auth_is_staff());

create policy portal_users_staff_update on portal_users
  for update to authenticated
  using (auth_is_staff())
  with check (auth_is_staff());

-- No DELETE policy — rows are deactivated, never deleted (Law 3, 0005's
-- comments on deactivated_at / closed_at).

comment on table portal_users is
  'Portal identities. Self-registration binds ONLY via portal_claim_by_verified_email() '
  '(D2, 30 Aug 2026 — verified control of the exact email stored on the client; no fuzzy '
  'matching ever). Unbound accounts have no row here — see portal_link_requests. '
  'Policies added by 0072, replacing the deny-all 0054 documented.';

-- portal_sessions: the phone/OTP session table. An account may read ITS OWN
-- sessions (via its portal_users binding); staff may read for support. All
-- writes remain service-role-only — the OTP flow is server-side by 0005's own
-- rule, and no browser writes a session row directly.
create policy portal_sessions_self_read on portal_sessions
  for select to authenticated
  using (
    portal_user_id in (select id from portal_users where auth_user_id = auth.uid())
  );

create policy portal_sessions_staff_read on portal_sessions
  for select to authenticated
  using (auth_is_staff());

comment on table portal_sessions is
  'Portal OTP sessions (invite path). SELECT: own rows via portal_users.auth_user_id, '
  'or staff. Writes: service role only — no policy grants them, deliberately (0072).';

-- portal_auth_challenges: 0005:1046 — "reading another phone''s challenge row
-- is account takeover". Service-role only, now as an EXPLICIT policy rather
-- than a zero-policy table that reads as an oversight. `using (false)` is
-- equivalent to the old denial and survives policy-count lint sweeps with its
-- intent attached.
create policy portal_auth_challenges_service_only on portal_auth_challenges
  for all to authenticated
  using (false)
  with check (false);

comment on table portal_auth_challenges is
  'OTP challenges. Service-role only — the explicit using(false) policy added by 0072 '
  'replaces the deliberate zero-policy denial of 0049/0054. Reading another phone''s '
  'challenge row is account takeover (0005:1046); no authenticated path may exist.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Post-conditions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('portal_users', 'portal_sessions', 'portal_auth_challenges', 'portal_link_requests');
  if n <> 11 then
    raise exception '0072 post-condition failed: expected 11 portal policies, found %', n;
  end if;

  -- The one thing D2 forbids above all: an authenticated INSERT/UPDATE path
  -- into portal_users that is not staff-gated. Self-binding must have exactly
  -- one door, and it is the definer function.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename = 'portal_users'
     and cmd in ('INSERT', 'UPDATE')
     and coalesce(qual, with_check) not like '%auth_is_staff%';
  if n <> 0 then
    raise exception '0072 post-condition failed: a non-staff write policy exists on portal_users';
  end if;

  raise notice '0072 OK — portal trio has real policies; binding is by verified email only';
end $$;

commit;
