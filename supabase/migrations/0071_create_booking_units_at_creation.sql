-- =============================================================================
-- 0071 — `create_booking(jsonb)`: serials assigned AT CREATION (D5, ruled 30 Aug).
--
-- ## The ruling this implements
--
-- `docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0, D5 — **serials are
-- assigned at booking creation.** The 27 Jul least-used-unit lock stands and
-- B4 closes. The live Booqable account does exactly this today (spec §10.2:
-- the removable serial chip `LAO-10MM-ZDFF-SE-01` on booking #906's line), so
-- staff already work this way.
--
-- 0063's header said the opposite — "per PLAN.md §4.30 it is Confirm — not
-- creation — that reserves inventory. Nothing here touches
-- `inventory_reservations` or `booking_line_units`." D5 supersedes the first
-- half for `booking_line_units` ONLY:
--
--   · A line may now carry `"units": [{ "client_uuid": …, "asset_id": … }]`
--     and this function writes one `booking_line_units` row per entry.
--   · `inventory_reservations` — the table with the GiST double-booking
--     defence — is STILL written at Confirm (`reserveAssignedUnits`,
--     `queries/availability.ts`), not here. A creation-time assignment is a
--     statement of intent the floor can see and swap at Pack; the reservation
--     the database defends is still minted where §4.30(a) put it. Moving that
--     too would need its own ruling — a Quote that hard-locks inventory is a
--     different product than one that doesn't.
--
-- ## The fallback is part of the ruling
--
-- D5, verbatim: "either the bridge feeds [availability] or creation falls back
-- to unit-less lines (the signature allows both, so the floor never blocks on
-- a sync gap). Pack confirms/swaps what creation assigned." So `units` is
-- OPTIONAL per line: absent or `[]` writes no unit rows and the line behaves
-- exactly as it did under 0070. A caller that cannot know availability sends
-- nothing rather than guessing.
--
-- ## Law 8 — one key per unit ROW
--
-- `booking_line_units.client_uuid` is NOT NULL UNIQUE, exactly like the line
-- and discount rows, so each unit entry carries its own caller-minted key. A
-- replayed create returns the original booking before any of this runs.
--
-- ## Defensive checks, and why each raises rather than trims
--
--   · more units than qty         — a 2-qty line with 3 serials is a caller
--                                   bug; trimming silently would pick which
--                                   serial to drop, which is a product call.
--   · the same asset twice        — one physical unit cannot cover two rows;
--                                   nothing in the schema stops it (no unique
--                                   on asset_id here), so it is stopped here.
--   · asset from another product  — a serial chip for a lens on a light's
--                                   line is a mis-scan; the FK cannot catch it
--                                   (both are real product_units), so this
--                                   does.
--
-- ## What this is rebased on
--
-- **0070, verbatim** — the dependency-order line loop and the discount
-- audit-row fallback are carried forward unchanged. 0065's named-column replay
-- check is likewise preserved; re-emitting a `%rowtype` star would 42501 under
-- 0062's grants.
--
-- ## Applying this
--
-- ⚠ NOT APPLIED — anywhere — as written. Per CLAUDE.md no migration reaches
-- the live project without explicit approval. The local mirror in
-- `src/lib/mock/client.ts` is amended in the same change (the seam rule at
-- `createRental.ts:33-44` — one implementation of what a booking is, two
-- backends). This file is additive: one `create or replace function`, no table
-- touched, and a payload written for 0063/0070 behaves identically under it.
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
  v_unit_count    integer := 0;
  v_pending       jsonb;
  v_next          jsonb;
  v_parent_key    uuid;
  v_parent_id     uuid;
  v_wrote         integer;
  v_line_id       uuid;
  v_unit          jsonb;
  v_asset_product uuid;
  v_dupe_assets   integer;
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

    -- D5 pre-validation: the units array, when present, must be coherent with
    -- the line it rides on. Checked before the first insert for the same
    -- reason as `days`.
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

  -- One physical unit cannot be assigned twice on one booking, and no schema
  -- constraint says so (`booking_line_units` has no unique on asset_id).
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
      )
      returning id into v_line_id;

      -- ── D5: the creation-time unit assignment ──────────────────────────
      -- One row per unit entry, qty 1 each — the serial chips of spec §10.2.
      -- Removing one later is a DELETE of that row, not an edit of the line.
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        -- A serial from another product on this line is a mis-scan; the FK
        -- alone would accept it, so it is refused by name here.
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
    'unit_count', v_unit_count,
    'replayed',   false
  );
end;
$$;

comment on function create_booking(jsonb) is
  'Creates one booking (header + lines + optional per-line unit assignments + '
  'discounts) in a single transaction. SECURITY INVOKER — every insert faces '
  'its own RLS policy. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Lines are inserted in dependency order so a bundle child may name '
  'its parent by that parent''s client_uuid (parent_client_uuid). Per D5 '
  '(ruled 30 Aug 2026) a line may carry units[] — serials assigned at '
  'creation, one booking_line_units row each; absent means unit-less, and '
  'Pack confirms or fills. Reservation with the GiST defence still happens at '
  'Confirm, not here. Prices nothing — src/lib/money.ts owns pricing (Law 1).';

commit;
