-- =============================================================================
-- `auth_user_role()` must be able to read the caller's own `users` row.
--
-- ## The failure this fixes
--
-- A signed-in Owner saw EMPTY LISTS ON EVERY SCREEN, with no error anywhere —
-- indistinguishable from an empty database. The database was not empty: 120
-- bookings, 41 clients, 56 products. Every one of them was invisible.
--
-- `auth_user_role()` is the predicate the whole RLS layer is built on:
-- `auth_is_staff()` is `auth_user_role() <> 'Client'`, and `bookings_select`,
-- `clients_select` and their siblings are `auth_is_staff()`. It resolved the
-- caller by reading `users` — and it was SECURITY INVOKER, so that read was
-- itself subject to the policies that call this function to decide access.
--
-- That is a cycle: you must read `users` to learn your role, and you need a
-- role to read `users`. It is broken only by `app.current_user_id`, the GUC
-- 0041's `pgrst.db_pre_request` hook sets from `auth.uid()`, which the `users`
-- self-read policy accepts directly. Where that hook runs, everything works.
-- Where it does not, the function falls through to its `coalesce` default of
-- 'Client' and every protected select returns zero rows — silently, because
-- "you may see nothing" is not an error.
--
-- Verified on the live project before and after, as role `authenticated` with
-- the GUC absent:
--
--   before → auth_user_role() = 'Client' · bookings 0 · clients 0 · products 0
--   after  → auth_user_role() = 'Owner'  · bookings 120 · clients 41 · products 56
--
-- ## Why SECURITY DEFINER is the right instrument
--
-- It is the only way for the role resolver to sit outside the policies that
-- depend on it. The exposure is one enum value about the CALLER'S OWN row: the
-- lookup is keyed by the caller's identity and nothing else, so the function
-- cannot report another user's role, cannot return a row, and cannot be steered
-- by an argument — it takes none.
--
-- `search_path` is pinned (0050's rule), and EXECUTE is revoked from `public`
-- and granted to the four roles that need it, so the definer's rights are not
-- reachable from anywhere else.
--
-- ## What is deliberately unchanged
--
-- The GUC is still read FIRST and still wins. Any server-side caller that sets
-- `app.current_user_id` explicitly — and 0041's hook, where it runs — behaves
-- exactly as before. `auth.uid()` is a fallback, not a replacement, so this
-- migration cannot change the answer for a request that was already working.
-- =============================================================================

begin;

create or replace function public.auth_user_role()
returns system_role
language sql
stable
security definer
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

revoke execute on function public.auth_user_role() from public;
grant execute on function public.auth_user_role() to authenticator, anon, authenticated, service_role;

commit;
