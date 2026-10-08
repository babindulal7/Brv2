-- ============================================================================
-- 0158_settings_table.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G1. `lib/settingsStore.ts` kept every setting in `localStorage`, so two
-- devices could run different 06:00 cuts, deposit-skip toggles and VAT rates. PERMISSIONS.md §4.10
-- records "there is no `settings` table in `public`" — this is that table.
--
-- WHAT
-- ----
--   settings          one row per (key, scope, location). scope 'org' = the whole business,
--                     'location' = an override for one branch. Never deleted (Law 3).
--   settings_history  append-only: every change keeps old value, new value, actor, time (Law 3).
--                     Written by a trigger, so no path — RPC, service_role or table owner — skips it.
--   set_setting()     the ONLY write path for `authenticated`. Owner only, carries a client_uuid
--                     (a retry returns the first result, a reused uuid on a different change is refused).
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   any staff, EXCEPT money keys (is_money) which need auth_can_view_money() — Law 6.
--          Warehouse therefore never receives VAT / payment-terms / late-fee / deposit-rule values.
--   write  Owner only. The spec proposed Owner/Admin; PERMISSIONS.md §4.10 and rbac.canManageSettings
--          are Owner-only and B-1 (stricter wins) settles it. Revert = add 'Admin' to
--          set_setting()'s role list AND canManageSettings, together (B-3).
--   A setting never opens a DB gate on its own (0155): this table stores a preference, the gate
--   functions still decide.
--
-- LOCATION OVERRIDE (D-1, proposal adopted): only `operationalDayStart` may be overridden per
-- location; settings_location_overridable() is the one-line list to widen later.
--
-- RULING 2026-10-07: settings live in the database; localStorage keeps device UI preferences only.
-- REVERT: drop function set_setting; drop table settings_history; drop table settings; (nothing
-- else references them).
-- ============================================================================

begin;

create table settings (
  id               uuid         not null default gen_random_uuid() primary key,
  key              text         not null,
  value            jsonb        not null,
  scope            text         not null default 'org',
  location_id      uuid         references branches (id),
  is_money         boolean      not null default false,
  last_client_uuid uuid,
  updated_by       uuid         references users (id),
  updated_at       timestamptz  not null default now(),
  created_at       timestamptz  not null default now(),

  constraint settings_key_shape check (key ~ '^[A-Za-z][A-Za-z0-9]{0,63}$'),
  constraint settings_scope_valid check (scope in ('org', 'location')),
  constraint settings_scope_location check (
    (scope = 'org' and location_id is null) or (scope = 'location' and location_id is not null)
  ),
  constraint settings_value_scalar check (jsonb_typeof(value) in ('string', 'number', 'boolean'))
);

create unique index settings_key_scope_location_key
  on settings (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table settings_history (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  setting_id    uuid         not null references settings (id),
  key           text         not null,
  scope         text         not null,
  location_id   uuid,
  old_value     jsonb,
  new_value     jsonb        not null,
  changed_by    uuid,
  changed_at    timestamptz  not null default now(),

  constraint settings_history_client_uuid_key unique (client_uuid)
);

create index idx_settings_history_setting on settings_history (setting_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Which keys are money (Law 6) and which may be overridden per location. Immutable lists in code,
-- so adding a key is a migration, exactly like a permission cell.
-- ---------------------------------------------------------------------------
create or replace function settings_is_money_key(p_key text)
returns boolean language sql immutable as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose'
  );
$$;

create or replace function settings_location_overridable(p_key text)
returns boolean language sql immutable as $$
  select p_key in ('operationalDayStart');
$$;

revoke all on function settings_is_money_key(text), settings_location_overridable(text) from public, anon;
grant execute on function settings_is_money_key(text), settings_location_overridable(text) to authenticated;

-- ---------------------------------------------------------------------------
-- History is written by a trigger so no write path can skip it.
-- ---------------------------------------------------------------------------
create or replace function settings_write_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into settings_history (client_uuid, setting_id, key, scope, location_id, old_value, new_value, changed_by)
  values (
    coalesce(NEW.last_client_uuid, gen_random_uuid()), NEW.id, NEW.key, NEW.scope, NEW.location_id,
    case when TG_OP = 'UPDATE' then OLD.value else null end,
    NEW.value, NEW.updated_by
  );
  return NEW;
end;
$$;

revoke all on function settings_write_history() from public, anon, authenticated;

create trigger trg_settings_history after insert or update on settings
  for each row execute function settings_write_history();

create trigger trg_settings_reject_delete before delete on settings
  for each row execute function reject_delete_nothing_is_deleted('set a new value; the old one stays in settings_history');
create trigger trg_settings_history_reject_update before update on settings_history
  for each row execute function reject_update_append_only('none — a later change is its own history row');
create trigger trg_settings_history_reject_delete before delete on settings_history
  for each row execute function reject_delete_nothing_is_deleted('none — history is never removed');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table settings enable row level security;
alter table settings_history enable row level security;

create policy settings_select on settings for select to authenticated
  using (auth_is_staff() and (not is_money or auth_can_view_money()));

create policy settings_history_select on settings_history for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager') and (not settings_is_money_key(key) or auth_can_view_money()));

revoke all on settings, settings_history from public, anon, authenticated;
grant select on settings, settings_history to authenticated;

-- ---------------------------------------------------------------------------
-- The write path.
-- ---------------------------------------------------------------------------
create or replace function public.set_setting(
  p_client_uuid uuid,
  p_key text,
  p_value jsonb,
  p_scope text default 'org',
  p_location_id uuid default null
) returns table (setting_id uuid, value jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_hist settings_history%rowtype;
  v_row settings%rowtype;
  v_scope text := coalesce(p_scope, 'org');
begin
  if auth_user_role() is distinct from 'Owner' then
    raise exception 'GATE:gate.settings.role|Only the Owner may change settings.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.settings.idempotency|A settings change requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
    raise exception 'GATE:gate.settings.key|Not a valid setting key.' using errcode = 'P0001';
  end if;
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number', 'boolean') then
    raise exception 'GATE:gate.settings.value|A setting is a single text, number or yes/no value.' using errcode = 'P0001';
  end if;
  if v_scope not in ('org', 'location') then
    raise exception 'GATE:gate.settings.scope|Scope must be org or location.' using errcode = 'P0001';
  end if;
  if v_scope = 'location' and (p_location_id is null or not settings_location_overridable(p_key)) then
    raise exception 'GATE:gate.settings.not_overridable|This setting applies to the whole business and has no per-location override.' using errcode = 'P0001';
  end if;
  if v_scope = 'org' and p_location_id is not null then
    raise exception 'GATE:gate.settings.scope|An org setting carries no location.' using errcode = 'P0001';
  end if;

  select * into v_existing_hist from settings_history h where h.client_uuid = p_client_uuid;
  if found then
    if v_existing_hist.key <> p_key or v_existing_hist.new_value <> p_value
       or v_existing_hist.scope <> v_scope or v_existing_hist.location_id is distinct from p_location_id then
      raise exception 'GATE:gate.settings.idempotency_conflict|Client UUID already belongs to a different change.' using errcode = 'P0001';
    end if;
    return query select v_existing_hist.setting_id, v_existing_hist.new_value;
    return;
  end if;

  select * into v_row from settings s
   where s.key = p_key and s.scope = v_scope
     and coalesce(s.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
   for update;

  if found then
    if v_row.value = p_value then
      return query select v_row.id, v_row.value;   -- no change, no history row
      return;
    end if;
    update settings
       set value = p_value, last_client_uuid = p_client_uuid, updated_by = auth_user_id(), updated_at = now()
     where id = v_row.id;
    return query select v_row.id, p_value;
  else
    insert into settings (key, value, scope, location_id, is_money, last_client_uuid, updated_by)
    values (p_key, p_value, v_scope, p_location_id, settings_is_money_key(p_key), p_client_uuid, auth_user_id())
    returning id into v_row.id;
    return query select v_row.id, p_value;
  end if;
end;
$$;

revoke all on function public.set_setting(uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function public.set_setting(uuid, text, jsonb, text, uuid) to authenticated;

commit;
