-- =============================================================================
-- Migration 0109: `cancel_booking` RPC (Stage 1)
--
-- Closes the cancellation write seam:
-- - In 0094:159-171, cancelled_at / cancelled_by / cancellation_reason were
--   locked down against direct table UPDATE by authenticated users, requiring a
--   SECURITY DEFINER writer.
-- - In 0100:344-380, trg_reservations_released_on_cancellation was armed to
--   automatically release all active holds when bookings.cancelled_at is set.
-- - PERMISSIONS.md:
--   - Before Packed (Quote, Reserved): Coordinator, Manager, Admin, Owner (C+).
--   - Packed: Manager, Admin, Owner (M+).
--   - On Rent, Returned, Closed: Cannot be cancelled (gear is in field or settled).
-- - Reason must be >= 10 non-whitespace characters.
-- - Inserts immutable audit_events record.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function public.cancel_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'cancelled_by', ''), '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
begin
  if v_booking_id is null then
    raise exception 'cancel_booking: booking_id is required.';
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'cancel_booking: cancellation reason must be at least 10 characters (got % characters). State why the booking is being cancelled.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'cancel_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'cancel_booking: booking % is already cancelled (at %).',
      v_booking.booking_no, v_booking.cancelled_at;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'cancel_booking: booking % is Closed and cannot be cancelled.', v_booking.booking_no;
  end if;

  if v_booking.stage in ('On Rent', 'Returned') then
    raise exception
      'cancel_booking: booking % is at stage % and cannot be cancelled. Gear in the field must be returned and settled.',
      v_booking.booking_no, v_booking.stage;
  end if;

  -- Check if any unit lines are picked up
  if exists (
    select 1 from booking_line_units blu
     join booking_lines bl on bl.id = blu.booking_line_id
     where bl.booking_id = v_booking_id
       and blu.unit_state = 'Picked Up'
  ) then
    raise exception 'cancel_booking: booking % has units already picked up and cannot be cancelled.', v_booking.booking_no;
  end if;

  -- 2. Role & permission validation
  v_role := auth_user_role();
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
      raise exception
        'cancel_booking: this session (%) may not cancel a booking. Coordinator, Manager, Admin and Owner only.',
        coalesce(v_role::text, 'unidentified')
        using errcode = '42501';
    end if;

    if v_booking.stage = 'Packed' and v_role = 'Coordinator' then
      raise exception
        'cancel_booking: booking % is Packed. Cancelling a Packed booking requires Manager, Admin or Owner authority.',
        v_booking.booking_no
        using errcode = '42501';
    end if;
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager')
     order by created_at
     limit 1;
  end if;
  if v_actor is null then
    raise exception 'cancel_booking: an actor ID is required to cancel a booking.';
  end if;

  -- 4. Update bookings row (SECURITY DEFINER bypasses reject_direct_booking_stage_write)
  update bookings
     set cancelled_at        = v_now,
         cancelled_by        = v_actor,
         cancellation_reason = v_reason,
         updated_at          = v_now
   where id = v_booking_id;

  -- 5. Record audit event
  if v_client_uuid is null then
    v_client_uuid := gen_random_uuid();
  end if;

  insert into audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    old_values,
    new_values,
    reason
  ) values (
    v_client_uuid,
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'cancelled_at', null,
      'stage', v_booking.stage
    ),
    jsonb_build_object(
      'cancelled_at', v_now,
      'cancelled_by', v_actor,
      'cancellation_reason', v_reason,
      'stage', v_booking.stage
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'cancelled_at', v_now,
    'cancelled_by', v_actor,
    'cancellation_reason', v_reason
  );
end;
$$;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.cancel_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.cancel_booking(jsonb) to authenticated;
grant execute on function public.cancel_booking(uuid, text, uuid) to authenticated;

comment on function public.cancel_booking(jsonb) is
  'Cancels a booking (Quote, Reserved, Packed). Checks role permissions (C+ before Packed, M+ for Packed), '
  'refuses if On Rent/Returned/Closed or units picked up, requires reason >= 10 chars, updates bookings, '
  'triggers inventory_reservations release via trg_reservations_released_on_cancellation, and logs audit_events.';

commit;
