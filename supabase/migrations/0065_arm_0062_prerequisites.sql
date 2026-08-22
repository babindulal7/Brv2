-- =============================================================================
-- 0065 — The two database-side prerequisites 0062 cannot apply without.
--
-- ⚠⚠ NOT APPLIED. Written 23 Aug 2026 from AUDIT_0062.md (the 74-call-site
-- audit). Apply order, when the time comes: app code carrying the dataAccess
-- returning-columns change deploys FIRST, then 0065, then 0062 — old clients
-- issue RETURNING * the instant the grants change, so the order is not
-- optional. The local-stack rehearsal (apply 0065+0062 locally, drive create
-- booking / Add Equipment / a Booqable sync cycle / a stage transition / every
-- deposit screen as multiple roles, zero 42501s in the PostgREST logs) remains
-- MANDATORY before production: the vitest mock is grant-blind and cannot catch
-- any failure this file exists to prevent.
--
-- ## Fix 1 — create_booking's replay check survives the mask
--
-- 0063:110 reads `select * into v_existing from bookings` through a
-- `bookings%rowtype` variable. SECURITY INVOKER means that star expands under
-- the CALLER's column grants, and after 0062 it names the ungranted
-- `deposit_required` — so every create_booking call, for every role, dies at
-- the replay check before writing anything. The replacement reads the three
-- columns the replay branch actually returns, all granted by 0062's list.
-- Everything else in the function body is byte-identical to 0063.
--
-- ## Fix 2 — bookings_deposit_v goes definer-rights + row predicate
--
-- 0061 shipped the view `security_invoker = on`, reasoning that invoker rights
-- keep the row policies live. Correct then; fatal under 0062: with invoker
-- rights the view's read of `b.deposit_required` executes under the caller's
-- COLUMN grants, which 0062 revokes — so the one sanctioned path to the
-- deposit dies with the paths it was meant to replace. The fix is the 0048
-- pattern used by the other twenty masking views: definer rights (the view
-- owner reads the base table) with the row predicate stated EXPLICITLY in the
-- view body — `where auth_is_staff()`, verified today as the exact
-- `bookings_select` USING expression on the live project. Row protection is
-- preserved, column protection comes from `auth_can_view_money()` in the
-- select list, and 0062's design statement — "the ONLY path to a money column
-- is the matching _v view" — finally holds for bookings too.
--
-- ## Checked and clean — no fix needed
--
-- The 0021 stage-sync trigger body (booking_stage_transitions → bookings.stage)
-- was audited 23 Aug for star-selects/rowtype reads: none. It touches NEW/OLD
-- and named granted columns only, so it survives 0062 as-is (AUDIT_0062.md,
-- audit item 5).
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: create_booking, replay check on named granted columns
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid    uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id    uuid;
  v_existing_no    text;
  v_existing_stage text;
  v_booking_id     uuid;
  v_booking_no     text;
  v_actor          uuid := (p_payload ->> 'created_by')::uuid;
  v_branch         uuid := (p_payload ->> 'branch_id')::uuid;
  v_line           jsonb;
  v_discount       jsonb;
  v_audit_id       uuid;
  v_line_count     integer := 0;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  -- Named columns only: under 0062 a select-star here would 42501 on the
  -- ungranted deposit_required for every role (AUDIT_0062.md, the one BREAKS
  -- inside the schema itself). id/booking_no/stage are all on 0062's grant
  -- list, and they are the only fields the replay branch ever returned.
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

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, pickup_at, return_at, delivery_type,
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

  -- ── Lines ────────────────────────────────────────────────────────────────
  -- `days` is passed through, never defaulted here (Law 9).
  for v_line in select * from jsonb_array_elements(coalesce(p_payload -> 'lines', '[]'::jsonb))
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    insert into booking_lines (
      client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
      description, qty, days, rate, discount_amount, is_included, service_basis,
      supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by
    )
    values (
      (v_line ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_line ->> 'line_type')::booking_line_type,
      (v_line ->> 'parent_line_id')::uuid,
      (v_line ->> 'product_id')::uuid,
      (v_line ->> 'bundle_id')::uuid,
      v_line ->> 'description',
      coalesce((v_line ->> 'qty')::integer, 1),
      (v_line ->> 'days')::integer,
      coalesce((v_line ->> 'rate')::numeric, 0),
      coalesce((v_line ->> 'discount_amount')::numeric, 0),
      coalesce((v_line ->> 'is_included')::boolean, false),
      (v_line ->> 'service_basis')::service_basis,
      (v_line ->> 'supplier_id')::uuid,
      (v_line ->> 'supplier_cost')::numeric,
      (v_line ->> 'markup_amount')::numeric,
      v_line ->> 'line_note',
      coalesce((v_line ->> 'sort_order')::integer, v_line_count),
      v_actor
    );
    v_line_count := v_line_count + 1;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  -- Each needs an `audit_events` row FIRST (audit_event_id is NOT NULL).
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    insert into audit_events (
      client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      (v_discount ->> 'audit_client_uuid')::uuid,
      'data change',
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
    )
    returning id into v_audit_id;

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

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_no', v_booking_no,
    'stage',      'Quote',
    'line_count', v_line_count,
    'replayed',   false
  );
end;
$$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + discounts) in a single transaction. '
  'SECURITY INVOKER — every insert faces its own RLS policy. Idempotent on '
  'bookings.client_uuid (Law 8); the replay check reads named granted columns '
  'only (0065), so it survives 0062''s column grants. Prices nothing — '
  'src/lib/money.ts owns the pricing order (Law 1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: bookings_deposit_v — definer rights + explicit row predicate
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view bookings_deposit_v as
select
  b.id,
  case when auth_can_view_money() then b.deposit_required else null end as deposit_required
from bookings b
where auth_is_staff();

-- `create or replace view` preserves reloptions, so the 0061 invoker setting
-- must be removed explicitly. Definer rights are the point: the view owner
-- reads the base table, so the caller needs no column grant on
-- deposit_required — which is exactly what 0062 revokes.
alter view bookings_deposit_v reset (security_invoker);

grant select on bookings_deposit_v to authenticated;

comment on view bookings_deposit_v is
  'Law 6. The only path to bookings.deposit_required once 0062 arms the mask. '
  'Definer-rights + explicit row predicate (0048 pattern, 0065): where '
  'auth_is_staff() mirrors the live bookings_select policy verbatim, and '
  'auth_can_view_money() nulls the figure for money-blind roles. Do NOT set '
  'security_invoker on this view - under 0062 that re-applies the caller''s '
  'revoked column grants and takes deposit display down app-wide.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Post-conditions — refuse to leave either fix half-landed
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_booking';
  if v_src is null or v_src ilike '%select * into%' then
    raise exception 'create_booking still carries a select-star replay check; 0062 would kill every booking creation.';
  end if;

  if not exists (
    select 1 from pg_views
     where schemaname = 'public' and viewname = 'bookings_deposit_v'
       and definition ilike '%auth_is_staff()%'
  ) then
    raise exception 'bookings_deposit_v lacks the auth_is_staff() row predicate; definer rights without it would leak booking ids to the Client role.';
  end if;

  if exists (
    select 1 from pg_class
     where relname = 'bookings_deposit_v'
       and coalesce(reloptions, '{}') && array['security_invoker=on', 'security_invoker=true']
  ) then
    raise exception 'bookings_deposit_v is still security_invoker; under 0062 the deposit read dies for every role.';
  end if;
end $$;

commit;
