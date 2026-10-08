-- ====================================================================
-- Babin Rentals OS — Pending Migrations (0140, 0144, 0146, 0147)
-- Run this script in the Supabase Dashboard SQL Editor
-- ====================================================================

-- >>> START supabase/migrations/0140_stock_adjustments.sql <<<
begin;

-- RULING 2026-09-29: bulk stock is product-wide; Manager+ may correct it with a reason.
create table stock_adjustments (
  id uuid not null default gen_random_uuid() primary key,
  client_uuid uuid not null unique,
  product_id uuid not null references products(id),
  delta integer not null check (delta <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (length(btrim(reason)) >= 10),
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  constraint stock_adjustments_arithmetic check (quantity_after = quantity_before + delta)
);

create index idx_stock_adjustments_product on stock_adjustments(product_id, created_at desc);
alter table stock_adjustments enable row level security;

create policy stock_adjustments_select on stock_adjustments for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke all on stock_adjustments from public, anon, authenticated;
grant select on stock_adjustments to authenticated;

create or replace function public.reject_direct_bulk_quantity_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and NEW.total_quantity is distinct from OLD.total_quantity then
    raise exception 'GATE:gate.stock_adjust.rpc_required|Use the audited stock adjustment action to change quantity.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

create trigger products_bulk_quantity_rpc_only
before update of total_quantity on products
for each row execute function public.reject_direct_bulk_quantity_update();

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta integer,
  p_reason text,
  p_actor_id uuid,
  p_client_uuid uuid
) returns table (product_id uuid, quantity_before integer, quantity_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_after integer;
  v_tracking product_tracking_mode;
  v_existing stock_adjustments%rowtype;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager') or auth_user_role() is null then
    raise exception 'GATE:gate.stock_adjust.role|Only Owner, Admin, or Manager may adjust stock.' using errcode = 'P0001';
  end if;
  if p_actor_id is distinct from auth.uid() then
    raise exception 'GATE:gate.stock_adjust.actor|Adjustment actor must be the signed-in user.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.stock_adjust.idempotency|Adjustment requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'GATE:gate.stock_adjust.delta_zero|Adjustment must be a non-zero whole number.' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'GATE:gate.stock_adjust.reason_missing|Stock adjustment requires a reason of at least 10 characters.' using errcode = 'P0001';
  end if;

  -- The product lock serialises concurrent adjustments and retries.
  select p.total_quantity, p.tracking_mode into v_before, v_tracking
    from products p where p.id = p_product_id for update;
  if not found then
    raise exception 'GATE:gate.stock_adjust.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  select * into v_existing from stock_adjustments sa where sa.client_uuid = p_client_uuid;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.delta <> p_delta
       or v_existing.reason <> btrim(p_reason) or v_existing.created_by <> p_actor_id then
      raise exception 'GATE:gate.stock_adjust.idempotency_conflict|Client UUID already belongs to a different adjustment.' using errcode = 'P0001';
    end if;
    return query select v_existing.product_id, v_existing.quantity_before, v_existing.quantity_after;
    return;
  end if;

  if v_tracking = 'Serialised' then
    raise exception 'GATE:gate.stock_adjust.wrong_tracking_mode|Serialised products are corrected by adding or retiring individual units.' using errcode = 'P0001';
  end if;
  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'GATE:gate.stock_adjust.negative_result|Adjustment would take stock below zero.' using errcode = 'P0001';
  end if;

  update products set total_quantity = v_after, updated_at = now(), updated_by = p_actor_id
   where id = p_product_id;
  insert into stock_adjustments
    (client_uuid, product_id, delta, quantity_before, quantity_after, reason, created_by)
  values
    (p_client_uuid, p_product_id, p_delta, v_before, v_after, btrim(p_reason), p_actor_id);
  return query select p_product_id, v_before, v_after;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text, uuid, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to authenticated;

commit;

-- >>> END supabase/migrations/0140_stock_adjustments.sql <<<

-- >>> START supabase/migrations/0144_booking_project_type.sql <<<
-- =============================================================================
-- 0144 — Booking Project Type: structured `project_type` + `project_type_other`.
--
-- ## What this adds
--
-- `bookings.project` is free-text project NAME ("Mountain Dreams"). This adds
-- the structured companion answering "what kind of production is this rental
-- supporting" (`project_type`, controlled list) plus the custom description
-- used only when the type is `Other` (`project_type_other`).
--
-- Both columns are NULLABLE: every existing row reads back NULL and renders
-- as "—", so no historical booking needs a backfill before the app operates.
-- `create_booking` stays the only header writer (R-43) and passes both
-- through with the same validation the app applies (`src/lib/projectTypes.ts`).
--
-- ## Why TEXT + CHECK, not an enum (spec §38)
--
-- Project categories evolve (a rigid enum makes that a migration). The CHECK
-- below pins the 15 allowed values; changing the set later is one constraint,
-- not an enum surgery.
-- =============================================================================

begin;

alter table bookings
  add column if not exists project_type text,
  add column if not exists project_type_other text;

-- Controlled list. NULL-safe: NULL passes (legacy rows + Drafts).
alter table bookings
  drop constraint if exists bookings_project_type_allowed;
alter table bookings
  add constraint bookings_project_type_allowed
  check (
    project_type is null or project_type in (
      'Feature Film',
      'Short Film',
      'Documentary',
      'Commercial / Advertisement',
      'Music Video',
      'Corporate',
      'Wedding',
      'Event',
      'TV / Broadcast',
      'Web / Digital Content',
      'Photography',
      'Student Project',
      'Personal / Test Shoot',
      'Rental House / Sub-rental',
      'Other'
    )
  );

-- The custom description belongs to Other and to nothing else.
alter table bookings
  drop constraint if exists bookings_project_type_other_scoped;
alter table bookings
  add constraint bookings_project_type_other_scoped
  check (
    project_type_other is null
    or (project_type = 'Other' and btrim(project_type_other) <> '')
  );

-- ── create_booking: pass both fields through (R-43, 0132 + project type) ────
-- Full redefinition: the header insert and a validation block mirroring the
-- app (`src/lib/projectTypes.ts`). NULL project_type is accepted (Drafts);
-- Confirm refuses it instead (`confirmRental`). An invalid value or a
-- mis-scoped `project_type_other` rejects the WHOLE booking, never a
-- half-written one.

create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id     uuid;
  v_existing_no     text;
  v_existing_stage  text;
  v_booking_id      uuid;
  v_booking_no      text;
  v_actor           uuid := (p_payload ->> 'created_by')::uuid;
  v_branch          uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines           jsonb;
  v_line            jsonb;
  v_discount        jsonb;
  v_audit_id        uuid;
  v_line_count      integer := 0;
  v_unit_count      integer := 0;
  v_pending         jsonb;
  v_next            jsonb;
  v_parent_key      uuid;
  v_parent_id       uuid;
  v_wrote           integer;
  v_line_id         uuid;
  v_unit            jsonb;
  v_asset_product   uuid;
  v_dupe_assets     integer;
  v_base_rate       numeric;
  v_payload_rate    numeric;
  v_final_rate      numeric;
  v_rate_overridden boolean;
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
  /* 0144 */
  v_project_type       text := nullif(btrim(p_payload ->> 'project_type'), '');
  v_project_type_other text := nullif(btrim(p_payload ->> 'project_type_other'), '');
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── 0144 project-type validation, BEFORE anything is written ──────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Short Film',
    'Documentary',
    'Commercial / Advertisement',
    'Music Video',
    'Corporate',
    'Wedding',
    'Event',
    'TV / Broadcast',
    'Web / Digital Content',
    'Photography',
    'Student Project',
    'Personal / Test Shoot',
    'Rental House / Sub-rental',
    'Other'
  ) then
    raise exception 'create_booking: project_type "%" is not an allowed value. Nothing was created.', v_project_type;
  end if;
  if v_project_type_other is not null and v_project_type <> 'Other' then
    raise exception 'create_booking: project_type_other is only used with project_type Other. Nothing was created.';
  end if;
  if v_project_type = 'Other' and v_project_type_other is null then
    raise exception 'create_booking: project_type Other requires project_type_other. Nothing was created.';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, project_type, project_type_other, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
    v_project_type,
    v_project_type_other,
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ────────────────────────────────────────────
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      -- ── S1-7: Line pricing calculation ─────────────────────────────────────
      if v_parent_id is not null or coalesce((v_line ->> 'is_included')::boolean, false) then
        v_base_rate := 0;
      elsif (v_line ->> 'product_id') is not null or (v_line ->> 'bundle_id') is not null then
        v_base_rate := get_model_daily_rate((v_line ->> 'product_id')::uuid, (v_line ->> 'bundle_id')::uuid);
      else
        v_base_rate := coalesce((v_line ->> 'rate')::numeric, 0);
      end if;

      v_payload_rate := (v_line ->> 'rate')::numeric;
      v_rate_overridden := false;

      if auth_can_view_money() then
        if v_payload_rate is not null then
          v_final_rate := v_payload_rate;
          if v_base_rate is not null and v_final_rate <> v_base_rate then
            v_rate_overridden := true;
          end if;
        else
          v_final_rate := coalesce(v_base_rate, 0);
        end if;
      else
        -- Money-blind caller: silently use server price
        v_final_rate := coalesce(v_base_rate, 0);
        v_rate_overridden := false;

        if v_payload_rate is not null and v_payload_rate <> v_final_rate then
          insert into audit_events (
            id, client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, branch_id, reason, new_values
          )
          values (
            gen_random_uuid(),
            gen_random_uuid(),
            'override',
            'Rentals',
            'Rentals',
            'price.server_applied',
            'Informational',
            'Success',
            'booking_lines',
            v_booking_id,
            v_actor,
            v_branch,
            'Server-side price applied for money-blind caller (Law 6)',
            jsonb_build_object(
              'booking_no',   v_booking_no,
              'product_id',   v_line ->> 'product_id',
              'payload_rate', v_payload_rate,
              'applied_rate', v_final_rate
            )
          );
        end if;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        v_final_rate,
        case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end,
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        case when auth_can_view_money() then (v_line ->> 'supplier_cost')::numeric else null end,
        case when auth_can_view_money() then (v_line ->> 'markup_amount')::numeric else null end,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor,
        v_rate_overridden
      )
      returning id into v_line_id;

      -- ── D5: creation-time unit assignment ───────────────────────────────
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  -- ── Crew (0132) — inside the transaction, or the booking does not exist ──
  for v_crew in select * from jsonb_array_elements(coalesce(p_payload -> 'crew', '[]'::jsonb))
  loop
    if v_crew ->> 'client_uuid' is null then
      raise exception 'create_booking: every crew row needs its own client_uuid (Law 8, one per ROW)';
    end if;

    insert into booking_crew_lines (
      client_uuid, booking_id, crew_member_id, name, crew_role, phone,
      day_rate, days, overtime, accommodation, meals, created_by
    )
    values (
      (v_crew ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_crew ->> 'crew_member_id')::uuid,
      v_crew ->> 'name',
      (v_crew ->> 'crew_role')::crew_role,
      v_crew ->> 'phone',
      coalesce((v_crew ->> 'day_rate')::numeric, 0),
      (v_crew ->> 'days')::integer,
      coalesce((v_crew ->> 'overtime')::numeric, 0),
      coalesce((v_crew ->> 'accommodation')::numeric, 0),
      coalesce((v_crew ->> 'meals')::numeric, 0),
      v_actor
    );
    v_crew_count := v_crew_count + 1;
  end loop;

  -- ── Transport (0132) — the one row `booking_transport_booking_id_key` allows ──
  if jsonb_typeof(p_payload -> 'transport') = 'object' then
    v_transport := p_payload -> 'transport';
    if v_transport ->> 'client_uuid' is null then
      raise exception 'create_booking: the transport row needs its own client_uuid (Law 8)';
    end if;

    insert into booking_transport (
      client_uuid, booking_id, delivery_charge, fuel_charge,
      vehicle, number_plate, driver_contact, special_instructions, created_by
    )
    values (
      (v_transport ->> 'client_uuid')::uuid,
      v_booking_id,
      coalesce((v_transport ->> 'delivery_charge')::numeric, 0),
      coalesce((v_transport ->> 'fuel_charge')::numeric, 0),
      v_transport ->> 'vehicle',
      v_transport ->> 'number_plate',
      v_transport ->> 'driver_contact',
      v_transport ->> 'special_instructions',
      v_actor
    );
    v_transport_written := true;
  end if;

  return jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_no',        v_booking_no,
    'stage',             'Quote',
    'line_count',        v_line_count,
    'unit_count',        v_unit_count,
    'crew_lines',        v_crew_count,
    'transport_written', v_transport_written,
    'replayed',          false
  );
end;
$$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + discounts + crew + transport) in a '
  'single transaction (0132 — crew/transport folded in; 0144 — project_type/project_type_other passthrough with '
  'allow-list validation; there is no partial booking). SECURITY INVOKER — every insert faces its own RLS policy. '
  'Idempotent on bookings.client_uuid (Law 8): a replay returns the existing booking and writes nothing, including '
  'no sequence advance. Lines insert in dependency order (parent_client_uuid); per D5 a line may carry units[]; '
  'S1-7 prices lines server-side for money-blind callers. Prices nothing else — src/lib/money.ts owns the pricing '
  'order (Law 1).';

commit;

-- >>> END supabase/migrations/0144_booking_project_type.sql <<<

-- >>> START supabase/migrations/0146_record_editor_transactions.sql <<<
-- RULING 2026-10-02: one atomic record save; existing role ceilings remain.
-- WRITTEN locally. Never apply this file to production from an agent session.
begin;
create schema if not exists record_editor_private;
revoke all on schema record_editor_private from public, anon, authenticated;

create table record_editor_private.receipts (
  key uuid primary key, actor uuid not null, request jsonb not null, response jsonb not null,
  created_at timestamptz not null default now()
);
alter table record_editor_private.receipts enable row level security;
revoke all on record_editor_private.receipts from public, anon, authenticated;

create function record_editor_private.fields(kind text) returns text[] language sql immutable as $$
select case kind
when 'client' then array['type_parent','org_subtype','name','phone','email','pan_vat','business_registration','website','address_line','city','district','postal_code','country','billing_address','notes']
when 'equipment' then array['name','short_name','category_id','brand','model','manufacturer','description','reorder_level','quantity_unit','purchase_date','purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed','min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes','inspection_required','packing_required','notes_internal','notes_warehouse']
when 'bundle' then array['name','description','category_id','daily_rate','weekly_rate'] end;
$$;

create function record_editor_private.pick(value jsonb, keys text[]) returns jsonb language sql immutable as $$
select coalesce(jsonb_object_agg(key, val), '{}'::jsonb) from jsonb_each(value) as e(key,val) where key=any(keys);
$$;

-- Only the guarded public functions can invoke this helper. Identifiers are quoted,
-- and callers validate keys before invoking it. Values are always bound parameters.
create function record_editor_private.write_row(tab text, row_id uuid, value jsonb) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare cols text; vals text; result uuid;
begin
  select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_object_keys(value) key;
  if row_id is null then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning id',tab,cols,vals,tab) into result using value;
  elsif cols is not null then
    execute format('update public.%I t set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1) r) where t.id=$2 returning t.id',tab,cols,vals,tab) into result using value,row_id;
  else result:=row_id;
  end if;
  if result is null then raise exception 'The record no longer exists. Reload before saving.'; end if;
  return result;
end; $$;

create function read_record_editor(p_kind text,p_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent jsonb; children jsonb; allowed text[]; identity uuid; code text; snapshot jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text=any(case when p_kind='client' then array['Owner','Admin','Manager','Coordinator'] else array['Owner','Admin','Manager'] end),false) then raise exception 'Permission denied for this record.' using errcode='42501'; end if;
  allowed:=record_editor_private.fields(p_kind);
  if allowed is null then raise exception 'Unknown record kind'; end if;
  if p_kind='client' then
    select to_jsonb(c),c.id,c.client_code into parent,identity,code from clients c where c.id::text=p_id or c.client_code=p_id;
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(c),array['id','full_name','designation','phone','email']) order by c.id),'[]') into children from client_contacts c where c.client_id=identity and c.is_primary and c.status='Active';
  elsif p_kind='equipment' then
    select to_jsonb(p),p.id,p.asset_code into parent,identity,code from products p where p.id::text=p_id or p.asset_code=p_id;
    allowed:=allowed||array['tracking_mode','total_quantity'];
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(u),array['id','asset_tag','serial_no','warehouse_id','rack','shelf','bin','condition','status']) order by u.id),'[]') into children from product_units u where u.product_id=identity;
  else
    select to_jsonb(b),b.id,b.bundle_code into parent,identity,code from bundles b where b.id::text=p_id or b.bundle_code=p_id;
    select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(i),array['id','product_id','quantity','days','is_mandatory','sort_order'])||jsonb_build_object('name',p.name) order by i.sort_order,i.id),'[]') into children from bundle_items i join products p on p.id=i.product_id where i.bundle_id=identity and i.is_active;
  end if;
  if parent is null then raise exception 'Record not found.'; end if;
  snapshot:=jsonb_build_object('id',identity,'code',code,'values',record_editor_private.pick(parent,allowed),'rows',children);
  return snapshot||jsonb_build_object('revision',md5((snapshot||jsonb_build_object('updated_at',parent->'updated_at'))::text));
end; $$;
revoke all on function read_record_editor(text,text) from public,anon;
grant execute on function read_record_editor(text,text) to authenticated;

create function save_record_editor(p_kind text,p_id uuid,p_revision text,p_key uuid,p_values jsonb,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tab text; child_tab text; fk text; allowed text[]; child_allowed text[]; identity uuid:=p_id; row_data jsonb; patch jsonb; child_id uuid; existing jsonb; response jsonb; request jsonb; saved record; kept uuid[]:='{}'; warehouse_branch uuid; generated_code text; current_snapshot jsonb; serial_count int:=0;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text=any(case when p_kind='client' then array['Owner','Admin','Manager','Coordinator'] else array['Owner','Admin','Manager'] end),false) then raise exception 'Permission denied for this record.' using errcode='42501'; end if;
  if p_key is null then raise exception 'A save key is required.'; end if;
  if jsonb_typeof(p_values)<>'object' or jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid record payload.'; end if;
  request:=jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision,'values',p_values,'rows',p_rows);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into saved from record_editor_private.receipts where key=p_key;
  if found then
    if saved.actor<>auth.uid() or saved.request<>request then raise exception 'This save key belongs to a different change.'; end if;
    return saved.response;
  end if;
  allowed:=record_editor_private.fields(p_kind);
  if allowed is null then raise exception 'Unknown record kind'; end if;
  tab:=case p_kind when 'client' then 'clients' when 'equipment' then 'products' else 'bundles' end;
  child_tab:=case p_kind when 'client' then 'client_contacts' when 'equipment' then 'product_units' else 'bundle_items' end;
  fk:=case p_kind when 'client' then 'client_id' when 'equipment' then 'product_id' else 'bundle_id' end;
  child_allowed:=case p_kind when 'client' then array['full_name','designation','phone','email'] when 'equipment' then array['asset_tag','serial_no','warehouse_id','rack','shelf','bin'] else array['product_id','quantity','days','is_mandatory','sort_order'] end;
  if p_id is null and p_kind='equipment' then allowed:=allowed||array['tracking_mode','total_quantity']; child_allowed:=child_allowed||array['condition']; end if;
  if exists(select 1 from jsonb_object_keys(p_values) k where not k=any(allowed)) then raise exception 'One of these fields cannot be edited here.'; end if;
  if p_id is not null then
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) into existing using p_id;
    if existing is null then raise exception 'Record not found.'; end if;
    -- Child locks prevent an in-flight unit/component edit from passing the revision check.
    execute format('select 1 from public.%I where %I=$1 for update',child_tab,fk) using p_id;
    current_snapshot:=read_record_editor(p_kind,p_id::text);
    if p_revision is null or p_revision<>current_snapshot->>'revision' then raise exception 'This record changed since you opened it. Reload the latest record before saving. Your changes have not been saved.' using errcode='40001'; end if;
  end if;
  patch:=p_values;
  if p_kind='client' then
    if patch ? 'country' and patch->>'country' is null then patch:=patch||'{"country":"Nepal"}'; end if;
    if patch ? 'type_parent' and patch->>'type_parent'<>'Organisation' then patch:=patch||'{"org_subtype":null}'; end if;
    if jsonb_array_length(p_rows)>1 then raise exception 'Only one primary contact is supported.'; end if;
  end if;
  if patch ? 'name' and nullif(btrim(patch->>'name'),'') is null then raise exception 'Name is required.'; end if;
  if p_kind='bundle' and jsonb_array_length(p_rows)=0 then raise exception 'Add at least one component.'; end if;
  if p_id is null then
    generated_code:=next_document_number(case p_kind when 'client' then 'client' when 'equipment' then 'equipment' else 'bundle' end);
    patch:=patch||jsonb_build_object('client_uuid',p_key,'created_by',auth.uid(),case p_kind when 'client' then 'client_code' when 'equipment' then 'asset_code' else 'bundle_code' end,generated_code);
    if p_kind='equipment' then
      if coalesce(patch->>'tracking_mode','Serialised')='Serialised' then
        if jsonb_array_length(p_rows)=0 then raise exception 'Add at least one unit.'; end if;
        patch:=patch||jsonb_build_object('total_quantity',jsonb_array_length(p_rows));
      end if;
      patch:=patch||'{"status":"Active"}';
    end if;
  else patch:=patch||jsonb_build_object('updated_at',clock_timestamp());
  end if;
  identity:=record_editor_private.write_row(tab,p_id,patch);
  for row_data in select value from jsonb_array_elements(p_rows) loop
    child_id:=(row_data->>'id')::uuid;
    if exists(select 1 from jsonb_object_keys(row_data) k where not k=any(child_allowed||array['id','name','status','condition'])) then raise exception 'Unsupported component or unit field.'; end if;
    if child_id is not null then
      execute format('select to_jsonb(t) from public.%I t where id=$1 and %I=$2',child_tab,fk) into existing using child_id,identity;
      if existing is null then raise exception 'This row does not belong to the record.'; end if;
      if p_kind='bundle' and not (existing->>'is_active')::boolean then raise exception 'This component has been removed. Reload first.'; end if;
      if p_kind='equipment' and (row_data->>'condition' is distinct from existing->>'condition' or row_data->>'status' is distinct from existing->>'status') then raise exception 'Use the operational workflow to change condition or custody.'; end if;
    elsif p_id is not null and p_kind='equipment' then raise exception 'Use equipment intake to add units; stock cannot change through Edit.';
    end if;
    patch:=record_editor_private.pick(row_data,child_allowed);
    if p_kind='equipment' then
      if child_id is not null and existing->>'status' not in ('In Stock','Reserved') and (record_editor_private.pick(existing,array['warehouse_id','rack','shelf','bin'])<>record_editor_private.pick(row_data,array['warehouse_id','rack','shelf','bin'])) then raise exception 'Location changes require the equipment to be in stock or reserved.'; end if;
      select branch_id into warehouse_branch from warehouses where id=(patch->>'warehouse_id')::uuid;
      if warehouse_branch is null then raise exception 'Select a warehouse for every unit.'; end if;
      patch:=patch||jsonb_build_object('branch_id',warehouse_branch);
      if child_id is null then serial_count:=serial_count+1; patch:=patch||jsonb_build_object('asset_tag',generated_code||'-'||lpad(serial_count::text,2,'0')); end if;
    end if;
    if child_id is null then patch:=patch||jsonb_build_object(fk,identity,'client_uuid',gen_random_uuid(),'created_by',auth.uid());
      if p_kind='client' then patch:=patch||'{"is_primary":true}'; end if;
    end if;
    child_id:=record_editor_private.write_row(child_tab,child_id,patch);
    kept:=array_append(kept,child_id);
  end loop;
  if p_kind='equipment' and exists(select 1 from product_units where product_id=identity and not id=any(kept)) then raise exception 'Units cannot be removed here. Use the stock or retirement workflow.'; end if;
  if p_kind='client' then update client_contacts set status='Inactive',is_primary=false,deactivated_at=now(),deactivated_by=auth.uid() where client_id=identity and is_primary and status='Active' and not id=any(kept); end if;
  if p_kind='bundle' then update bundle_items set is_active=false,deactivated_at=now(),deactivated_by=auth.uid() where bundle_id=identity and is_active and not id=any(kept); end if;
  response:=read_record_editor(p_kind,identity::text);
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,new_values)
  values(p_key,'status change',(case when p_kind='client' then 'Administration' else 'Inventory' end)::audit_category,(case when p_kind='client' then 'Clients' else 'Inventory' end)::audit_module,'Update','Informational','Success',tab,identity,auth.uid(),auth_user_role(),jsonb_build_object('revision',response->>'revision'));
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,auth.uid(),request,response);
  return response;
end; $$;
revoke all on function save_record_editor(text,uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function save_record_editor(text,uuid,text,uuid,jsonb,jsonb) to authenticated;
revoke all on all functions in schema record_editor_private from public,anon,authenticated;
commit;

-- >>> END supabase/migrations/0146_record_editor_transactions.sql <<<

-- >>> START supabase/migrations/0147_quote_editor_transactions.sql <<<
-- RULING 2026-10-02: general editing is a Quote-only, online atomic operation.
begin;
create function read_quote_editor(p_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; result jsonb; line_rows jsonb; crew_rows jsonb; transport_row jsonb; discounts jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator'),false) then raise exception 'You cannot edit this booking.' using errcode='42501'; end if;
  select * into b from bookings where id::text=p_id or booking_no=p_id;
  if b.id is null then raise exception 'Booking not found.'; end if;
  if b.stage<>'Quote' or b.cancelled_at is not null then raise exception 'Only unconfirmed quotes can be edited. Use the booking’s operational actions.'; end if;
  select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(l),array['id','client_uuid','parent_line_id','line_type','product_id','bundle_id','description','qty','days','rate','discount_amount','is_included','service_basis','line_note','sort_order'])||jsonb_build_object('name',coalesce(l.description,p.name,k.name),'parent_client_uuid',parent.client_uuid) order by l.sort_order,l.id),'[]') into line_rows
  from booking_lines l left join products p on p.id=l.product_id left join bundles k on k.id=l.bundle_id left join booking_lines parent on parent.id=l.parent_line_id where l.booking_id=b.id and l.voided_at is null;
  select coalesce(jsonb_agg(record_editor_private.pick(to_jsonb(c),array['id','client_uuid','crew_member_id','name','crew_role','phone','day_rate','days','overtime','accommodation','meals']) order by c.id),'[]') into crew_rows from booking_crew_lines c where c.booking_id=b.id and c.voided_at is null;
  select record_editor_private.pick(to_jsonb(t),array['id','vehicle','number_plate','driver_contact','delivery_charge','fuel_charge','special_instructions']) into transport_row from booking_transport t where t.booking_id=b.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'percent',percent) order by id),'[]') into discounts from booking_discounts where booking_id=b.id;
  result:=jsonb_build_object('id',b.id,'code',b.booking_no,'values',record_editor_private.pick(to_jsonb(b),array['client_id','contact_id','branch_id','project','project_type','project_type_other','pickup_at','return_at','delivery_type','pickup_location','return_location','deposit_required']),'lines',line_rows,'crew',crew_rows,'transport',transport_row,'discounts',discounts);
  return result||jsonb_build_object('revision',md5((result||jsonb_build_object('updated_at',b.updated_at,'version',b.version))::text));
end; $$;
revoke all on function read_quote_editor(text) from public,anon;
grant execute on function read_quote_editor(text) to authenticated;

create function update_rental_quote(p_id uuid,p_revision text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; req jsonb; receipt record; result jsonb; row_data jsonb; patch jsonb; existing jsonb; row_id uuid; kept uuid[]:='{}'; kept_crew uuid[]:='{}'; mapping jsonb:='{}'; parent_id uuid; transport_id uuid; audit_id uuid:=gen_random_uuid(); first_discount uuid; discount_pct numeric; rate numeric; base_rate numeric;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator'),false) then raise exception 'You cannot edit this booking.' using errcode='42501'; end if;
  if p_key is null or p_revision is null then raise exception 'Reload this booking before saving.'; end if;
  req:=jsonb_build_object('booking',p_id,'revision',p_revision,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then if receipt.actor<>auth.uid() or receipt.request<>req then raise exception 'This save key belongs to another change.'; end if; return receipt.response; end if;
  select * into b from bookings where id=p_id for update;
  if b.id is null then raise exception 'Booking not found.'; end if;
  if b.stage<>'Quote' or b.cancelled_at is not null then raise exception 'Only unconfirmed quotes can be edited.'; end if;
  perform 1 from booking_lines where booking_id=p_id for update;
  perform 1 from booking_crew_lines where booking_id=p_id for update;
  perform 1 from booking_transport where booking_id=p_id for update;
  perform 1 from booking_discounts where booking_id=p_id for update;
  perform 1 from invoices where booking_id=p_id for update;
  if exists(select 1 from invoices where booking_id=p_id and status::text not in ('Draft','Void')) then raise exception 'This booking has an issued financial document. Use the finance correction workflow.'; end if;
  if (read_quote_editor(p_id::text)->>'revision')<>p_revision then raise exception 'This booking changed since you opened it. Reload the latest record before saving.' using errcode='40001'; end if;
  if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_typeof(p_payload->'crew')<>'array' then raise exception 'Invalid booking lines.'; end if;
  patch:=p_payload->'values';
  if exists(select 1 from jsonb_object_keys(patch) k where not k=any(array['client_id','project','project_type','project_type_other','pickup_at','return_at','delivery_type','pickup_location','return_location','deposit_required'])) then raise exception 'This booking field cannot be edited.'; end if;
  -- Client reassignment may not detach existing receipts from their account.
  if patch->>'client_id' is distinct from b.client_id::text and exists(select 1 from invoices where booking_id=p_id) then raise exception 'The client cannot change after a financial document has been created.'; end if;
  perform record_editor_private.write_row('bookings',p_id,patch||jsonb_build_object('updated_at',clock_timestamp(),'updated_by',auth.uid()));
  for row_data in select value from jsonb_array_elements(p_payload->'lines') loop
    row_id:=(row_data->>'id')::uuid;
    if row_id is not null then
      select to_jsonb(l) into existing from booking_lines l where id=row_id and booking_id=p_id and voided_at is null;
      if existing is null then raise exception 'A line no longer belongs to this quote. Reload before saving.'; end if;
      if row_data->>'client_uuid' is distinct from existing->>'client_uuid' then raise exception 'A line identity cannot change.'; end if;
    else existing:=null; end if;
    if row_data->>'client_uuid' is null then raise exception 'Every line needs a stable key.'; end if;
    patch:=record_editor_private.pick(row_data,array['line_type','product_id','bundle_id','description','qty','days','rate','discount_amount','is_included','service_basis','line_note','sort_order']);
    if row_data->>'parent_client_uuid' is not null or coalesce((patch->>'is_included')::boolean,false) then rate:=0; base_rate:=0;
    else
      base_rate:=get_model_daily_rate((patch->>'product_id')::uuid,(patch->>'bundle_id')::uuid);
      rate:=coalesce((patch->>'rate')::numeric,base_rate,0);
    end if;
    patch:=patch||jsonb_build_object('rate',rate,'rate_overridden',base_rate is not null and rate<>base_rate);
    if row_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',row_data->>'client_uuid','created_by',auth.uid()); end if;
    row_id:=record_editor_private.write_row('booking_lines',row_id,patch);
    if row_id=any(kept) then raise exception 'A booking line appears twice.'; end if;
    kept:=array_append(kept,row_id);mapping:=mapping||jsonb_build_object(row_data->>'client_uuid',row_id);
  end loop;
  for row_data in select value from jsonb_array_elements(p_payload->'lines') loop
    row_id:=(mapping->>(row_data->>'client_uuid'))::uuid;
    parent_id:=(mapping->>(row_data->>'parent_client_uuid'))::uuid;
    if row_data->>'parent_client_uuid' is not null and parent_id is null then raise exception 'The bundle parent is missing.'; end if;
    update booking_lines set parent_line_id=parent_id where id=row_id;
  end loop;
  update booking_lines set voided_at=now(),voided_reason='Removed while editing unconfirmed quote' where booking_id=p_id and voided_at is null and not id=any(kept);
  -- Assignments keep their identity and history. Over-allocation cannot survive a qty change.
  if exists(select 1 from booking_lines l where l.id=any(kept) and (select count(*) from booking_line_units u where u.booking_line_id=l.id and u.released_at is null)>l.qty) then raise exception 'Release assigned units before reducing this quantity.'; end if;
  for row_data in select value from jsonb_array_elements(p_payload->'crew') loop
    row_id:=(row_data->>'id')::uuid;
    if row_id is not null and not exists(select 1 from booking_crew_lines where id=row_id and booking_id=p_id and voided_at is null) then raise exception 'This crew row does not belong to the booking.'; end if;
    patch:=record_editor_private.pick(row_data,array['crew_member_id','name','crew_role','phone','day_rate','days','overtime','accommodation','meals']);
    if row_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',gen_random_uuid(),'created_by',auth.uid()); end if;
    row_id:=record_editor_private.write_row('booking_crew_lines',row_id,patch);kept_crew:=array_append(kept_crew,row_id);
  end loop;
  update booking_crew_lines set voided_at=now() where booking_id=p_id and voided_at is null and not id=any(kept_crew);
  select id into transport_id from booking_transport where booking_id=p_id;
  patch:=record_editor_private.pick(coalesce(p_payload->'transport','{}'),array['vehicle','number_plate','driver_contact','delivery_charge','fuel_charge','special_instructions']);
  if transport_id is not null or patch<>'{}' then
    if transport_id is null then patch:=patch||jsonb_build_object('booking_id',p_id,'client_uuid',gen_random_uuid(),'created_by',auth.uid()); end if;
    perform record_editor_private.write_row('booking_transport',transport_id,patch);
  end if;
  discount_pct:=(p_payload->>'discount_percent')::numeric;
  if discount_pct is null or discount_pct<0 or discount_pct>100 then raise exception 'Discount must be between 0 and 100 percent.'; end if;
  insert into audit_events(id,client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
  values(audit_id,p_key,'status change','Rentals','Rentals','Update','Informational','Success','bookings',p_id,auth.uid(),auth_user_role(),b.branch_id,jsonb_build_object('revision',p_revision),jsonb_build_object('edited','Quote'));
  if discount_pct is distinct from (select coalesce(sum(percent),0) from booking_discounts where booking_id=p_id) then
    select id into first_discount from booking_discounts where booking_id=p_id order by id limit 1;
    if first_discount is null and discount_pct>0 then
      insert into booking_discounts(client_uuid,booking_id,branch_id,discount_source,percent,reason,applied_by,audit_event_id) values(gen_random_uuid(),p_id,b.branch_id,'Manual',discount_pct,'Quote edited',auth.uid(),audit_id);
    else update booking_discounts set percent=case when id=first_discount then discount_pct else 0 end,reason='Quote edited',audit_event_id=audit_id where booking_id=p_id; end if;
  end if;
  -- Draft invoices retain their identity but must be refreshed by Finance before issue.
  -- Their existing line snapshots are never silently rewritten by a booking edit.
  if exists(select 1 from invoices where booking_id=p_id and status='Draft') then raise exception 'Void the draft invoice before editing this quote, then create its replacement from the updated booking.'; end if;
  result:=read_quote_editor(p_id::text);
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,auth.uid(),req,result);
  return result;
end; $$;
revoke all on function update_rental_quote(uuid,text,uuid,jsonb) from public,anon;
grant execute on function update_rental_quote(uuid,text,uuid,jsonb) to authenticated;
commit;

-- >>> END supabase/migrations/0147_quote_editor_transactions.sql <<<

