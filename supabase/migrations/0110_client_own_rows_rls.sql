-- =============================================================================
-- Migration 0110: `client own rows` RLS policies (Stage 1 - 9th DB Gate)
--
-- Closes the 9th DB Enforcement gate:
-- - In 0020, clients_select, bookings_select and booking_lines_select were restricted
--   to auth_is_staff(), completely locking out non-staff / Client roles from seeing
--   even their own records.
-- - This migration defines auth_client_id() to resolve the acting user's client binding
--   (from portal_users or linked client account).
-- - Scopes SELECT policies on clients, bookings, and booking_lines: staff continue
--   to see all operational rows, while a Client role sees ONLY their own rows and is
--   denied access to other clients' rows.
-- - Money tables (invoices, payments, security_deposits) remain masked from money-blind
--   roles (Warehouse, Technician, Driver, Client) under Law 6 (0011/0014/0038/0062).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- 1. Helper function to resolve the acting client's ID
create or replace function public.auth_client_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.client_id
    from portal_users p
   where (p.auth_user_id = auth_user_id() or p.id = auth_user_id())
     and p.status = 'Active'
     and p.deactivated_at is null
  union all
  select p.client_id
    from portal_users p
    join users u on u.id = auth_user_id() and lower(btrim(u.email)) = lower(btrim(p.email))
   where p.status = 'Active'
     and p.deactivated_at is null
  union all
  select c.id
    from clients c
    join users u on u.id = auth_user_id() and lower(btrim(u.email)) = lower(btrim(c.email))
   where c.deactivated_at is null
  limit 1;
$$;

comment on function public.auth_client_id() is
  'Resolves the clients.id uuid bound to the current auth identity (via portal_users or linked email). '
  'Returns null for unauthenticated users, unbound users, or internal staff without an attached client.';

grant execute on function public.auth_client_id() to authenticated;

-- 2. clients_select: staff read all; clients read own row only
drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select
  using (
    auth_is_staff()
    or id = auth_client_id()
  );

-- 3. bookings_select: staff read all; clients read own bookings only
drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select
  using (
    auth_is_staff()
    or client_id = auth_client_id()
  );

-- 4. booking_lines_select: staff read all; clients read lines for own bookings only
drop policy if exists booking_lines_select on booking_lines;
create policy booking_lines_select on booking_lines
  for select
  using (
    auth_is_staff()
    or exists (
      select 1 from bookings b
       where b.id = booking_lines.booking_id
         and b.client_id = auth_client_id()
    )
  );

commit;
