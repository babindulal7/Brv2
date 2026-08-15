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
--
-- ## Renumbered 0057 → 0059 on 15 Aug 2026
--
-- This file and `0057_damage_approval_rank.sql` both carried `0057`; its own
-- companion and `0058_late_fee_rank_and_approver_is_actor.sql` both carried
-- `0058`. Replaying this directory in filename order would therefore have run
-- damage → users → late_fee → staff, which is NOT the order that produced the
-- live project. There the four landed as versions 20260812163615 (damage),
-- 20260812165503 (late fee), 20260812170827 (this file) and 20260812170856
-- (staff row). The new numbers make filename order and applied order the same
-- sequence, so a rebuild from this directory reproduces what is live.
--
-- Nothing was re-applied and no SQL below changed. The project records an
-- applied migration by its timestamp version, not by this prefix, so the rename
-- is invisible to the live database; it matters only to a rebuild.
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
