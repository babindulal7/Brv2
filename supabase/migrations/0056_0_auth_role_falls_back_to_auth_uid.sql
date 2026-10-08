-- =============================================================================
-- 0056_0 — RECOVERED 16 Aug 2026. Superseded one minute after it was applied.
--
-- ## Why this file did not exist until today
--
-- This migration was applied to the live project as version `20260812160730`
-- and **its source was never committed**. `PLAN.md` §4.33(3) recorded the
-- consequence: the repo could not rebuild the database, because one applied
-- migration existed only inside `supabase_migrations.schema_migrations`.
--
-- The SQL below is that row, copied out of `schema_migrations.statements`
-- verbatim. Nothing was reconstructed or inferred.
--
-- ## It is superseded, and a rebuild may skip it
--
-- `0056_auth_role_resolves_without_pre_request_hook.sql` was applied at
-- `20260812160830` — sixty seconds later — and is a `create or replace` of the
-- same function. It keeps this file's `coalesce(GUC, auth.uid())` and adds what
-- this one lacked: `SECURITY DEFINER`, so the role resolver sits outside the
-- policies that depend on it, plus a pinned `search_path` and revoked EXECUTE.
--
-- So the end state of applying both is identical to applying only the later one.
-- This file is retained for provenance — a faithful replay of history, and the
-- answer to "what was `20260812160730`?" — not because a rebuild needs it.
--
-- The filename sorts before `0056_auth_role_resolves…` ( `_0_` < `_a` ) so that
-- directory order still matches applied order, which is the property the
-- 0057-0060 renumbering established.
--
-- ⚠ Do not "fix" this file by adding SECURITY DEFINER to it. It is a record of
-- what ran, not a migration anyone should improve.
-- =============================================================================

-- Resolve the caller from auth.uid() when the pre-request GUC is absent.
--
-- 0041 bridges Supabase auth into `app.current_user_id` with a
-- `pgrst.db_pre_request` hook. When that hook does not run, `auth_user_role()`
-- fell through to 'Client', `auth_is_staff()` returned false, and every
-- RLS-protected select returned ZERO ROWS WITH NO ERROR — a signed-in Owner
-- seeing empty lists on every screen, which is indistinguishable from an empty
-- database.
--
-- NOT a widening. Both paths land on the SAME users row and read that row's own
-- primary_role. The GUC still wins where it is set, so any server-side caller
-- that sets it explicitly is unaffected.
create or replace function public.auth_user_role()
returns system_role
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select primary_role from users
      where id = coalesce(
        nullif(current_setting('app.current_user_id', true), '')::uuid,
        auth.uid()
      )),
    'Client'::system_role
  );
$$;
