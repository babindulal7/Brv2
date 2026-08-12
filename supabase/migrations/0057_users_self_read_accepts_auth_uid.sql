-- =============================================================================
-- `users_select_own` must accept `auth.uid()`, not only the pre-request GUC.
--
-- ## The failure this fixes
--
-- A signed-in Owner got a CLIENT UI: money hidden, screens gated — while RLS
-- itself, after 0056, would have answered Owner. Two different answers to "who
-- is this" in the same session.
--
-- The app resolves its own identity by reading its `users` row directly
-- (`lib/auth.tsx` → `loadProfile`). That read is subject to `users_select_own`,
-- which was:
--
--     id = nullif(current_setting('app.current_user_id', true), '')::uuid
--
-- — the GUC 0041's `pgrst.db_pre_request` hook sets. Where that hook does not
-- run the predicate is `id = null`, the lookup returns nothing, and
-- `loadProfile`'s documented fallback for "authenticated but carrying no staff
-- row" is the `Client` role. That fallback is correct for the case it was
-- written for; it just cannot tell that case apart from "the policy would not
-- let me look".
--
-- ## Why this is narrow
--
-- The row you may read is still ONLY your own — the change is to how "your own"
-- is established, not to how many rows it covers. The GUC is read first and
-- still wins, so any request that was already working is unaffected.
--
-- Companion to 0056, which did the same for `auth_user_role()`. Both exist
-- because the GUC is a single point of failure that fails SILENTLY: no error,
-- no denial message, just an identity that resolves to the least-privileged
-- role and screens that render themselves correctly around nothing.
-- =============================================================================

begin;

alter policy users_select_own on public.users
  using (
    id = coalesce(
      nullif(current_setting('app.current_user_id', true), '')::uuid,
      auth.uid()
    )
  );

commit;
