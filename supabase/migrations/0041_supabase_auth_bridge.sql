-- ============================================================================
-- 0041_supabase_auth_bridge.sql — first go-live bridge, 10 Aug 2026
--
-- THE PROBLEM
-- ------------
-- Every auth-aware expression in this schema — `auth_user_role()` (0011/0014),
-- `log_audit_event()`'s actor stamp (0010), `users_select_own` (0020), the
-- stage-transition actor pin (0021), and every self-row-scoping policy
-- (`notifications` 0031, `timesheets` 0032) — reads ONE thing:
--
--     current_setting('app.current_user_id', true)
--
-- a custom Postgres GUC. A browser Supabase client (anon key + Supabase Auth
-- session) has no way to set a GUC per request, so as applied through 0040
-- every one of those expressions resolves NULL → the 'Client' fallback role →
-- every staff-gated policy denies everyone. This is the exact silent-outage
-- shape PLAN.md §6.8 already documented for the policy-less-`users` bug —
-- same failure, different missing link.
--
-- THE FIX — one hook, zero rewrites
-- ----------------------------------
-- PostgREST (the API layer in front of this database) supports
-- `db_pre_request`: a function it calls inside the transaction at the start
-- of EVERY request. Setting the GUC there from the request's real Supabase
-- Auth identity (`auth.uid()`) makes every existing GUC read work unchanged —
-- no function body rewritten, no policy touched, one definition to audit.
-- `set_config(..., true)` is transaction-local, so nothing leaks across
-- pooled connections.
--
-- Staff identity contract: a staff member's `auth.users.id` IS their
-- `public.users.id` (enforced at user creation). No mapping table;
-- `auth.uid()` lands directly on the row every policy already joins.
--
-- IDENTITY BOOTSTRAP IS DELIBERATELY NOT IN THIS FILE. An earlier draft
-- seeded the Owner's auth.users row here with a hardcoded temporary
-- password — a cleartext credential persisted into repo/migration history,
-- which is exactly the class of leak Platform Build Instructions §7 exists
-- to prevent. Bootstrap is executed out-of-band instead (a one-time
-- statement with a runtime-generated password handed to the owner through a
-- private channel and rotated on first login); this migration stays
-- credential-free.
--
-- TODO(decision): portal (Client-role) sessions still need their own scheme —
-- flagged since §6.8, unchanged here. This bridge is the staff path only.
-- ============================================================================

-- 0 · pgcrypto (crypt/gen_salt for the out-of-band bootstrap; usually
--     pre-enabled on Supabase; harmless if already present).
create extension if not exists pgcrypto with schema extensions;

-- 1 · The per-request hook.
create or replace function public.set_request_context()
returns void
language sql
as $$
  select set_config(
    'app.current_user_id',
    coalesce(auth.uid()::text, ''),
    true  -- transaction-local: dies with the request, safe under pooling
  );
$$;

grant execute on function public.set_request_context() to authenticator, anon, authenticated;

-- 2 · Tell PostgREST to call it on every request, and reload its config now.
alter role authenticator set pgrst.db_pre_request = 'public.set_request_context';
notify pgrst, 'reload config';
