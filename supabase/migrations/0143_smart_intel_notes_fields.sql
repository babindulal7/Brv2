-- Smart Intel Cards: append-only notes and classified custom fields.
-- RULING 2026-09-29: existing booking notes stay all_staff; new notes use
-- all_staff / operations (staff except Accounts) / management (O/A/M).
-- WRITTEN for local verification only. N-5 forbids live application here.

alter table booking_notes
  add column visibility text not null default 'all_staff'
  constraint booking_notes_visibility_check
  check (visibility in ('all_staff', 'operations', 'management'));

-- A permissive FOR ALL policy would OR with a new SELECT policy and leak
-- management notes. Replace it with command-specific policies.
drop policy if exists booking_notes_all on booking_notes;
drop policy if exists booking_notes_select on booking_notes;
create policy booking_notes_select on booking_notes for select
  using (
    auth_is_staff() and archived_at is null and (
      visibility = 'all_staff'
      or (visibility = 'operations' and auth_user_role() <> 'Accounts')
      or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))
    )
  );
create policy booking_notes_insert on booking_notes for insert
  with check (
    auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and created_by = auth_user_id()
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager'))
  );
create policy booking_notes_update on booking_notes for update
  using (archived_at is null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and (visibility = 'all_staff' or (visibility = 'operations' and auth_user_role() <> 'Accounts')
      or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))))
  with check (auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse')
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager')));

create function booking_intel_note_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.booking_id is distinct from old.booking_id or new.booking_line_id is distinct from old.booking_line_id
     or new.note_type is distinct from old.note_type or new.body is distinct from old.body
     or new.visibility is distinct from old.visibility or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only archiving a live booking note is allowed';
  end if;
  return new;
end $$;
create trigger booking_intel_note_archive_only before update on booking_notes
  for each row execute function booking_intel_note_archive_only();

create table intel_entity_notes (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  entity_type text not null check (entity_type in ('client','equipment')),
  client_id uuid references clients(id),
  product_id uuid references products(id),
  body text not null check (length(btrim(body)) > 0),
  visibility text not null default 'all_staff'
    check (visibility in ('all_staff','operations','management')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint intel_entity_notes_target check (
    (entity_type = 'client' and client_id is not null and product_id is null)
    or (entity_type = 'equipment' and product_id is not null and client_id is null)
  )
);
create index intel_entity_notes_client_recent on intel_entity_notes(client_id, created_at desc)
  where archived_at is null;
create index intel_entity_notes_product_recent on intel_entity_notes(product_id, created_at desc)
  where archived_at is null;
alter table intel_entity_notes enable row level security;
grant select, insert, update on intel_entity_notes to authenticated;
revoke delete on intel_entity_notes from public, anon, authenticated;

create policy intel_entity_notes_read on intel_entity_notes for select
  using (auth_is_staff() and archived_at is null and (
    visibility = 'all_staff'
    or (visibility = 'operations' and auth_user_role() <> 'Accounts')
    or (visibility = 'management' and auth_user_role() in ('Owner','Admin','Manager'))
  ));
create policy intel_entity_notes_insert on intel_entity_notes for insert
  with check (
    created_by = auth_user_id()
    and (
      (entity_type = 'client' and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
      or (entity_type = 'equipment' and auth_user_role() in ('Owner','Admin','Manager'))
    )
    and (visibility <> 'management' or auth_user_role() in ('Owner','Admin','Manager'))
  );
create policy intel_entity_notes_archive on intel_entity_notes for update
  using (auth_user_role() in ('Owner','Admin','Manager'))
  with check (auth_user_role() in ('Owner','Admin','Manager'));

create function intel_entity_note_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.entity_type is distinct from old.entity_type or new.client_id is distinct from old.client_id
     or new.product_id is distinct from old.product_id or new.body is distinct from old.body
     or new.visibility is distinct from old.visibility or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only archiving a live Intel note is allowed';
  end if;
  return new;
end $$;
create trigger intel_entity_note_archive_only before update on intel_entity_notes
  for each row execute function intel_entity_note_archive_only();

create table intel_field_definitions (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  entity_type text not null check (entity_type in ('client','equipment','rental')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  classification text not null check (classification in ('operational','personal','financial')),
  high_priority boolean not null default false,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index intel_field_definition_live_key on intel_field_definitions(entity_type, field_key)
  where archived_at is null;
alter table intel_field_definitions enable row level security;
grant select, insert, update on intel_field_definitions to authenticated;
revoke delete on intel_field_definitions from public, anon, authenticated;
create policy intel_field_definitions_read on intel_field_definitions for select
  using (auth_is_staff());
create policy intel_field_definitions_insert on intel_field_definitions for insert
  with check (auth_user_role() in ('Owner','Admin','Manager') and created_by = auth_user_id());
create policy intel_field_definitions_archive on intel_field_definitions for update
  using (auth_user_role() in ('Owner','Admin','Manager'))
  with check (auth_user_role() in ('Owner','Admin','Manager'));

create function intel_field_definition_archive_only() returns trigger language plpgsql as $$
begin
  if old.archived_at is not null or new.archived_at is null
     or new.id is distinct from old.id or new.client_uuid is distinct from old.client_uuid
     or new.entity_type is distinct from old.entity_type or new.field_key is distinct from old.field_key
     or new.label is distinct from old.label or new.classification is distinct from old.classification
     or new.high_priority is distinct from old.high_priority or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Custom field definitions are immutable; archive and create another';
  end if;
  return new;
end $$;
create trigger intel_field_definition_archive_only before update on intel_field_definitions
  for each row execute function intel_field_definition_archive_only();

-- Values are append-only. The most recent row for a definition and entity is
-- the current value; a NULL value_text clears it while retaining the history.
create table intel_field_values (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  definition_id uuid not null references intel_field_definitions(id),
  client_id uuid references clients(id),
  product_id uuid references products(id),
  booking_id uuid references bookings(id),
  value_text text check (value_text is null or length(value_text) <= 2000),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint intel_field_values_one_target check (
    (case when client_id is not null then 1 else 0 end)
    + (case when product_id is not null then 1 else 0 end)
    + (case when booking_id is not null then 1 else 0 end) = 1
  )
);
create index intel_field_values_client_recent on intel_field_values(client_id, definition_id, created_at desc, id desc);
create index intel_field_values_product_recent on intel_field_values(product_id, definition_id, created_at desc, id desc);
create index intel_field_values_booking_recent on intel_field_values(booking_id, definition_id, created_at desc, id desc);
alter table intel_field_values enable row level security;
grant select, insert on intel_field_values to authenticated;
revoke update, delete on intel_field_values from public, anon, authenticated;

create function intel_field_allowed(p_classification text) returns boolean language sql stable as $$
  select case p_classification
    when 'operational' then auth_is_staff()
    when 'personal' then auth_user_role() in ('Owner','Admin','Manager','Coordinator','Accounts')
    when 'financial' then auth_user_role() in ('Owner','Admin','Manager','Accounts')
    else false
  end;
$$;

create policy intel_field_values_read on intel_field_values for select
  using (exists (
    select 1 from intel_field_definitions d
    where d.id = definition_id and d.archived_at is null
      and intel_field_allowed(d.classification)
  ));
create policy intel_field_values_insert on intel_field_values for insert
  with check (
    created_by = auth_user_id()
    and exists (
      select 1 from intel_field_definitions d
      where d.id = definition_id and d.archived_at is null
        and (
          (d.entity_type = 'client' and client_id is not null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
          or (d.entity_type = 'equipment' and product_id is not null and auth_user_role() in ('Owner','Admin','Manager'))
          or (d.entity_type = 'rental' and booking_id is not null and auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
        )
        and intel_field_allowed(d.classification)
    )
  );

-- Preserve the existing immutable audit trail for these new writes and for
-- visibility/archive changes. The logger captures the actor and row snapshot;
-- audit_events itself remains Owner/Manager-readable under its existing RLS.
create trigger trg_audit_booking_intel_notes after insert or update on booking_notes
  for each row execute function log_audit_event();
create trigger trg_audit_intel_entity_notes after insert or update on intel_entity_notes
  for each row execute function log_audit_event();
create trigger trg_audit_intel_field_definitions after insert or update on intel_field_definitions
  for each row execute function log_audit_event();
create trigger trg_audit_intel_field_values after insert on intel_field_values
  for each row execute function log_audit_event();
