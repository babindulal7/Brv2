-- =============================================================================
-- 0070 — `create_booking(jsonb)`: bundle children can finally name their parent.
--
-- ## The gap 0063 shipped with
--
-- `0063_create_booking_function.sql:169` casts `parent_line_id` straight out of
-- the payload:
--
--     (v_line ->> 'parent_line_id')::uuid
--
-- `booking_lines.id` is `gen_random_uuid()`, generated **inside** this
-- transaction. A browser building the payload therefore cannot know any line's
-- id, so it cannot fill that field for a bundle child — and a bundle child that
-- cannot name its parent is not a bundle child at all. Every "Bundle" booking
-- 0063 could create came out as a flat list of unrelated lines with the
-- components priced at 0 and nothing recording what they belonged to.
--
-- `booking_lines.parent_line_id` carries a comment of its own on the live table
-- ("Self-FK for bundle children. Children price at 0; the bundle line carries
-- the rate.") and a CHECK that enforces it — `booking_lines_bundle_child_is_free`
-- — so the schema is not ambiguous about the intent. The function simply had no
-- way to satisfy it.
--
-- ## The fix — `parent_client_uuid`, resolved in-transaction
--
-- Every line already carries its own `client_uuid` (Law 8, one per ROW), and
-- `booking_lines_client_uuid_key` makes it unique. That is a key the CALLER
-- mints and therefore a key the caller can point at. A child line now carries
--
--     "parent_client_uuid": "<the parent line's client_uuid>"
--
-- and this function inserts in dependency order, resolving the parent's real
-- `id` from the rows it has already written on THIS booking.
--
-- Insertion is a fixed-point loop rather than two passes: a line is written as
-- soon as its parent exists, so an arbitrarily deep tree lands in dependency
-- order. When a pass writes nothing while lines remain, the payload names a
-- parent that is not in it (or is cyclic) — the function raises and the whole
-- transaction rolls back, because a bundle silently flattened into loose lines
-- is the exact failure this migration exists to end.
--
-- `parent_line_id` is still honoured when a caller genuinely holds a real id
-- (a future "add a line to an existing booking" path), so this is additive: a
-- payload written for 0063 behaves identically under 0070.
--
-- ## Second fix — the discount audit row's own client_uuid
--
-- 0063 read `v_discount ->> 'audit_client_uuid'` for the `audit_events` row it
-- writes ahead of each `booking_discounts` row, but nothing ever sent that key —
-- `createRental.ts` maps a discount to `client_uuid`, `discount_source`,
-- `percent`, `reason`, `approver_id`, `coupon_id` and no more. `audit_events.
-- client_uuid` is NOT NULL, so **every booking carrying a discount failed** with
-- a not-null violation naming a column the caller had never heard of. The
-- function now falls back to a freshly generated uuid when the caller does not
-- supply one, and `createRental` supplies one; either way the audit row is
-- written and the discount lands.
--
-- ## What this is rebased on
--
-- **0065, not 0063.** `0065_arm_0062_prerequisites.sql` already replaced this
-- function once, to make the Law 8 replay check read named granted columns
-- (`id, booking_no, stage::text`) instead of a `bookings%rowtype` star that
-- 42501s on the ungranted `deposit_required` the moment 0062's column grants
-- land. That fix is carried forward here verbatim; re-emitting 0063's
-- `select * into v_existing` would silently revert it and break every
-- create_booking call for every role on the day 0062 is applied.
--
-- ## Applying this
--
-- ⚠ LOCAL ONLY in this change. Applied to `supabase_db_babin-rentals-os`
-- (the local container) and to that alone. It is additive — one
-- `create or replace function`, no table touched — and it does not become
-- reachable on the live project until 0063, 0065 and this file are applied there
-- with explicit approval, exactly as 0063's own header requires.
--
-- The local mirror in `src/lib/mock/client.ts` is amended in the same change
-- (the seam rule at `createRental.ts:33-44` — one implementation of what a
-- booking is, two backends).
-- =============================================================================

begin;

create or replace function create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_uuid   uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id    uuid;
  v_existing_no    text;
  v_existing_stage text;
  v_booking_id    uuid;
  v_booking_no    text;
  v_actor         uuid := (p_payload ->> 'created_by')::uuid;
  v_branch        uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines         jsonb;
  v_line          jsonb;
  v_discount      jsonb;
  v_audit_id      uuid;
  v_line_count    integer := 0;
  v_pending       jsonb;
  v_next          jsonb;
  v_parent_key    uuid;
  v_parent_id     uuid;
  v_wrote         integer;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  -- Named columns only, carried forward from 0065: under 0062 a select-star
  -- here would 42501 on the ungranted `deposit_required` for every role.
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

  -- ── Lines, in dependency order ───────────────────────────────────────────
  -- `days` is passed through, never defaulted here (Law 9), and every line is
  -- validated BEFORE the first insert so a bad line later in the array cannot
  -- leave a half-built tree behind. The transaction would roll it back anyway;
  -- validating first is what makes the error name the line rather than a
  -- constraint.
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;
  end loop;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        -- Resolve against the rows written for THIS booking only. Scoping to
        -- the booking is what stops a payload pointing a child at some other
        -- booking's line, which the self-FK alone would happily accept.
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          -- Parent not written yet. Defer; a later pass picks it up.
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
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
        v_parent_id,
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
  -- Each needs an `audit_events` row FIRST, because `audit_event_id` is NOT
  -- NULL. This ordering is the reason the whole operation must be one
  -- transaction and cannot be four PostgREST calls.
  --
  -- `audit_client_uuid` is the audit ROW's own Law 8 key and is distinct from
  -- the discount's. 0063 read it and nothing sent it, so `audit_events.
  -- client_uuid` (NOT NULL) rejected every discounted booking. A generated
  -- fallback keeps the write possible for a caller that has not been updated;
  -- `createRental` now sends one so the key is the caller's, as Law 8 wants.
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    insert into audit_events (
      client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
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
  'SECURITY INVOKER — every insert faces its own RLS policy, so a money-blind '
  'role creating a discounted booking is rejected whole rather than silently '
  'losing the discount. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid) — line ids are '
  'generated in-transaction and no caller can know them. Prices nothing — '
  'src/lib/money.ts owns the pricing order (Law 1).';

commit;
