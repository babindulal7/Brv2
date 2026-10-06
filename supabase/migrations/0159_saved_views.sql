-- ============================================================================
-- 0159_saved_views.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G2. Saved views lived in `localStorage` (SavedViewsMenu): per device, not
-- shareable, no built-ins. Floor staff reuse the same handful of views daily.
--
-- WHAT
-- ----
--   saved_views   one row per view: list_key (which screen), query (the URL filter string, already
--                 normalised by the client), hidden_columns, owner, visibility private | team.
--                 Five SYSTEM views are seeded for the Rentals list (is_system, owner null,
--                 not retirable): Pickups today · Returns today · Overdue · Awaiting inspection · Drafts.
--                 They carry a relative filter (`quick=Pickups Today`), never a date literal, so they
--                 resolve through the operational day (settings.operationalDayStart) when opened.
--   save_view()   create / update (staff may make private views; publishing a TEAM view is Manager+ — D-3).
--   retire_view() the only way a view goes away (Law 3): retired_at is set, the row stays.
--
-- LAW 6: `touches_money` is computed in the database from the query (never trusted from the client). A
-- view whose filter touches money is invisible to Warehouse · Technician · Driver · Client, and one of
-- those roles cannot save such a view either.
--
-- RULING 2026-10-07: D-3 proposal adopted (⭐ B-5) — Manager and above may publish a team view; anyone
-- staff may make a private one. REVERT: change v_can_publish in save_view() (one line).
-- REVERT ALL: drop function save_view, retire_view, saved_view_query_touches_money; drop table saved_views.
-- ============================================================================

begin;

create table saved_views (
  id             uuid         not null default gen_random_uuid() primary key,
  client_uuid    uuid         not null,
  list_key       text         not null,
  name           text         not null,
  query          text         not null default '',
  hidden_columns text[]       not null default '{}',
  sort           text,
  owner_id       uuid         references users (id),
  visibility     text         not null default 'private',
  is_system      boolean      not null default false,
  system_key     text,
  touches_money  boolean      not null default false,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  retired_at     timestamptz,
  retired_by     uuid         references users (id),

  constraint saved_views_client_uuid_key unique (client_uuid),
  constraint saved_views_list_key_shape check (list_key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  constraint saved_views_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint saved_views_visibility_valid check (visibility in ('private', 'team')),
  constraint saved_views_system_shape check (
    (is_system and owner_id is null and visibility = 'team' and system_key is not null)
    or (not is_system and owner_id is not null and system_key is null)
  )
);

create unique index saved_views_system_key_key on saved_views (system_key) where system_key is not null;
create unique index saved_views_team_name_key
  on saved_views (list_key, lower(btrim(name))) where visibility = 'team' and retired_at is null;
create unique index saved_views_private_name_key
  on saved_views (list_key, owner_id, lower(btrim(name))) where visibility = 'private' and retired_at is null;

-- Which queries touch money. Stricter wins (B-1): a key on this list, or the Payment Due chip.
create or replace function saved_view_query_touches_money(p_query text)
returns boolean language sql immutable as $$
  select coalesce(p_query, '') ~* '(^|&)(total|rental_total|outstanding|balance|paid|deposit|amount|price|rate|revenue|payment_status|min_total|max_total|payment)[^=&]*='
      or coalesce(p_query, '') ~* '=(Payment(\+|%20| )Due)(&|$)';
$$;

-- ---------------------------------------------------------------------------
-- Law 3 backstops. A system view is fixed; nothing is deleted.
-- ---------------------------------------------------------------------------
create or replace function saved_views_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if OLD.is_system and (
       NEW.is_system is distinct from OLD.is_system or NEW.retired_at is distinct from OLD.retired_at
       or NEW.query is distinct from OLD.query or NEW.name is distinct from OLD.name
       or NEW.hidden_columns is distinct from OLD.hidden_columns or NEW.system_key is distinct from OLD.system_key
     ) then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

create trigger trg_saved_views_guard before update on saved_views
  for each row execute function saved_views_guard();
create trigger trg_saved_views_reject_delete before delete on saved_views
  for each row execute function reject_delete_nothing_is_deleted('retire the view; the row stays');

-- ---------------------------------------------------------------------------
-- RLS — read only; every write goes through the two RPCs below.
-- ---------------------------------------------------------------------------
alter table saved_views enable row level security;

create policy saved_views_select on saved_views for select to authenticated
  using (
    auth_is_staff()
    and retired_at is null
    and (is_system or visibility = 'team' or owner_id = auth_user_id())
    and (not touches_money or auth_can_view_money())
  );

revoke all on saved_views from public, anon, authenticated;
grant select on saved_views to authenticated;

revoke all on function saved_view_query_touches_money(text) from public, anon;
grant execute on function saved_view_query_touches_money(text) to authenticated;
revoke all on function saved_views_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_view — create (p_id null) or update one the caller may edit.
-- ---------------------------------------------------------------------------
create or replace function public.save_view(
  p_client_uuid uuid,
  p_list_key text,
  p_name text,
  p_query text,
  p_hidden_columns text[],
  p_visibility text,
  p_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth_user_id();
  v_can_publish boolean := auth_user_role() in ('Owner', 'Admin', 'Manager');
  v_money boolean := saved_view_query_touches_money(p_query);
  v_name text := btrim(coalesce(p_name, ''));
  v_existing saved_views%rowtype;
  v_row saved_views%rowtype;
begin
  if not auth_is_staff() or v_me is null then
    raise exception 'GATE:gate.saved_view.role|Only staff may save views.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.saved_view.idempotency|A saved view requires a client UUID.' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'GATE:gate.saved_view.name|A view name is 1 to 60 characters.' using errcode = 'P0001';
  end if;
  if coalesce(p_visibility, 'private') not in ('private', 'team') then
    raise exception 'GATE:gate.saved_view.visibility|Visibility is private or team.' using errcode = 'P0001';
  end if;
  if p_visibility = 'team' and not v_can_publish then
    raise exception 'GATE:gate.saved_view.publish|Only a Manager or above may publish a team view.' using errcode = 'P0001';
  end if;
  if v_money and not auth_can_view_money() then
    raise exception 'GATE:gate.saved_view.money|This role cannot save a view that filters on money.' using errcode = 'P0001';
  end if;

  select * into v_existing from saved_views where client_uuid = p_client_uuid;
  if found then
    return v_existing.id;           -- retried request
  end if;

  if p_id is null then
    insert into saved_views (client_uuid, list_key, name, query, hidden_columns, owner_id, visibility, touches_money)
    values (p_client_uuid, p_list_key, v_name, coalesce(p_query, ''), coalesce(p_hidden_columns, '{}'),
            v_me, coalesce(p_visibility, 'private'), v_money)
    returning * into v_row;
    return v_row.id;
  end if;

  select * into v_row from saved_views where id = p_id for update;
  if not found or v_row.retired_at is not null then
    raise exception 'GATE:gate.saved_view.not_found|That view no longer exists.' using errcode = 'P0001';
  end if;
  if v_row.is_system then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  if not (v_row.owner_id = v_me or (v_row.visibility = 'team' and v_can_publish)) then
    raise exception 'GATE:gate.saved_view.not_yours|Only the owner may change this view.' using errcode = 'P0001';
  end if;
  update saved_views
     set name = v_name, query = coalesce(p_query, ''), hidden_columns = coalesce(p_hidden_columns, '{}'),
         visibility = coalesce(p_visibility, v_row.visibility), touches_money = v_money, updated_at = now()
   where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.save_view(uuid, text, text, text, text[], text, uuid) from public, anon;
grant execute on function public.save_view(uuid, text, text, text, text[], text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- retire_view — the terminal action. Owner for a private view, Manager+ for a team one.
-- ---------------------------------------------------------------------------
create or replace function public.retire_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth_user_id();
  v_row saved_views%rowtype;
begin
  if not auth_is_staff() or v_me is null then
    raise exception 'GATE:gate.saved_view.role|Only staff may retire views.' using errcode = 'P0001';
  end if;
  select * into v_row from saved_views where id = p_id for update;
  if not found or v_row.retired_at is not null then
    return;                         -- already gone: retiring twice is not an error
  end if;
  if v_row.is_system then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  if not (v_row.owner_id = v_me or (v_row.visibility = 'team' and auth_user_role() in ('Owner', 'Admin', 'Manager'))) then
    raise exception 'GATE:gate.saved_view.not_yours|Only the owner may retire this view.' using errcode = 'P0001';
  end if;
  update saved_views set retired_at = now(), retired_by = v_me, updated_at = now() where id = p_id;
end;
$$;

revoke all on function public.retire_view(uuid) from public, anon;
grant execute on function public.retire_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The five system views. Relative filters only — see header.
-- ---------------------------------------------------------------------------
insert into saved_views (client_uuid, list_key, name, query, owner_id, visibility, is_system, system_key) values
  (gen_random_uuid(), 'rentals', 'Pickups today',       'quick=Pickups+Today', null, 'team', true, 'rentals.pickups_today'),
  (gen_random_uuid(), 'rentals', 'Returns today',       'quick=Returns+Today', null, 'team', true, 'rentals.returns_today'),
  (gen_random_uuid(), 'rentals', 'Overdue',             'quick=Overdue',       null, 'team', true, 'rentals.overdue'),
  (gen_random_uuid(), 'rentals', 'Awaiting inspection', 'quick=Inspection',    null, 'team', true, 'rentals.awaiting_inspection'),
  (gen_random_uuid(), 'rentals', 'Drafts',              'stage=Draft',         null, 'team', true, 'rentals.drafts');

commit;
