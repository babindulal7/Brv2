-- =============================================================================
-- 0063 — `create_booking(jsonb)`: the one transaction that makes a Quote exist.
--
-- ## Why a function and not four inserts from the browser
--
-- Creating a booking touches three tables, and two of them cannot be reached
-- independently:
--
--   1. `bookings`               — the header
--   2. `booking_lines`          — one row per priced line, FK to the header
--   3. `audit_events` +
--      `booking_discounts`      — `booking_discounts.audit_event_id` is
--                                 **NOT NULL** (`0002_bookings.sql:587`), so a
--                                 discount needs an audit row written AND read
--                                 back before it can be inserted at all.
--
-- PostgREST gives a browser no transaction. Four sequential `.from().insert()`
-- calls can therefore half-succeed: a `bookings` row with no lines, or lines
-- with the discount silently dropped — which under Law 10 is a booking that
-- charges the wrong money and carries no record of why.
--
-- One function call is one transaction. Either the whole booking exists or none
-- of it does.
--
-- ## SECURITY INVOKER, deliberately
--
-- `security invoker` (the default, stated here because it is load-bearing)
-- means each insert below faces its own RLS policy as the calling user. A
-- Warehouse session can create a booking — `bookings_insert` admits the desk
-- five, and Warehouse is among them — but **cannot attach a discount**, because
-- `booking_discounts` is money-blind under Law 6. The call is then rejected
-- whole rather than quietly writing the booking and dropping the discount.
--
-- `search_path` is pinned per the convention `0050` established.
--
-- ## This function prices NOTHING
--
-- Law 1: `src/lib/money.ts` owns the pricing order (subtotal → discount → VAT →
-- total) and is the only place it is written down. The caller sends `rate`,
-- `qty` and `days` per line and this function stores them. It does not compute
-- a line total, a booking total, or VAT. A second pricing implementation in
-- PL/pgSQL is exactly the drift `money.ts`'s own header blames for past errors.
--
-- The table CHECKs still apply and are not pricing — `booking_lines_days_min`,
-- `booking_lines_qty_positive`, `booking_discounts_hard_cap` and
-- `booking_discounts_over_ten_needs_reason_and_approver` all reject bad input
-- here regardless of what the caller believes.
--
-- ## Idempotent on `client_uuid` (Law 8)
--
-- Every write carries a client UUID and a replayed write must not act twice.
-- `bookings_client_uuid_key` is a unique constraint, so a replay is detected
-- rather than raced: this function looks first, and if the booking already
-- exists it returns it with `replayed: true` and **writes nothing at all** —
-- not a line, not an audit row, not a sequence advance.
--
-- That last point matters. `next_document_number()` advances a counter, and a
-- retried scan on a Nepali mobile connection that minted a second booking
-- number would burn an identifier and produce two bookings for one intent.
--
-- ## Stage is Quote, and this function does not move it
--
-- `bookings.stage` defaults to `'Quote'` and is NOT written here. `0002:80-81`:
-- *"Read model of booking_stage_transitions. Written ONLY by that table's
-- trigger; a direct UPDATE is rejected."* Confirm is a separate act with its own
-- action (`confirmRental`), and per PLAN.md §4.30 it is Confirm — not creation —
-- that reserves inventory. Nothing here touches `inventory_reservations` or
-- `booking_line_units`.
--
-- ## Applying this
--
-- ⚠ Needs explicit approval per CLAUDE.md. The target database holds 121 real
-- bookings. This migration is **additive** — it creates one function and alters
-- no table, so it cannot damage existing rows. It does not become reachable
-- until `src/actions/rentals/createRental.ts` calls it.
--
-- Numbered 0063 because 0059–0062 are taken. The identifier it mints comes from
-- `next_document_number('booking')`, which under 0055 yields the ruled `B-N`
-- form and satisfies the live `^B-[0-9]+$` CHECK.
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
  v_existing      bookings%rowtype;
  v_booking_id    uuid;
  v_booking_no    text;
  v_actor         uuid := (p_payload ->> 'created_by')::uuid;
  v_branch        uuid := (p_payload ->> 'branch_id')::uuid;
  v_line          jsonb;
  v_discount      jsonb;
  v_audit_id      uuid;
  v_line_count    integer := 0;
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select * into v_existing from bookings where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing.id,
      'booking_no', v_existing.booking_no,
      'stage',      v_existing.stage,
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
  -- `days` is passed through, never defaulted here. Law 9 requires it stated
  -- explicitly on every priced line; letting the column default to 1 would
  -- satisfy the constraint while hiding a caller that never set it.
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
  -- Each needs an `audit_events` row FIRST, because `audit_event_id` is NOT
  -- NULL. This ordering is the reason the whole operation must be one
  -- transaction and cannot be four PostgREST calls.
  --
  -- The 25% cap, and the reason+approver requirement above 10%, are enforced by
  -- table CHECKs and by `trg_booking_discounts_stacking` (0044, applied 11 Aug)
  -- for the cumulative case. Nothing is re-checked here — Law 10 says no path
  -- bypasses the database rule, and a second implementation in this function
  -- would be a path that could disagree with it.
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
  'SECURITY INVOKER — every insert faces its own RLS policy, so a money-blind '
  'role creating a discounted booking is rejected whole rather than silently '
  'losing the discount. Idempotent on bookings.client_uuid (Law 8): a replay '
  'returns the existing booking and writes nothing, including no sequence '
  'advance. Prices nothing — src/lib/money.ts owns the pricing order (Law 1).';

commit;
