-- ============================================================================
-- 0020_role_lookup_and_staff_retrofit.sql
--
-- Two fixes, found together auditing Phase 1 against its own gate (9 Aug
-- 2026), kept in one migration because the second is meaningless without
-- the first — see section 1.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · THE FOUNDATIONAL BUG: auth_user_role() cannot read `users`
--
-- `auth_user_role()` (0011, restated 0014) is `language sql stable` — NOT
-- `security definer` — so its body runs as the CALLING role, same as any
-- other query that role makes. Its body is:
--
--   select primary_role from users where id = ...current_setting...
--
-- `users` has `enable row level security` (0007_admin_security.sql:426) and,
-- verified by an exhaustive grep of every `create policy` statement across
-- all 19 migration files, NOT ONE POLICY has ever existed for it. Postgres
-- RLS semantics: a table with RLS enabled and zero policies returns ZERO
-- ROWS to any role that is not the table owner or BYPASSRLS — it does not
-- error, it silently returns nothing.
--
-- Consequence, if this schema were applied to a live database today: EVERY
-- call to `auth_user_role()`, for every user including Owner, resolves its
-- inner `select` to no rows, the `coalesce()` wrapper falls through to the
-- default, and the function returns `'Client'` for literally everyone,
-- regardless of their real `primary_role`. Since `'Client'` is excluded from
-- every single staff/finance/admin allow-list in 0011/0014/0017-reopen/0018
-- (correctly — it is the external portal role), this means every
-- role-gated policy in the entire schema — invoices, payments, deposits,
-- bookings, clients, the lot — denies EVERY session, Owner included. Only
-- the small number of `using (true)` policies (the exact opposite problem
-- this session has otherwise been closing) would have actually worked.
-- Net effect: not a security leak, but a total, silent, first-query outage —
-- the kind that would have taken a live debugging session to trace back to
-- "RLS enabled, zero policies, on the ONE table the entire auth layer reads
-- from," rather than anything resembling the areas already under audit.
--
-- THE FIX
-- A session must be able to read its OWN row — nothing more — for
-- `auth_user_role()`'s lookup to succeed. This is the standard, minimal
-- Postgres/Supabase idiom for this exact self-lookup pattern (compare
-- `auth_user_role()`'s own `current_setting('app.current_user_id', true)`
-- pattern, which this policy reuses verbatim rather than inventing a second
-- one). It does NOT make `users` broadly listable — an admin "manage users"
-- screen (if Phase 6 needs one) still has no policy letting Owner/Admin read
-- OTHER users' rows; that is a separate, real, not-yet-needed decision, not
-- assumed here.
-- ---------------------------------------------------------------------------

create policy users_select_own on users
  for select
  using (id = nullif(current_setting('app.current_user_id', true), '')::uuid);

comment on policy users_select_own on users is
  'Lets a session read exactly its own row -- the minimum auth_user_role() '
  '(0011) needs to resolve a real role instead of silently falling back to '
  'Client for everyone. Does not make users broadly listable; an admin '
  '"see all users" policy is a separate, later decision.';

-- ---------------------------------------------------------------------------
-- 2 · Retrofit the remaining `using (true)` SELECT policies to auth_is_staff()
--
-- A full re-read of every one of 0011's policies (this session, cross-
-- checked against 0014/0017-reopen/0018/0019) found 32 policies, not the
-- ~22 that 0014's and the original 0017's own comments both estimated --
-- correcting that count matters because sizing a retrofit off the wrong
-- number silently drops real work. Of the 32, six had no role check at all
-- (`using (true)`):
--
--   bookings_select, booking_lines_select, product_units_select (as
--   `inventory_units_select` before this session's fix -- see 0011/0018),
--   maintenance_records_select, operation_sessions_select, clients_select.
--
-- `booking_lines_select` and `product_units_select` are already handled --
-- the former by 0019, the latter by 0011's own fixed definition (this
-- session) plus 0019's idempotent restatement. The four below are the rest.
-- All four are operational, internal-staff tables with no money columns of
-- their own (money-bearing tables were already scoped narrower in 0011/0014
-- and are untouched here) -- `auth_is_staff()` is the correct, minimal
-- tightening: every staff role keeps full read access, only the external
-- Client portal role loses access it was never meant to have. For
-- `clients_select` specifically: the external-facing client portal
-- authenticates through `portal_users`/`portal_sessions`
-- (0005_clients.sql), a completely separate mechanism from `system_role` --
-- `0017-reopen`'s own comment states "Client is EXTERNAL -- portal only,
-- never a staff surface." So excluding `system_role = 'Client'` from the
-- internal `clients` renter-records table via `auth_is_staff()` matches the
-- documented architecture, not a guess.
--
-- The other 21 of the 32 (explicit operational-role allow-lists like
-- `bookings_insert`/`bookings_update`, and the 17 finance/admin-only ones)
-- are deliberately NOT touched here -- see PLAN.md §4.7 for why that is its
-- own, separate, not-yet-done pass, not an oversight in this one.
-- ---------------------------------------------------------------------------

drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select
  using (auth_is_staff());

drop policy if exists maintenance_records_select on maintenance_records;
create policy maintenance_records_select on maintenance_records
  for select
  using (auth_is_staff());

drop policy if exists operation_sessions_select on operation_sessions;
create policy operation_sessions_select on operation_sessions
  for select
  using (auth_is_staff());

drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select
  using (auth_is_staff());

commit;
