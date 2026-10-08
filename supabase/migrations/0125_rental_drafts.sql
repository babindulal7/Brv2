-- 0125 — durable New Rental drafts
--
-- A draft is not yet a booking: it has no booking number, does not enter the
-- booking stage machine, and must not reserve inventory.  The complete,
-- versioned New Rental form is stored as JSON so reopening the draft restores
-- fields that do not yet have a home on `bookings` (for example the VAT toggle
-- and the entered advance).  Conversion retains the snapshot and links it to
-- the one booking produced from it.

begin;

create table rental_drafts (
  id                    uuid        primary key default gen_random_uuid(),
  client_uuid           uuid        not null unique,
  booking_client_uuid   uuid        not null unique,
  branch_id             uuid        not null references branches(id),
  data                  jsonb       not null,
  status                text        not null default 'Active',
  converted_booking_id  uuid        references bookings(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid        references users(id),
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  created_by            uuid        not null references users(id),
  updated_at            timestamptz not null default now(),
  updated_by            uuid        not null references users(id),

  constraint rental_drafts_status_check
    check (status in ('Active', 'Converted', 'Cancelled')),
  constraint rental_drafts_data_version_check
    check ((data ->> 'version')::integer = 1),
  constraint rental_drafts_conversion_check
    check ((status = 'Converted') = (converted_booking_id is not null)),
  constraint rental_drafts_cancellation_check
    check (
      (status = 'Cancelled') =
      (cancelled_at is not null and cancelled_by is not null and nullif(btrim(cancellation_reason), '') is not null)
    )
);

create index rental_drafts_branch_status_updated_idx
  on rental_drafts (branch_id, status, updated_at desc);

create function enforce_rental_draft_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking bookings%rowtype;
begin
  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.booking_client_uuid <> OLD.booking_client_uuid
     or NEW.branch_id <> OLD.branch_id
     or NEW.created_at <> OLD.created_at
     or NEW.created_by <> OLD.created_by then
    raise exception 'A rental draft identity and ownership are immutable.' using errcode = 'P0001';
  end if;

  if OLD.status <> 'Active' and NEW is distinct from OLD then
    raise exception 'A converted or cancelled rental draft is immutable.' using errcode = 'P0001';
  end if;

  if NEW.status = 'Converted' then
    select * into v_booking from bookings where id = NEW.converted_booking_id;
    if not found or v_booking.stage <> 'Booked' then
      raise exception 'A rental draft can only convert to a Booked booking.' using errcode = 'P0001';
    end if;
    if v_booking.client_uuid <> NEW.booking_client_uuid then
      raise exception 'The booking was not created from this rental draft.' using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_enforce_rental_draft_update
  before update on rental_drafts
  for each row execute function enforce_rental_draft_update();

alter table rental_drafts enable row level security;

create policy rental_drafts_select on rental_drafts
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

create policy rental_drafts_insert on rental_drafts
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
    and branch_id = auth_user_branch_id()
    and created_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
    and updated_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
  );

create policy rental_drafts_update on rental_drafts
  for update
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
    and updated_by = coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, auth.uid())
  );

grant select, insert, update on rental_drafts to authenticated, service_role;
revoke delete on rental_drafts from public, anon, authenticated;

comment on table rental_drafts is
  'Durable, versioned New Rental snapshots. Drafts do not reserve equipment; conversion links the retained snapshot to its confirmed booking.';
comment on column rental_drafts.client_uuid is
  'Idempotency key for creation/retry of this draft.';
comment on column rental_drafts.booking_client_uuid is
  'Stable create_booking idempotency key used when this exact draft is converted.';

commit;
