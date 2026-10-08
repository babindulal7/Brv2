-- =============================================================================
-- 0067_staff_directory_view.sql — the staff directory, 24 Aug 2026
--
-- Design authority: `specs/09-staff-credentials.md`.
-- FILE ONLY on the live project (0064/0065 convention). Applied to the local stack.
--
-- WHY THIS VIEW EXISTS
-- ---------------------
-- `Settings ▸ People` has said this since it was built:
--
--   "How many staff accounts exist is not tracked yet — there is no user query
--    in this build. The full directory, user creation and role assignment need
--    the auth backend, which is not connected."
--   (src/modules/settings/sections/UsersRoles.tsx:145-149)
--
-- The auth backend HAS been connected since 0041. What was actually missing is
-- this read. Every other directory in the app goes through a view rather than a
-- screen-side join (`client_directory_v`, 0052/0053) and this follows it.
--
-- THE COLUMN THIS VIEW EXISTS FOR: has_auth_account
-- --------------------------------------------------
-- `public.users` and `auth.users` are joined by convention, not by a foreign
-- key — 0041's identity contract is "`auth.users.id` IS `public.users.id`" and
-- 0060's header spells out that nothing enforces it. So a staff row can exist
-- with no sign-in account behind it, and that is not a hypothetical: on 23 Aug
-- 2026 the local stack held five `public.users` rows and four `auth.users`
-- accounts, with `babindulal7@gmail.com` being the row that had no account.
--
-- That state breaks password reset SILENTLY, which is the reason this column is
-- not optional. `resetPasswordForEmail` answers identically for an address with
-- an account and one without — deliberately, because an endpoint that
-- distinguishes them is an account-enumeration oracle. So the client cannot
-- tell, the operator gets a success-shaped response, and the link never
-- arrives. The only place the truth exists is here, in a join the browser is
-- not allowed to perform.
--
-- Without this column the reset feature would be a button that sometimes does
-- nothing and never says so — a fresh entry for
-- SUCCESS_FABRICATION_REGISTER_2026-08-12.md.
--
-- WHY SECURITY DEFINER AND NOT security_invoker
-- ----------------------------------------------
-- 0048's rule for this schema: masking views run as their OWNER and carry the
-- row predicate INLINE. `client_directory_v` ends `where auth_is_staff()` for
-- exactly this reason, and 0065 records what happened when `bookings_deposit_v`
-- was shipped `security_invoker = on` instead.
--
-- It is also load-bearing here specifically: `authenticated` holds no privilege
-- on `auth.users` and must not be granted one. Owner rights on the view are the
-- only way to answer `has_auth_account` without handing the client a read of
-- the auth schema.
--
-- WHY THE PREDICATE IS `Owner` AND NOT `auth_is_staff()`
-- ------------------------------------------------------
-- `client_directory_v` is staff-wide because a client list is working data for
-- anyone on the floor. This is not that: it carries every colleague's email
-- plus their credential state (whether they hold a PIN, whether that PIN is
-- locked out, whether they can sign in at all). That is security metadata, and
-- a Driver has no operational use for it.
--
-- The predicate matches `canManageSettings` in `lib/rbac.ts`, which is
-- `role === 'Owner'` — Owner alone. `auth_is_finance_or_admin()` was the
-- obvious helper to reach for and is deliberately NOT used: 0014 defines it as
-- Owner, Admin, Coordinator, Accounts, and Coordinator seeing colleagues'
-- lockout state is a widening nobody has ruled on.
--
-- ⚠ If Admin should also hold this — a reasonable business call, since Admin
-- carries the operational load — that is a ruling, and it belongs in PLAN.md §4
-- with `canManageSettings` widened in the same change so the UI gate and this
-- predicate cannot drift apart. Do not widen it here alone.
-- =============================================================================

begin;

create or replace view staff_directory_v as
select
  u.id,
  u.full_name,
  u.employee_code,
  u.email,
  u.primary_role,
  u.department,
  u.mobile,
  b.branch_code,
  b.name                                        as branch_name,
  u.is_active,

  -- Credential state. Existence and lockout only — never a hash, never a count.
  (p.id is not null)                            as has_pin,
  case when p.locked_until > now() then p.locked_until end as pin_locked_until,
  coalesce(p.rotated_at, p.set_at)              as pin_set_at,

  -- The join 0041 leaves unenforced, answered once, here.
  (au.id is not null)                           as has_auth_account,
  au.last_sign_in_at,
  au.email_confirmed_at

from users u
left join branches b
  on b.id = u.branch_id
left join staff_auth_pins p
  on p.user_id = u.id
 and p.revoked_at is null
left join auth.users au
  on au.id = u.id

-- Row predicate, inline (0048's rule for every SECURITY DEFINER masking view).
-- Owner alone — see this file's header before widening.
where auth_user_role() = 'Owner';

grant select on staff_directory_v to authenticated;

comment on view staff_directory_v is
  'One row per staff member with branch, credential state and whether a sign-in account actually exists behind the staff row. Owner-only by inline predicate (matches rbac.canManageSettings). Query this for any staff list - never join auth.users from a screen, which cannot see it. has_auth_account is the column this view exists for: without it a password reset for a row with no auth account succeeds silently and the link never arrives (0041/0060 identity contract).';

commit;
