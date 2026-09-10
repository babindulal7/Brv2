-- Migration 0120_users_visibility_and_role_ceiling.sql
-- S1-6 · Staff can be seen, and roles have a ceiling (PERMISSIONS.md §3.1 AD2, §10, Law 3)
--
-- 1. users gains deactivated_at timestamptz
-- 2. auth_user_branch_id() helper
-- 3. auth_user_role() updated to resolve deactivated users to 'Client'
-- 4. staff_directory_v view: dropped and recreated with masking and general staff access
-- 5. users RLS policies (self_read, read_staff_directory, update_admin, insert_admin)
-- 6. enforce_users_role_ceiling() trigger before insert or update on users
-- 7. reject_users_delete() trigger before delete on users (Law 3)

alter table users add column if not exists deactivated_at timestamptz;

create or replace function auth_user_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch_id from users
   where id = coalesce(
     nullif(current_setting('app.current_user_id', true), '')::uuid,
     auth.uid()
   );
$$;

revoke all on function auth_user_branch_id() from public;
grant execute on function auth_user_branch_id() to authenticated, service_role;

-- Deactivation resolves to Client immediately
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
      )
      and deactivated_at is null
      and is_active = true),
    'Client'::system_role
  );
$$;

revoke execute on function public.auth_user_role() from public;
grant execute on function public.auth_user_role() to authenticator, anon, authenticated, service_role;

-- 4 · staff_directory_v: names for assignment dropdowns (email/mobile masked for non-Owner/Admin)
drop view if exists staff_directory_v cascade;

create view staff_directory_v as
select
  u.id,
  u.full_name,
  u.employee_code,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.email
    else null
  end as email,
  u.primary_role,
  u.department,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.mobile
    else null
  end as mobile,
  u.branch_id,
  b.branch_code,
  b.name as branch_name,
  u.is_active,

  -- Credential state (Owner/Admin only)
  case
    when auth_user_role() in ('Owner', 'Admin') then (p.id is not null)
    else false
  end as has_pin,
  case
    when auth_user_role() in ('Owner', 'Admin') and p.locked_until > now() then p.locked_until
    else null
  end as pin_locked_until,
  case
    when auth_user_role() in ('Owner', 'Admin') then coalesce(p.rotated_at, p.set_at)
    else null
  end as pin_set_at,

  case
    when auth_user_role() in ('Owner', 'Admin') then (au.id is not null)
    else false
  end as has_auth_account,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.last_sign_in_at
    else null
  end as last_sign_in_at,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.email_confirmed_at
    else null
  end as email_confirmed_at

from users u
left join branches b
  on b.id = u.branch_id
left join staff_auth_pins p
  on p.user_id = u.id
 and p.revoked_at is null
left join auth.users au
  on au.id = u.id
where u.deactivated_at is null
  and u.is_active = true;

revoke all on staff_directory_v from public;
grant select on staff_directory_v to authenticated, service_role;

-- 5 · RLS policies on users
drop policy if exists users_select_own on users;
drop policy if exists users_self_read on users;
create policy users_self_read on users
  for select
  using (
    id = coalesce(
      nullif(current_setting('app.current_user_id', true), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists users_read_staff_directory on users;
create policy users_read_staff_directory on users
  for select
  using (
    auth_user_role() in ('Owner', 'Admin')
    or (
      auth_user_role() = 'Manager'
      and branch_id = auth_user_branch_id()
    )
  );

drop policy if exists users_update_admin on users;
create policy users_update_admin on users
  for update
  using (auth_user_role() in ('Owner', 'Admin'))
  with check (auth_user_role() in ('Owner', 'Admin'));

drop policy if exists users_insert_admin on users;
create policy users_insert_admin on users
  for insert
  with check (auth_user_role() in ('Owner', 'Admin'));

grant select, insert, update on users to authenticated, service_role;
revoke delete on users from public, authenticated, anon;

-- 6 · Role ceiling & invariant trigger
create or replace function enforce_users_role_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role system_role;
  v_caller_id uuid;
  v_owner_count integer;
begin
  v_caller_role := auth_user_role();
  v_caller_id := coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  );

  if TG_OP = 'INSERT' then
    if v_caller_role = 'Admin' and NEW.primary_role in ('Owner', 'Admin') then
      raise exception 'GATE:gate.users.role_ceiling|Admin cannot create user with role % (role ceiling AD2)',
        NEW.primary_role
        using errcode = 'P0001';
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    -- Role ceiling check
    if v_caller_role = 'Admin' and NEW.primary_role in ('Owner', 'Admin') and (OLD.primary_role is distinct from NEW.primary_role) then
      raise exception 'GATE:gate.users.role_ceiling|Admin cannot assign role % (role ceiling AD2)',
        NEW.primary_role
        using errcode = 'P0001';
    end if;

    if v_caller_role = 'Manager' and NEW.primary_role is distinct from OLD.primary_role then
      raise exception 'GATE:gate.users.role_ceiling|Manager cannot change user roles'
        using errcode = 'P0001';
    end if;

    -- Self-deactivation prohibited
    if NEW.id = v_caller_id and (
      (NEW.deactivated_at is not null and OLD.deactivated_at is null)
      or (NEW.is_active = false and OLD.is_active = true)
    ) then
      raise exception 'GATE:gate.users.self_deactivation|Users cannot deactivate their own account'
        using errcode = 'P0001';
    end if;

    -- Sync is_active and deactivated_at
    if NEW.deactivated_at is not null and OLD.deactivated_at is null then
      NEW.is_active := false;
    elsif NEW.is_active = false and OLD.is_active = true and NEW.deactivated_at is null then
      NEW.deactivated_at := now();
    elsif NEW.deactivated_at is null and OLD.deactivated_at is not null then
      NEW.is_active := true;
    end if;

    -- Last Owner protection
    if OLD.primary_role = 'Owner' and (
      NEW.primary_role <> 'Owner'
      or NEW.deactivated_at is not null
      or NEW.is_active = false
    ) then
      select count(*) into v_owner_count
        from users
       where primary_role = 'Owner'
         and deactivated_at is null
         and is_active = true
         and id <> OLD.id;

      if v_owner_count = 0 then
        raise exception 'GATE:gate.users.last_owner|Cannot demote or deactivate the last remaining active Owner'
          using errcode = 'P0001';
      end if;
    end if;

    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_users_role_ceiling on users;
create trigger trg_enforce_users_role_ceiling
  before insert or update on users
  for each row execute function enforce_users_role_ceiling();

-- 7 · Immutable users (Law 3 - no delete)
create or replace function reject_users_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'GATE:gate.users.immutable|Users cannot be deleted (Law 3). Deactivate instead.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_reject_users_delete on users;
create trigger trg_reject_users_delete
  before delete on users
  for each row execute function reject_users_delete();